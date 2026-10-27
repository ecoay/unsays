// Accounts, the store, the flair locker and guilds. One sheet with three tabs, opened from the lobby.
import { PACKS, GUILD_PASS, FLAIR, GIFTS, money, titleText } from './catalog.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }

export const ACCOUNT = { me: null, providers: { google: false, email: false }, store: false };

async function api(path, body, method = body ? 'POST' : 'GET') {
  const r = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  let j = {}; try { j = await r.json(); } catch {}
  if (j.me !== undefined) { ACCOUNT.me = j.me; ACCOUNT.providers = j.providers || ACCOUNT.providers; ACCOUNT.store = !!j.store; announce(); }
  if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong.'), { data: j });
  return j;
}
const announce = () => window.dispatchEvent(new CustomEvent('unsays:me', { detail: ACCOUNT.me }));

export async function loadMe() { try { await api('/api/me'); } catch {} return ACCOUNT.me; }
export async function saveMe(name, hue) { try { await api('/api/me', { name, hue }); } catch {} return ACCOUNT.me; }

/* ---------- names with flair ---------- */

// p: { name, tag, style, title }. Used by the scoreboard, chat and results.
export function nameHTML(p, label) {
  const tag = p.tag ? `<span class="gtag">[${esc(p.tag)}]</span>` : '';
  return `${tag}<span class="${p.style ? 'nf-' + esc(p.style) : ''}">${label ?? esc(p.name)}</span>`;
}
export const titleHTML = p => p.title ? `<span class="ptitle">${esc(p.title)}</span>` : '';

/* ---------- sheet ---------- */

