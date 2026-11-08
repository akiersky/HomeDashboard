'use strict';
// The no-Home-Assistant backend (server/), driven over its real HTTP and WebSocket ports with fake upstreams.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { start } = require('../server/index');
const { expand } = require('../server/ics');
const { sunIsUp } = require('../server/api');

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:America/Chicago
BEGIN:STANDARD
DTSTART:19701101T020000
TZOFFSETFROM:-0500
TZOFFSETTO:-0600
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700308T020000
TZOFFSETFROM:-0600
TZOFFSETTO:-0500
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:soccer
DTSTART;TZID=America/Chicago:20261005T160000
DTEND;TZID=America/Chicago:20261005T170000
RRULE:FREQ=WEEKLY;BYDAY=MO
EXDATE;TZID=America/Chicago:20261019T160000
SUMMARY:Soccer
LOCATION:The park
END:VEVENT
BEGIN:VEVENT
UID:soccer
RECURRENCE-ID;TZID=America/Chicago:20261026T160000
DTSTART;TZID=America/Chicago:20261026T180000
DTEND;TZID=America/Chicago:20261026T190000
SUMMARY:Soccer (moved)
END:VEVENT
BEGIN:VEVENT
UID:halloween
DTSTART;VALUE=DATE:20261031
DTEND;VALUE=DATE:20261101
SUMMARY:Halloween
END:VEVENT
BEGIN:VEVENT
UID:gone
DTSTART:20261007T150000Z
DTEND:20261007T160000Z
STATUS:CANCELLED
SUMMARY:Cancelled
END:VEVENT
END:VCALENDAR`;

test('ics: recurrence, exceptions, exdates, DST, all-day and cancelled events', () => {
  const events = expand(ICS, new Date('2026-10-01T00:00:00Z'), new Date('2026-11-10T00:00:00Z'));
  const soccer = events.filter((e) => e.uid === 'soccer').map((e) => `${e.summary} ${e.start}`);
  assert.deepEqual(soccer, [
    'Soccer 2026-10-05T21:00:00.000Z',        // CDT
    'Soccer 2026-10-12T21:00:00.000Z',
    'Soccer (moved) 2026-10-26T23:00:00.000Z', // the 19th is an EXDATE, the 26th was moved to 18:00
    'Soccer 2026-11-02T22:00:00.000Z',         // CST after the clocks change
    'Soccer 2026-11-09T22:00:00.000Z'
  ]);
  assert.equal(events.find((e) => e.uid === 'soccer').location, 'The park');
  assert.deepEqual(events.filter((e) => e.uid === 'halloween').map((e) => [e.start, e.end]), [['2026-10-31', '2026-11-01']]);
  assert.ok(!events.some((e) => e.uid === 'gone'));
  assert.equal(expand(ICS, new Date('2026-10-13T00:00:00Z'), new Date('2026-10-14T00:00:00Z')).length, 0, 'range filter');
});

// A fake internet: Response objects for the few URLs the server may call.
const fakeFetch = (calls) => async (url, opts = {}) => {
  calls.push(`${opts.method || 'GET'} ${url}`);
  (calls.bodies ||= {})[url] = opts.body;
  if (url.includes('commons.wikimedia.org/w/api.php') && url.includes('list=categorymembers')) {
    return Response.json({ query: { categorymembers: [{ title: 'File:Diagram.svg' }, { title: 'File:Mountain_lake.jpg' }] } });
  }
  if (url.includes('commons.wikimedia.org/w/api.php') && url.includes('prop=imageinfo')) {
    return Response.json({ query: { pages: [{ imageinfo: [{ thumburl: 'https://upload.wikimedia.org/thumb/lake.jpg', extmetadata: {
      ObjectName: { value: 'Mountain lake at dawn' }, Artist: { value: '<a href="//x">Jane &amp; Co</a>' } } }] }] } });
  }
  if (url === 'https://upload.wikimedia.org/thumb/lake.jpg') return new Response(Buffer.from('LAKE'), { headers: { 'content-type': 'image/jpeg' } });
  if (url === 'http://pics.test/a/summer%20day.jpg') return new Response(Buffer.from('SUMMER'), { headers: { 'content-type': 'image/jpeg' } });
  if (url === 'https://cal.example/mom.ics') return new Response(ICS);
  if (url === 'http://immich.test/api/search/random') {
    return Response.json([{ id: 'a1', originalFileName: 'beach_day.jpg', exifInfo: { city: 'Boston', state: 'MA', dateTimeOriginal: '2025-07-04T12:00:00Z' } }]);
  }
  if (url.startsWith('http://immich.test/api/assets/a1/thumbnail')) return new Response(Buffer.from('JPEGDATA'), { headers: { 'content-type': 'image/jpeg' } });
  if (url === 'http://cam.test/stream') return new Response('MJPEG', { headers: { 'content-type': 'multipart/x-mixed-replace' } });
  return new Response('nope', { status: 404 });
};

async function boot(serverJson, { dataDir, password } = {}) {
  dataDir ||= fs.mkdtempSync(path.join(os.tmpdir(), 'fd-server-'));
  if (serverJson) fs.writeFileSync(path.join(dataDir, 'server.json'), JSON.stringify(serverJson));
  const calls = [];
  const server = start({ port: 0, dataDir, fetchImpl: fakeFetch(calls), password });
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  if (password) return { base, port: server.address().port, close: () => { server.close(); server.closeAllConnections(); } };
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/websocket`);
  const waiting = new Map(), events = [];
  const first = new Promise((resolve) => {
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'event') return events.push(msg);
      if (msg.type === 'auth_required') return ws.send(JSON.stringify({ type: 'auth', access_token: 'x' }));
      if (msg.type === 'auth_ok') return resolve();
      waiting.get(msg.id)?.(msg);
    };
  });
  await first;
  let id = 0;
  const call = (msg) => new Promise((resolve) => { const n = ++id; waiting.set(n, resolve); ws.send(JSON.stringify({ ...msg, id: n })); });
  const ok = async (msg) => { const r = await call(msg); assert.ok(r.success, r.error?.message); return r.result; };
  const service = (domain, svc, data, extra) => ok({ type: 'call_service', domain, service: svc, service_data: data, ...extra });
  return { base, calls, dataDir, call, ok, service, events, close: () => { ws.close(); server.close(); server.closeAllConnections(); } };
}

