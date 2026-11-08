'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBundle } = require('./helpers/load-bundle');

const { ParentTasks } = loadBundle();

// Wednesday 2026-10-14, 21:00 local time. This week ends Saturday 2026-10-17; "soon" runs to 2026-11-13.
const NOW = new Date(2026, 9, 14, 21, 0);
assert.equal(NOW.getDay(), 3, 'fixture date must be a Wednesday');

const task = (o) => ({ id: 't', memberId: 'mom', title: 'Task', priority: 'medium', category: 'general', dueDate: '', frequency: 'none', completed: false, ...o });
function setup(list = []) {
  const store = { data: { parentTasks: list }, saves: 0, save() { this.saves++; } };
  return { store, tasks: new ParentTasks(store, () => new Date(NOW)) };
}
const ids = (list) => list.map((t) => t.id);

test('add puts a new open task first, with a unique id, and saves', () => {
  const { store, tasks } = setup([task({ id: 'old' })]);
  const a = tasks.add({ title: 'A', memberId: 'mom' });
  const b = tasks.add({ title: 'B', memberId: 'mom' });
  const c = tasks.add({ title: 'C', memberId: 'dad' });
  assert.deepEqual(ids(store.data.parentTasks), [c.id, b.id, a.id, 'old']);
  assert.equal(new Set([a.id, b.id, c.id, 'old']).size, 4);
  assert.equal(a.completed, false);
  assert.equal(store.saves, 3);
});

test('mine is the parent\'s own tasks plus shared ones', () => {
  const { tasks } = setup([task({ id: 'm' }), task({ id: 'd', memberId: 'dad' }), task({ id: 's', memberId: 'shared' })]);
  assert.deepEqual(ids(tasks.mine('mom')), ['m', 's']);
  assert.deepEqual(ids(tasks.mine('dad')), ['d', 's']);
});

test('update changes fields of one task and saves', () => {
  const { store, tasks } = setup([task({ id: 'a', title: 'Old' })]);
  tasks.update('a', { title: 'New', priority: 'high' });
  assert.equal(store.data.parentTasks[0].title, 'New');
  assert.equal(store.data.parentTasks[0].priority, 'high');
  assert.equal(store.saves, 1);
  assert.equal(tasks.update('missing', { title: 'x' }), null);
});

test('toggle completes a one-off task, reopens it, and undo restores the state', () => {
  const { store, tasks } = setup([task({ id: 'a' })]);
  const done = tasks.toggle('a');
  assert.equal(store.data.parentTasks[0].completed, true);
  tasks.toggle('a');
  assert.equal(store.data.parentTasks[0].completed, false);
  tasks.toggle('a').undo();
  assert.equal(store.data.parentTasks[0].completed, false);
  assert.equal(done.task.id, 'a');
});

test('toggle on a repeating task moves the due date forward instead of completing it', () => {
  const cases = [
    ['daily', '2026-10-14', '2026-10-15'],
    ['weekly', '2026-10-14', '2026-10-21'],
    ['monthly', '2026-10-14', '2026-11-14'],
    ['annually', '2026-10-14', '2027-10-14'],
    ['weekly', '2026-10-20', '2026-10-27'],   // future due date: counted from the due date
    ['weekly', '2026-09-01', '2026-10-21'],   // overdue: counted from today
    ['weekly', '', '2026-10-21']              // no due date: counted from today
  ];
  for (const [frequency, dueDate, expected] of cases) {
    const { store, tasks } = setup([task({ id: 'r', frequency, dueDate })]);
    tasks.toggle('r');
    const t = store.data.parentTasks[0];
    assert.equal(t.dueDate, expected, `${frequency} from "${dueDate}"`);
    assert.equal(t.lastCompletedDate, '2026-10-14');
    assert.equal(t.completed, false);
  }
});

test('undo of a repeating toggle restores due date and last completed date', () => {
  const { store, tasks } = setup([task({ id: 'r', frequency: 'weekly', dueDate: '2026-10-14', lastCompletedDate: '2026-10-07' })]);
  const { undo } = tasks.toggle('r');
  undo();
  assert.equal(store.data.parentTasks[0].dueDate, '2026-10-14');
  assert.equal(store.data.parentTasks[0].lastCompletedDate, '2026-10-07');
});

