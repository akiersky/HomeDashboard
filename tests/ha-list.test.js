'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBundle } = require('./helpers/load-bundle');

const { HaList, MealPlan, StateManager, storeList } = loadBundle();

// A Home Assistant that holds to-do lists in memory and can be switched off.
function fakeHa(initial = {}) {
  const ha = {
    lists: { ...initial }, calls: [], down: false, failOn: new Set(), seq: 0,
    guard(op) { ha.calls.push(op); if (ha.down || ha.failOn.has(op)) throw new Error('Home Assistant unreachable'); },
    async getTodoItems(entity) { ha.guard('list'); if (!ha.lists[entity]) throw new Error('unknown entity'); return ha.lists[entity].map((i) => ({ ...i })); },
    async addTodoItem(entity, name) { ha.guard('add'); ha.lists[entity].push({ id: 'u' + ++ha.seq, name, bought: false }); },
    async updateTodoItem(entity, id, completed) { ha.guard('update'); ha.lists[entity].find((i) => i.id === id).bought = completed; },
    async updateTodoItemName(entity, id, name) { ha.guard('rename'); ha.lists[entity].find((i) => i.id === id).name = name; },
    async removeTodoItem(entity, id) { ha.guard('remove'); ha.lists[entity] = ha.lists[entity].filter((i) => i.id !== id); }
  };
  return ha;
}
const localCopy = (items = []) => ({ items, writes: [], read() { return this.items; }, write(next, mirror) { this.items = next; this.writes.push(mirror); } });
const item = (id, name, bought = false) => ({ id, name, bought });
const names = (list) => list.items.map((i) => i.name);

function setup({ entity = 'todo.x', hai, local = [], addAt } = {}) {
  const ha = hai || fakeHa({ 'todo.x': [item('a', 'Milk'), item('b', 'Eggs')] });
  const copy = localCopy(local);
  const errors = [];
  const list = new HaList({ ha, entity: () => entity, local: copy, addAt, onError: (e, what) => errors.push(what) });
  return { list, ha, copy, errors };
}

test('load shows the Home Assistant list and keeps a quiet local copy of it', async () => {
  const { list, copy } = setup({ local: [item('old', 'Stale')] });
  let told = 0;
  list.subscribe(() => { told++; });
  await list.load();
  assert.deepEqual(names(list), ['Milk', 'Eggs']);
  assert.deepEqual(copy.items.map((i) => i.name), ['Milk', 'Eggs']);
  assert.deepEqual(copy.writes, [true], 'a mirror, not a household change');
  assert.equal(told, 1);
});

test('an empty Home Assistant list is the truth, not a reason to fall back', async () => {
  const { list } = setup({ hai: fakeHa({ 'todo.x': [] }), local: [item('old', 'Stale')] });
  await list.load();
  assert.deepEqual(list.items, []);
});

test('when Home Assistant cannot be reached the local copy is shown and the problem reported', async () => {
  const hai = fakeHa({ 'todo.x': [item('a', 'Milk')] });
  hai.down = true;
  const { list, errors } = setup({ hai, local: [item('l', 'Local only')] });
  await list.load();
  assert.deepEqual(names(list), ['Local only']);
  assert.deepEqual(errors, ['load']);
});

test('without an entity the list lives locally and Home Assistant is never asked', async () => {
  const { list, ha, copy } = setup({ entity: '', local: [item('l', 'Bread')] });
  await list.load();
  const added = await list.add('Jam');
  await list.toggle(added.id);
  await list.rename('l', 'Rye bread');
  await list.remove(added.id);
  assert.deepEqual(names(list), ['Rye bread']);
  assert.deepEqual(ha.calls, []);
  assert.equal(copy.writes.every((mirror) => mirror === false), true, 'local is the truth here');
  assert.equal(list.configured, false);
});

test('add sends the item to Home Assistant and shows the list it answers with', async () => {
  const { list, ha } = setup();
  await list.load();
  const added = await list.add('  Butter ');
  assert.equal(added.name, 'Butter');
  assert.deepEqual(names(list), ['Milk', 'Eggs', 'Butter']);
  assert.deepEqual(ha.lists['todo.x'].map((i) => i.name), ['Milk', 'Eggs', 'Butter']);
  assert.equal(added.id, ha.lists['todo.x'][2].id, 'the item carries Home Assistant\'s id');
});

test('a blank name is not added or renamed', async () => {
  const { list, ha } = setup();
  await list.load();
  assert.equal(await list.add('   '), null);
  await list.rename('a', '  ');
  assert.deepEqual(names(list), ['Milk', 'Eggs']);
  assert.equal(ha.calls.filter((c) => c === 'add' || c === 'rename').length, 0);
});