test('shared state survives a restart and big messages cross the socket intact', async () => {
  const a = await boot();
  const doc = { updatedAt: 5, blob: 'x'.repeat(200000) }; // forces the 64-bit frame length both ways
  await a.ok({ type: 'frontend/set_user_data', key: 'family_dashboard_state', value: doc });
  assert.deepEqual((await a.ok({ type: 'frontend/get_user_data', key: 'family_dashboard_state' })).value, doc);
  a.close();
  const b = await boot(null, { dataDir: a.dataDir });
  assert.equal((await b.ok({ type: 'frontend/get_user_data', key: 'family_dashboard_state' })).value.updatedAt, 5);
  assert.equal((await b.ok({ type: 'frontend/get_user_data', key: 'missing' })).value, null);
  b.close();
});

test('to-do lists: add, rename, complete, remove, and unknown or malformed requests fail cleanly', async () => {
  const s = await boot();
  const e = 'todo.groceries';
  await s.service('todo', 'add_item', { entity_id: e, item: 'Milk' });
  await s.service('todo', 'add_item', { entity_id: e, item: 'Eggs' });
  let { items } = await s.ok({ type: 'todo/item/list', entity_id: e });
  assert.deepEqual(items.map((i) => [i.summary, i.status]), [['Milk', 'needs_action'], ['Eggs', 'needs_action']]);
  await s.service('todo', 'update_item', { entity_id: e, item: items[0].uid, rename: 'Oat milk', status: 'completed' });
  ({ items } = await s.ok({ type: 'todo/item/list', entity_id: e }));
  assert.deepEqual([items[0].summary, items[0].status], ['Oat milk', 'completed']);
  await s.service('todo', 'remove_item', { entity_id: e, item: items[1].uid });
  assert.equal((await s.ok({ type: 'todo/item/list', entity_id: e })).items.length, 1);
  assert.equal((await s.call({ type: 'todo/item/list', entity_id: '__proto__' })).success, false);
  assert.equal((await s.call({ type: 'nonsense' })).success, false);
  assert.equal((await s.call({ type: 'call_service', domain: 'todo', service: 'update_item', service_data: { entity_id: e, item: 'nope' } })).success, false);
  s.close();
});

