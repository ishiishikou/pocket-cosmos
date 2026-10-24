import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { PROTOCOL, MAX_MEMBERS, cleanBatch, validRoom, validToken } from '../src/protocol.js';

const token = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest();
const matches = (raw, digest) => validToken(raw) && timingSafeEqual(hash(raw), digest);
const ROOM_LIFE = 6 * 60 * 60 * 1000;
const ROOM_IDLE = 15 * 60 * 1000;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };

export function createCosmosServer({ staticDir = resolve('dist'), now = Date.now, publicOrigin = process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL, maxRooms = 100 } = {}) {
  const rooms = new Map(), creationLimits = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
  let stopping = false;
  const send = (ws, data) => {
    if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 65536) ws.send(JSON.stringify(data));
  };
  function roomBroadcast(room, data) { for (const member of room.members.values()) send(member.ws, data); }
  function roster(room) {
    roomBroadcast(room, { t: 'roster', locked: room.locked, members: [...room.members.values()].map(m => ({ id: m.id, slot: m.slot, host: m.host, online: m.ws?.readyState === WebSocket.OPEN })) });
    const host = [...room.members.values()].find(m => m.host);
    send(host?.ws, { t: 'requests', requests: [...room.pending.values()].map(p => ({ id: p.id, code: p.code })) });
  }
  function endRoom(room, reason = 'closed') {
    roomBroadcast(room, { t: 'ended', reason });
    for (const p of room.pending.values()) { send(p.ws, { t: 'ended', reason }); p.ws.close(1000); }
    for (const m of room.members.values()) m.ws?.close(1000);
    rooms.delete(room.id);
  }
  function reap() {
    for (const room of rooms.values()) {
      if (now() - room.created > ROOM_LIFE || now() - room.active > ROOM_IDLE) { endRoom(room, 'expired'); continue; }
      for (const p of room.pending.values()) if (now() - p.created > 120000) {
        send(p.ws, { t: 'denied' }); p.ws.close(1000); room.pending.delete(p.id); roster(room);
      }
    }
    for (const [ip, v] of creationLimits) if (now() > v.expires) creationLimits.delete(ip);
  }
  function sameOrigin(req) {
    if (!req.headers.origin) return false;
    try {
      const o = new URL(req.headers.origin);
      if (publicOrigin) return o.origin === new URL(publicOrigin).origin;
      return ['http:', 'https:'].includes(o.protocol) && o.host === req.headers.host;
    } catch { return false; }
  }
  function json(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data));
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { return json(res, 400, { error: 'invalid_request' }); }
    if (path === '/healthz' && req.method === 'GET') return json(res, stopping ? 503 : 200, { status: stopping ? 'stopping' : 'ok', version: PROTOCOL });
    if (path === '/api/rooms' && req.method === 'POST') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'origin' });
      if (stopping) return json(res, 503, { error: 'busy' });
      // One instance, with a global cap. Do not trust client-supplied forwarding headers.
      const ip = req.socket.remoteAddress;
      let limit = creationLimits.get(ip);
      if (!limit || now() > limit.expires) { limit = { n: 0, expires: now() + 3600000 }; creationLimits.set(ip, limit); }
      if (++limit.n > 30 || rooms.size >= maxRooms) return json(res, 429, { error: 'busy' });
      if (Number(req.headers['content-length'] || 0) > 100) return json(res, 413, { error: 'too_large' });
      req.resume();
      const invite = token(), resume = token(), id = randomBytes(18).toString('base64url'), memberId = randomUUID();
      const host = { id: memberId, slot: 0, host: true, resume: hash(resume), ws: null, lastSeq: -1 };
      rooms.set(id, { id, invite: hash(invite), members: new Map([[memberId, host]]), pending: new Map(), locked: false, created: now(), active: now() });
      return json(res, 201, { room: id, invite, resume, memberId });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method' });
    if (path.includes('\0') || path.includes('\\') || path.split('/').some(p => p.startsWith('.'))) return json(res, 404, { error: 'not_found' });
    const file = resolve(staticDir, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(resolve(staticDir) + sep)) return json(res, 404, { error: 'not_found' });
    try {
      if (!(await stat(file)).isFile()) return json(res, 404, { error: 'not_found' });
      const bytes = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': extname(file) === '.png' ? 'public, max-age=86400' : 'no-cache', 'Content-Length': bytes.length });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { json(res, 404, { error: 'not_found' }); }
  });
  server.headersTimeout = 10000; server.requestTimeout = 15000;
  server.on('upgrade', (req, socket, head) => {
    if (stopping || req.url !== '/socket' || !sameOrigin(req) || wss.clients.size >= 200) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    let room, member, pending, greeted = false, budget = 70, budgetAt = now(), bad = 0;
    let noteAt = 0, whaleAt = 0;
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; if (room && member) room.active = now(); });
    const authTimeout = setTimeout(() => { if (!member && !pending) ws.close(1008, 'authenticate'); }, 10000);
    authTimeout.unref();
    const reject = () => { send(ws, { t: 'error', code: 'unavailable' }); ws.close(1008, 'unavailable'); };
    const joined = (m, resume) => {
      member = m; pending = null;
      const previous = m.ws; m.ws = ws; m.lastSeq = -1;
      if (previous && previous !== ws) previous.close(1000, 'replaced');
      send(ws, { t: 'joined', room: room.id, id: m.id, slot: m.slot, host: m.host, ...(resume ? { resume } : {}), now: now() });
      room.active = now(); roster(room);
    };
    ws.on('message', (raw, isBinary) => {
      const time = now(); budget = Math.min(70, budget + (time - budgetAt) * 0.045); budgetAt = time;
      if (--budget < 0 || isBinary) return ws.close(1008, 'rate');
      let msg; try { msg = JSON.parse(raw.toString()); } catch { return ws.close(1008, 'invalid'); }
      if (!msg || typeof msg !== 'object') return ws.close(1008, 'invalid');
      if (msg.t === 'hello' && !greeted) {
        greeted = true;
        if (msg.v !== PROTOCOL || !validRoom(msg.room) || !validToken(msg.key)) return reject();
        room = rooms.get(msg.room);
        if (!room || time - room.created > ROOM_LIFE) return reject();
        if (msg.kind === 'resume') {
          const m = [...room.members.values()].find(m => matches(msg.key, m.resume));
          if (!m) return reject();
          joined(m); clearTimeout(authTimeout); return;
        }
        if (msg.kind !== 'invite' || room.locked || !matches(msg.key, room.invite) || room.members.size + room.pending.size >= MAX_MEMBERS) return reject();
        const host = [...room.members.values()].find(m => m.host);
        if (host.ws?.readyState !== WebSocket.OPEN) return reject();
        let code; do { code=String(randomInt(10,100)); } while ([...room.pending.values()].some(p=>p.code===code));
        pending = { id: randomUUID(), code, ws, created: time, accept: joined };
        room.pending.set(pending.id, pending);
        send(ws, { t: 'waiting', code: pending.code }); clearTimeout(authTimeout); roster(room); return;
      }
      if (!member || !room || !rooms.has(room.id) || room.members.get(member.id)!==member || member.ws!==ws) { if (++bad > 2) reject(); return; }
      room.active = time;
      if (msg.t === 'ping' && typeof msg.at === 'number' && Number.isFinite(msg.at)) return send(ws, { t: 'pong', at: msg.at, now: time });
      if (msg.t === 'batch') {
        const events = cleanBatch(msg.events);
        if (!events || !Number.isSafeInteger(msg.seq) || msg.seq < 0) { if (++bad > 2) ws.close(1008, 'invalid'); return; }
        if (msg.seq <= member.lastSeq) return;
        member.lastSeq = msg.seq;
        const safe = events.filter(e => {
          if (e.t === 'note') { if (time - noteAt < 70) return false; noteAt = time; }
          if (e.t === 'whale') { if (time - whaleAt < 2500) return false; whaleAt = time; }
          return true;
        });
        if (safe.length) roomBroadcast(room, { t: 'batch', id: member.id, slot: member.slot, seq: msg.seq, at: time + 120, events: safe });
        return;
      }
      if (msg.t === 'leave' && !member.host) {
        room.members.delete(member.id); send(ws, { t: 'ended', reason: 'left' }); ws.close(1000); roster(room); return;
      }
      if (!member.host) return;
      if (msg.t === 'approve' || msg.t === 'deny') {
        const p = room.pending.get(msg.id); if (!p) return;
        room.pending.delete(p.id);
        if (msg.t === 'deny') { send(p.ws, { t: 'denied' }); p.ws.close(1000); roster(room); return; }
        const resume = token();
        const used = new Set([...room.members.values()].map(m => m.slot));
        const slot = Array.from({ length: MAX_MEMBERS }, (_, i) => i).find(i => !used.has(i));
        const m = { id: p.id, slot, host: false, resume: hash(resume), ws: null, lastSeq: -1 };
        room.members.set(m.id, m); p.accept(m, resume); return;
      }
      if (msg.t === 'lock' && typeof msg.locked === 'boolean') {
        room.locked = msg.locked;
        if (room.locked) {
          for (const p of room.pending.values()) { send(p.ws, { t: 'denied' }); p.ws.close(1000); }
          room.pending.clear();
        }
        roster(room); return;
      }
      if (msg.t === 'remove' && typeof msg.id === 'string') {
        const m = room.members.get(msg.id); if (!m || m.host) return;
        room.members.delete(m.id); send(m.ws, { t: 'ended', reason: 'removed' }); m.ws?.close(1000); roster(room); return;
      }
      if (msg.t === 'close') endRoom(room);
    });
    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (!room) return;
      if (pending) room.pending.delete(pending.id);
      if (member?.ws === ws) member.ws = null;
      if (rooms.has(room.id)) roster(room);
    });
    ws.on('error', () => {});
  });
  const heartbeat = setInterval(() => {
    reap();
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false; ws.ping();
    }
  }, 20000);
  heartbeat.unref();
  return { server, reap, async close() {
    stopping = true; clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    await new Promise(resolve => server.close(resolve));
  } };
}
