import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { unlocked, PACKS, EMOJI_FREE } from '../public/catalog.js';
import { verifySignature } from '../src/stripe.js';
import { robots, sitemap, llms } from '../src/pages.js';
import { monthKey, prevMonth, monthLabel } from '../src/db.js';

test('the all-emoji bundle unlocks every emoji pack', () => {
  const u = unlocked(['emoji_all']);
  for (const p of PACKS.filter(p => p.kind === 'emoji' && !p.bundle)) for (const e of p.emoji) assert.ok(u.emoji.has(e), e);
  for (const e of EMOJI_FREE) assert.ok(u.emoji.has(e));
  assert.ok(u.big.has('🎉'));
});

test('earned titles sit beside bought ones', () => {
  const u = unlocked(['flair_titles'], ['Champion · Nov 2026']);
  assert.ok(u.title.has('poet'));
  assert.ok(u.title.has('Champion · Nov 2026'));
  assert.equal(u.name.size, 0);
});

test('Stripe signatures are checked and stale ones rejected', async () => {
  const secret = 'whsec_x', body = '{"id":"evt_1"}', t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  assert.equal(await verifySignature(body, `t=${t},v1=${sig}`, secret), true);
  assert.equal(await verifySignature(body + ' ', `t=${t},v1=${sig}`, secret), false);
  assert.equal(await verifySignature(body, `t=${t},v1=${sig}`, 'whsec_other'), false);
  assert.equal(await verifySignature(body, `t=${t},v1=${sig}`, secret, Date.now() + 600_000), false);
  assert.equal(await verifySignature(body, '', secret), false);
});

test('preview hosts stay out of search; the real site lists every topic page', async () => {
  const env = { SITE_URL: 'https://unsays.com' };
  assert.match(robots(env, false), /Disallow: \//);
  assert.match(robots(env, true), /Sitemap: https:\/\/unsays.com\/sitemap.xml/);
  const xml = await sitemap(env, null);
  assert.equal((xml.match(/\/topics\//g) || []).length, 16);
  assert.match(llms(env), /^# Unsay/);
});

test('month helpers', () => {
  assert.equal(prevMonth('2026-01'), '2025-12');
  assert.equal(monthLabel('2026-11'), 'Nov 2026');
  assert.match(monthKey(), /^\d{4}-\d{2}$/);
});

test('bots favor lines that make sense', async () => {
  const { botPhrase, humanQuality, checkAnswer, makeAcronym } = await import('../public/shared.js');
  for (let i = 0; i < 200; i++) {
    const acro = makeAcronym(3 + (i % 5));
    const p = botPhrase(acro, i % 2 ? 'sports' : null);
    assert.ok(checkAnswer(p.text.replace(/[!?.]+$/, ''), acro).valid, p.text);
  }
  const avg = (words, topic) => { let t = 0; for (let i = 0; i < 50; i++) t += humanQuality(words.split(' '), topic); return t / 50; };
  assert.ok(avg('My boss fired me', 'boss') > avg('Jealous score dont cat', 'boss'));
  assert.ok(avg('Jkdf Sdfg Qwrt') < .3, 'keyboard mash');
});
