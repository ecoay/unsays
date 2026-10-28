import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './d1.js';
import { migrate, createPlayer, getPlayer, sendGift, claimDrop, startDrop, exchange, profile, mergePlayers } from '../src/db.js';
import { DAY, PACKS, packById } from '../public/catalog.js';

const fresh = async () => { const DB = fakeD1(); await migrate(DB); return DB; };

test('the gift drop gives 2 gifts once a day for 30 days', async () => {
  const DB = await fresh();
  const id = await createPlayer(DB);
  const t0 = Date.UTC(2026, 10, 1, 12);
  assert.equal(await claimDrop(DB, id, t0), 0, 'nothing before buying');
  await startDrop(DB, id, t0);
  assert.equal(await claimDrop(DB, id, t0), 2);
  assert.equal(await claimDrop(DB, id, t0 + 3600_000), 0, 'once per day');
  assert.equal(await claimDrop(DB, id, t0 + DAY), 2);
  assert.equal(await claimDrop(DB, id, t0 + 30 * DAY), 0, 'over after 30 days');
  assert.equal((await getPlayer(DB, id)).gifts, 4);
  await startDrop(DB, id, t0 + 10 * DAY);
  assert.equal((await getPlayer(DB, id)).drop_until, t0 + 60 * DAY, 'buying again adds 30 days to the end');
});

test('the drop is the cheapest way to get gifts', () => {
  const drop = packById('gift_drop');
  const perGift = drop.price / (drop.perDay * drop.days);
  for (const p of PACKS.filter(p => p.kind === 'gifts')) assert.ok(perGift < p.price / p.gifts, p.id);
});

test('received gifts, not bought ones, pay at the Gift Exchange', async () => {
  const DB = await fresh();
  const a = await createPlayer(DB), b = await createPlayer(DB);
  await DB.prepare('UPDATE players SET gifts = 30 WHERE id = ?').bind(a).run();
  assert.match(await exchange(DB, a, 'x_gifted'), /need 25/);
  assert.equal(await sendGift(DB, { from: a, to: b, kind: 'gift', cost: 25, line: 'x', acro: 'X', table: 't' }), true);
  assert.equal(await sendGift(DB, { from: a, to: b, kind: 'gift', cost: 25, line: 'x', acro: 'X', table: 't' }), false, 'can\'t overspend');
  assert.equal(await exchange(DB, b, 'flair_season'), 'That isn\'t in the Gift Exchange.');
  assert.equal(await exchange(DB, b, 'x_gifted'), null);
  assert.match(await exchange(DB, b, 'x_gifted'), /already/);
  const me = await profile(DB, b);
  assert.equal(me.earned, 0);
  assert.ok(me.unlocked.title.includes('gifted'));
});

test('merging a guest keeps its received gifts and drop', async () => {
  const DB = await fresh();
  const guest = await createPlayer(DB), acct = await createPlayer(DB);
  await DB.prepare('UPDATE players SET earned = 7, drop_until = 99 WHERE id = ?').bind(guest).run();
  await mergePlayers(DB, guest, acct);
  const p = await getPlayer(DB, acct);
  assert.equal(p.earned, 7);
  assert.equal(p.drop_until, 99);
});

test('an existing database gets the new columns', async () => {
  const D1 = fakeD1();
  D1.raw.exec(`CREATE TABLE players (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT 'guest', hue INTEGER NOT NULL DEFAULT 0, email TEXT UNIQUE, google_sub TEXT UNIQUE,
    stripe_customer TEXT, gifts INTEGER NOT NULL DEFAULT 0, equip TEXT NOT NULL DEFAULT '{}', guild_id TEXT, created_at INTEGER NOT NULL, seen_at INTEGER NOT NULL)`);
  await migrate(D1);
  const id = await createPlayer(D1);
  assert.equal((await getPlayer(D1, id)).earned, 0);
});

test('guild logos use the LLC icon set and a fixed color list', async () => {
  const { ICONS, ICON_GROUPS } = await import('../public/guild-icons.js');
  const { logoSVG, logoURL, GUILD_COLORS } = await import('../public/guild-logo.js');
  assert.equal(Object.keys(ICONS).length, 204);
  assert.deepEqual(ICON_GROUPS, ['Animals', 'Faces', 'Food', 'Things', 'Brands']);
  assert.match(logoSVG(ICONS.cow, 'gold'), new RegExp(GUILD_COLORS.gold[1]));
  assert.equal(logoURL('<script>', 'nope'), '/gi/briefcase-pink.svg');
});

test('check-in streaks grow the reward and win flair at milestones', async () => {
  const { checkIn } = await import('../src/db.js');
  const { checkinGifts } = await import('../public/catalog.js');
  assert.deepEqual([1, 6, 7, 8, 14, 15, 22, 30, 100].map(checkinGifts), [1, 1, 4, 2, 5, 3, 4, 4, 4]);
  const DB = await fresh();
  const id = await createPlayer(DB);
  const t0 = Date.UTC(2026, 10, 1, 12);
  let total = 0;
  for (let d = 0; d < 14; d++) { const r = await checkIn(DB, id, t0 + d * DAY); assert.equal(r.streak, d + 1); total += r.gifts; }
  assert.equal(await checkIn(DB, id, t0 + 13 * DAY + 3600_000), null, 'once a day');
  const p = await getPlayer(DB, id);
  assert.equal(p.gifts, total);
  const owned = (await DB.prepare('SELECT item FROM owned WHERE player_id = ?').bind(id).all()).results.map(r => r.item).sort();
  assert.deepEqual(owned, ['streak_14', 'streak_3', 'streak_7']);
  assert.equal((await checkIn(DB, id, t0 + 16 * DAY)).streak, 1, 'a missed day starts over');
  const me = await profile(DB, id);
  assert.ok(me.unlocked.name.includes('graffiti'));
  assert.equal(me.checkin.best, 14);
});

test('friend streaks count days played together', async () => {
  const { recordFriends, friendStreaks } = await import('../src/db.js');
  const DB = await fresh();
  const [a, b, c] = [await createPlayer(DB, { name: 'a' }), await createPlayer(DB, { name: 'b' }), await createPlayer(DB, { name: 'c' })];
  const t0 = Date.UTC(2026, 10, 1, 12);
  assert.equal((await recordFriends(DB, [a, b, c], t0)).length, 3);
  assert.equal((await recordFriends(DB, [a, b], t0 + 60_000)).length, 0, 'same day doesn\'t move it');
  for (let d = 1; d < 7; d++) await recordFriends(DB, [a, b], t0 + d * DAY);
  const mine = await friendStreaks(DB, a, t0 + 6 * DAY);
  assert.equal(mine[0].streak, 7);
  assert.equal(mine[0].name, 'b');
  assert.equal(mine.length, 1, 'the streak with c lapsed');
  assert.ok(await DB.prepare('SELECT 1 FROM owned WHERE player_id = ? AND item = ?').bind(b, 'fstreak_7').first());
});
