import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botPhrase, humanQuality, checkAnswer } from '../public/shared.js';

const avg = f => { let s = 0; for (let i = 0; i < 400; i++) s += f(); return s / 400; };

test('bots rate a readable line from a person above their own lines', () => {
  const acro = 'SEWPS';
  const human = avg(() => humanQuality(checkAnswer('Shes easy, wild passionate swinger.', acro).words, 'weddings'));
  const bot = avg(() => botPhrase(acro, 'weddings').q);
  assert.ok(human > bot * 1.3, `human ${human} vs bot ${bot}`);
});

test('keyboard mashing still rates low', () => {
  assert.ok(humanQuality(checkAnswer('Sdfgh Eqwrt Wxzcv', 'SEW').words, null) < .3);
});

test('bot lines fit the letters and never end in "..."', () => {
  for (const acro of ['SEWPS', 'HSKR', 'CSP', 'ODFLRT', 'MBTWQAD']) for (let i = 0; i < 50; i++) {
    const { text } = botPhrase(acro, 'boss');
    assert.ok(checkAnswer(text, acro).valid, text);
    assert.ok(!text.endsWith('...'), text);
  }
});
