// RookieGamers on unsays, through the portal's SDK (the `rg` global from rookiegamers.com/sdk/v1.js):
// sign-in, ads, playtime, sound and game XP. If the SDK can't load, unsays still plays, guests only.

const SLUG = 'unsays';
const sdk = () => window.rg && window.rg.version ? window.rg : null;
const wait = ms => new Promise(r => setTimeout(r, ms));

let started = null;
// Resolves to 'portal' (inside rookiegamers.com), 'standalone' (on unsays.com), 'test', or null without the SDK.
export function rgStart() {
  if (started) return started;
  started = (async () => {
    // The SDK script loads async, so give it a couple of seconds to arrive.
    for (let i = 0; i < 20 && !sdk(); i++) await wait(100);
    const rg = sdk();
    if (!rg) return null;
    const r = await Promise.race([rg.init({ game: SLUG }), wait(4000).then(() => null)]);
    return r && r.ok ? r.mode : null;
  })();
  return started;
}

// The signed-in RookieGamers player ({ id, name, avatar, ... }) or null.
export async function rgUser() {
  if (!await rgStart()) return null;
  return sdk().user.get().catch(() => null);
}

// A fresh player token for the unsays server, or null. login: true opens RookieGamers sign-in first.
export async function rgToken({ login = false } = {}) {
  if (!await rgStart()) return null;
  const rg = sdk();
  if (login && !await rg.user.get()) { if (!await rg.user.login()) return null; }
  return rg.user.token().catch(() => null);
}

export const rgAvailable = async () => !!await rgStart();

// Signing out of unsays also forgets the RookieGamers token the SDK saved for this site.
export function rgForget() { try { localStorage.removeItem('rg.auth.' + SLUG); } catch { /* private mode */ } }

export function rgOnUser(fn) { rgStart().then(m => m && sdk().user.onChange(fn)); }

/* ---------- playtime, XP and sound ---------- */

export function rgLoaded() { rgStart().then(m => m && sdk().game.loaded()); }
export function rgPlaying(on) { rgStart().then(m => m && (on ? sdk().game.gameplayStart() : sdk().game.gameplayStop())); }
export function rgXp(n) { if (n > 0) rgStart().then(m => m && sdk().user.get().then(u => u && sdk().level.addXp(Math.min(1000, n | 0)))); }

// fn(muted): the portal's sound button, ads on screen and a hidden tab all mute the game.
export function rgAudio(fn) { rgStart().then(m => { if (!m) return; fn(sdk().audio.muted()); sdk().audio.onChange(fn); }); }

/* ---------- ads ---------- */

// A short ad at a natural break. The portal serves it, caps it at one every 3 minutes, and resolves
// { shown: false } until unsays is in its ad program. Callers decide who never sees one.
export async function rgBreakAd({ before, after } = {}) {
  if (!await rgStart()) return { shown: false };
  return sdk().ads.midgame({ before, after }).catch(() => ({ shown: false }));
}
