import { unlocked, titleText, FLAIR } from '../public/catalog.js';

// D1 holds players, sessions, purchases, guilds, monthly scores, gifts and the Hall of Fame.
// The schema is applied on first use, so a fresh database needs no migration step.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT 'guest', hue INTEGER NOT NULL DEFAULT 0,
    email TEXT UNIQUE, google_sub TEXT UNIQUE, stripe_customer TEXT, gifts INTEGER NOT NULL DEFAULT 0, equip TEXT NOT NULL DEFAULT '{}',
    guild_id TEXT, created_at INTEGER NOT NULL, seen_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS players_guild ON players(guild_id)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, player_id TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS sessions_player ON sessions(player_id)`,
  `CREATE TABLE IF NOT EXISTS login_tokens (token TEXT PRIMARY KEY, email TEXT NOT NULL, player_id TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS owned (player_id TEXT NOT NULL, item TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (player_id, item))`,
  `CREATE TABLE IF NOT EXISTS titles (player_id TEXT NOT NULL, title TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (player_id, title))`,
  `CREATE TABLE IF NOT EXISTS purchases (ref TEXT PRIMARY KEY, player_id TEXT, item TEXT, amount INTEGER, at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS scores (month TEXT NOT NULL, player_id TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0, round_wins INTEGER NOT NULL DEFAULT 0,
    game_wins INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (month, player_id))`,
  `CREATE INDEX IF NOT EXISTS scores_rank ON scores(month, points DESC)`,
  `CREATE TABLE IF NOT EXISTS guilds (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, tag TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL UNIQUE,
    invite TEXT NOT NULL UNIQUE, speed TEXT NOT NULL DEFAULT 'turbo', mode TEXT NOT NULL DEFAULT 'adult', pass_until INTEGER NOT NULL DEFAULT 0,
    sub_id TEXT, sub_status TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS guild_scores (month TEXT NOT NULL, guild_id TEXT NOT NULL, player_id TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0,
    round_wins INTEGER NOT NULL DEFAULT 0, game_wins INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (month, guild_id, player_id))`,
  `CREATE TABLE IF NOT EXISTS gift_events (id INTEGER PRIMARY KEY AUTOINCREMENT, month TEXT NOT NULL, from_id TEXT NOT NULL, to_id TEXT NOT NULL,
    value INTEGER NOT NULL, kind TEXT NOT NULL, line TEXT NOT NULL, acro TEXT NOT NULL, table_id TEXT, at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS gifts_to ON gift_events(month, to_id)`,
  `CREATE TABLE IF NOT EXISTS hall (month TEXT NOT NULL, board TEXT NOT NULL, rank INTEGER NOT NULL, player_id TEXT, guild_id TEXT, name TEXT NOT NULL,
    tag TEXT, value INTEGER NOT NULL, line TEXT, PRIMARY KEY (month, board, rank))`,
];

let ready = null;
export function db(env) {
  if (!env.DB) return null;
  if (!ready) ready = env.DB.batch(SCHEMA.map(s => env.DB.prepare(s))).catch(e => { ready = null; throw e; });
  return ready.then(() => env.DB);
}

export const now = () => Date.now();
export const monthKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 7);
export function prevMonth(m) { const [y, mo] = m.split('-').map(Number); return monthKey(Date.UTC(y, mo - 2, 15)); }
export function monthLabel(m) { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, 15)).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }); }
export const newId = (prefix, n = 20) => prefix + [...crypto.getRandomValues(new Uint8Array(n / 2))].map(b => b.toString(16).padStart(2, '0')).join('');
export async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- players ---------- */

export async function createPlayer(DB, { name = 'guest', hue = 0 } = {}) {
  const id = newId('p');
  await DB.prepare('INSERT INTO players (id, name, hue, created_at, seen_at) VALUES (?, ?, ?, ?, ?)').bind(id, name, hue, now(), now()).run();
  return id;
}

export const getPlayer = (DB, id) => DB.prepare('SELECT * FROM players WHERE id = ?').bind(id).first();

export function guildActive(g) { return !!g && g.pass_until > now(); }

// The view a Table needs to dress a player: guild tag, equipped flair and usable emoji.
export async function tableProfile(DB, id) {
  const [p, owned, titles] = await Promise.all([
    getPlayer(DB, id),
    DB.prepare('SELECT item FROM owned WHERE player_id = ?').bind(id).all(),
    DB.prepare('SELECT title FROM titles WHERE player_id = ?').bind(id).all(),
  ]);
  if (!p) return null;
  const u = unlocked(owned.results.map(r => r.item), titles.results.map(r => r.title));
  const g = p.guild_id ? await DB.prepare('SELECT id, tag, pass_until FROM guilds WHERE id = ?').bind(p.guild_id).first() : null;
  const eq = safeJSON(p.equip);
  const ok = (k, v) => v && u[k].has(v) ? v : null;
  return {
    id, account: !!(p.email || p.google_sub), gifts: p.gifts,
    guild: guildActive(g) ? { id: g.id, tag: g.tag } : null,
    flair: { name: ok('name', eq.name), win: ok('win', eq.win), reveal: ok('reveal', eq.reveal), title: eq.title && u.title.has(eq.title) ? titleText(eq.title) : null },
    emoji: [...u.emoji], big: [...u.big],
  };
}

export async function profile(DB, id) {
  const p = await getPlayer(DB, id);
  if (!p) return null;
  const m = monthKey();
  const [owned, titles, score, received, g] = await Promise.all([
    DB.prepare('SELECT item FROM owned WHERE player_id = ?').bind(id).all(),
    DB.prepare('SELECT title FROM titles WHERE player_id = ? ORDER BY at DESC').bind(id).all(),
    DB.prepare('SELECT points, round_wins, game_wins FROM scores WHERE month = ? AND player_id = ?').bind(m, id).first(),
    DB.prepare('SELECT COALESCE(SUM(value), 0) AS n FROM gift_events WHERE to_id = ?').bind(id).first(),
    p.guild_id ? DB.prepare('SELECT * FROM guilds WHERE id = ?').bind(p.guild_id).first() : null,
  ]);
  const ownedIds = owned.results.map(r => r.item);
  const earned = titles.results.map(r => r.title);
  const u = unlocked(ownedIds, earned);
  let guild = null;
  if (g) {
    guild = { id: g.id, slug: g.slug, name: g.name, tag: g.tag, owner: g.owner_id === id, active: guildActive(g), passUntil: g.pass_until,
      subscribed: !!g.sub_id && g.sub_status !== 'canceled', speed: g.speed, mode: g.mode };
    if (guild.owner) {
      guild.invite = g.invite;
      guild.members = (await DB.prepare('SELECT id, name, hue FROM players WHERE guild_id = ? ORDER BY name').bind(g.id).all()).results;
    }
  }
  const eq = safeJSON(p.equip);
  return {
    id, name: p.name, hue: p.hue, email: p.email, signedIn: !!(p.email || p.google_sub), gifts: p.gifts,
    owned: ownedIds, earnedTitles: earned, equip: eq,
    unlocked: { name: [...u.name], win: [...u.win], reveal: [...u.reveal], title: [...u.title], emoji: [...u.emoji] },
    month: m, score: score || { points: 0, round_wins: 0, game_wins: 0 }, giftsReceived: received.n,
    guild, adFree: !!(g && g.owner_id === id && guildActive(g)),
  };
}

export async function setEquip(DB, id, want) {
  const owned = (await DB.prepare('SELECT item FROM owned WHERE player_id = ?').bind(id).all()).results.map(r => r.item);
  const earned = (await DB.prepare('SELECT title FROM titles WHERE player_id = ?').bind(id).all()).results.map(r => r.title);
  const u = unlocked(owned, earned);
  const eq = {};
  for (const k of ['name', 'win', 'reveal', 'title']) if (want[k] && u[k].has(want[k])) eq[k] = want[k];
  await DB.prepare('UPDATE players SET equip = ? WHERE id = ?').bind(JSON.stringify(eq), id).run();
  return eq;
}

// Signing in on a new device folds that device's guest account into the existing one.
export async function mergePlayers(DB, fromId, intoId) {
  if (fromId === intoId) return;
  const from = await getPlayer(DB, fromId);
  if (!from) return;
  await DB.batch([
    DB.prepare('INSERT OR IGNORE INTO owned (player_id, item, at) SELECT ?, item, at FROM owned WHERE player_id = ?').bind(intoId, fromId),
    DB.prepare('INSERT OR IGNORE INTO titles (player_id, title, at) SELECT ?, title, at FROM titles WHERE player_id = ?').bind(intoId, fromId),
    DB.prepare(`INSERT INTO scores (month, player_id, points, round_wins, game_wins) SELECT month, ?, points, round_wins, game_wins FROM scores WHERE player_id = ?
      ON CONFLICT (month, player_id) DO UPDATE SET points = points + excluded.points, round_wins = round_wins + excluded.round_wins, game_wins = game_wins + excluded.game_wins`).bind(intoId, fromId),
    DB.prepare(`INSERT INTO guild_scores (month, guild_id, player_id, points, round_wins, game_wins) SELECT month, guild_id, ?, points, round_wins, game_wins FROM guild_scores WHERE player_id = ?
      ON CONFLICT (month, guild_id, player_id) DO UPDATE SET points = points + excluded.points, round_wins = round_wins + excluded.round_wins, game_wins = game_wins + excluded.game_wins`).bind(intoId, fromId),
    DB.prepare('UPDATE players SET gifts = gifts + ?, guild_id = COALESCE(guild_id, ?) WHERE id = ?').bind(from.gifts, from.guild_id, intoId),
    DB.prepare('UPDATE guilds SET owner_id = ? WHERE owner_id = ? AND NOT EXISTS (SELECT 1 FROM guilds WHERE owner_id = ?)').bind(intoId, fromId, intoId),
    DB.prepare('UPDATE gift_events SET to_id = ? WHERE to_id = ?').bind(intoId, fromId),
    DB.prepare('UPDATE gift_events SET from_id = ? WHERE from_id = ?').bind(intoId, fromId),
    DB.prepare('UPDATE sessions SET player_id = ? WHERE player_id = ?').bind(intoId, fromId),
    DB.prepare('DELETE FROM scores WHERE player_id = ?').bind(fromId),
    DB.prepare('DELETE FROM guild_scores WHERE player_id = ?').bind(fromId),
    DB.prepare('DELETE FROM owned WHERE player_id = ?').bind(fromId),
    DB.prepare('DELETE FROM titles WHERE player_id = ?').bind(fromId),
    DB.prepare('DELETE FROM players WHERE id = ?').bind(fromId),
  ]);
}

/* ---------- scoring ---------- */

// rows: [{ id, points, won }]; guildId is set when the round was played at a guild table.
export async function recordRound(DB, rows, guildId) {
  const m = monthKey();
  const stmts = rows.filter(r => r.points > 0 || r.won).map(r => guildId
    ? DB.prepare(`INSERT INTO guild_scores (month, guild_id, player_id, points, round_wins) SELECT ?, ?, id, ?, ? FROM players WHERE id = ? AND guild_id = ?
        ON CONFLICT (month, guild_id, player_id) DO UPDATE SET points = points + excluded.points, round_wins = round_wins + excluded.round_wins`).bind(m, guildId, r.points, r.won ? 1 : 0, r.id, guildId)
    : DB.prepare(`INSERT INTO scores (month, player_id, points, round_wins) SELECT ?, id, ?, ? FROM players WHERE id = ?
        ON CONFLICT (month, player_id) DO UPDATE SET points = points + excluded.points, round_wins = round_wins + excluded.round_wins`).bind(m, r.points, r.won ? 1 : 0, r.id));
  if (stmts.length) await DB.batch(stmts);
}

export async function recordGameWin(DB, id, guildId) {
  const m = monthKey();
  await (guildId
    ? DB.prepare(`INSERT INTO guild_scores (month, guild_id, player_id, game_wins) SELECT ?, ?, id, 1 FROM players WHERE id = ? AND guild_id = ?
        ON CONFLICT (month, guild_id, player_id) DO UPDATE SET game_wins = game_wins + 1`).bind(m, guildId, id, guildId)
    : DB.prepare(`INSERT INTO scores (month, player_id, game_wins) SELECT ?, id, 1 FROM players WHERE id = ?
        ON CONFLICT (month, player_id) DO UPDATE SET game_wins = game_wins + 1`).bind(m, id)).run();
}

// Spend gifts on a line. Returns false when the sender can't afford it.
export async function sendGift(DB, { from, to, kind, cost, line, acro, table }) {
  const r = await DB.prepare('UPDATE players SET gifts = gifts - ? WHERE id = ? AND gifts >= ?').bind(cost, from, cost).run();
  if (!r.meta.changes) return false;
  await DB.prepare('INSERT INTO gift_events (month, from_id, to_id, value, kind, line, acro, table_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(monthKey(), from, to, cost, kind, line.slice(0, 160), acro, table, now()).run();
  return true;
}

/* ---------- boards ---------- */

export async function topPlayers(DB, month, limit = 50) {
  return (await DB.prepare(`SELECT s.player_id AS id, p.name, p.hue, s.points, s.round_wins, s.game_wins, g.tag, g.pass_until
    FROM scores s JOIN players p ON p.id = s.player_id LEFT JOIN guilds g ON g.id = p.guild_id
    WHERE s.month = ? AND s.points > 0 ORDER BY s.points DESC, s.game_wins DESC LIMIT ?`).bind(month, limit).all()).results
    .map(r => ({ ...r, tag: r.pass_until > now() ? r.tag : null }));
}

// Guilds rank by their current members' points in public games.
export async function topGuilds(DB, month, limit = 50) {
  return (await DB.prepare(`SELECT g.id, g.slug, g.name, g.tag, COUNT(DISTINCT p.id) AS members, COALESCE(SUM(s.points), 0) AS points
    FROM guilds g JOIN players p ON p.guild_id = g.id LEFT JOIN scores s ON s.player_id = p.id AND s.month = ?
    WHERE g.pass_until > ? GROUP BY g.id HAVING points > 0 ORDER BY points DESC LIMIT ?`).bind(month, now(), limit).all()).results;
}

export async function topGifted(DB, month, limit = 50) {
  return (await DB.prepare(`SELECT e.to_id AS id, p.name, p.hue, SUM(e.value) AS gifts, COUNT(*) AS times
    FROM gift_events e JOIN players p ON p.id = e.to_id WHERE e.month = ? GROUP BY e.to_id ORDER BY gifts DESC LIMIT ?`).bind(month, limit).all()).results;
}

export async function topLine(DB, month) {
  return DB.prepare(`SELECT e.to_id AS id, p.name, e.line, e.acro, SUM(e.value) AS gifts FROM gift_events e JOIN players p ON p.id = e.to_id
    WHERE e.month = ? GROUP BY e.to_id, e.line ORDER BY gifts DESC, MIN(e.at) LIMIT 1`).bind(month).first();
}

export async function guildBoard(DB, guildId, month, limit = 50) {
  return (await DB.prepare(`SELECT s.player_id AS id, p.name, p.hue, s.points, s.round_wins, s.game_wins,
    (SELECT COALESCE(SUM(value), 0) FROM gift_events e WHERE e.to_id = s.player_id AND e.month = s.month) AS gifts
    FROM guild_scores s JOIN players p ON p.id = s.player_id WHERE s.guild_id = ? AND s.month = ? AND s.points > 0
    ORDER BY s.points DESC LIMIT ?`).bind(guildId, month, limit).all()).results;
}

/* ---------- Hall of Fame ---------- */

// Seal a finished month: top 3 players, top guild, most-gifted line, and each guild's top 3.
// Champions get a free title that no pack can buy. Safe to call more than once.
export async function archiveMonth(DB, month) {
  if (month >= monthKey()) return false;
  const done = await DB.prepare("SELECT 1 FROM hall WHERE month = ? AND board = 'sealed'").bind(month).first();
  if (done) return false;
  const label = monthLabel(month);
  const stmts = [];
  const put = (board, rank, row) => stmts.push(DB.prepare('INSERT OR REPLACE INTO hall (month, board, rank, player_id, guild_id, name, tag, value, line) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(month, board, rank, row.player_id || null, row.guild_id || null, row.name, row.tag || null, row.value | 0, row.line || null));
  const title = (pid, t) => stmts.push(DB.prepare('INSERT OR IGNORE INTO titles (player_id, title, at) VALUES (?, ?, ?)').bind(pid, t, now()));

  (await topPlayers(DB, month, 3)).forEach((p, i) => {
    put('players', i + 1, { player_id: p.id, name: p.name, tag: p.tag, value: p.points });
    title(p.id, i === 0 ? `Champion · ${label}` : `Top 3 · ${label}`);
  });
  const g = (await topGuilds(DB, month, 1))[0];
  if (g) put('guilds', 1, { guild_id: g.id, name: g.name, tag: g.tag, value: g.points });
  const line = await topLine(DB, month);
  if (line) { put('line', 1, { player_id: line.id, name: line.name, value: line.gifts, line: line.line }); title(line.id, `Most Gifted · ${label}`); }

  const guilds = (await DB.prepare('SELECT DISTINCT s.guild_id AS id, g.tag FROM guild_scores s JOIN guilds g ON g.id = s.guild_id WHERE s.month = ?').bind(month).all()).results;
  for (const gu of guilds) {
    (await guildBoard(DB, gu.id, month, 3)).forEach((p, i) => {
      put('g:' + gu.id, i + 1, { player_id: p.id, guild_id: gu.id, name: p.name, tag: gu.tag, value: p.points });
      if (i === 0) title(p.id, `[${gu.tag}] Champion · ${label}`);
    });
  }
  put('sealed', 0, { name: 'sealed' });
  await DB.batch(stmts);
  return true;
}

export async function hall(DB, board = 'players') {
  const rows = (await DB.prepare(`SELECT * FROM hall WHERE board = ? OR (? = 'players' AND board IN ('line', 'guilds')) ORDER BY month DESC, board, rank LIMIT 600`).bind(board, board).all()).results;
  const months = new Map();
  for (const r of rows) {
    if (!months.has(r.month)) months.set(r.month, { month: r.month, label: monthLabel(r.month), players: [], guild: null, line: null });
    const m = months.get(r.month);
    if (r.board === 'line') m.line = r; else if (r.board === 'guilds') m.guild = r; else m.players.push(r);
  }
  return [...months.values()];
}

export function safeJSON(s) { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } }
export { FLAIR };