test('an item added while Home Assistant rejects writes stays visible, and the failure is reported', async () => {
  const { list, ha, errors } = setup();
  await list.load();
  ha.failOn.add('add');
  const added = await list.add('Offline item');
  assert.deepEqual(names(list), ['Milk', 'Eggs', 'Offline item']);
  assert.equal(added.name, 'Offline item');
  assert.deepEqual(errors, ['add']);
  ha.failOn.clear();
  await list.load();
  assert.deepEqual(names(list), ['Milk', 'Eggs'], 'the next load shows what Home Assistant really has');
});

test('new local items go where the list asks: at the end, or at the start', async () => {
  const end = setup({ entity: '', local: [item('1', 'A')] });
  await end.list.add('B');
  assert.deepEqual(names(end.list), ['A', 'B']);
  const start = setup({ entity: '', local: [item('1', 'A')], addAt: 'start' });
  await start.list.add('B');
  assert.deepEqual(names(start.list), ['B', 'A']);
});

test('toggle, rename and remove go to Home Assistant and come back from it', async () => {
  const { list, ha } = setup();
  await list.load();
  await list.toggle('a');
  assert.equal(ha.lists['todo.x'][0].bought, true);
  assert.equal(list.items.find((i) => i.id === 'a').bought, true);
  await list.toggle('a');
  assert.equal(list.items.find((i) => i.id === 'a').bought, false);
  await list.rename('b', 'Free-range eggs');
  assert.deepEqual(names(list), ['Milk', 'Free-range eggs']);
  await list.remove('a');
  assert.deepEqual(names(list), ['Free-range eggs']);
  assert.deepEqual(ha.lists['todo.x'].map((i) => i.name), ['Free-range eggs']);
});

test('toggle, rename and remove still work on the local copy when Home Assistant is down', async () => {
  const { list, ha, errors } = setup();
  await list.load();
  ha.down = true;
  await list.toggle('a');
  await list.rename('b', 'Eggs x12');
  await list.remove('a');
  assert.deepEqual(list.items.map((i) => [i.name, i.bought]), [['Eggs x12', false]]);
  assert.deepEqual(errors, ['toggle', 'rename', 'remove']);
});

test('unknown ids change nothing', async () => {
  const { list } = setup({ entity: '', local: [item('1', 'A')] });
  await list.toggle('zzz');
  await list.rename('zzz', 'x');
  await list.remove('zzz');
  assert.deepEqual(names(list), ['A']);
});

test('a list kept in the household data shows what a sync brings, and adds to that, not to an older copy', async () => {
  const KEY = 'family_dashboard_state_v1';
  const stored = { updatedAt: 1000, groceries: [item('l1', 'Milk')] };
  const pushed = [];
  const remote = {
    ready: () => true,
    async get() { return { updatedAt: 5000, groceries: [item('l1', 'Milk'), item('l2', 'Eggs')] }; },
    async set(doc) { pushed.push(doc); }
  };
  const local = { get: (k) => (k === KEY ? JSON.stringify(stored) : null), set() {} };
  const sm = new StateManager({ local, remote, baseline: async () => null, now: () => 2000, pushDelay: 1 });
  const list = new HaList({ ha: fakeHa(), entity: () => '', local: storeList(sm, 'groceries') });
  assert.deepEqual(names(list), ['Milk']);

  await sm.syncRemote();               // another tablet added Eggs
  assert.deepEqual(names(list), ['Milk', 'Eggs']);
  await list.add('Bread');
  assert.deepEqual(sm.data.groceries.map((i) => i.name), ['Milk', 'Eggs', 'Bread']);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(pushed.at(-1).groceries.map((i) => i.name), ['Milk', 'Eggs', 'Bread'], 'and Eggs survives for everyone');
});

test('with an entity, the household data holds a mirror of the list that does not count as an edit', async () => {
  const sm = new StateManager({ local: { get: () => null, set() {} }, remote: { ready: () => false }, baseline: async () => null, now: () => 2000, pushDelay: 1 });
  const list = new HaList({ ha: fakeHa({ 'todo.x': [item('a', 'Milk')] }), entity: () => 'todo.x', local: storeList(sm, 'groceries') });
  await list.load();
  assert.deepEqual(sm.data.groceries, [item('a', 'Milk')]);
  assert.equal(sm.data.updatedAt, undefined, 'a mirror is not an edit');
});

test('subscribers hear about every change and can stop listening', async () => {
  const { list } = setup({ entity: '' });
  const seen = [];
  const stop = list.subscribe((items) => seen.push(items.length));
  await list.add('A');
  await list.add('B');
  stop();
  await list.add('C');
  assert.deepEqual(seen, [1, 2]);
});

