import { createPlayer, getPlayer, mergePlayers, newId, sha256, now } from './db.js';

// Every visitor gets a guest account on first load, held by an HttpOnly cookie. Signing in
// with Google or an email link attaches an identity so the account follows them to new devices.

const COOKIE = 'us_sid';
const YEAR = 365 * 24 * 3600;
const LINK_TTL = 15 * 60 * 1000;

export function cookies(req) {
  const out = {};
  for (const part of (req.headers.get('cookie') || '').split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
  }
  return out;
}
const setCookie = (name, value, maxAge, secure) =>
  `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
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

export const providers = env => ({ google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), email: !!env.RESEND_API_KEY });

// Attach an identity to the current guest, or switch to the account that already has it.
async function attach(DB, req, guestId, field, value, email) {
  const existing = await DB.prepare(`SELECT id FROM players WHERE ${field} = ?`).bind(value).first();
  if (existing) {
    if (guestId && guestId !== existing.id) {
      const guest = await getPlayer(DB, guestId);
      // Only fold in a guest; never swallow another signed-in account.
      if (guest && !guest.email && !guest.google_sub) await mergePlayers(DB, guestId, existing.id);
    }
    if (email) await DB.prepare('UPDATE players SET email = COALESCE(email, ?) WHERE id = ? AND NOT EXISTS (SELECT 1 FROM players WHERE email = ?)').bind(email, existing.id, email).run();
    return { id: existing.id, cookie: await newSession(DB, existing.id, req) };
  }
  const guest = guestId && await getPlayer(DB, guestId);
  let id = guestId;
  if (!guest || (field === 'email' ? guest.email : guest.google_sub)) id = await createPlayer(DB, guest ? { name: guest.name, hue: guest.hue } : {});
  await DB.prepare(`UPDATE players SET ${field} = ? WHERE id = ?`).bind(value, id).run();
  if (email && field !== 'email') await DB.prepare('UPDATE players SET email = ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM players WHERE email = ?)').bind(email, id, email).run();
  return { id, cookie: id === guestId ? null : await newSession(DB, id, req) };
}

const redirect = (to, cookies = []) => {
  const h = new Headers({ location: to });
  for (const c of cookies) if (c) h.append('set-cookie', c);
  return new Response(null, { status: 302, headers: h });
};

/* ---------- Google ---------- */

export async function googleStart(env, req) {
  const url = new URL(req.url);
  const state = newId('', 32);
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: `${url.origin}/auth/google/callback`, response_type: 'code',
    scope: 'openid email', state, prompt: 'select_account',
  });
  return redirect('https://accounts.google.com/o/oauth2/v2/auth?' + q, [setCookie('us_oauth', state, 600, isSecure(req))]);
}

export async function googleCallback(DB, env, req) {
  const url = new URL(req.url);
  const state = url.searchParams.get('state'), code = url.searchParams.get('code');
  if (!code || !state || state !== cookies(req).us_oauth) return redirect('/#signin-failed');
  const tr = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${url.origin}/auth/google/callback`, grant_type: 'authorization_code' }),
  });
  if (!tr.ok) return redirect('/#signin-failed');
  const { access_token } = await tr.json();
  const ur = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${access_token}` } });
  if (!ur.ok) return redirect('/#signin-failed');
  const info = await ur.json();
  if (!info.sub) return redirect('/#signin-failed');
  const email = info.email_verified && info.email ? String(info.email).toLowerCase() : null;
  const guest = await sessionPlayer(DB, req);
  const r = await attach(DB, req, guest, 'google_sub', String(info.sub), email);
  return redirect('/#signed-in', [r.cookie, setCookie('us_oauth', '', 0, isSecure(req))]);
}

/* ---------- Email link ---------- */

const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,}$/i;

export async function emailStart(DB, env, req, playerId) {
  let body; try { body = await req.json(); } catch { body = {}; }
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { status: 400, error: 'That email address doesn\'t look right.' };
  const recent = await DB.prepare('SELECT COUNT(*) AS n FROM login_tokens WHERE email = ? AND expires_at > ?').bind(email, now()).first();
  if (recent.n >= 3) return { status: 429, error: 'We already sent a few links. Check your inbox, or try again in 15 minutes.' };
  const tok = newId('', 48);
  await DB.prepare('INSERT INTO login_tokens (token, email, player_id, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256(tok), email, playerId, now() + LINK_TTL).run();
  const link = `${new URL(req.url).origin}/auth/email?token=${tok}`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM || 'unsays <login@unsays.com>', to: [email], subject: 'Your unsays sign-in link',
      text: `Tap this link to sign in to unsays:\n\n${link}\n\nIt works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`,
      html: `<p>Tap the button to sign in to unsays.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#8f6bff;color:#fff;text-decoration:none;font-weight:600">Sign in to unsays</a></p><p style="color:#666">It works once and expires in 15 minutes. If you didn't ask for it, ignore this email.</p>`,
    }),
  });
  if (!r.ok) { console.error('resend', r.status, await r.text()); return { status: 502, error: 'We couldn\'t send the email. Try again in a minute.' }; }
  return { status: 200, ok: true };
}

export async function emailVerify(DB, req) {
  const tok = new URL(req.url).searchParams.get('token') || '';
  const hash = await sha256(tok);
  const row = await DB.prepare('SELECT email, expires_at FROM login_tokens WHERE token = ?').bind(hash).first();
  await DB.prepare('DELETE FROM login_tokens WHERE token = ? OR expires_at < ?').bind(hash, now()).run();
  if (!row || row.expires_at < now()) return redirect('/#signin-expired');
  // Only this browser's own guest is folded in. A link opened elsewhere signs in fresh, so a
  // link someone else requested can never tie your email to their account.
  const guest = await sessionPlayer(DB, req);
  const r = await attach(DB, req, guest, 'email', row.email, null);
  return redirect('/#signed-in', [r.cookie || await newSession(DB, r.id, req)]);
}