test('calendars: read from an iCal URL, listed as entities, cached between calls', async () => {
  const s = await boot({ calendars: { 'calendar.mom': 'webcal://cal.example/mom.ics' } });
  // webcal:// is fetched as https://
  s.calls.length = 0;
  const range = { start_date_time: '2026-10-01T00:00:00Z', end_date_time: '2026-11-10T00:00:00Z' };
  const got = await s.service('calendar', 'get_events', { entity_id: ['calendar.mom', 'calendar.unset'], ...range }, { return_response: true });
  assert.ok(got.response['calendar.mom'].events.some((ev) => ev.summary === 'Halloween'));
  assert.deepEqual(got.response['calendar.unset'], { events: [] });
  await s.service('calendar', 'get_events', { entity_id: 'calendar.mom', ...range });
  assert.equal(s.calls.filter((c) => c.includes('cal.example')).length, 1, 'second call is served from the cache');
  const states = await s.ok({ type: 'get_states' });
  assert.ok(states.some((x) => x.entity_id === 'calendar.mom'));
  assert.deepEqual(await (await fetch(`${s.base}/api/calendars`)).json(), [{ entity_id: 'calendar.mom', name: 'Mom' }]);
  s.close();
});

test('photos: an Immich pick is served by token; update_entity picks again; a folder works too', async () => {
  const s = await boot({ photos: { 'image.photos': { type: 'immich', url: 'http://immich.test', apiKey: 'k' } } });
  const photo = (await s.ok({ type: 'get_states' })).find((x) => x.entity_id === 'image.photos');
  assert.deepEqual(photo.attributes.media_exif, { city: 'Boston', state: 'MA', dateTimeOriginal: '2025-07-04T12:00:00Z' });
  assert.equal(photo.attributes.media_filename, 'beach_day.jpg');
  const img = await fetch(`${s.base}${photo.attributes.entity_picture}`);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.equal(await img.text(), 'JPEGDATA');
  assert.equal((await fetch(`${s.base}/api/image_proxy/image.photos?token=wrong`)).status, 404);
  await new Promise((r) => setTimeout(r, 5));
  await s.service('homeassistant', 'update_entity', { entity_id: 'image.photos' });
  const again = (await s.ok({ type: 'get_states' })).find((x) => x.entity_id === 'image.photos');
  assert.notEqual(again.attributes.entity_picture, photo.attributes.entity_picture);
  assert.notEqual(again.state, photo.state, 'the entity state changes with each pick: the photo frame waits for that');
  assert.equal((await fetch(`${s.base}${photo.attributes.entity_picture}`)).status, 200, 'the previous pick still loads for another tablet');
  assert.ok(s.calls.some((c) => c.includes('immich.test/api/search/random')));
  s.close();

  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-photos-'));
  fs.mkdirSync(path.join(folder, 'trip'));
  fs.writeFileSync(path.join(folder, 'trip', 'lake_day.png'), 'PNGDATA');
  fs.writeFileSync(path.join(folder, 'notes.txt'), 'not a picture');
  const f = await boot({ photos: { 'image.photos': { type: 'folder', path: folder } } });
  const pic = (await f.ok({ type: 'get_states' })).find((x) => x.entity_id === 'image.photos');
  assert.equal(pic.attributes.media_filename, 'lake_day.png');
  assert.equal(await (await fetch(`${f.base}${pic.attributes.entity_picture}`)).text(), 'PNGDATA');
  f.close();
});

const photoOf = async (s) => (await s.ok({ type: 'get_states' })).find((x) => x.entity_id === 'image.photos');
const pixels = async (s, photo) => (await fetch(`${s.base}${photo.attributes.entity_picture}`)).text();

test('photos: with nothing set up, a themed Commons category is the screensaver, credited and cached', async () => {
  const s = await boot();
  const photo = await photoOf(s);
  assert.equal(photo.attributes.media_filename, 'Mountain lake at dawn (Jane & Co).jpg'); // the frame strips the ".jpg"
  assert.equal(await pixels(s, photo), 'LAKE');
  assert.ok(s.calls.some((c) => c.includes('Featured%20pictures%20of%20landscapes')), 'default theme is nature');
  await s.service('homeassistant', 'update_entity', { entity_id: 'image.photos' });
  assert.equal(s.calls.filter((c) => c.includes('list=categorymembers')).length, 1, 'the category is listed once, not per photo');
  s.close();
});

