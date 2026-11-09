import { createPlayer, getPlayer, mergePlayers, newId, sha256, now, isAccount } from './db.js';
import { verifyRG, rgProfile } from './rg.js';

// Every visitor gets a guest account on first load, held by an HttpOnly cookie. Signing in with
// RookieGamers (the only sign-in) links the portal player so the account follows them everywhere.

const COOKIE = 'us_sid';
const YEAR = 365 * 24 * 3600;

export function cookies(req) {
  const out = {};
  for (const part of (req.headers.get('cookie') || '').split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
  }
  return out;
}
// Over HTTPS the cookie is SameSite=None and Partitioned, so it also works while unsays plays inside the
// RookieGamers portal's frame (keyed to the portal there). Cross-site requests still can't act for a
// player: every write needs a JSON body, which needs a CORS preflight we never grant.
const setCookie = (name, value, maxAge, secure) =>
  `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; ${secure ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax'}`;
const isSecure = req => new URL(req.url).protocol === 'https:';

export async function sessionPlayer(DB, req) {
  const tok = cookies(req)[COOKIE];
  if (!tok || tok.length < 20) return null;
  const row = await DB.prepare('SELECT player_id FROM sessions WHERE token = ?').bind(await sha256(tok)).first();
  return row ? row.player_id : null;
}

export async function newSession(DB, playerId, req) {
  const tok = newId('', 48);
  await DB.prepare('INSERT INTO sessions (token, player_id, created_at) VALUES (?, ?, ?)').bind(await sha256(tok), playerId, now()).run();
  return setCookie(COOKIE, tok, YEAR, isSecure(req));
}

// Returns the player id for this request, creating a guest account (and its cookie) if needed.
export async function ensurePlayer(DB, req) {
  const id = await sessionPlayer(DB, req);
  if (id && await getPlayer(DB, id)) return { id, cookie: null };
  const pid = await createPlayer(DB);
  return { id: pid, cookie: await newSession(DB, pid, req) };
}

export async function signOut(DB, req) {
  const tok = cookies(req)[COOKIE];
  if (tok) await DB.prepare('DELETE FROM sessions WHERE token = ?').bind(await sha256(tok)).run();
  return setCookie(COOKIE, '', 0, isSecure(req));
}

// Link the RookieGamers player behind `token` to this browser. A guest is folded into the account
// that already has that RookieGamers player, or becomes it; another signed-in account is never swallowed.
export async function rgSignIn(DB, env, req, token) {
  const claims = await verifyRG(env, token);
  if (!claims) return { status: 401, error: 'RookieGamers sign-in didn\'t go through. Try again.' };
  const sub = claims.sub;
  const guestId = await sessionPlayer(DB, req);
  const guest = guestId && await getPlayer(DB, guestId);
  const existing = await DB.prepare('SELECT id FROM players WHERE rg_id = ?').bind(sub).first();
  let id, cookie = null;
  if (existing) {
    id = existing.id;
    if (guest && guest.id !== id && !isAccount(guest)) await mergePlayers(DB, guest.id, id);
    if (!guest || guest.id !== id) cookie = await newSession(DB, id, req);
  } else if (guest && !guest.rg_id) {
    // A guest, or an account from before RookieGamers sign-in, takes on the RookieGamers player.
    id = guest.id;
  } else {
    id = await createPlayer(DB, guest ? { hue: guest.hue } : {});
    cookie = await newSession(DB, id, req);
  }
  const prof = await rgProfile(env, sub);
  const name = String((prof && prof.name) || claims.name || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
  const save = pid => DB.prepare(`UPDATE players SET rg_id = ?, name = CASE WHEN ? != '' THEN ? ELSE name END, rg_avatar = ?, rg_frame = ?, rg_title = ?, seen_at = ? WHERE id = ?`)
    .bind(sub, name, name, prof?.avatar || null, prof?.frame || null, prof?.title || null, now(), pid).run();
  try { await save(id); } catch (e) {
    // Two sign-ins for the same RookieGamers player raced and the other one linked it first: use that account.
    if (!/UNIQUE/i.test(String(e))) throw e;
    const won = await DB.prepare('SELECT id FROM players WHERE rg_id = ?').bind(sub).first();
    if (!won) throw e;
    id = won.id; cookie = await newSession(DB, id, req);
    await save(id);
  }
  return { status: 200, id, cookie };
}
