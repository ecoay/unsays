// RookieGamers portal hookup for the client. It only switches on when unsays runs inside the
// portal's game frame (the portal opens /?rg=1). Then it loads the RookieGamers SDK, reports when
// the game is played, and gets the signed token the server uses to count portal scores.
import { RG_URL } from '/rg.js';

const wanted = !!RG_URL && new URLSearchParams(location.search).has('rg') && window.parent !== window;
let ready = null;

export const inPortal = () => wanted;

export function rgReady() {
  if (!wanted) return Promise.resolve(null);
  if (!ready) ready = new Promise(resolve => {
    const s = document.createElement('script');
    s.src = RG_URL + '/sdk/v1.js';
    s.onload = async () => {
      const r = await window.rg.init({ game: 'unsays' });
      if (r.mode !== 'portal') return resolve(null);
      window.rg.game.loaded();
      resolve(window.rg);
    };
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return ready;
}

export async function rgToken() { const rg = await rgReady(); return rg ? rg.user.token() : null; }
export async function rgUser() { const rg = await rgReady(); return rg ? rg.user.get() : null; }
export async function rgLogin() { const rg = await rgReady(); return rg ? rg.user.login() : null; }
export function rgOnChange(fn) { rgReady().then(rg => rg && rg.user.onChange(fn)); }
export function rgPlaying(on) { rgReady().then(rg => rg && (on ? rg.game.gameplayStart() : rg.game.gameplayStop())); }
export function rgNext() { rgReady().then(rg => rg && rg.promo.showNext()); }
