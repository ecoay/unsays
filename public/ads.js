// Ads for free players. The server decides whether ads are on (publisher ID set, real domain) and whether
// this visitor is ad-free (Guild Pass owner). The game decides where: placeAd() only ever runs in the lobby
// and the between-games screens, never while anyone is writing or voting.
// Consent: Google's own consent message (AdSense > Privacy & messaging) runs inside adsbygoogle.js, so
// visitors in the EEA, UK and Switzerland are asked before any ad cookies are set.

let CFG = null, loaded = false;
const config = () => CFG || (CFG = fetch('/api/ads', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : {}).catch(() => ({})));

function loadScript(client) {
  if (loaded) return;
  loaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  document.head.appendChild(s);
}

// Fills `el` with a fresh ad unit of the given kind ('lobby', 'break' or 'content'), or leaves it empty.
// Call it on a visible element: AdSense can't size a unit inside display:none.
export async function placeAd(el, kind) {
  if (!el || el.dataset.ad === 'filled') return false;
  const c = await config();
  const slot = c.client && !c.adFree && c.slots && c.slots[kind];
  if (!slot || !el.isConnected) { el.hidden = true; return false; }
  el.dataset.ad = 'filled';
  el.hidden = false;
  el.classList.add('ad-slot');
  el.innerHTML = `<span class="ad-label">Advertisement</span><ins class="adsbygoogle" style="display:block" data-ad-client="${c.client}" data-ad-slot="${slot}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
  loadScript(c.client);
  try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { console.warn('ads', e); }
  return true;
}

// Reopens Google's consent message so visitors can change their choice.
export function privacyChoices() {
  window.googlefc = window.googlefc || {};
  window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
  window.googlefc.callbackQueue.push(() => window.googlefc.showRevocationMessage());
}

// Buying a Guild Pass mid-session takes the ads away right away.
window.addEventListener('unsays:me', e => {
  if (!e.detail || !e.detail.adFree) return;
  config().then(c => { c.adFree = true; });
  document.querySelectorAll('.ad-slot').forEach(el => el.remove());
});

// Content pages mark their slots with data-ad="content"; the footer link only shows when ads are on.
config().then(c => {
  document.querySelectorAll('[data-ad="content"]').forEach(el => placeAd(el, 'content'));
  if (!c.client || c.adFree) return;
  document.querySelectorAll('[data-privacy-choices]').forEach(a => {
    a.hidden = false;
    a.addEventListener('click', e => { e.preventDefault(); privacyChoices(); });
  });
});