let tab = 'profile';
function sheet() {
  let el = $('#metaSheet');
  if (el) return el;
  el = document.createElement('div');
  el.className = 'modal-back'; el.id = 'metaSheet'; el.hidden = true;
  el.innerHTML = `<div class="modal glass sheet" role="dialog" aria-modal="true" aria-label="Your account">
    <div class="sheet-head"><nav class="sheet-tabs" role="tablist">
      <button type="button" role="tab" data-tab="profile">Profile</button><button type="button" role="tab" data-tab="store">Store</button><button type="button" role="tab" data-tab="guild">Guild</button></nav>
      <button class="btn small ghost" type="button" id="sheetClose" aria-label="Close">✕</button></div>
    <div class="sheet-body" id="sheetBody"></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) close(); });
  el.querySelector('#sheetClose').onclick = close;
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; paint(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.hidden) close(); });
  return el;
}
function close() { sheet().hidden = true; }
export async function openSheet(which = 'profile') {
  tab = which;
  const el = sheet(); el.hidden = false;
  if (ACCOUNT.me) paint(); else $('#sheetBody').innerHTML = '<div class="muted">Loading…</div>';
  // Fetch fresh: a purchase may have landed since the page loaded. The first open creates the guest account.
  if (ACCOUNT.me) await loadMe(); else await saveMe();
  paint();
}

function paint() {
  const el = sheet();
  el.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  const body = $('#sheetBody');
  const me = ACCOUNT.me;
  if (!me) { body.innerHTML = '<div class="muted">Accounts are offline right now. You can still play as a guest.</div>'; return; }
  body.innerHTML = tab === 'store' ? storeHTML(me) : tab === 'guild' ? guildHTML(me) : profileHTML(me);
  wire(body, me);
}

/* ---------- profile + locker ---------- */

function signInHTML() {
  const p = ACCOUNT.providers;
  if (!p.google && !p.email) return '<p class="muted">Sign-in is coming soon. Until then your account lives in this browser.</p>';
  return `<div class="signin"><p class="muted">Sign in to keep your points, packs and guild on every device.</p>
    <div class="actions">${p.google ? '<a class="btn" href="/auth/google">Continue with Google</a>' : ''}</div>
    ${p.email ? `<form class="compose" id="emailForm"><input class="field" id="emailIn" type="email" autocomplete="email" placeholder="you@example.com" aria-label="Email" required><button class="btn" type="submit">Email me a link</button></form>` : ''}</div>`;
}

function select(kind, me, label) {
  const opts = me.unlocked[kind];
  const names = kind === 'title' ? Object.fromEntries(opts.map(k => [k, titleText(k)])) : FLAIR[kind];
  const cur = me.equip[kind] || '';
  return `<label><span class="label">${label}</span><select data-equip="${kind}" ${opts.length ? '' : 'disabled'}>
    <option value="">${opts.length ? 'None' : 'Get a pack in the store'}</option>${opts.map(k => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(names[k] || k)}</option>`).join('')}</select></label>`;
}

function profileHTML(me) {
  const s = me.score;
  return `<div class="ph">${`<span class="orb lg" style="--h:${me.hue}"></span>`}<div><div class="ph-name">${nameHTML({ name: me.name, tag: me.guild?.active ? me.guild.tag : null, style: me.equip.name })}</div>
      <div class="muted">${me.signedIn ? `Signed in${me.email ? ' as ' + esc(me.email) : ''}` : 'Guest account'}</div></div></div>
    <div class="stats"><div><b>${s.points}</b><span>points this month</span></div><div><b>${s.round_wins}</b><span>rounds won</span></div><div><b>${s.game_wins}</b><span>games won</span></div><div><b>${me.giftsReceived}</b><span>gifts received</span></div></div>
    <p class="muted small">Points count on the <a href="/leaderboard" target="_blank" rel="noopener">global leaderboard</a> when at least 3 real people play a round. Boards reset monthly, and the top 3 go into the <a href="/hall-of-fame" target="_blank" rel="noopener">Hall of Fame</a>.</p>
    <h3>Locker</h3>
    <div class="row2">${select('name', me, 'Name style')}${select('title', me, 'Title')}</div>
    <div class="row2">${select('win', me, 'Win animation')}${select('reveal', me, 'Vote reveal')}</div>
    <p class="muted small">You have <b>${me.gifts}</b> gift${me.gifts === 1 ? '' : 's'} to send. ${GIFTS.gift.icon} costs 1 and ${GIFTS.crown.icon} costs ${GIFTS.crown.cost}.</p>
    ${me.signedIn ? '<div class="actions"><button class="btn small ghost" type="button" id="signOut">Sign out</button></div>' : signInHTML()}`;
}

/* ---------- store ---------- */

function storeHTML(me) {
  const owned = new Set(me.owned);
  const closed = !ACCOUNT.store;
  const card = p => {
    const have = p.kind !== 'gifts' && (owned.has(p.id) || (p.bundle && p.bundle.every(b => owned.has(b))) || PACKS.some(x => x.bundle && owned.has(x.id) && x.bundle.includes(p.id)));
    return `<div class="sku"><div><b>${esc(p.name)}</b>${p.emoji ? ` <span>${p.emoji.join(' ')}</span>` : ''}<div class="muted small">${esc(p.blurb)}</div></div>
      ${have ? '<span class="tag good">Owned</span>' : `<button class="btn small ${closed ? '' : 'prime'}" type="button" data-buy="${p.id}" ${closed ? 'disabled' : ''}>${money(p.price)}</button>`}</div>`;
  };
  const group = (kind, title) => `<h3>${title}</h3><div class="skus">${PACKS.filter(p => p.kind === kind).map(card).join('')}</div>`;
  return `${closed ? '<p class="notice">The store opens soon. Everything here is coming at launch.</p>' : ''}
    <div class="sku hot"><div><b>Guild Pass</b><div class="muted small">Your crew's own 14-seat table, guild leaderboard and tag. ${money(GUILD_PASS.monthly.price)} a month.</div></div><button class="btn small" type="button" data-goto="guild">See guilds</button></div>
    ${group('flair', 'Flair')}${group('emoji', 'Emoji')}${group('gifts', 'Gifts')}
    <p class="muted small">Nothing in the store adds points or votes. Payments are handled by Stripe.</p>`;
}

/* ---------- guild ---------- */

function guildHTML(me) {
  const g = me.guild;
  if (!g) return `<p>A guild is your crew: a members-only table in the lobby, a guild tag on every member and your own leaderboard. <a href="/guild-pass" target="_blank" rel="noopener">How it works</a></p>
    <p class="muted small">Joining a guild is free. To join one, open the invite link its owner sent you.</p>
    <h3>Start a guild</h3>
    <form id="guildForm" class="gform">
      <label><span class="label">Guild name</span><input class="field" name="name" maxlength="28" required placeholder="The Gas Giants"></label>
      <label><span class="label">Tag (2 to 5 letters)</span><input class="field" name="tag" maxlength="5" required placeholder="FART" style="text-transform:uppercase"></label>
      <div class="row2"><label><span class="label">Speed</span><select name="speed"><option value="turbo">Turbo</option><option value="classic">Classic</option></select></label>
      <label><span class="label">Language</span><select name="mode"><option value="adult">Adult language</option><option value="clean">Keep it clean</option></select></label></div>
      <div class="actions"><button class="btn prime" type="submit">Create guild</button></div>
      <p class="muted small">The guild's table, tag and leaderboard switch on when you add a Guild Pass (${money(GUILD_PASS.monthly.price)} a month).</p></form>`;
  const status = g.active ? `<span class="tag good">Active</span> until ${new Date(g.passUntil).toLocaleDateString()}` : '<span class="tag dim">Paused</span>';
  const head = `<div class="ph"><div><div class="ph-name"><span class="gtag">[${esc(g.tag)}]</span>${esc(g.name)}</div><div class="muted">${status}</div></div></div>`;
  if (!g.owner) return `${head}<p class="muted">You're a member. ${g.active ? 'Find the guild table in the lobby.' : 'The guild table is paused until the owner renews the Guild Pass.'}</p>
    <div class="actions">${g.active ? `<a class="btn" href="/g/${esc(g.slug)}" target="_blank" rel="noopener">Guild leaderboard</a>` : ''}<button class="btn ghost" type="button" id="leaveGuild">Leave guild</button></div>`;
  const link = `${location.origin}/join/${g.invite}`;
  const closed = !ACCOUNT.store;
  return `${head}
    ${g.active && g.subscribed ? `<div class="actions"><button class="btn small" type="button" id="billing">Manage billing</button><a class="btn small" href="/g/${esc(g.slug)}" target="_blank" rel="noopener">Guild leaderboard</a></div>`
      : `<div class="skus"><div class="sku hot"><div><b>Guild Pass · monthly</b><div class="muted small">Table, tag, leaderboard and no ads for you.</div></div><button class="btn small prime" type="button" data-buy="${GUILD_PASS.monthly.id}" ${closed ? 'disabled' : ''}>${money(GUILD_PASS.monthly.price)}/mo</button></div>
        <div class="sku"><div><b>Guild Pass · yearly</b><div class="muted small">${esc(GUILD_PASS.yearly.blurb)}.</div></div><button class="btn small" type="button" data-buy="${GUILD_PASS.yearly.id}" ${closed ? 'disabled' : ''}>${money(GUILD_PASS.yearly.price)}/yr</button></div></div>
        ${closed ? '<p class="notice">The store opens soon.</p>' : ''}`}
    <h3>Invite members</h3>
    <div class="compose"><input class="field" readonly value="${esc(link)}" id="guildLink" aria-label="Invite link"><button class="btn" type="button" id="copyGuild">Copy</button></div>
    <div class="actions"><button class="btn small ghost" type="button" id="resetInvite">Make a new link</button></div>
    <h3>Members (${g.members.length})</h3>
    <div class="members">${g.members.map(m => `<div class="mrow"><span class="orb sm" style="--h:${m.hue}"></span><span>${esc(m.name)}${m.id === me.id ? ' (you)' : ''}</span>${m.id === me.id ? '' : `<button class="btn small ghost" type="button" data-remove="${m.id}">Remove</button>`}</div>`).join('')}</div>
    <h3>Table settings</h3>
    <form id="guildEdit" class="gform"><label><span class="label">Guild name</span><input class="field" name="name" maxlength="28" value="${esc(g.name)}"></label>
      <div class="row2"><label><span class="label">Speed</span><select name="speed"><option value="turbo" ${g.speed === 'turbo' ? 'selected' : ''}>Turbo</option><option value="classic" ${g.speed === 'classic' ? 'selected' : ''}>Classic</option></select></label>
      <label><span class="label">Language</span><select name="mode"><option value="adult" ${g.mode === 'adult' ? 'selected' : ''}>Adult language</option><option value="clean" ${g.mode === 'clean' ? 'selected' : ''}>Keep it clean</option></select></label></div>
      <div class="actions"><button class="btn small" type="submit">Save</button></div></form>`;
}

/* ---------- actions ---------- */

async function act(fn, ok) {
  try { await fn(); if (ok) toast(ok); paint(); }
  catch (e) {
    toast(e.message);
    if (e.data?.signin) { tab = 'profile'; paint(); }
  }
}

function wire(body, me) {
  body.querySelectorAll('[data-equip]').forEach(s => s.onchange = () => {
    const want = { ...me.equip, [s.dataset.equip]: s.value || undefined };
    act(() => api('/api/me/equip', want), 'Saved.');
  });
  body.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { tab = b.dataset.goto; paint(); });
  body.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => act(async () => {
    b.disabled = true;
    try { const j = await api('/api/checkout', { item: b.dataset.buy }); location.href = j.url; }
    finally { b.disabled = false; }
  }));
  body.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => act(() => api('/api/guild/remove', { player: b.dataset.remove }), 'Removed.'));
  const on = (id, fn) => { const el = body.querySelector('#' + id); if (el) el.onclick = fn; };
  on('signOut', () => act(async () => { await api('/api/auth/signout', {}); ACCOUNT.me = null; await saveMe(localName(), localHue()); }, 'Signed out.'));
  on('leaveGuild', () => act(() => api('/api/guild/leave', {}), 'You left the guild.'));
  on('resetInvite', () => act(() => api('/api/guild/invite', {}), 'The old link no longer works.'));
  on('billing', () => act(async () => { const j = await api('/api/portal', {}); location.href = j.url; }));
  on('copyGuild', async () => { const v = body.querySelector('#guildLink').value; try { await navigator.clipboard.writeText(v); toast('Invite link copied.'); } catch { body.querySelector('#guildLink').select(); } });
  const ef = body.querySelector('#emailForm');
  if (ef) ef.onsubmit = e => { e.preventDefault(); act(() => api('/api/auth/email', { email: body.querySelector('#emailIn').value }), 'Check your email for the sign-in link.'); };
  const gf = body.querySelector('#guildForm');
  if (gf) gf.onsubmit = e => { e.preventDefault(); const f = new FormData(gf); act(() => api('/api/guild', Object.fromEntries(f)), 'Guild created.'); };
  const ge = body.querySelector('#guildEdit');
  if (ge) ge.onsubmit = e => { e.preventDefault(); const f = new FormData(ge); act(() => api('/api/guild', Object.fromEntries(f), 'PATCH'), 'Saved.'); };
}

