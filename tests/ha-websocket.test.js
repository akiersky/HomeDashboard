'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBundle } = require('./helpers/load-bundle');

const { HAWebSocket } = loadBundle();

// A Home Assistant that answers on a fake WebSocket. `handler(message, socket)` decides what to answer.
class FakeSocket {
  static OPEN = 1;
  static all = [];
  static handler = (msg, socket) => socket.reply(msg.id, { echoed: msg.type });
  constructor(url) {
    this.url = url; this.readyState = 0; this.sent = [];
    FakeSocket.all.push(this);
    setTimeout(() => { this.readyState = 1; this.push({ type: 'auth_required' }); }, 0);
  }
  push(msg) { setTimeout(() => this.readyState === 1 && this.onmessage && this.onmessage({ data: JSON.stringify(msg) }), 0); }
  reply(id, result) { this.push({ id, type: 'result', success: true, result }); }
  fail(id, message) { this.push({ id, type: 'result', success: false, error: { message } }); }
  send(raw) {
    const msg = JSON.parse(raw);
    this.sent.push(msg);
    if (msg.type === 'auth') this.push({ type: msg.access_token === 'GOOD' ? 'auth_ok' : 'auth_invalid' });
    else FakeSocket.handler(msg, this);
  }
  close() { this.readyState = 3; this.onclose && this.onclose({}); }
}
globalThis.WebSocket = FakeSocket;

function connection(overrides = {}) {
  const c = { url: 'http://ha.local:8123', token: 'GOOD', ...overrides };
  return () => c;
}
function reset() { FakeSocket.all = []; FakeSocket.handler = (msg, socket) => socket.reply(msg.id, { echoed: msg.type }); }

test('it connects with the current URL and token, and answers requests', async () => {
  reset();
  const ha = new HAWebSocket(connection());
  assert.deepEqual(await ha.send({ type: 'ping' }), { echoed: 'ping' });
  assert.equal(FakeSocket.all[0].url, 'ws://ha.local:8123/api/websocket');
  assert.equal(FakeSocket.all[0].sent[0].access_token, 'GOOD');
  const secure = new HAWebSocket(connection({ url: 'https://ha.example' }));
  await secure.send({ type: 'ping' });
  assert.equal(FakeSocket.all[1].url, 'wss://ha.example/api/websocket');
});

test('settings are read when it connects, not when it is created', async () => {
  reset();
  const c = { url: 'http://first:8123', token: 'BAD' };
  const ha = new HAWebSocket(() => c);
  c.url = 'http://second:8123';
  c.token = 'GOOD';
  await ha.send({ type: 'ping' });
  assert.equal(FakeSocket.all[0].url, 'ws://second:8123/api/websocket');
});

test('a wrong token rejects the request', async () => {
  reset();
  const ha = new HAWebSocket(connection({ token: 'WRONG' }));
  await assert.rejects(ha.send({ type: 'ping' }), /token invalid/i);
});

test('Home Assistant refusing a request rejects it with its message', async () => {
  reset();
  FakeSocket.handler = (msg, socket) => socket.fail(msg.id, 'entity not found');
  const ha = new HAWebSocket(connection());
  await assert.rejects(ha.send({ type: 'todo/item/list', entity_id: 'todo.x' }), /entity not found/);
});

test('requests still waiting when the connection drops are rejected, not left hanging', async () => {
  reset();
  FakeSocket.handler = () => { /* never answers */ };
  const ha = new HAWebSocket(connection(), { timeout: 5000 });
  const first = ha.send({ type: 'slow' });
  const second = ha.send({ type: 'slower' });
  await new Promise((r) => setTimeout(r, 30));
  FakeSocket.all[0].close();
  await assert.rejects(first, /closed/i);
  await assert.rejects(second, /closed/i);
});

test('a request Home Assistant never answers is rejected after the timeout', async () => {
  reset();
  FakeSocket.handler = () => { /* never answers */ };
  const ha = new HAWebSocket(connection(), { timeout: 40 });
  const started = Date.now();
  await assert.rejects(ha.send({ type: 'slow' }), /did not answer/i);
  assert.ok(Date.now() - started >= 35);
});

test('calendar events may take three times as long to arrive as other answers', async () => {
  reset();
  FakeSocket.handler = (msg, socket) => {
    setTimeout(() => socket.reply(msg.id, msg.service === 'get_events' ? { response: { 'calendar.mom': { events: [] } } } : 'ok'), 200);
  };
  const ha = new HAWebSocket(connection(), { timeout: 100 });
  await assert.rejects(ha.send({ type: 'slow' }), /did not answer/i);
  assert.deepEqual(await ha.getCalendarEvents(['calendar.mom'], 'a', 'b'), { 'calendar.mom': { events: [] } });
});

