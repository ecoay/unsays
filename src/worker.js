import { Table } from './table.js';
import { Lobby } from './lobby.js';

export { Table, Lobby };

const TABLE_PATH = /^\/ws\/table\/([a-z0-9-]{1,40})$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws/lobby' || url.pathname.startsWith('/api/')) {
      return env.LOBBY.get(env.LOBBY.idFromName('main')).fetch(req);
    }
    const m = url.pathname.match(TABLE_PATH);
    if (m) {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      return env.TABLE.get(env.TABLE.idFromName(m[1])).fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
};
