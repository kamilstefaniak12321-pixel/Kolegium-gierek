import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Rooms } from './rooms.js';
import { GameError, requireThat } from './errors.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function lanAddresses() {
  try {
    return Object.values(networkInterfaces()).flat().filter(a => a && !a.internal && a.family === 'IPv4')
      .map(a => a.address);
  } catch {
    return []; // Some container hosts expose the listening socket but hide their network interfaces.
  }
}

function localInvite(req) {
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(req.headers.host || '');
  if (!localHost || !loopback.includes(req.socket.remoteAddress)) return null;
  const address = lanAddresses().find(ip => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip));
  return address ? 'http://' + address + ':' + req.socket.localPort : null;
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function body(req) {
  requireThat(req.headers['content-type']?.split(';')[0] === 'application/json', 'Wyślij dane jako JSON.', 415);
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    requireThat(length <= 4096, 'Wiadomość jest za długa.', 413);
    chunks.push(chunk);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new GameError('Nieprawidłowy JSON.'); }
  requireThat(data && typeof data === 'object' && !Array.isArray(data), 'Nieprawidłowe dane.');
  return data;
}

function waitForChange(service, room, player, res) {
  function cleanup() {
    clearTimeout(timer);
    room.listeners.delete(reply);
    res.off('close', cleanup);
  }
  function reply() {
    cleanup();
    if (!room.players.includes(player) || !service.rooms.has(room.code)) {
      return json(res, 401, { error: 'Sesja pokoju dobiegła końca.' });
    }
    json(res, 200, service.view(room, player));
  }
  const timer = setTimeout(reply, 20_000);
  room.listeners.add(reply);
  res.once('close', cleanup);
}

async function api(service, req, res, url) {
  const post = req.method === 'POST';
  if (post && url.pathname === '/api/rooms') {
    const data = await body(req);
    return json(res, 201, service.create(data.gameId, data.name));
  }
  const route = /^\/api\/rooms\/([A-Z0-9]{6})\/(join|state|action)$/u.exec(url.pathname);
  requireThat(route, 'Nie znaleziono takiej trasy.', 404);
  const [, code, operation] = route;
  if (post && operation === 'join') return json(res, 201, service.join(code, (await body(req)).name));
  const token = req.headers.authorization?.match(/^Bearer (\S+)$/u)?.[1];
  requireThat(token, 'Dołącz do pokoju, aby zagrać.', 401);
  if (post && operation === 'action') {
    const data = await body(req);
    return json(res, 200, service.action(code, token, data.action, data));
  }
  requireThat(req.method === 'GET' && operation === 'state', 'Ta metoda jest niedostępna.', 405);
  const { room, player } = service.auth(code, token);
  if (url.searchParams.get('after') === String(room.revision)) return waitForChange(service, room, player, res);
  json(res, 200, service.view(room, player));
}

async function serveFile(req, res, url) {
  requireThat(req.method === 'GET' || req.method === 'HEAD', 'Ta metoda jest niedostępna.', 405);
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { throw new GameError('Nieprawidłowy adres.'); }
  const target = resolve(publicDir, '.' + (path === '/' ? '/index.html' : path));
  requireThat(!path.includes('\u0000') && target.startsWith(resolve(publicDir) + sep) && Object.hasOwn(types, extname(target)),
    'Nie znaleziono pliku.', 404);
  let file;
  try { file = await readFile(target); } catch { throw new GameError('Nie znaleziono pliku.', 404); }
  res.writeHead(200, {
    'Content-Type': types[extname(target)], 'Cache-Control': 'no-cache',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  });
  res.end(req.method === 'HEAD' ? undefined : file);
}

export function createServer(service = new Rooms()) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz') return json(res, 200, { ok: true });
      if (url.pathname === '/api/lan' && req.method === 'GET') return json(res, 200, { origin: localInvite(req) });
      if (url.pathname.startsWith('/api/')) return await api(service, req, res, url);
      await serveFile(req, res, url);
    } catch (error) {
      if (!(error instanceof GameError)) console.error(error);
      if (!res.headersSent && !res.destroyed) json(res, error.status || 500, {
        error: error instanceof GameError ? error.message : 'Serwer nie mógł wykonać tej akcji.',
      });
    }
  });
  const timer = setInterval(() => service.tick(), 1000).unref();
  server.once('close', () => clearInterval(timer));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  const server = createServer();
  server.listen(port, host, () => {
    const boundPort = server.address().port;
    console.log('Kolegium gierek → http://localhost:' + boundPort);
    if (host === '0.0.0.0') {
      for (const address of lanAddresses()) console.log('W tej samej sieci Wi-Fi → http://' + address + ':' + boundPort);
    }
  });
}
