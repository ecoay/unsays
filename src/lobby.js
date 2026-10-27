import { DurableObject } from 'cloudflare:workers';
import { PACKS, SPEEDS } from '../public/shared.js';
import { db, now } from './db.js';

// One Lobby object holds every table's settings and live status, and pushes the list to lobby viewers.

const DEFAULT_TABLES = [
  { id: 'neon-lounge', name: 'Neon Lounge', pack: 'all', speed: 'turbo', mode: 'clean', target: 30 },
  { id: 'after-dark', name: 'After Dark', pack: 'all', speed: 'turbo', mode: 'adult', target: 30 },
  { id: 'breakup-booth', name: 'The Breakup Booth', pack: 'love', speed: 'classic', mode: 'adult', target: 30 },
  { id: 'magic-kingdom', name: 'Magic Kingdom Meltdown', pack: 'fan', speed: 'turbo', mode: 'clean', target: 15 },
  { id: 'office-hours', name: 'Office Hours', pack: 'work', speed: 'classic', mode: 'clean', target: 30 },
  { id: 'speedrun', name: 'Speedrun', pack: 'all', speed: 'turbo', mode: 'clean', target: 15 },
  { id: 'old-school', name: 'Old School Acro', pack: 'all', speed: 'classic', mode: 'clean', target: 30 },
  { id: 'thanksgiving', name: 'Thanksgiving Table', pack: 'love', speed: 'turbo', mode: 'clean', target: 15 },
];
const MAX_CUSTOM = 40;
const EMPTY_TTL = 10 * 60 * 1000;

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sockets = new Set();
    this.tables = new Map();
    this.pushTimer = null;
    ctx.blockConcurrencyWhile(async () => {
      const saved = (await ctx.storage.get('tables')) || [];
      for (const t of DEFAULT_TABLES) this.tables.set(t.id, { ...t, special: t.pack !== 'all', custom: false, createdAt: 0 });
      for (const t of saved) if (t.custom) this.tables.set(t.id, t);
      for (const t of this.tables.values()) t.live = { humans: 0, bots: 0, names: [], round: 0, acro: '', phase: 'waiting', emptySince: Date.now() };
      await this.syncGuilds();
    });
  }

  // Each guild with an active Guild Pass gets a permanent members-only table.
  async syncGuilds() {
    const DB = await db(this.env)?.catch(e => { console.error('db', e); return null; });
    if (!DB) return;
    const rows = (await DB.prepare('SELECT id, slug, name, tag, speed, mode FROM guilds WHERE pass_until > ?').bind(now()).all()).results;
    const want = new Set(rows.map(g => 'g-' + g.slug));
    for (const [id, t] of this.tables) if (t.guild && !want.has(id)) this.tables.delete(id);
    for (const g of rows) {
      const id = 'g-' + g.slug, old = this.tables.get(id);
      this.tables.set(id, { id, name: g.name, pack: 'all', speed: SPEEDS[g.speed] ? g.speed : 'turbo', mode: g.mode === 'clean' ? 'clean' : 'adult', target: 30,
        special: true, custom: false, guild: { id: g.id, tag: g.tag, slug: g.slug }, createdAt: 0,
        live: old?.live || { humans: 0, bots: 0, names: [], round: 0, acro: '', phase: 'waiting', emptySince: Date.now() } });
    }
    this.push();
  }

  async save() {
    await this.ctx.storage.put('tables', [...this.tables.values()].filter(t => t.custom).map(({ live, ...t }) => t));
  }

  // Busy tables first, then the house tables in their usual order.
  list() {
    return [...this.tables.values()].sort((a, b) => b.live.humans - a.live.humans).map(t => ({
      id: t.id, name: t.name, pack: t.pack, speed: t.speed, mode: t.mode, target: t.target, special: t.special, custom: t.custom, guild: t.guild || null,
      humans: t.live.humans, bots: t.live.bots, names: t.live.names, round: t.live.round, acro: t.live.acro, phase: t.live.phase,
    }));
  }

  push() {
    if (this.pushTimer) return;
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      const msg = JSON.stringify({ t: 'tables', tables: this.list() });
      for (const ws of this.sockets) { try { ws.send(msg); } catch { this.sockets.delete(ws); } }
    }, 400);
  }

  async sweep() {
    const now = Date.now(); let changed = false;
    for (const t of this.tables.values()) {
      if (t.custom && t.live.humans === 0 && now - t.live.emptySince > EMPTY_TTL) { this.tables.delete(t.id); changed = true; }
    }
    if (changed) { await this.save(); this.push(); }
  }

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === '/ws/lobby') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      this.sockets.add(server);
      server.send(JSON.stringify({ t: 'tables', tables: this.list() }));
      const drop = () => this.sockets.delete(server);
      server.addEventListener('close', drop);
      server.addEventListener('error', drop);
      await this.sweep();
      return new Response(null, { status: 101, webSocket: client });
    }

    if (path === '/internal/guilds/sync') { await this.syncGuilds(); return json({ ok: true }); }

    if (path === '/api/tables' && req.method === 'GET') { await this.sweep(); return json({ tables: this.list() }); }

    if (path === '/api/tables' && req.method === 'POST') {
      await this.sweep();
      let body; try { body = await req.json(); } catch { return json({ error: 'Send the table settings as JSON.' }, 400); }
      if ([...this.tables.values()].filter(t => t.custom).length >= MAX_CUSTOM) return json({ error: 'Too many open tables right now. Join one of the others.' }, 429);
      const name = String(body.name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 28) || 'Untitled table';
      const pack = PACKS[body.pack] ? body.pack : 'all';
      const speed = SPEEDS[body.speed] ? body.speed : 'turbo';
      const mode = body.mode === 'adult' ? 'adult' : 'clean';
      const target = body.target === 15 || body.target === '15' ? 15 : 30;
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'table';
      const id = `${slug}-${crypto.randomUUID().slice(0, 6)}`;
      // The Worker sets x-player from the session cookie; older clients only send cid.
      const cid = req.headers.get('x-player') || String(body.cid || '');
      const host = /^[a-z0-9-]{8,40}$/i.test(cid) ? cid : null;
      const t = { id, name, pack, speed, mode, target, special: pack !== 'all', custom: true, host, createdAt: Date.now(),
        live: { humans: 0, bots: 0, names: [], round: 0, acro: '', phase: 'waiting', emptySince: Date.now() } };
      this.tables.set(id, t);
      await this.save(); this.push();
      return json({ table: this.list().find(x => x.id === id) }, 201);
    }

    let m = path.match(/^\/api\/tables\/([a-z0-9-]+)\/config$/);
    if (m && req.method === 'GET') {
      const t = this.tables.get(m[1]);
      if (!t) return json({ error: 'No such table.' }, 404);
      const { live, ...config } = t;
      return json({ config });
    }

    m = path.match(/^\/api\/tables\/([a-z0-9-]+)\/live$/);
    if (m && req.method === 'POST') {
      const t = this.tables.get(m[1]);
      if (!t) return json({ ok: false }, 404);
      const b = await req.json();
      const wasEmpty = t.live.humans === 0;
      t.live = { humans: b.humans | 0, bots: b.bots | 0, names: (b.names || []).slice(0, 14), round: b.round | 0, acro: String(b.acro || ''), phase: String(b.phase || 'waiting'),
        emptySince: (b.humans | 0) === 0 ? (wasEmpty ? t.live.emptySince : Date.now()) : 0 };
      this.push();
      return json({ ok: true });
    }

    return json({ error: 'Not found' }, 404);
  }
}
