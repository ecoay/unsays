// RookieGamers: the account, avatar and leaderboard unsays shares with the rest of the portal.
// The browser gets a short-lived player token from the RookieGamers SDK; we check it here against
// the portal's public keys and link that RookieGamers player to an unsays player.

const SLUG = 'unsays';
const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };
const KEYS_TTL = 10 * 60 * 1000;

export const rgURL = env => (env.RG_URL || 'https://rookiegamers.com').replace(/\/$/, '');

const b64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const part = s => JSON.parse(new TextDecoder().decode(b64(s)));

let keys = { at: 0, url: '', byKid: {} };
async function publicKey(env, kid, fetcher = fetch) {
  const url = rgURL(env) + '/.well-known/jwks.json';
  if (keys.url !== url || Date.now() - keys.at > KEYS_TTL || !keys.byKid[kid]) {
    const r = await fetcher(url);
    if (!r.ok) throw new Error('jwks ' + r.status);
    const byKid = {};
    for (const k of (await r.json()).keys || []) if (k.kid && k.kty === 'EC') byKid[k.kid] = k;
    keys = { at: Date.now(), url, byKid };
  }
  const jwk = keys.byKid[kid];
  return jwk ? crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, ALG, false, ['verify']) : null;
}

// The token's claims ({ sub, name, ... }) if RookieGamers signed it for unsays and it hasn't expired, else null.
export async function verifyRG(env, token, fetcher) {
  const p = String(token || '').split('.');
  if (p.length !== 3) return null;
  let head, claims;
  try { head = part(p[0]); claims = part(p[1]); } catch { return null; }
  if (head.alg !== 'ES256' || !head.kid) return null;
  const key = await publicKey(env, String(head.kid), fetcher).catch(e => { console.error('rg keys', e); return null; });
  if (!key) return null;
  const ok = await crypto.subtle.verify(SIGN, key, b64(p[2]), new TextEncoder().encode(`${p[0]}.${p[1]}`));
  if (!ok || claims.iss !== rgURL(env) || claims.aud !== SLUG || !(claims.exp > Date.now() / 1000)) return null;
  if (!/^p[a-f0-9]{20}$/.test(String(claims.sub || ''))) return null;
  return claims;
}

// Avatars are RookieGamers icons or its generated letter avatars. Anything else is dropped.
export function safeAvatar(env, v) {
  const s = String(v || '');
  if (s.startsWith('data:image/svg+xml,') && s.length < 4000) return s;
  try {
    const u = new URL(s), rg = new URL(rgURL(env));
    const hosts = [rg.hostname.replace(/^www\./, ''), 'rookiegamers.com'];
    const secure = u.protocol === 'https:' || (u.protocol === 'http:' && rg.protocol === 'http:');
    if (secure && hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h))) return u.href;
  } catch { /* not a URL */ }
  return null;
}

// The player's public RookieGamers profile: name, avatar, frame and Hall of Fame title.
export async function rgProfile(env, sub, fetcher = fetch) {
  try {
    const r = await fetcher(`${rgURL(env)}/api/v1/players/${sub}`);
    if (!r.ok) return null;
    const p = (await r.json()).player;
    return p ? { name: p.name, avatar: safeAvatar(env, p.avatar), frame: /^[a-z0-9-]{1,24}$/.test(p.frame || '') ? p.frame : null, title: p.title ? String(p.title).slice(0, 60) : null } : null;
  } catch (e) { console.error('rg profile', e); return null; }
}

// Ranked round points go to the unsays board on RookieGamers too (a "sum" board, server-reported).
export async function reportScores(env, rows, fetcher = fetch) {
  if (!env.RG_SERVER_KEY) return;
  await Promise.all(rows.filter(r => r.rgId && r.points > 0).map(r => fetcher(`${rgURL(env)}/api/v1/scores`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + env.RG_SERVER_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ game: SLUG, player: r.rgId, score: r.points }),
  }).then(res => { if (!res.ok) console.error('rg score', res.status); }).catch(e => console.error('rg score', e))));
}
