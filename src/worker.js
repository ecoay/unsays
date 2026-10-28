import { Table } from './table.js';
import { Lobby } from './lobby.js';
import { db, profile, getPlayer, setEquip, newId, now, monthKey, prevMonth, archiveMonth, topPlayers, topGuilds, topGifted } from './db.js';
import { sessionPlayer, ensurePlayer, signOut, providers, googleStart, googleCallback, emailStart, emailVerify } from './auth.js';
import { stripeReady, checkout, portal, verifySignature, handleEvent } from './stripe.js';
import { page, robots, sitemap, llms, llmsFull, canonicalHost } from './pages.js';

export { Table, Lobby };

const TABLE_PATH = /^\/ws\/table\/([a-z0-9-]{1,40})$/;
const TAG_RE = /^[A-Z0-9]{2,5}$/;
const MAX_MEMBERS = 50;

const json = (data, status = 200, cookie) => {
  const h = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
  if (cookie) h.append('set-cookie', cookie);
  return new Response(JSON.stringify(data), { status, headers: h });
};
const lobby = env => env.LOBBY.get(env.LOBBY.idFromName('main'));
const syncLobby = env => lobby(env).fetch('https://lobby/internal/guilds/sync', { method: 'POST' });
const cleanText = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

// Pass the request on with x-player set from the session cookie (never from the client).
async function withPlayer(req, DB) {
  const h = new Headers(req.headers);
  h.delete('x-player');
  const pid = DB ? await sessionPlayer(DB, req) : null;
  if (pid) h.set('x-player', pid);
  return new Request(req, { headers: h });
}

async function readJSON(req) { try { return await req.json(); } catch { return {}; } }