test('a late answer after the timeout is ignored', async () => {
  reset();
  let late;
  FakeSocket.handler = (msg, socket) => { late = () => socket.reply(msg.id, 'too late'); };
  const ha = new HAWebSocket(connection(), { timeout: 20 });
  await assert.rejects(ha.send({ type: 'slow' }), /did not answer/i);
  late();
  await new Promise((r) => setTimeout(r, 20));
  reset();
  assert.deepEqual(await new HAWebSocket(connection()).send({ type: 'ping' }), { echoed: 'ping' });
});

test('the to-do and calendar helpers speak Home Assistant\'s protocol', async () => {
  reset();
  FakeSocket.handler = (msg, socket) => {
    if (msg.type === 'todo/item/list') socket.reply(msg.id, { items: [{ uid: 'u1', summary: 'Milk', status: 'completed' }, { uid: 'u2', summary: 'Eggs', status: 'needs_action' }] });
    else if (msg.type === 'call_service' && msg.service === 'get_events') socket.reply(msg.id, { response: { 'calendar.mom': { events: [] } } });
    else socket.reply(msg.id, null);
  };
  const ha = new HAWebSocket(connection());
  assert.deepEqual(await ha.getTodoItems('todo.x'), [{ id: 'u1', name: 'Milk', bought: true }, { id: 'u2', name: 'Eggs', bought: false }]);
  await ha.addTodoItem('todo.x', 'Jam');
  await ha.updateTodoItem('todo.x', 'u1', false);
  await ha.updateTodoItemName('todo.x', 'u1', 'Oat milk');
  await ha.removeTodoItem('todo.x', 'u2');
  assert.deepEqual(await ha.getCalendarEvents(['calendar.mom'], 'a', 'b'), { 'calendar.mom': { events: [] } });
  const calls = FakeSocket.all[0].sent.filter((m) => m.type === 'call_service').map((m) => [m.domain, m.service, m.service_data]);
  assert.deepEqual(calls.slice(0, 4), [
    ['todo', 'add_item', { entity_id: 'todo.x', item: 'Jam' }],
    ['todo', 'update_item', { entity_id: 'todo.x', item: 'u1', status: 'needs_action' }],
    ['todo', 'update_item', { entity_id: 'todo.x', item: 'u1', rename: 'Oat milk' }],
    ['todo', 'remove_item', { entity_id: 'todo.x', item: 'u2' }]
  ]);
  assert.equal(FakeSocket.all[0].sent.at(-1).return_response, true);
});

test('getEntityState finds one entity among all states', async () => {
  reset();
  FakeSocket.handler = (msg, socket) => socket.reply(msg.id, [{ entity_id: 'sun.sun', state: 'below_horizon' }, { entity_id: 'camera.door', state: 'idle' }]);
  const ha = new HAWebSocket(connection());
  assert.equal((await ha.getEntityState('camera.door')).state, 'idle');
  assert.equal(await ha.getEntityState('nothing.here'), undefined);
});

test('subscribed events reach their callback', async () => {
  reset();
  FakeSocket.handler = (msg, socket) => { if (msg.type === 'subscribe_events') socket.reply(msg.id, null); };
  const ha = new HAWebSocket(connection());
  const seen = [];
  ha.subscribe('state_changed', (event) => seen.push(event));
  await new Promise((r) => setTimeout(r, 40));
  const subscribed = FakeSocket.all[0].sent.find((m) => m.type === 'subscribe_events');
  assert.equal(subscribed.event_type, 'state_changed');
  FakeSocket.all[0].push({ id: subscribed.id, type: 'event', event: { data: { entity_id: 'x' } } });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(seen, [{ data: { entity_id: 'x' } }]);
});

test('native connection forwards requests and subscriptions without opening a raw WebSocket', async () => {
  reset();
  const sent = [];
  const subs = [];
  const fakeConn = {
    sendMessagePromise: async (msg) => { sent.push(msg); return { ok: true, echo: msg.type }; },
    subscribeEvents: (cb, eventType) => { subs.push({ cb, eventType }); return () => {}; }
  };
  const ha = new HAWebSocket(connection());
  assert.equal(ha.isNative(), false);
  ha.setNativeConnection(fakeConn);
  assert.equal(ha.isNative(), true);

  const res = await ha.send({ type: 'get_config' });
  assert.deepEqual(res, { ok: true, echo: 'get_config' });
  assert.deepEqual(sent, [{ type: 'get_config' }]);
  assert.equal(FakeSocket.all.length, 0, 'no raw socket was opened');

  const seen = [];
  ha.subscribe('call_ding', (e) => seen.push(e));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(subs.length, 1);
  assert.equal(subs[0].eventType, 'call_ding');
  subs[0].cb({ ding: true });
  assert.deepEqual(seen, [{ ding: true }]);
});