test('remove returns an undo that puts the task back in place', () => {
  const { store, tasks } = setup([task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' })]);
  const undo = tasks.remove('b');
  assert.deepEqual(ids(store.data.parentTasks), ['a', 'c']);
  tasks.add({ title: 'later', memberId: 'mom' });
  undo();
  assert.deepEqual(ids(store.data.parentTasks).filter((id) => id !== store.data.parentTasks[0].id), ['a', 'b', 'c']);
  assert.equal(tasks.remove('missing'), null);
});

test('undo still works after sync replaced the whole state object', () => {
  const { store, tasks } = setup([task({ id: 'a' }), task({ id: 'b' })]);
  const undo = tasks.remove('a');
  store.data = JSON.parse(JSON.stringify(store.data));   // adopting the Home Assistant copy swaps the data object
  undo();
  assert.deepEqual(ids(store.data.parentTasks), ['a', 'b']);
});

test('clearDone removes the done one-off tasks of that parent and shared, and undo brings them back in order', () => {
  const list = [task({ id: 'x', completed: true }), task({ id: 'open' }), task({ id: 's', memberId: 'shared', completed: true }),
    task({ id: 'dad', memberId: 'dad', completed: true }), task({ id: 'y', completed: true })];
  const { store, tasks } = setup(list);
  const { count, undo } = tasks.clearDone('mom');
  assert.equal(count, 3);
  assert.deepEqual(ids(store.data.parentTasks), ['open', 'dad']);
  undo();
  assert.deepEqual(ids(store.data.parentTasks), ['x', 'open', 's', 'dad', 'y']);
});

test('board by priority: three columns, sorted by due date then priority, done and repeating apart', () => {
  const { tasks } = setup([
    task({ id: 'later-high', priority: 'high', dueDate: '2026-12-01' }),
    task({ id: 'soon-high', priority: 'high', dueDate: '2026-10-20' }),
    task({ id: 'nodate', priority: 'high' }),
    task({ id: 'default-priority', priority: undefined }),
    task({ id: 'low', priority: 'low' }),
    task({ id: 'done', completed: true }),
    task({ id: 'rep-b', frequency: 'weekly', dueDate: '2026-10-25' }),
    task({ id: 'rep-a', frequency: 'daily', dueDate: '2026-10-15' }),
    task({ id: 'dad', memberId: 'dad' })
  ]);
  const b = tasks.board('mom', 'priority');
  assert.deepEqual(b.columns.map((c) => c.key), ['high', 'medium', 'low']);
  assert.deepEqual(ids(b.columns[0].tasks), ['soon-high', 'later-high', 'nodate']);
  assert.deepEqual(ids(b.columns[1].tasks), ['default-priority']);
  assert.deepEqual(ids(b.columns[2].tasks), ['low']);
  assert.deepEqual(ids(b.done), ['done']);
  assert.deepEqual(ids(b.recurring), ['rep-a', 'rep-b']);
  assert.equal(b.group.hide, 'priority');
});

test('board by theme: only categories that have open tasks, in the usual order', () => {
  const { tasks } = setup([task({ id: 'h', category: 'health' }), task({ id: 'g' }), task({ id: 'e', category: 'errands' }), task({ id: 'x', category: 'vehicle', completed: true })]);
  const b = tasks.board('mom', 'theme');
  assert.deepEqual(b.columns.map((c) => c.key), ['general', 'errands', 'health']);
  assert.equal(b.group.hide, 'category');
});

test('board by time: this week ends Saturday, soon runs 30 days, the rest is later; overdue appears only when needed', () => {
  const list = [
    task({ id: 'today', dueDate: '2026-10-14' }), task({ id: 'sat', dueDate: '2026-10-17' }),
    task({ id: 'sun', dueDate: '2026-10-18' }), task({ id: 'edge', dueDate: '2026-11-13' }),
    task({ id: 'far', dueDate: '2026-11-14' }), task({ id: 'undated' })
  ];
  const { tasks } = setup(list);
  const b = tasks.board('mom', 'time');
  const by = Object.fromEntries(b.columns.map((c) => [c.key, ids(c.tasks)]));
  assert.deepEqual(Object.keys(by), ['week', 'soon', 'later']);
  assert.deepEqual(by.week, ['today', 'sat']);
  assert.deepEqual(by.soon, ['sun', 'edge']);
  assert.deepEqual(by.later, ['far', 'undated']);

  const withOverdue = setup([...list, task({ id: 'late', dueDate: '2026-10-10' })]).tasks.board('mom', 'time');
  assert.deepEqual(withOverdue.columns.map((c) => c.key), ['overdue', 'week', 'soon', 'later']);
  assert.equal(withOverdue.columns[0].droppable, false);
  assert.equal(withOverdue.columns[1].droppable, true);
});

test('an unknown grouping falls back to priority', () => {
  const { tasks } = setup([task({ id: 'a' })]);
  assert.equal(tasks.board('mom', 'nonsense').group.key, 'priority');
});

test('board offers scheduled tasks by date and the undated open ones for the month calendar', () => {
  const { tasks } = setup([
    task({ id: 'a', dueDate: '2026-10-20', priority: 'low' }), task({ id: 'b', dueDate: '2026-10-20', priority: 'high' }),
    task({ id: 'rep', frequency: 'weekly', dueDate: '2026-10-21' }), task({ id: 'done', dueDate: '2026-10-22', completed: true }),
    task({ id: 'none' })
  ]);
  const b = tasks.board('mom', 'priority');
  assert.deepEqual(ids(b.scheduled['2026-10-20']), ['b', 'a']);
  assert.deepEqual(ids(b.scheduled['2026-10-21']), ['rep']);
  assert.equal(b.scheduled['2026-10-22'], undefined);
  assert.deepEqual(ids(b.undated), ['none']);
});

test('dropping a card on a column changes the field the board is grouped by', () => {
  const { store, tasks } = setup([task({ id: 'a', completed: true }), task({ id: 'b', dueDate: '2026-10-15' }), task({ id: 'c', dueDate: '2026-10-30' })]);
  assert.equal(tasks.dropOnColumn('a', 'priority', 'high'), true);
  assert.equal(store.data.parentTasks[0].priority, 'high');
  assert.equal(store.data.parentTasks[0].completed, false, 'dropping on an open column reopens a done task');

  tasks.dropOnColumn('a', 'theme', 'health');
  assert.equal(store.data.parentTasks[0].category, 'health');

  tasks.dropOnColumn('a', 'priority', 'done');
  assert.equal(store.data.parentTasks[0].completed, true);

  tasks.dropOnColumn('b', 'time', 'week');
  assert.equal(store.data.parentTasks[1].dueDate, '2026-10-15', 'already this week: keep the date');
  tasks.dropOnColumn('b', 'time', 'soon');
  assert.equal(store.data.parentTasks[1].dueDate, '2026-10-28', 'soon = two weeks out');
  tasks.dropOnColumn('b', 'time', 'later');
  assert.equal(store.data.parentTasks[1].dueDate, '');
  tasks.dropOnColumn('c', 'time', 'week');
  assert.equal(store.data.parentTasks[2].dueDate, '2026-10-17', 'this week = Saturday');
});

test('overdue cannot be a drop target and unknown tasks are ignored', () => {
  const { store, tasks } = setup([task({ id: 'a', dueDate: '2026-10-20' })]);
  assert.equal(tasks.dropOnColumn('a', 'time', 'overdue'), false);
  assert.equal(store.data.parentTasks[0].dueDate, '2026-10-20');
  assert.equal(tasks.dropOnColumn('missing', 'priority', 'high'), false);
});

test('schedule moves a task to a calendar day', () => {
  const { store, tasks } = setup([task({ id: 'a' })]);
  tasks.schedule('a', '2026-11-02');
  assert.equal(store.data.parentTasks[0].dueDate, '2026-11-02');
});

test('calendar projection: tasks marked "show on calendar" with a due date; finished one-offs drop off', () => {
  const { tasks } = setup([
    task({ id: 'open', showOnCalendar: true, dueDate: '2026-10-15', notes: 'bring card' }),
    task({ id: 'finished', showOnCalendar: true, dueDate: '2026-10-15', completed: true }),
    task({ id: 'weekly', showOnCalendar: true, dueDate: '2026-10-16', frequency: 'weekly', memberId: 'shared' }),
    task({ id: 'hidden', dueDate: '2026-10-15' }),
    task({ id: 'undated', showOnCalendar: true })
  ]);
  const events = tasks.asCalendarEvents();
  assert.deepEqual(events.map((e) => e.id), ['task-open', 'task-weekly']);
  assert.deepEqual(events[0], { id: 'task-open', title: 'Task', memberId: 'mom', category: 'family', date: '2026-10-15', time: 'All Day', frequency: 'none', location: '', notes: 'bring card' });
  assert.equal(events[1].memberId, 'shared');
  assert.equal(events[1].location, 'Repeats weekly');
});

test('daysUntil counts whole calendar days', () => {
  assert.equal(ParentTasks.daysUntil('2026-10-14', '2026-10-14'), 0);
  assert.equal(ParentTasks.daysUntil('2026-10-15', '2026-10-14'), 1);
  assert.equal(ParentTasks.daysUntil('2026-10-10', '2026-10-14'), -4);
  assert.equal(ParentTasks.daysUntil('2026-11-02', '2026-10-14'), 19, 'across the daylight-saving change');
});