async function api(req, env, DB, url) {
  const path = url.pathname, method = req.method;
  // Browsers only send JSON cross-site after a CORS preflight we never grant, so this blocks CSRF.
  if (method !== 'GET' && path !== '/api/stripe/webhook' && !(req.headers.get('content-type') || '').includes('application/json')) return json({ error: 'Send JSON.' }, 415);

  if (path === '/api/stripe/webhook' && method === 'POST') {
    if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'Webhook secret not set' }, 503);
    const raw = await req.text();
    if (!await verifySignature(raw, req.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET)) return json({ error: 'Bad signature' }, 400);
    const out = await handleEvent(DB, env, JSON.parse(raw));
    if (out.guildChanged) await syncLobby(env);
    return json({ received: true });
  }

  if (path === '/api/leaderboard' && method === 'GET') {
    const m = /^\d{4}-\d{2}$/.test(url.searchParams.get('month') || '') ? url.searchParams.get('month') : monthKey();
    const board = url.searchParams.get('board');
    const rows = board === 'guilds' ? await topGuilds(DB, m) : board === 'gifted' ? await topGifted(DB, m) : await topPlayers(DB, m);
    return json({ month: m, board: board || 'players', rows });
  }

  if (path === '/api/me' && method === 'GET') {
    const pid = await sessionPlayer(DB, req);
    const prof = pid && await profile(DB, pid);
    return json({ me: prof || null, providers: providers(env), store: stripeReady(env) });
  }

  // Everything below acts for a player, creating a guest account on first use.
  const { id: pid, cookie } = await ensurePlayer(DB, req);
  const reply = (data, status) => json(data, status, cookie);
  const me = async () => ({ me: await profile(DB, pid), providers: providers(env), store: stripeReady(env) });

  if (path === '/api/me' && method === 'POST') {
    const b = await readJSON(req);
    const name = cleanText(b.name, 18);
    if (name) await DB.prepare('UPDATE players SET name = ?, hue = ?, seen_at = ? WHERE id = ?').bind(name, Math.abs(Number(b.hue) | 0) % 360, now(), pid).run();
    return reply(await me());
  }
  if (path === '/api/me/equip' && method === 'POST') { await setEquip(DB, pid, await readJSON(req)); return reply(await me()); }
  if (path === '/api/auth/signout' && method === 'POST') return json({ ok: true }, 200, await signOut(DB, req));
  if (path === '/api/auth/email' && method === 'POST') {
    if (!providers(env).email) return reply({ error: 'Email sign-in isn\'t set up yet.' }, 503);
    const r = await emailStart(DB, env, req, pid);
    return reply(r, r.status);
  }

  if (path === '/api/checkout' && method === 'POST') {
    if (!stripeReady(env)) return reply({ error: 'The store opens soon.' }, 503);
    const p = await getPlayer(DB, pid);
    const pv = providers(env);
    if ((pv.google || pv.email) && !p.email && !p.google_sub) return reply({ error: 'Sign in first so your purchase follows you to any device.', signin: true }, 401);
    const r = await checkout(DB, env, req, pid, String((await readJSON(req)).item || ''));
    return reply(r, r.status);
  }
  if (path === '/api/portal' && method === 'POST') {
    if (!stripeReady(env)) return reply({ error: 'The store opens soon.' }, 503);
    const r = await portal(DB, env, req, pid);
    return reply(r, r.status);
  }

  /* ---------- guilds ---------- */

  if (path === '/api/guild' && method === 'POST') {
    const b = await readJSON(req);
    const p = await getPlayer(DB, pid);
    if (p.guild_id) return reply({ error: 'Leave your current guild first.' }, 400);
    const name = cleanText(b.name, 28), tag = String(b.tag || '').toUpperCase().trim();
    if (name.length < 3) return reply({ error: 'Give the guild a name of at least 3 characters.' }, 400);
    if (!TAG_RE.test(tag)) return reply({ error: 'The tag needs 2 to 5 letters or numbers, like FART.' }, 400);
    const slug = (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'guild') + '-' + newId('', 4);
    const id = newId('g');
    try {
      await DB.batch([
        DB.prepare('INSERT INTO guilds (id, slug, name, tag, owner_id, invite, speed, mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, slug, name, tag, pid, newId('', 16), b.speed === 'classic' ? 'classic' : 'turbo', b.mode === 'clean' ? 'clean' : 'adult', now()),
        DB.prepare('UPDATE players SET guild_id = ? WHERE id = ?').bind(id, pid),
      ]);
    } catch (e) {
      if (/UNIQUE.*tag/i.test(String(e))) return reply({ error: `The tag [${tag}] is taken. Try another.` }, 409);
      if (/UNIQUE.*owner/i.test(String(e))) return reply({ error: 'You already own a guild.' }, 409);
      throw e;
    }
    return reply(await me());
  }
  if (path === '/api/guild' && method === 'PATCH') {
    const b = await readJSON(req);
    const g = await DB.prepare('SELECT * FROM guilds WHERE owner_id = ?').bind(pid).first();
    if (!g) return reply({ error: 'Only the guild owner can change settings.' }, 403);
    const name = cleanText(b.name, 28) || g.name;
    await DB.prepare('UPDATE guilds SET name = ?, speed = ?, mode = ? WHERE id = ?').bind(name.length >= 3 ? name : g.name, b.speed === 'classic' ? 'classic' : 'turbo', b.mode === 'clean' ? 'clean' : 'adult', g.id).run();
    await syncLobby(env);
    return reply(await me());
  }
  if (path === '/api/guild/join' && method === 'POST') {
    const code = String((await readJSON(req)).code || '');
    const g = await DB.prepare('SELECT * FROM guilds WHERE invite = ?').bind(code).first();
    if (!g) return reply({ error: 'That invite link has expired. Ask the owner for a new one.' }, 404);
    const p = await getPlayer(DB, pid);
    if (p.guild_id === g.id) return reply(await me());
    if (p.guild_id) return reply({ error: 'Leave your current guild first.' }, 400);
    const n = await DB.prepare('SELECT COUNT(*) AS n FROM players WHERE guild_id = ?').bind(g.id).first();
    if (n.n >= MAX_MEMBERS) return reply({ error: 'That guild is full.' }, 409);
    await DB.prepare('UPDATE players SET guild_id = ? WHERE id = ?').bind(g.id, pid).run();
    return reply(await me());
  }
  if (path === '/api/guild/leave' && method === 'POST') {
    const owns = await DB.prepare('SELECT 1 FROM guilds WHERE owner_id = ?').bind(pid).first();
    if (owns) return reply({ error: 'Owners can\'t leave their own guild. Cancel the Guild Pass instead.' }, 400);
    await DB.prepare('UPDATE players SET guild_id = NULL WHERE id = ?').bind(pid).run();
    return reply(await me());
  }
  if (path === '/api/guild/remove' && method === 'POST') {
    const who = String((await readJSON(req)).player || '');
    const g = await DB.prepare('SELECT id FROM guilds WHERE owner_id = ?').bind(pid).first();
    if (!g || who === pid) return reply({ error: 'Only the owner can remove members.' }, 403);
    await DB.prepare('UPDATE players SET guild_id = NULL WHERE id = ? AND guild_id = ?').bind(who, g.id).run();
    return reply(await me());
  }
  if (path === '/api/guild/invite' && method === 'POST') {
    await DB.prepare('UPDATE guilds SET invite = ? WHERE owner_id = ?').bind(newId('', 16), pid).run();
    return reply(await me());
  }

  return reply({ error: 'Not found' }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const DB = await Promise.resolve(db(env)).catch(e => { console.error('db', e); return null; });

    if (path === '/ws/lobby' || path.startsWith('/api/tables')) return lobby(env).fetch(await withPlayer(req, DB));
    const m = path.match(TABLE_PATH);
    if (m) {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      return env.TABLE.get(env.TABLE.idFromName(m[1])).fetch(await withPlayer(req, DB));
    }
    if (path.startsWith('/api/')) {
      if (!DB) return json({ error: 'Accounts are offline.' }, 503);
      try { return await api(req, env, DB, url); } catch (e) { console.error(e); return json({ error: 'Something went wrong. Try again.' }, 500); }
    }
    if (path === '/auth/google') return providers(env).google ? googleStart(env, req) : Response.redirect(url.origin + '/', 302);
    if (path === '/auth/google/callback') return googleCallback(DB, env, req);
    if (path === '/auth/email') return emailVerify(DB, req);

    // The canonical site is unsays.com. Other hosts (workers.dev, previews) stay out of search.
    const canonical = canonicalHost(env);
    if (url.hostname === 'www.' + canonical) return Response.redirect(`https://${canonical}${path}${url.search}`, 301);
    const indexable = url.hostname === canonical;
    if (path === '/robots.txt') return text(robots(env, indexable), 'text/plain');
    if (path === '/sitemap.xml') return text(await sitemap(env, DB), 'application/xml');
    if (path === '/llms.txt') return text(llms(env), 'text/plain');
    if (path === '/llms-full.txt') return text(llmsFull(env), 'text/plain');

    let res = await page(path, url, env, DB);
    if (!res) {
      res = await env.ASSETS.fetch(req);
      if (res.status === 404) res = await page('/404', url, env, DB);
    }
    if (indexable) return res;
    const out = new Response(res.body, res);
    out.headers.set('x-robots-tag', 'noindex');
    return out;
  },

  // Just after midnight UTC on the 1st, seal last month into the Hall of Fame.
  async scheduled(event, env, ctx) {
    const DB = await Promise.resolve(db(env)).catch(() => null);
    if (DB) ctx.waitUntil(archiveMonth(DB, prevMonth(monthKey())));
  },
};

function text(body, type) { return new Response(body, { headers: { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'public, max-age=3600' } }); }