// ---------------------------------------------------------------- the weekly dinner plan

function planSetup(items = [], { entity = 'todo.plan' } = {}) {
  const ha = fakeHa({ 'todo.plan': items });
  const list = new HaList({ ha, entity: () => entity, local: localCopy([]) });
  return { plan: new MealPlan(list), ha, list };
}

test('the plan reads "Mon|Taco Night" items into a meal per weekday and ignores anything else', async () => {
  const { plan } = planSetup([item('1', 'Mon|Taco Night'), item('2', 'Tue|Pasta|with cheese'), item('3', 'no separator'), item('4', '|nothing'), item('5', 'Mon|Burgers')]);
  await plan.load();
  assert.deepEqual(plan.byDay, { Mon: 'Burgers', Tue: 'Pasta|with cheese' }, 'the last entry for a day wins');
});

test('setting a meal adds the day or renames its entry; clearing removes it', async () => {
  const { plan, ha } = planSetup([item('1', 'Mon|Taco Night')]);
  await plan.load();
  await plan.set('Tue', 'Pizza');
  await plan.set('Mon', 'Soup');
  assert.deepEqual(ha.lists['todo.plan'].map((i) => i.name), ['Mon|Soup', 'Tue|Pizza']);
  assert.deepEqual(plan.byDay, { Mon: 'Soup', Tue: 'Pizza' });
  await plan.clear('Mon');
  assert.deepEqual(plan.byDay, { Tue: 'Pizza' });
  await plan.clear('Sun');
  assert.deepEqual(ha.lists['todo.plan'].map((i) => i.name), ['Tue|Pizza']);
});

test('the plan tells whether a plan list is configured and passes changes on', async () => {
  const none = planSetup([], { entity: '' });
  assert.equal(none.plan.configured, false);
  const some = planSetup([]);
  assert.equal(some.plan.configured, true);
  let told = 0;
  some.plan.subscribe(() => { told++; });
  await some.plan.set('Wed', 'Stew');
  assert.ok(told >= 1);
});

test('dinnerOn only answers for the next seven days, by weekday', async () => {
  const { plan } = planSetup([item('1', 'Mon|Taco Night'), item('2', 'Wed|Soup')]);
  await plan.load();
  const today = '2026-10-14';                                   // a Wednesday
  assert.equal(plan.dinnerOn('2026-10-14', today), 'Soup', 'today');
  assert.equal(plan.dinnerOn('2026-10-19', today), 'Taco Night', 'next Monday, 5 days ahead');
  assert.equal(plan.dinnerOn('2026-10-20', today), undefined, 'Tuesday has no meal');
  assert.equal(plan.dinnerOn('2026-10-12', today), undefined, 'last Monday is past');
  assert.equal(plan.dinnerOn('2026-10-21', today), undefined, 'a Wednesday a week ahead is outside the plan');
  assert.equal(plan.dinnerOn('2026-10-26', today), undefined, 'two Mondays ahead is outside the plan');
});

test('poll shows a change made elsewhere, but waits while a change could not be sent', async () => {
  const { list, ha } = setup();
  await list.load();
  ha.lists['todo.x'].push(item('k', 'From Keep'));
  await list.poll();
  assert.ok(names(list).includes('From Keep'), 'a change made elsewhere appears');

  ha.failOn.add('add');
  await list.add('Typed while Keep is broken');
  await list.poll();
  assert.ok(names(list).includes('Typed while Keep is broken'), 'the poll does not wipe an unsent change');

  ha.failOn.delete('add');
  await list.add('Bread');
  ha.lists['todo.x'].push(item('k2', 'Also from Keep'));
  await list.poll();
  assert.ok(names(list).includes('Also from Keep'), 'polling resumes once a change gets through');
});

test('poll recovers after Home Assistant was down for a load', async () => {
  const { list, ha } = setup();
  ha.down = true;
  await list.load();
  ha.down = false;
  await list.poll();
  assert.deepEqual(names(list), ['Milk', 'Eggs']);
});

test('status says how far the list can be trusted', async () => {
  assert.equal(setup({ entity: '' }).list.status, 'local');

  const { list, ha } = setup();
  assert.equal(list.status, 'connecting');
  await list.load();
  assert.equal(list.status, 'connected');

  let told = 0;
  list.subscribe(() => { told++; });
  ha.down = true;
  await list.poll();
  assert.equal(list.status, 'offline');
  assert.equal(told, 1, 'a lost connection is shown without waiting for a change');

  ha.down = false;
  await list.poll();
  assert.equal(list.status, 'connected');

  ha.failOn.add('add');
  await list.add('Typed');
  assert.equal(list.status, 'unsent');
});
