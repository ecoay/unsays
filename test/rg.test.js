import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './d1.js';
import { migrate, createPlayer, getPlayer, profile, tableProfile } from '../src/db.js';
import { verifyRG, safeAvatar, reportScores } from '../src/rg.js';
import { rgSignIn, newSession } from '../src/auth.js';

const RG = 'https://rookiegamers.com';
const env = { RG_URL: RG };
const SUB = 'p0123456789abcdef0123';
const b64 = buf => Buffer.from(buf).toString('base64url');

// A stand-in RookieGamers portal: its signing key, JWKS and public player profiles.
async function portal() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const kid = 'k' + Math.random().toString(16).slice(2, 10);
  const sign = async (claims) => {
    const body = `${b64(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid }))}.${b64(JSON.stringify(claims))}`;
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(body));
    return `${body}.${b64(sig)}`;
  };
  const claims = (o = {}) => ({ iss: RG, aud: 'unsays', sub: SUB, name: 'bruce', exp: Math.floor(Date.now() / 1000) + 900, ...o });
  const fetcher = async url => {
    if (url.endsWith('/.well-known/jwks.json')) return Response.json({ keys: [{ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y, kid }] });
    if (url.includes('/api/v1/players/')) return Response.json({ player: { id: SUB, name: 'Bruce RG', avatar: `${RG}/icons/hooded-frog.webp`, frame: 'diamond', title: 'unsays champion · Oct 2026' } });
    return new Response('nope', { status: 404 });
  };
  return { sign, claims, fetcher };
}

test('RookieGamers tokens are checked: signature, issuer, audience and expiry', async () => {
  const p = await portal();
  assert.equal((await verifyRG(env, await p.sign(p.claims()), p.fetcher)).sub, SUB);
  assert.equal(await verifyRG(env, await p.sign(p.claims({ aud: 'other-game' })), p.fetcher), null);
  assert.equal(await verifyRG(env, await p.sign(p.claims({ iss: 'https://evil.example' })), p.fetcher), null);
  assert.equal(await verifyRG(env, await p.sign(p.claims({ exp: 1 })), p.fetcher), null);
  const t = await p.sign(p.claims());
  assert.equal(await verifyRG(env, t.slice(0, -4) + 'AAAA', p.fetcher), null, 'tampered signature');
  assert.equal(await verifyRG(env, 'not.a.token', p.fetcher), null);
});

test('only RookieGamers avatars are kept', () => {
  assert.equal(safeAvatar(env, `${RG}/icons/x.webp`), `${RG}/icons/x.webp`);
  assert.ok(safeAvatar(env, 'data:image/svg+xml,%3Csvg%3E'));
  assert.equal(safeAvatar(env, 'https://evil.example/x.png'), null);
  assert.equal(safeAvatar(env, 'javascript:alert(1)'), null);
  assert.equal(safeAvatar(env, 'http://rookiegamers.com/x.png'), null, 'no plain http on the real portal');
});

test('logging in with RookieGamers turns the guest into that account, and a second device joins it', async () => {
  const p = await portal();
  const realFetch = globalThis.fetch;
  globalThis.fetch = p.fetcher;
  try {
    const DB = fakeD1(); await migrate(DB);
    const guest = await createPlayer(DB, { name: 'GuestGal', hue: 40 });
    const cookieOf = c => c.split(';')[0];
    const req = cookie => new Request('https://unsays.com/api/rg/session', { headers: { cookie } });
    const c1 = cookieOf(await newSession(DB, guest, req('')));
    const r1 = await rgSignIn(DB, env, req(c1), await p.sign(p.claims()));
    assert.equal(r1.id, guest, 'the guest becomes the account');
    const me = await profile(DB, guest);
    assert.equal(me.name, 'Bruce RG');
    assert.equal(me.rg.id, SUB);
    assert.equal(me.frame, 'rg-diamond', 'their RookieGamers frame shows until they equip an unsays one');
    assert.ok(me.signedIn);
    const tp = await tableProfile(DB, guest);
    assert.equal(tp.flair.title, 'unsays champion · Oct 2026');
    assert.equal(tp.rgId, SUB);

    // Another browser: its guest folds into the same account.
    const other = await createPlayer(DB, { name: 'phone' });
    const c2 = cookieOf(await newSession(DB, other, req('')));
    const r2 = await rgSignIn(DB, env, req(c2), await p.sign(p.claims()));
    assert.equal(r2.id, guest);
    assert.ok(r2.cookie, 'a new session for the existing account');

    assert.equal((await rgSignIn(DB, env, req(c1), await p.sign(p.claims({ aud: 'x' })))).status, 401);
    assert.equal((await getPlayer(DB, guest)).rg_id, SUB);
  } finally { globalThis.fetch = realFetch; }
});

test('ranked points go to the RookieGamers board for linked players only', async () => {
  const sent = [];
  const fetcher = async (url, init) => { sent.push({ url, auth: init.headers.authorization, body: JSON.parse(init.body) }); return new Response('{}'); };
  await reportScores({ RG_URL: RG }, [{ rgId: SUB, points: 5 }], fetcher);
  assert.equal(sent.length, 0, 'nothing without a server key');
  await reportScores({ RG_URL: RG, RG_SERVER_KEY: 'rgs_x' }, [{ rgId: SUB, points: 5 }, { rgId: null, points: 3 }, { rgId: 'p1', points: 0 }], fetcher);
  assert.deepEqual(sent, [{ url: `${RG}/api/v1/scores`, auth: 'Bearer rgs_x', body: { game: 'unsays', player: SUB, score: 5 } }]);
});
