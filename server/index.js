'use strict';
// Family Dashboard without Home Assistant: serves the dashboard and answers the slice of Home Assistant's API it uses.
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { createApi } = require('./api');
const { accept } = require('./ws');

// Only these files are public. config.js is built here (below); nothing else in the repo is reachable.
const PUBLIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/js/bundle.js': ['js/bundle.js', 'text/javascript; charset=utf-8'],
  '/data/dashboard-data.json': ['data/dashboard-data.json', 'application/json']
};

// This server is the backend, so whatever config.js says about Home Assistant, the page talks back to where it came from.
const BACKEND = `
;(function () {
  var c = window.FAMILY_DASHBOARD_CONFIG = window.FAMILY_DASHBOARD_CONFIG || {};
  c.homeAssistant = Object.assign({}, c.homeAssistant, { url: window.location.origin, token: 'local' });
  c.backend = 'server'; // the page hides the Home Assistant settings
  if (!c.photoEntity) c.photoEntity = 'image.photos';
})();
`;

function start({ port = 8080, dataDir = '/data', appDir = path.join(__dirname, '..'), fetchImpl, password = '' } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const api = createApi({ dataDir, fetchImpl });
  // Optional HTTP Basic password (any user name). Browsers resend it on the page, the API and the WebSocket.
  const hash = (text) => crypto.createHash('sha256').update(text).digest();
  const wanted = hash(password);
  const allowed = (req) => {
    if (!password) return true;
    const given = Buffer.from((/^Basic (.+)$/i.exec(req.headers.authorization || '') || [])[1] || '', 'base64').toString();
    return crypto.timingSafeEqual(hash(given.slice(given.indexOf(':') + 1)), wanted);
  };
  const listeners = new Set(); // { conn, id, type }: sockets that asked for events (subscribe_events)
  const ring = (entityId) => listeners.forEach(({ conn, id, type }) => {
    if (type !== 'state_changed') return;
    const state = (s) => ({ entity_id: entityId, state: s, attributes: {} });
    conn.send(JSON.stringify({ id, type: 'event', event: { event_type: 'state_changed', data: { entity_id: entityId, old_state: state('off'), new_state: state('on') } } }));
  });
  const sockets = new Set();
  const keepalive = setInterval(() => sockets.forEach((conn) => conn.ping()), 30000).unref(); // proxies drop idle sockets
  const send = (res, status, type, body) => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(body); };
  const json = (res, body) => send(res, 200, 'application/json', JSON.stringify(body));

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const route = url.pathname;
    try {
      if (route === '/healthz') return send(res, 200, 'text/plain', 'ok');
      if (!allowed(req)) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Family Dashboard", charset="UTF-8"', 'Content-Type': 'text/plain' });
        return res.end('Password needed');
      }
      // A doorbell, camera or script can ring the dashboard: curl -X POST http://host:8080/api/webhook/binary_sensor.front_door
      const hook = route.match(/^\/api\/webhook\/([a-z_]+\.[a-z0-9_]+)$/i);
      if (hook) {
        if (req.method !== 'POST') return send(res, 405, 'text/plain', 'Use POST');
        ring(hook[1]);
        return json(res, { rang: hook[1] });
      }
      if (PUBLIC[route]) return send(res, 200, PUBLIC[route][1], fs.readFileSync(path.join(appDir, PUBLIC[route][0])));
      if (route === '/config.js') {
        let mine = '';
        try { mine = fs.readFileSync(path.join(dataDir, 'config.js'), 'utf8'); } catch (_) { mine = "window.FAMILY_DASHBOARD_CONFIG = { familyName: 'Our Family' };"; }
        return send(res, 200, 'text/javascript; charset=utf-8', mine + BACKEND);
      }
      if (route === '/api/calendars') return json(res, api.calendars());
      if (route === '/api/config') return json(res, api.location());
      const photo = route.match(/^\/api\/image_proxy\/[^/]+$/);
      if (photo) {
        const img = api.image(url.searchParams.get('token'));
        return img ? send(res, 200, img.type, img.bytes) : send(res, 404, 'text/plain', 'Not found');
      }
      const cam = route.match(/^\/api\/camera_proxy_stream\/([^/]+)$/);
      if (cam) {
        const upstream = api.cameraUrl(cam[1], url.searchParams.get('token'));
        if (!upstream) return send(res, 404, 'text/plain', 'Not found');
        const abort = new AbortController();
        res.on('close', () => abort.abort());
        const feed = await (fetchImpl || fetch)(upstream, { signal: abort.signal });
        res.writeHead(feed.ok ? 200 : 502, { 'Content-Type': feed.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'no-store' });
        return feed.ok && feed.body ? Readable.fromWeb(feed.body).on('error', () => res.end()).pipe(res) : res.end();
      }
      send(res, 404, 'text/plain', 'Not found');
    } catch (e) {
      console.warn(`${route}: ${e.message}`);
      if (!res.headersSent) send(res, 500, 'text/plain', 'Server error'); else res.end();
    }
  });

  server.on('upgrade', (req, socket) => {
    if (new URL(req.url, 'http://x').pathname !== '/api/websocket') return socket.destroy();
    if (!allowed(req)) return socket.end('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="Family Dashboard"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
    let authed = false;
    const mine = [];
    const conn = accept(req, socket, async (text) => {
      let msg;
      try { msg = JSON.parse(text); } catch (_) { return; }
      if (!authed) { // no password here: anyone who can reach the port is let in (see README)
        if (msg.type === 'auth') { authed = true; conn.send(JSON.stringify({ type: 'auth_ok', ha_version: 'family-dashboard' })); }
        return;
      }
      if (msg.type === 'subscribe_events') {
        const sub = { conn, id: msg.id, type: msg.event_type };
        listeners.add(sub); mine.push(sub);
        return conn.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: null }));
      }
      try {
        conn.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: await api.handle(msg) }));
      } catch (e) {
        conn.send(JSON.stringify({ id: msg.id, type: 'result', success: false, error: { code: 'failed', message: e.message } }));
      }
    }, () => { sockets.delete(conn); mine.forEach((sub) => listeners.delete(sub)); });
    sockets.add(conn);
    conn.send(JSON.stringify({ type: 'auth_required' }));
  });

  server.on('close', () => clearInterval(keepalive));
  server.listen(port, () => { console.log(`Family Dashboard on :${server.address().port}, data in ${dataDir}`); api.warm(); });
  return server;
}

if (require.main === module) start({ port: Number(process.env.PORT) || 8080, dataDir: process.env.DATA_DIR || '/data', password: process.env.PASSWORD || '' });

module.exports = { start };
