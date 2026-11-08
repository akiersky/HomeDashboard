'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBundle } = require('./helpers/load-bundle');

const { Renderer } = loadBundle();

// A view that records its renders. `showing` stands in for "this screen is on display".
function view(log, name, { showing = () => true } = {}) {
  return { name, showing, render() { log.push(name); return name + ' done'; } };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

function setup(views = ['calendar', 'chores', 'filter']) {
  const log = [];
  const owners = Object.fromEntries(views.map((n) => [n, view(log, n)]));
  const preserved = [];
  const renderer = new Renderer({ preserve: (render) => { preserved.push('enter'); const r = render(); preserved.push('leave'); return r; } });
  views.forEach((n) => renderer.add(n, owners[n], { visible: () => owners[n].showing() }));
  return { renderer, owners, log, preserved };
}

test('invalidating renders every view that is showing, once, in the order they were added', async () => {
  const { renderer, log } = setup();
  renderer.invalidate();
  assert.deepEqual(log, [], 'not at once: the current work finishes first');
  await settle();
  assert.deepEqual(log, ['calendar', 'chores', 'filter']);
});

test('many invalidations in one go render once', async () => {
  const { renderer, log } = setup();
  renderer.invalidate();
  renderer.invalidate();
  renderer.invalidate('chores');
  await settle();
  assert.deepEqual(log, ['calendar', 'chores', 'filter']);
  renderer.invalidate();
  await settle();
  assert.equal(log.length, 6, 'a later change renders again');
});

test('only the named views are invalidated when names are given', async () => {
  const { renderer, log } = setup();
  renderer.invalidate('chores');
  await settle();
  assert.deepEqual(log, ['chores']);
});

test('a view that is not showing is left alone', async () => {
  const { renderer, owners, log } = setup();
  owners.calendar.showing = () => false;
  renderer.invalidate();
  await settle();
  assert.deepEqual(log, ['chores', 'filter']);
});

test('a view that renders itself in the meantime is not rendered again for the same change', async () => {
  const { renderer, owners, log } = setup();
  renderer.invalidate();
  owners.chores.render();                       // e.g. the click handler re-renders right away
  assert.deepEqual(log, ['chores']);
  await settle();
  assert.deepEqual(log, ['chores', 'calendar', 'filter']);
});

test('every render, including direct calls, keeps the scroll positions around it and returns its result', () => {
  const { owners, preserved } = setup(['chores']);
  assert.equal(owners.chores.render(), 'chores done');
  assert.deepEqual(preserved, ['enter', 'leave']);
});

test('the render keeps its own this, arguments and any method name', () => {
  const calls = [];
  const owner = { label: 'store', renderStore(...args) { calls.push([this.label, ...args]); } };
  const renderer = new Renderer();
  renderer.add('store', owner, { method: 'renderStore' });
  owner.renderStore(1, 2);
  assert.deepEqual(calls, [['store', 1, 2]]);
});

test('show renders a view now, whatever its state', () => {
  const { renderer, log } = setup();
  renderer.show('chores');
  assert.deepEqual(log, ['chores']);
  renderer.show('nothing');
  assert.deepEqual(log, ['chores']);
});

test('visibility is checked when it renders, not when it was invalidated', async () => {
  const { renderer, owners, log } = setup(['chores']);
  owners.chores.showing = () => true;
  renderer.invalidate();
  owners.chores.showing = () => false;           // the user switched away before the render happened
  await settle();
  assert.deepEqual(log, []);
});

test('a view that fails to render does not stop the others', async () => {
  const log = [];
  const broken = { render() { throw new Error('boom'); } };
  const fine = view(log, 'fine');
  const renderer = new Renderer();
  renderer.add('broken', broken);
  renderer.add('fine', fine);
  renderer.invalidate();
  await settle();
  assert.deepEqual(log, ['fine']);
});
