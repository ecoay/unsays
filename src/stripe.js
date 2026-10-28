import { GUILD_PASS, PACKS, DROP, DAY, packById } from '../public/catalog.js';
import { getPlayer, now, startDrop } from './db.js';

// Stripe Checkout through the REST API. Prices are sent inline from the catalog, so nothing
// has to be set up in the Stripe dashboard besides the webhook.

const API = 'https://api.stripe.com/v1/';
const GRACE = 3 * 24 * 3600 * 1000; // keep a guild open a few days past a failed renewal

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out); else out.append(key, String(v));
  }
  return out;
}

async function stripe(env, method, path, body) {
  const r = await fetch(API + path, {
    method, headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: body ? form(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Stripe ${path}: ${j.error?.message || r.status}`);
  return j;
}

export const stripeReady = env => !!env.STRIPE_SECRET_KEY;

async function customer(DB, env, p) {
  if (p.stripe_customer) return p.stripe_customer;
  const c = await stripe(env, 'POST', 'customers', { email: p.email || undefined, metadata: { player_id: p.id } });
  await DB.prepare('UPDATE players SET stripe_customer = ? WHERE id = ?').bind(c.id, p.id).run();
  return c.id;
}

// item is a pack id from the catalog, or guild_month / guild_year.
export async function checkout(DB, env, req, playerId, item) {
  const p = await getPlayer(DB, playerId);
  const origin = new URL(req.url).origin;
  const base = {
    customer: await customer(DB, env, p), client_reference_id: playerId,
    success_url: `${origin}/#bought-${item}`, cancel_url: `${origin}/#store`,
    metadata: { player_id: playerId, item }, allow_promotion_codes: 'true',
  };
  const pass = Object.values(GUILD_PASS).find(g => g.id === item);
  if (pass) {
    const g = await DB.prepare('SELECT * FROM guilds WHERE owner_id = ?').bind(playerId).first();
    if (!g) return { status: 400, error: 'Create your guild first, then add the Guild Pass.' };
    if (g.sub_id && g.sub_status !== 'canceled' && g.pass_until > now()) return { status: 400, error: 'Your guild already has a Guild Pass.' };
    const s = await stripe(env, 'POST', 'checkout/sessions', {
      ...base, mode: 'subscription',
      line_items: { 0: { quantity: 1, price_data: { currency: 'usd', unit_amount: pass.price, recurring: { interval: pass.interval }, product_data: { name: pass.name, description: '14-seat guild table, guild leaderboard, guild tag, no ads for the owner' } } } },
      subscription_data: { metadata: { player_id: playerId, guild_id: g.id, item } },
    });
    return { status: 200, url: s.url };
  }
  const pack = packById(item);
  if (!pack?.price) return { status: 400, error: 'That item isn\'t in the store.' };
  if (pack.kind !== 'gifts' && pack.kind !== 'drop') {
    const have = await DB.prepare('SELECT 1 FROM owned WHERE player_id = ? AND item = ?').bind(playerId, item).first();
    if (have) return { status: 400, error: 'You already own that pack.' };
  }
  const s = await stripe(env, 'POST', 'checkout/sessions', {
    ...base, mode: 'payment',
    line_items: { 0: { quantity: 1, price_data: { currency: 'usd', unit_amount: pack.price, product_data: { name: `unsays: ${pack.name}`, description: pack.blurb } } } },
  });
  return { status: 200, url: s.url };
}

export async function portal(DB, env, req, playerId) {
  const p = await getPlayer(DB, playerId);
  if (!p.stripe_customer) return { status: 400, error: 'There\'s no subscription on this account.' };
  const s = await stripe(env, 'POST', 'billing_portal/sessions', { customer: p.stripe_customer, return_url: `${new URL(req.url).origin}/#guild` });
  return { status: 200, url: s.url };
}

/* ---------- webhook ---------- */

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

// Stripe-Signature: t=<unix>,v1=<hmac>. Rejects anything older than 5 minutes.
export async function verifySignature(payload, header, secret, at = Date.now()) {
  const parts = Object.fromEntries((header || '').split(',').map(kv => kv.split('=')).filter(x => x.length === 2).map(([k, v]) => [k.trim(), v]));
  const sigs = (header || '').split(',').filter(x => x.startsWith('v1=')).map(x => x.slice(3));
  if (!parts.t || !sigs.length || Math.abs(at / 1000 - Number(parts.t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parts.t}.${payload}`)));
  return sigs.some(s => s.length === mac.length && timingSafe(s, mac));
}
function timingSafe(a, b) { let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

// Newer API versions keep the billing period on the subscription item.
const periodEnd = sub => (sub.current_period_end || sub.items?.data?.[0]?.current_period_end || 0) * 1000;

async function applySubscription(DB, sub) {
  const guildId = sub.metadata?.guild_id;
  if (!guildId) return null;
  const live = ['active', 'trialing', 'past_due'].includes(sub.status);
  const until = live ? periodEnd(sub) + GRACE : Math.min(now(), periodEnd(sub));
  await DB.prepare('UPDATE guilds SET sub_id = ?, sub_status = ?, pass_until = ? WHERE id = ?').bind(sub.id, sub.status, until, guildId).run();
  return guildId;
}

// Returns { guildChanged } so the caller can refresh the lobby's guild tables.
export async function handleEvent(DB, env, ev) {
  const o = ev.data.object;
  if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') {
    if (o.payment_status !== 'paid' && o.mode === 'payment') return {};
    const pid = o.metadata?.player_id || o.client_reference_id, item = o.metadata?.item;
    if (!pid || !item) return {};
    const first = await DB.prepare('INSERT OR IGNORE INTO purchases (ref, player_id, item, amount, at) VALUES (?, ?, ?, ?, ?)').bind(o.id, pid, item, o.amount_total | 0, now()).run();
    if (!first.meta.changes) return {}; // already handled
    if (o.mode === 'subscription') {
      const sub = await stripe(env, 'GET', `subscriptions/${o.subscription}`);
      return { guildChanged: await applySubscription(DB, sub) };
    }
    const pack = packById(item);
    if (!pack) return {};
    if (pack.kind === 'gifts') await DB.prepare('UPDATE players SET gifts = gifts + ? WHERE id = ?').bind(pack.gifts, pid).run();
    else if (pack.kind === 'drop') await startDrop(DB, pid);
    else await DB.prepare('INSERT OR IGNORE INTO owned (player_id, item, at) VALUES (?, ?, ?)').bind(pid, item, now()).run();
    return { player: pid };
  }
  if (ev.type.startsWith('customer.subscription.')) return { guildChanged: await applySubscription(DB, o) };
  if (ev.type === 'charge.refunded' && o.payment_intent) {
    // Take back a refunded pack. Gifts already sent stay sent.
    const s = await stripe(env, 'GET', `checkout/sessions?payment_intent=${o.payment_intent}&limit=1`);
    const cs = s.data?.[0];
    const pack = cs && packById(cs.metadata?.item);
    if (pack?.kind === 'drop') await DB.prepare('UPDATE players SET drop_until = MAX(0, drop_until - ?) WHERE id = ?').bind(DROP.days * DAY, cs.metadata.player_id).run();
    else if (pack && pack.kind !== 'gifts') await DB.prepare('DELETE FROM owned WHERE player_id = ? AND item = ?').bind(cs.metadata.player_id, pack.id).run();
    return { player: cs?.metadata?.player_id };
  }
  return {};
}

export { PACKS, GUILD_PASS };