test('photos: another named theme, a raw category, and a bad theme that costs nothing', async () => {
  const space = await boot({ photos: { 'image.photos': { type: 'theme', theme: 'space' } } });
  assert.ok(await photoOf(space));
  assert.ok(space.calls.some((c) => c.includes('Featured%20pictures%20of%20astronomy')));
  space.close();
  const raw = await boot({ photos: { 'image.photos': { type: 'theme', category: 'Featured pictures of birds' } } });
  assert.ok(await photoOf(raw));
  assert.ok(raw.calls.some((c) => c.includes('Featured%20pictures%20of%20birds')));
  raw.close();
  const bad = await boot({ photos: { 'image.photos': { type: 'theme', theme: 'nope' } } });
  assert.equal(await photoOf(bad), undefined, 'no photo, no crash');
  assert.ok((await bad.ok({ type: 'get_states' })), 'the rest of get_states still answers');
  bad.close();
});

test('photos: a list of picture URLs, and an Immich album', async () => {
  const u = await boot({ photos: { 'image.photos': { type: 'urls', urls: ['http://pics.test/a/summer%20day.jpg'] } } });
  const photo = await photoOf(u);
  assert.equal(photo.attributes.media_filename, 'summer day.jpg');
  assert.equal(await pixels(u, photo), 'SUMMER');
  u.close();
  const i = await boot({ photos: { 'image.photos': { type: 'immich', url: 'http://immich.test', apiKey: 'k', albumId: 'album-7', favoritesOnly: false } } });
  assert.ok(await photoOf(i));
  assert.deepEqual(JSON.parse(i.calls.bodies['http://immich.test/api/search/random']), { size: 1, albumIds: ['album-7'] }, 'any photo in that album');
  i.close();
});

test('camera: streamed through the server with the token from the entity, never the real address', async () => {
  const s = await boot({ cameras: { 'camera.front_door': 'http://cam.test/stream' } });
  const cam = (await s.ok({ type: 'get_states' })).find((x) => x.entity_id === 'camera.front_door');
  assert.ok(cam.attributes.access_token);
  assert.ok(!JSON.stringify(cam).includes('cam.test'));
  const res = await fetch(`${s.base}/api/camera_proxy_stream/camera.front_door?token=${cam.attributes.access_token}`);
  assert.equal(await res.text(), 'MJPEG');
  assert.equal((await fetch(`${s.base}/api/camera_proxy_stream/camera.front_door?token=wrong`)).status, 404);
  assert.equal((await fetch(`${s.base}/api/camera_proxy_stream/camera.other?token=${cam.attributes.access_token}`)).status, 404);
  s.close();
});

test('weather location comes from server.json', async () => {
  const s = await boot({ location: { latitude: 41.5, longitude: -87.6, name: 'Chicago' } });
  assert.deepEqual(await s.ok({ type: 'get_config' }), { latitude: 41.5, longitude: -87.6, location_name: 'Chicago' });
  s.close();
});

test('web: only the dashboard files are public, and config.js always points the page at this server', async () => {
  const s = await boot();
  for (const p of ['/', '/styles.css', '/js/bundle.js', '/data/dashboard-data.json']) assert.equal((await fetch(s.base + p)).status, 200, p);
  for (const p of ['/server/index.js', '/config.example.js', '/docker-data/state.json', '/..%2Fserver%2Fapi.js', '/state.json']) assert.equal((await fetch(s.base + p)).status, 404, p);
  const plain = await (await fetch(`${s.base}/config.js`)).text();
  assert.match(plain, /familyName/);
  fs.writeFileSync(path.join(s.dataDir, 'config.js'), "window.FAMILY_DASHBOARD_CONFIG = { familyName: 'Smiths', homeAssistant: { url: 'http://homeassistant.local:8123', token: 'LLAT' } };");
  const mine = await (await fetch(`${s.base}/config.js`)).text();
  assert.match(mine, /Smiths/);
  // evaluate it the way the page does
  const win = { location: { origin: 'http://kitchen.lan:8080' } };
  new Function('window', mine)(win);
  assert.deepEqual(win.FAMILY_DASHBOARD_CONFIG.homeAssistant, { url: 'http://kitchen.lan:8080', token: 'local' });
  assert.equal(win.FAMILY_DASHBOARD_CONFIG.photoEntity, 'image.photos');
  s.close();
});