const localName = () => { try { return JSON.parse(localStorage.getItem('unsays.name')) || ''; } catch { return ''; } };
const localHue = () => { try { return JSON.parse(localStorage.getItem('unsays.hue')) || 0; } catch { return 0; } };

// Hash links like /#store or /#bought-emoji_roast come back from other pages and Stripe.
export function hashIntent(hash) {
  if (/^#(store|bought-|guild|profile|account|signed-in|signin-)/.test(hash)) return hash.slice(1);
  return null;
}
export function runIntent(intent) {
  if (!intent) return;
  if (intent === 'store') return openSheet('store');
  if (intent === 'guild') return openSheet('guild');
  if (intent === 'profile' || intent === 'account') return openSheet('profile');
  if (intent === 'signed-in') { toast('Signed in.'); return; }
  if (intent === 'signin-failed') return toast('Sign-in didn\'t finish. Try again.');
  if (intent === 'signin-expired') return toast('That sign-in link expired. Ask for a new one.');
  if (intent.startsWith('bought-')) {
    const id = intent.slice(7);
    const name = PACKS.find(p => p.id === id)?.name || (id.startsWith('guild') ? 'Guild Pass' : 'your purchase');
    toast(`Thanks! ${name} is yours.`);
    // The webhook can land a moment after the redirect, so check again shortly.
    setTimeout(loadMe, 2500); setTimeout(loadMe, 7000);
    if (id.startsWith('guild')) openSheet('guild');
  }
}
