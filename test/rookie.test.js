import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './d1.js';
import { migrate, createPlayer } from '../src/db.js';
import { verifyRG, rgPlayer, reportRound } from '../src/rookie.js';

const b64 = b => Buffer.from(b).toString('base64url');
const RG = 'https://rg.test';

async function portal() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const kid = 'k' + Math.random().toString(36).slice(2);
  const sign = async claims => {
    const body = `${b64(JSON.stringify({ alg: 'ES256', kid }))}.${b64(JSON.stringify({ iss: RG, aud: 'unsays', exp: Math.floor(Date.now() / 1000) + 600, ...claims }))}`;
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(body));
    return `${body}.${b64(sig)}`;
  };
  const posted = [];
  globalThis.fetch = async (url, opts = {}) => {
    if (url === `${RG}/.well-known/jwks.json`) return new Response(JSON.stringify({ keys: [{ ...pub, kid }] }));
    if (url === `${RG}/api/v1/scores`) { posted.push({ auth: opts.headers.authorization, ...JSON.parse(opts.body) }); return new Response('{}'); }
    return new Response('nope', { status: 404 });
  };
  return { sign, posted };
}

test('portal tokens map to one unsays player, and bad tokens are refused', async () => {
  const { sign } = await portal();
  const env = { RG_URL: RG };
  const DB = fakeD1(); await migrate(DB);
  const t = await sign({ sub: 'p_rg1', name: 'Fan' });
  const id = await rgPlayer(DB, env, t);
  assert.ok(id);
  assert.equal(await rgPlayer(DB, env, t), id);
  assert.equal((await DB.prepare('SELECT name FROM players WHERE id = ?').bind(id).first()).name, 'Fan');
  assert.equal(await verifyRG(env, await sign({ sub: 'x', aud: 'other-game' })), null);
  assert.equal(await verifyRG(env, await sign({ sub: 'x', iss: 'https://evil.test' })), null);
  assert.equal(await verifyRG(env, await sign({ sub: 'x', exp: 1 })), null);
  assert.equal(await verifyRG(env, t.slice(0, -3) + 'AAA'), null);
  assert.equal(await verifyRG({}, t), null);
});

test('ranked points go to the portal for portal players only', async () => {
  const { sign, posted } = await portal();
  const env = { RG_URL: RG, RG_SERVER_KEY: 'rgs_secret' };
  const DB = fakeD1(); await migrate(DB);
  const fan = await rgPlayer(DB, env, await sign({ sub: 'p_rg1', name: 'Fan' }));
  const local = await createPlayer(DB);
  await reportRound(DB, env, [{ id: fan, points: 6 }, { id: local, points: 4 }, { id: fan, points: 0 }]);
  assert.deepEqual(posted, [{ auth: 'Bearer rgs_secret', game: 'unsays', player: 'p_rg1', score: 6 }]);
  posted.length = 0;
  await reportRound(DB, { RG_URL: RG }, [{ id: fan, points: 6 }]);
  assert.equal(posted.length, 0);
});
