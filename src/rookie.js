import { createPlayer } from './db.js';

// RookieGamers hookup. When unsays runs inside the portal (rookiegamers.com/play/unsays), the
// client sends the player's RookieGamers token with its socket (?rgt=...). We check it against
// the portal's public keys, map it to an unsays player, and report ranked points to the portal's
// monthly board with this game's server key. Off unless RG_URL is set; scores need RG_SERVER_KEY.

const GAME = 'unsays';
const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const KEYS_TTL = 10 * 60 * 1000;
let keyCache = null;

const rgURL = env => (env.RG_URL || '').replace(/\/$/, '');
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));

async function portalKeys(env, force) {
  if (!force && keyCache && keyCache.url === rgURL(env) && Date.now() - keyCache.at < KEYS_TTL) return keyCache.keys;
  const r = await fetch(`${rgURL(env)}/.well-known/jwks.json`);
  if (!r.ok) throw new Error(`jwks ${r.status}`);
  const keys = {};
  for (const k of (await r.json()).keys || []) if (k.kty === 'EC' && k.crv === 'P-256') keys[k.kid] = await crypto.subtle.importKey('jwk', { kty: k.kty, crv: k.crv, x: k.x, y: k.y }, ALG, false, ['verify']);
  keyCache = { url: rgURL(env), at: Date.now(), keys };
  return keys;
}

// The claims of a valid RookieGamers player token for unsays, or null.
export async function verifyRG(env, token) {
  if (!rgURL(env) || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let head, claims;
  try { head = JSON.parse(new TextDecoder().decode(unb64(parts[0]))); claims = JSON.parse(new TextDecoder().decode(unb64(parts[1]))); } catch { return null; }
  if (head.alg !== 'ES256' || claims.iss !== rgURL(env) || claims.aud !== GAME || !(claims.exp > Date.now() / 1000) || typeof claims.sub !== 'string') return null;
  let keys = await portalKeys(env).catch(e => { console.error('rg keys', e); return {}; });
  if (!keys[head.kid]) keys = await portalKeys(env, true).catch(() => ({}));
  const key = keys[head.kid];
  if (!key) return null;
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  return ok ? claims : null;
}

// The unsays player for a RookieGamers player, created on first visit.
export async function rgPlayer(DB, env, token) {
  const c = await verifyRG(env, token);
  if (!c) return null;
  const row = await DB.prepare('SELECT id FROM players WHERE rg_sub = ?').bind(c.sub).first();
  if (row) return row.id;
  const id = await createPlayer(DB, { name: String(c.name || 'guest').replace(/[\u0000-\u001f<>]/g, '').slice(0, 18) || 'guest', hue: Math.floor(Math.random() * 360) });
  try { await DB.prepare('UPDATE players SET rg_sub = ? WHERE id = ?').bind(c.sub, id).run(); } catch {
    // Two sockets raced to create the same player; use the one that won.
    const won = await DB.prepare('SELECT id FROM players WHERE rg_sub = ?').bind(c.sub).first();
    if (won) { await DB.prepare('DELETE FROM players WHERE id = ?').bind(id).run(); return won.id; }
  }
  return id;
}

// Send a ranked round's points to the portal's unsays board.
export async function reportRound(DB, env, rows) {
  if (!rgURL(env) || !env.RG_SERVER_KEY) return;
  const scored = rows.filter(r => r.points > 0);
  if (!scored.length) return;
  const subs = await DB.prepare(`SELECT id, rg_sub FROM players WHERE rg_sub IS NOT NULL AND id IN (${scored.map(() => '?').join(',')})`).bind(...scored.map(r => r.id)).all();
  const byId = Object.fromEntries(subs.results.map(r => [r.id, r.rg_sub]));
  await Promise.all(scored.filter(r => byId[r.id]).map(r => fetch(`${rgURL(env)}/api/v1/scores`, {
    method: 'POST', headers: { authorization: `Bearer ${env.RG_SERVER_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ game: GAME, player: byId[r.id], score: r.points }),
  }).then(async res => { if (!res.ok) console.error('rg score', res.status, await res.text()); }).catch(e => console.error('rg score', e))));
}
