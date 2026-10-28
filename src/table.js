import { DurableObject } from 'cloudflare:workers';
import {
  GENERAL, TOPICS, SPEEDS, BOT_NAMES, CHATTER,
  rnd, pick, shuffle, normal, clean, makeAcronym, checkAnswer, botPhrase, humanQuality, topicById, publicTopic,
} from '../public/shared.js';
import { EMOJI_FREE, GIFTS } from '../public/catalog.js';
import { db, tableProfile, recordRound, recordGameWin, sendGift, recordFriends } from './db.js';

// One Table object per room. It owns the game clock, scoring and bots, and sends each
// player their own view of the state after every change. Sockets are accepted without
// hibernation so the in-memory timers keep running while anyone is connected.

const MIN_SEATS = 5;       // bots fill seats up to this many players
const MAX_HUMANS = 14;
const GRACE_MS = 60_000;   // keep a disconnected player's seat and score this long
const IDLE_MS = 15_000;    // stop the game this long after the last player leaves
const MAX_MSG = 2048;
const IDLE_ROUNDS = 2;     // rounds with no activity before a player is sent to the lobby
// Points reach the leaderboards only when enough real people played the round. Bots never count.
const RANKED_MIN = 3;
const RANKED_MIN_GUILD = 2;
const EMOJI_GAP = 2000;    // one emoji per player every 2 seconds

const uid = () => crypto.randomUUID().slice(0, 8);