test('sun: the sun-up check matches New York on the winter solstice (sunrise 12:17Z, sunset 21:32Z)', () => {
  const up = (iso) => sunIsUp(40.7128, -74.006, new Date(iso));
  assert.deepEqual(['2026-12-21T12:00:00Z', '2026-12-21T12:35:00Z', '2026-12-21T17:00:00Z', '2026-12-21T21:20:00Z', '2026-12-21T21:50:00Z', '2026-12-22T03:00:00Z'].map(up),
    [false, true, true, true, false, false]);
  assert.equal(sunIsUp(40.7128, -74.006, new Date('2026-06-21T10:00:00Z')), true, '6am EDT in June');
  assert.equal(sunIsUp(40.7128, -74.006, new Date('2026-06-21T09:00:00Z')), false, '5am EDT, before the 5:25 sunrise');
  assert.equal(sunIsUp(-33.87, 151.2, new Date('2026-06-21T01:00:00Z')), true, 'Sydney at 11am');
  assert.equal(sunIsUp(-33.87, 151.2, new Date('2026-06-20T20:00:00Z')), false, 'Sydney at 6am, before the winter sunrise');
});

test('sun.sun is offered only when server.json has a location', async () => {
  const none = await boot();
  assert.ok(!(await none.ok({ type: 'get_states' })).some((x) => x.entity_id === 'sun.sun'));
  none.close();
  const placed = await boot({ location: { latitude: 40.7128, longitude: -74.006 } });
  assert.match((await placed.ok({ type: 'get_states' })).find((x) => x.entity_id === 'sun.sun').state, /^(above|below)_horizon$/);
  placed.close();
});

test('password: pages, API and WebSocket need it; /healthz does not', async () => {
  const s = await boot(null, { password: 'secret' });
  const auth = (pw) => ({ Authorization: `Basic ${Buffer.from(`anyone:${pw}`).toString('base64')}` });
  assert.equal((await fetch(s.base)).status, 401);
  assert.match((await fetch(s.base)).headers.get('www-authenticate'), /^Basic/);
  assert.equal((await fetch(s.base, { headers: auth('wrong') })).status, 401);
  assert.equal((await fetch(s.base, { headers: auth('secret') })).status, 200);
  assert.equal((await fetch(`${s.base}/api/calendars`)).status, 401);
  assert.equal((await fetch(`${s.base}/api/webhook/binary_sensor.door`, { method: 'POST' })).status, 401);
  assert.equal((await fetch(`${s.base}/healthz`)).status, 200);
  const upgrade = (headers) => new Promise((resolve) => {
    const req = http.request({ agent: false, port: s.port, path: '/api/websocket', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', ...headers } });
    req.on('upgrade', (res, socket) => { socket.destroy(); resolve(res.statusCode); });
    req.on('response', (res) => { res.resume(); resolve(res.statusCode); });
    req.end();
  });
  assert.equal(await upgrade({}), 401);
  assert.equal(await upgrade(auth('nope')), 401);
  assert.equal(await upgrade(auth('secret')), 101);
  s.close();
});

test('webhook: a POST rings every socket that subscribed to state_changed, as Home Assistant would', async () => {
  const s = await boot();
  const other = await boot(); // a second server: its sockets must not hear this one
  await s.ok({ type: 'subscribe_events', event_type: 'state_changed' });
  await other.ok({ type: 'subscribe_events', event_type: 'state_changed' });
  assert.equal((await fetch(`${s.base}/api/webhook/binary_sensor.front_door`)).status, 405, 'GET must not ring');
  assert.equal((await fetch(`${s.base}/api/webhook/not-an-entity`, { method: 'POST' })).status, 404);
  const res = await fetch(`${s.base}/api/webhook/binary_sensor.front_door`, { method: 'POST' });
  assert.deepEqual(await res.json(), { rang: 'binary_sensor.front_door' });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(s.events.length, 1);
  const { data } = s.events[0].event;
  assert.deepEqual([data.entity_id, data.old_state.state, data.new_state.state], ['binary_sensor.front_door', 'off', 'on']);
  assert.equal(other.events.length, 0);
  s.close(); other.close();
});