export class Table extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.config = null;
    this.players = new Map();
    this.timers = new Set();
    this.chatLog = [];
    this.phase = 'idle';
    this.reportTimer = null;
    this.useBots = true;
  }

  /* ---------- connections ---------- */

  async fetch(req) {
    const id = new URL(req.url).pathname.split('/').pop();
    if (!this.config) {
      const r = await this.lobby().fetch(`https://lobby/api/tables/${id}/config`);
      if (r.ok) {
        this.config = (await r.json()).config;
        // TIME_SCALE (local testing only) shortens every phase.
        const k = Number(this.env.TIME_SCALE) || 1;
        this.T = Object.fromEntries(Object.entries(SPEEDS[this.config.speed]).map(([n, v]) => [n, v * k]));
      }
    }
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    // Set by the Worker from the session cookie, so a player can't claim someone else's account.
    server.verifiedPid = req.headers.get('x-player') || null;
    if (!this.config) {
      server.close(4404, 'This table has closed.');
      return new Response(null, { status: 101, webSocket: client });
    }
    server.addEventListener('message', e => { try { Promise.resolve(this.onMessage(server, e.data)).catch(err => console.error(err)); } catch (err) { console.error(err); } });
    server.addEventListener('close', () => this.onClose(server));
    server.addEventListener('error', () => this.onClose(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  lobby() { return this.env.LOBBY.get(this.env.LOBBY.idFromName('main')); }
  db() { return db(this.env)?.catch(e => { console.error('db', e); return null; }) || Promise.resolve(null); }

  onMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_MSG) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'hello') return this.hello(ws, m);
    const p = this.players.get(ws.pid);
    if (!p || p.ws !== ws) return;
    p.active = true; // any message (typing, chat, answer, vote, pick) counts as activity
    switch (m.t) {
      case 'typing': return;
      case 'answer': return this.answer(p, String(m.text || '').slice(0, 140));
      case 'vote': return this.vote(p, String(m.entry || ''));
      case 'pick': return this.choose(p, String(m.topic || ''));
      case 'chat': return this.userChat(p, String(m.text || '').slice(0, 140));
      case 'again': if (this.phase === 'over') this.newGame(); return;
      case 'start': return this.startFromRoom(p, m.bots !== false);
      case 'bots': if (this.phase === 'waiting' && p.id === this.hostId()) { this.useBots = m.bots !== false; this.broadcast(); } return;
      case 'emoji': return this.emoji(p, String(m.e || ''), m.entry ? String(m.entry) : null);
      case 'gift': return this.gift(p, String(m.entry || ''), m.kind === 'crown' ? 'crown' : 'gift');
      case 'refresh': return this.loadProfile(p).then(() => this.broadcast());
    }
  }

  async loadProfile(p) {
    if (!p.verified) return;
    const DB = await this.db();
    if (!DB) return;
    try { p.prof = await tableProfile(DB, p.id); } catch (e) { console.error('profile', e); }
  }

  async hello(ws, m) {
    const cid = ws.verifiedPid || String(m.cid || '');
    if (!/^[a-z0-9-]{8,40}$/i.test(cid)) return ws.close(4400, 'Bad hello');
    if (this.config.guild) {
      const DB = await this.db();
      const row = DB && ws.verifiedPid && await DB.prepare('SELECT guild_id FROM players WHERE id = ?').bind(cid).first();
      if (!row || row.guild_id !== this.config.guild.id) {
        this.send(ws, { t: 'error', msg: 'This table is for guild members only.' });
        return ws.close(4403, 'Members only');
      }
    }
    const name = String(m.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 18) || 'guest';
    const hue = Math.abs(Number(m.hue) | 0) % 360;
    let p = this.players.get(cid);
    if (p && !p.bot) {
      if (p.ws && p.ws !== ws) { try { p.ws.close(4000, 'You opened this table in another tab.'); } catch {} }
      const wasAway = !p.connected;
      p.ws = ws; p.connected = true; p.name = name; p.hue = hue; p.leftAt = 0; p.active = true;
      if (wasAway) this.sys(`${name} is back.`);
    } else {
      if (this.humans().length >= MAX_HUMANS) { ws.send(JSON.stringify({ t: 'error', msg: 'This table is full.' })); return ws.close(4409, 'Table full'); }
      p = { id: cid, name, hue, bot: false, ws, connected: true, score: 0, leftAt: 0, active: true, idleRounds: 0, verified: !!ws.verifiedPid };
      this.players.set(cid, p);
      this.sys(`${name} sat down.`);
      if (this.phase !== 'idle' && Math.random() < .7) this.later(rnd(.6, 2), () => { const b = this.bots()[0] && pick(this.bots()); if (b) this.chat(b, pick(CHATTER.greet)); });
    }
    ws.pid = cid;
    await this.loadProfile(p);
    if (p.ws !== ws) return; // reconnected again while loading
    this.send(ws, { t: 'welcome', you: cid, config: this.publicConfig(), chat: this.chatLog });
    if (this.phase === 'idle') {
      // Tables people create open as a waiting room so the host can invite friends first.
      if (this.config.custom) { this.phase = 'waiting'; this.useBots = true; this.broadcast(); }
      else this.newGame();
    } else if (this.phase === 'waiting') this.broadcast();
    else { this.maintainBots(false); this.broadcast(); }
    this.report();
  }

  onClose(ws) {
    const p = this.players.get(ws.pid);
    if (!p || p.ws !== ws) return;
    p.ws = null; p.connected = false; p.leftAt = Date.now();
    this.sys(`${p.name} left.`);
    setTimeout(() => {
      if (!p.connected && this.players.get(p.id) === p && Date.now() - p.leftAt >= GRACE_MS - 50) { this.players.delete(p.id); this.broadcast(); this.report(); }
    }, GRACE_MS);
    setTimeout(() => { if (this.connected().length === 0) this.stopGame(); }, IDLE_MS);
    this.broadcast(); this.report();
  }

  /* ---------- helpers ---------- */

  humans() { return [...this.players.values()].filter(p => !p.bot); }
  connected() { return this.humans().filter(p => p.connected); }
  bots() { return [...this.players.values()].filter(p => p.bot); }
  active() { return [...this.players.values()].filter(p => p.bot || p.connected); }
  byId(id) { return this.players.get(id) || { id, name: 'someone', hue: 0, bot: true, score: 0 }; }
  publicConfig() { const { live, ...c } = this.config; return c; }

  later(sec, fn) {
    const h = setTimeout(() => { this.timers.delete(h); try { fn(); } catch (e) { console.error(e); } }, sec * 1000);
    this.timers.add(h); return h;
  }
  clearTimers() { for (const h of this.timers) clearTimeout(h); this.timers.clear(); }

  send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch {} }

  chat(p, text, kind = 'say') {
    const msg = { t: 'chat', kind, name: p ? p.name : null, hue: p ? p.hue : 0, tag: p?.prof?.guild?.tag || null, style: p?.prof?.flair.name || null, text: clean(text, this.config.mode) };
    this.chatLog.push(msg); if (this.chatLog.length > 30) this.chatLog.shift();
    for (const h of this.connected()) this.send(h.ws, msg);
  }
  sys(text) { this.chat(null, text, 'sys'); }
  botChat(kind, prob) {
    if (Math.random() < prob && this.bots().length) { const b = pick(this.bots()); this.later(rnd(.5, 3), () => { if (this.players.has(b.id)) this.chat(b, pick(CHATTER[kind])); }); }
  }
  userChat(p, text) {
    text = text.replace(/[\u0000-\u001f]/g, '').trim();
    if (!text) return;
    const now = Date.now();
    if (now - (p.lastChat || 0) < 700) return;
    p.lastChat = now;
    if (text.startsWith('/me ')) this.chat(p, text.slice(4), 'me'); else this.chat(p, text);
    if (/\b(gm|hi|hey|hello|yo)\b/i.test(text)) this.botChat('greet', .8);
    else this.botChat('reply', .25);
  }

  newBot() {
    const used = new Set([...this.players.values()].map(p => p.name));
    const name = shuffle(BOT_NAMES).find(n => !used.has(n)) || `bot_${uid().slice(0, 4)}`;
    return { id: 'bot-' + uid(), name, hue: Math.floor(rnd(0, 360)), bot: true, score: 0, speed: rnd(.25, .85), wit: rnd(.7, 1.3) };
  }
  // Bots keep the table playable: they fill empty seats and leave as people arrive.
  maintainBots(allowRemove = true) {
    // Without bots a game still needs 2 people, so a lone player always gets bots.
    const want = this.useBots || this.humans().length < 2 ? Math.max(0, MIN_SEATS - this.humans().length) : 0;
    let bots = this.bots();
    while (bots.length < want) { const b = this.newBot(); this.players.set(b.id, b); bots.push(b); }
    if (allowRemove && bots.length > want) {
      for (const b of bots.sort((a, c) => a.score - c.score).slice(0, bots.length - want)) this.players.delete(b.id);
    }
  }

  report() {
    if (this.reportTimer) return;
    this.reportTimer = setTimeout(async () => {
      this.reportTimer = null;
      const phaseName = { compose: 'writing', vote: 'voting', results: 'results', pick: 'picking', foCompose: 'face-off', foVote: 'face-off', foResults: 'face-off', over: 'game over', waiting: 'waiting room' }[this.phase] || 'waiting';
      try {
        await this.lobby().fetch(`https://lobby/api/tables/${this.config.id}/live`, {
          method: 'POST',
          body: JSON.stringify({ humans: this.connected().length, bots: this.bots().length, names: [...this.players.values()].map(p => p.name), round: this.round || 0, acro: this.acro || '', phase: phaseName }),
        });
      } catch (e) { console.error('report failed', e); }
    }, 1000);
  }

  /* ---------- clock ---------- */

  setPhase(phase, secs, onEnd) {
    this.phase = phase; this.dur = secs; this.endsAt = Date.now() + secs * 1000; this.onEnd = onEnd;
    if (this.endTimer) { clearTimeout(this.endTimer); this.timers.delete(this.endTimer); }
    this.endTimer = this.later(secs, onEnd);
    this.broadcast(); this.report();
  }
  // Everyone is done: end the phase after a short grace instead of waiting out the clock.
  cutShort() {
    if (this.endsAt - Date.now() > 1400) {
      clearTimeout(this.endTimer); this.timers.delete(this.endTimer);
      this.endsAt = Date.now() + 1200;
      this.endTimer = this.later(1.2, this.onEnd);
      this.broadcast();
    }
  }

  /* ---------- game flow ---------- */

  // The creator hosts; if they're gone, the longest-seated connected player takes over.
  hostId() {
    const c = this.connected();
    const host = c.find(p => p.id === this.config.host);
    return (host || c[0] || {}).id || null;
  }

  startFromRoom(p, bots) {
    if (this.phase !== 'waiting' || p.id !== this.hostId()) return;
    this.useBots = bots;
    this.sys(`${p.name} started the game.`);
    this.newGame();
  }

  newGame() {
    this.clearTimers();
    for (const p of this.players.values()) p.score = 0;
    this.round = 0; this.topic = GENERAL; this.recent = []; this.fo = null; this.champ = null;
    this.maintainBots();
    this.sys('New game. First to ' + this.config.target + ' points.');
    this.phase = 'starting'; this.endsAt = Date.now() + 2500; this.dur = 2.5;
    this.broadcast();
    this.endTimer = this.later(2.5, () => this.compose());
  }

  stopGame() {
    this.clearTimers();
    this.phase = 'idle'; this.acro = ''; this.round = 0;
    for (const b of this.bots()) this.players.delete(b.id);
    for (const p of this.humans()) if (!p.connected) this.players.delete(p.id);
    this.chatLog = [];
    this.report();
  }

  compose() {
    if (this.connected().length === 0) return this.stopGame();
    this.maintainBots();
    this.round++;
    const len = 3 + ((this.round - 1) % 5);
    this.acro = makeAcronym(len);
    this.entries = []; this.votes = {}; this.order = null; this.res = null;
    // Long acronyms get more time: 1.5x for 6 letters, 2x for 7 (as in the original IRC game).
    const secs = this.T.compose * (len >= 7 ? 2 : len === 6 ? 1.5 : 1);
    this.setPhase('compose', secs, () => this.startVote());
    for (const b of this.bots()) this.later(secs * rnd(b.speed * .45, Math.min(.95, b.speed + .2)), () => this.botEntry(b));
    this.botChat('compose', .5);
  }

  botEntry(b) {
    const ph0 = this.phase;
    if ((ph0 !== 'compose' && ph0 !== 'foCompose') || !this.players.has(b.id) || this.entries.some(e => e.pid === b.id)) return;
    const topicId = this.topic.id === 'general' ? null : this.topic.id;
    let ph, tries = 0;
    do { ph = botPhrase(this.acro, topicId); tries++; } while (this.entries.some(e => normal(e.text) === normal(ph.text)) && tries < 10);
    this.entries.push({ id: uid(), pid: b.id, text: ph.text, q: ph.q * b.wit, at: Date.now() });
    this.afterEntry();
  }

  writers() {
    return this.phase === 'foCompose' ? [this.fo.a, this.fo.b].map(id => this.byId(id)).filter(p => p.bot || p.connected) : this.active();
  }
  // Once every person has answered, bots answer straight away so nobody waits on them.
  afterEntry() {
    const writers = this.writers();
    const done = id => this.entries.some(e => e.pid === id);
    if (writers.every(p => done(p.id))) return this.cutShort();
    if (writers.filter(p => !p.bot).every(p => done(p.id))) {
      for (const b of writers.filter(p => p.bot && !done(p.id))) this.botEntry(b);
      return;
    }
    this.broadcast();
  }

  answer(p, text) {
    const fo = this.phase === 'foCompose';
    if (this.phase !== 'compose' && !fo) return this.send(p.ws, { t: 'answer', ok: false, msg: 'Answers are closed for this round.' });
    if (fo && p.id !== this.fo.a && p.id !== this.fo.b) return this.send(p.ws, { t: 'answer', ok: false, msg: 'Only the finalists write in the face-off.' });
    text = text.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
    const chk = checkAnswer(text, this.acro);
    if (!chk.valid) return this.send(p.ws, { t: 'answer', ok: false, msg: 'Each word has to start with the next letter.' });
    const n = normal(text);
    if (this.entries.some(e => e.pid !== p.id && normal(e.text) === n)) return this.send(p.ws, { t: 'answer', ok: false, msg: 'Someone already wrote that exact line.' });
    const mine = this.entries.find(e => e.pid === p.id);
    if (mine) { mine.text = text; this.send(p.ws, { t: 'answer', ok: true, edited: true }); return this.broadcast(); }
    this.entries.push({ id: uid(), pid: p.id, text, q: humanQuality(chk.words), at: Date.now() });
    this.send(p.ws, { t: 'answer', ok: true });
    this.afterEntry();
  }

  startVote() {
    if (this.entries.length < 2) {
      this.sys('Not enough answers this round.');
      this.phase = 'starting'; this.broadcast();
      this.endTimer = this.later(1.5, () => this.compose());
      return;
    }
    this.order = shuffle(this.entries);
    this.setPhase('vote', this.T.vote, () => this.results());
    for (const b of this.bots()) this.later(this.T.vote * rnd(.15, .8), () => this.botVote(b));
    this.botChat('vote', .4);
  }

  weightedPick(opts) {
    const w = opts.map(e => Math.pow(e.q, 2.2));
    let r = Math.random() * w.reduce((a, c) => a + c, 0);
    for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) return opts[i]; }
    return opts[opts.length - 1];
  }

  voters() {
    if (this.phase === 'foVote') return this.active().filter(p => p.id !== this.fo.a && p.id !== this.fo.b);
    return this.active();
  }
  botVote(b) {
    const fo = this.phase === 'foVote';
    if ((this.phase !== 'vote' && !fo) || !this.players.has(b.id) || this.votes[b.id]) return;
    if (fo && (b.id === this.fo.a || b.id === this.fo.b)) return;
    this.votes[b.id] = this.weightedPick(fo ? this.entries : this.entries.filter(e => e.pid !== b.id)).id;
    this.afterVote();
  }
  // Same for votes: when every person has voted, the bots vote now and the round moves on.
  afterVote() {
    const voters = this.voters();
    if (voters.every(v => this.votes[v.id])) return this.cutShort();
    if (voters.filter(v => !v.bot).every(v => this.votes[v.id])) {
      for (const b of voters.filter(v => v.bot && !this.votes[v.id])) this.botVote(b);
      return;
    }
    this.broadcast();
  }

  vote(p, entryId) {
    const fo = this.phase === 'foVote';
    if (this.phase !== 'vote' && !fo) return;
    if (fo && (p.id === this.fo.a || p.id === this.fo.b)) return;
    const e = this.entries.find(x => x.id === entryId);
    if (!e || e.pid === p.id) return;
    this.votes[p.id] = e.id;
    this.afterVote();
  }

  results() {
    const byEntry = new Map(this.entries.map(e => [e.id, e]));
    const tally = {}; for (const e of this.entries) tally[e.pid] = 0;
    for (const v in this.votes) { const e = byEntry.get(this.votes[v]); if (e) tally[e.pid]++; }
    const sorted = this.entries.slice().sort((a, b) => (tally[b.pid] - tally[a.pid]) || (a.at - b.at));
    const winner = tally[sorted[0].pid] > 0 ? sorted[0] : null;
    const fastest = this.entries.slice().sort((a, b) => a.at - b.at).find(e => tally[e.pid] > 0); // speed bonus needs at least one vote
    const gain = {}, why = {};
    for (const p of this.players.values()) { gain[p.id] = 0; why[p.id] = []; }
    for (const e of this.entries) { gain[e.pid] = (gain[e.pid] || 0) + tally[e.pid]; why[e.pid] ||= []; if (tally[e.pid]) why[e.pid].push(['', `+${tally[e.pid]} vote${tally[e.pid] > 1 ? 's' : ''}`]); }
    if (winner) { gain[winner.pid] += this.acro.length; why[winner.pid].push(['gold', `+${this.acro.length} win`]); }
    if (fastest) { gain[fastest.pid] += 2; why[fastest.pid].push(['cy', '+2 speed']); }
    if (winner) for (const v in this.votes) if (this.votes[v] === winner.id && gain[v] != null) { gain[v] += 1; why[v].push(['pk', '+1 voter']); }
    const forfeit = {};
    for (const p of this.humans()) if (!this.votes[p.id]) { forfeit[p.id] = gain[p.id] > 0; gain[p.id] = 0; }
    for (const id in gain) { const p = this.players.get(id); if (p) p.score += gain[id]; }
    this.rankRound(gain, winner ? winner.pid : null);
    this.checkIdle();
    const fx = pid => this.players.get(pid)?.prof?.flair.reveal || null;
    this.res = { tally, winner: winner ? winner.pid : null, gain, forfeit, gifts: {},
      winFx: winner ? this.players.get(winner.pid)?.prof?.flair.win || null : null,
      entries: sorted.map(e => ({ id: e.id, pid: e.pid, text: e.text, why: why[e.pid] || [], fx: fx(e.pid) })) };
    this.setPhase('results', this.T.results, () => this.afterResults());
    if (winner) {
      const w = this.byId(winner.pid);
      this.sys(`${w.name} wins round ${this.round} with "${winner.text}"`);
      if (w.bot) this.later(rnd(.6, 2), () => { if (this.players.has(w.id)) this.chat(w, pick(CHATTER.win)); });
      this.botChat('lose', .35);
    }
  }

  /* ---------- leaderboards, emoji and gifts ---------- */

  ranked() {
    const real = this.connected().filter(p => p.prof);
    return real.length >= (this.config.guild ? RANKED_MIN_GUILD : RANKED_MIN) ? real : null;
  }

  rankRound(gain, winnerId) {
    const real = this.ranked();
    this.wasRanked = !!real;
    if (!real) return;
    const rows = real.map(p => ({ id: p.id, points: gain[p.id] || 0, won: p.id === winnerId }));
    this.db().then(DB => DB && recordRound(DB, rows, this.config.guild?.id || null)).catch(e => console.error('rank', e));
  }

  emoji(p, e, entryId) {
    const now = Date.now();
    if (now - (p.lastEmoji || 0) < EMOJI_GAP) return;
    const mine = p.prof ? p.prof.emoji : EMOJI_FREE;
    if (!mine.includes(e)) return;
    // Emoji land on a specific line only after the votes are revealed, so they can't steer a vote.
    const revealed = (this.phase === 'results' || this.phase === 'foResults') && this.res;
    const entry = revealed && entryId && this.res.entries.some(x => x.id === entryId) ? entryId : null;
    p.lastEmoji = now;
    const msg = { t: 'emoji', e, from: p.id, entry, big: !!p.prof?.big.includes(e) };
    for (const h of this.connected()) this.send(h.ws, msg);
  }

  async gift(p, entryId, kind) {
    if ((this.phase !== 'results' && this.phase !== 'foResults') || !this.res) return;
    const e = this.res.entries.find(x => x.id === entryId);
    const to = e && this.players.get(e.pid);
    const fail = msg => this.send(p.ws, { t: 'gift', ok: false, msg });
    if (!p.prof) return fail('Gifts need an account. Open your profile to set one up.');
    if (!e || !to || to.bot || !to.prof) return fail('Gifts can only go to real players.');
    if (to.id === p.id) return fail('You can\'t gift your own line.');
    const g = GIFTS[kind];
    const DB = await this.db();
    if (!DB) return fail('Gifts are offline right now.');
    const ok = await sendGift(DB, { from: p.id, to: to.id, kind, cost: g.cost, line: e.text, acro: this.acro, table: this.config.id });
    if (!ok) return fail(`You need ${g.cost} gift${g.cost > 1 ? 's' : ''}. Get more in the store.`);
    p.prof.gifts -= g.cost;
    if (this.res) this.res.gifts[e.id] = (this.res.gifts[e.id] || 0) + g.cost;
    this.send(p.ws, { t: 'gift', ok: true, left: p.prof.gifts });
    const msg = { t: 'giftFx', kind, icon: g.icon, from: p.id, to: to.id, entry: e.id };
    for (const h of this.connected()) this.send(h.ws, msg);
    this.sys(`${p.name} sent ${g.icon} to ${to.name}'s line.`);
    this.broadcast();
  }

  // A player who does nothing for 2 rounds in a row (no typing, answer, vote or chat) is
  // probably gone or crashed, so they go back to the lobby and stop holding up the table.
  checkIdle() {
    for (const p of this.connected()) {
      p.idleRounds = p.active ? 0 : (p.idleRounds || 0) + 1;
      p.active = false;
      if (p.idleRounds >= IDLE_ROUNDS) {
        const ws = p.ws;
        this.players.delete(p.id);
        this.send(ws, { t: 'kicked', msg: `You were sent back to the lobby after ${IDLE_ROUNDS} rounds with no answers or votes.` });
        try { ws.close(4408, 'Inactive'); } catch {}
        this.sys(`${p.name} was moved to the lobby for being inactive.`);
      }
    }
    if (this.connected().length === 0) this.later(1, () => this.stopGame());
    this.report();
  }

  afterResults() {
    const top = [...this.players.values()].sort((a, b) => b.score - a.score)[0];
    if (top && top.score >= this.config.target) return this.faceoff();
    this.pickTopic();
  }

  topicOptions() {
    const pool = TOPICS.filter(t => (this.config.pack === 'all' || t.pack === this.config.pack) && !this.recent.includes(t.id));
    const opts = shuffle(pool).slice(0, 3);
    if (opts.length && !opts.some(o => o.style === 'aud')) {
      const a = shuffle(pool.filter(t => t.style === 'aud' && !opts.includes(t)))[0];
      if (a) opts[opts.length - 1] = a;
    }
    return [...opts, GENERAL];
  }

  pickTopic() {
    this.picker = this.res.winner; this.opts = this.topicOptions(); this.chosen = null;
    if (!this.picker || !this.players.has(this.picker)) return this.applyTopic(GENERAL);
    this.setPhase('pick', this.T.pick, () => this.applyTopic(this.chosen || GENERAL));
    const p = this.byId(this.picker);
    if (p.bot) this.later(rnd(1.2, 3.2), () => {
      const topics = this.opts.slice(0, -1);
      this.choose(p, (Math.random() < .35 || !topics.length ? GENERAL : pick(topics)).id);
    });
  }

  choose(p, topicId) {
    if (this.phase !== 'pick' || this.chosen || p.id !== this.picker) return;
    const t = this.opts.find(o => o.id === topicId);
    if (!t) return;
    this.chosen = t;
    clearTimeout(this.endTimer); this.timers.delete(this.endTimer);
    this.endsAt = Date.now() + 1100;
    this.endTimer = this.later(1.1, () => this.applyTopic(t));
    this.broadcast();
  }

  applyTopic(t) {
    this.topic = t;
    if (t.id !== 'general') { this.recent.push(t.id); if (this.recent.length > 3) this.recent.shift(); }
    this.compose();
  }

  /* ---------- face-off ---------- */

  faceoff() {
    const lastAt = id => this.entries.find(e => e.pid === id)?.at ?? Infinity;
    const ranked = [...this.players.values()].sort((a, b) => (b.score - a.score) || (lastAt(a.id) - lastAt(b.id)));
    const [a, b] = ranked;
    this.fo = { a: a.id, b: b.id, r: 0, lens: [3, 4, 4], votes: { [a.id]: 0, [b.id]: 0 }, speed: { [a.id]: 0, [b.id]: 0 } };
    this.topic = GENERAL;
    this.sys(`${a.name} hit ${this.config.target}. Face-off: ${a.name} vs ${b.name}.`);
    this.foCompose();
  }

  foCompose() {
    this.acro = makeAcronym(this.fo.lens[this.fo.r]);
    this.entries = []; this.votes = {}; this.order = null; this.res = null;
    this.foStart = Date.now();
    this.setPhase('foCompose', this.T.foCompose, () => this.foVote());
    for (const id of [this.fo.a, this.fo.b]) {
      const f = this.players.get(id);
      if (f && f.bot) this.later(this.T.foCompose * rnd(.3, .85), () => this.botEntry(f));
    }
  }

  foVote() {
    for (const id of [this.fo.a, this.fo.b]) {
      if (!this.entries.find(e => e.pid === id)) this.entries.push({ id: uid(), pid: id, text: '(no answer)', q: .05, at: Date.now() + 1e6, blank: true });
    }
    this.order = shuffle(this.entries);
    this.setPhase('foVote', this.T.foVote, () => this.foResults());
    for (const b of this.bots()) {
      if (b.id === this.fo.a || b.id === this.fo.b) continue;
      this.later(this.T.foVote * rnd(.15, .75), () => this.botVote(b));
    }
  }

  foResults() {
    const tally = { [this.fo.a]: 0, [this.fo.b]: 0 };
    for (const v in this.votes) { const e = this.entries.find(x => x.id === this.votes[v]); if (e) tally[e.pid]++; }
    for (const id in tally) { this.fo.votes[id] += tally[id]; const e = this.entries.find(x => x.pid === id); this.fo.speed[id] += e.at - this.foStart; }
    this.res = { tally, gifts: {}, entries: this.entries.map(e => ({ id: e.id, pid: e.pid, text: e.text })) };
    this.setPhase('foResults', this.T.foResults, () => { this.fo.r++; if (this.fo.r < 3) this.foCompose(); else this.gameOver(); });
  }

  gameOver() {
    const { a, b, votes, speed } = this.fo;
    // Tie on votes goes to the faster total entry time across the three rounds.
    const champ = votes[a] !== votes[b] ? (votes[a] > votes[b] ? a : b) : (speed[a] <= speed[b] ? a : b);
    this.champ = champ;
    const c = this.byId(champ);
    if (!c.bot && c.prof && this.wasRanked) this.db().then(DB => DB && recordGameWin(DB, c.id, this.config.guild?.id || null)).catch(e => console.error('win', e));
    this.sys(`${c.name} wins the game ${Math.max(votes[a], votes[b])} to ${Math.min(votes[a], votes[b])}.`);
    this.friendStreaks();
    if (c.bot) this.later(1, () => { if (this.players.has(c.id)) this.chat(c, pick(CHATTER.win)); });
    this.setPhase('over', this.T.over, () => this.newGame());
  }

  // Finishing a game together keeps a daily friend streak going. Each player hears about theirs.
  friendStreaks() {
    const here = this.connected().filter(p => p.prof);
    if (here.length < 2) return;
    this.db().then(async DB => {
      if (!DB) return;
      const news = new Map();
      for (const r of await recordFriends(DB, here.map(p => p.id))) for (const [me, other] of [[r.a, r.b], [r.b, r.a]]) {
        const o = this.players.get(other);
        if (o) news.set(me, [...(news.get(me) || []), `${o.name} ${r.streak}`]);
      }
      for (const [me, list] of news) {
        const p = this.players.get(me);
        if (p?.connected) this.send(p.ws, { t: 'toast', msg: `🔥 Friend streaks: ${list.slice(0, 4).join(', ')}${list.length > 4 ? '…' : ''}` });
      }
    }).catch(e => console.error('friends', e));
  }

  /* ---------- views ---------- */

  status(p) {
    const ph = this.phase;
    if (ph === 'compose' || ph === 'foCompose') {
      if (ph === 'foCompose' && p.id !== this.fo.a && p.id !== this.fo.b) return '';
      return this.entries.some(e => e.pid === p.id) ? 'in' : 'writing';
    }
    if (ph === 'vote' || ph === 'foVote') {
      if (ph === 'foVote' && (p.id === this.fo.a || p.id === this.fo.b)) return 'final';
      return this.votes[p.id] ? 'voted' : 'voting';
    }
    if (ph === 'results' && this.res.gain[p.id]) return `+${this.res.gain[p.id]}`;
    return '';
  }

  view(p) {
    const mode = this.config.mode;
    const ph = this.phase;
    const v = {
      t: 'state', now: Date.now(), phase: ph, endsAt: this.endsAt || 0, dur: this.dur || 0,
      round: this.round || 0, acro: this.acro || '', topic: publicTopic(this.topic || GENERAL), target: this.config.target,
      players: [...this.players.values()].map(x => ({ id: x.id, name: x.name, hue: x.hue, bot: x.bot, score: x.score, connected: x.bot || x.connected, status: ph === 'idle' || ph === 'starting' ? '' : this.status(x),
        tag: x.prof?.guild?.tag || null, style: x.prof?.flair.name || null, title: x.prof?.flair.title || null, acct: !!x.prof })),
      me: p.prof ? { gifts: p.prof.gifts, emoji: p.prof.emoji, account: p.prof.account } : { gifts: 0, emoji: EMOJI_FREE, account: false },
      ranked: !!this.ranked(), guild: this.config.guild || null,
    };
    if (this.fo) v.fo = { a: this.fo.a, b: this.fo.b, r: this.fo.r, votes: this.fo.votes };
    if (ph === 'compose' || ph === 'foCompose') {
      const mine = this.entries.find(e => e.pid === p.id);
      v.compose = { count: this.entries.length, need: ph === 'foCompose' ? 2 : this.active().length, mine: mine ? mine.text : null,
        canWrite: ph === 'compose' || p.id === this.fo.a || p.id === this.fo.b };
    }
    if (ph === 'vote' || ph === 'foVote') {
      v.vote = { entries: this.order.map(e => ({ id: e.id, text: clean(e.text, mode), mine: e.pid === p.id })), mine: this.votes[p.id] || null,
        canVote: ph === 'vote' || (p.id !== this.fo.a && p.id !== this.fo.b) };
    }
    if (ph === 'results') {
      v.results = { winner: this.res.winner, gain: this.res.gain, missedVote: !this.votes[p.id], forfeit: !!this.res.forfeit[p.id], winFx: this.res.winFx,
        entries: this.res.entries.map(e => ({ ...e, text: clean(e.text, mode), gifts: this.res.gifts[e.id] || 0 })) };
    }
    if (ph === 'foResults') v.results = { tally: this.res.tally, entries: this.res.entries.map(e => ({ ...e, text: clean(e.text, mode), gifts: this.res.gifts[e.id] || 0 })) };
    if (ph === 'pick') v.pick = { picker: this.picker, opts: this.opts.map(publicTopic), chosen: this.chosen ? this.chosen.id : null };
    if (ph === 'over') v.champ = this.champ;
    if (ph === 'waiting') v.waiting = { host: this.hostId(), useBots: this.useBots };
    return v;
  }

  broadcast() {
    for (const p of this.connected()) this.send(p.ws, this.view(p));
  }
}
