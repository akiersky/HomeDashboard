'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBundle } = require('./helpers/load-bundle');

const { MissionLedger } = loadBundle();

const day = (y, m, d, h = 21) => new Date(y, m - 1, d, h, 0);   // local time
const WED = day(2026, 10, 14);

function setup({ now = WED, data = {} } = {}) {
  const clock = { now };
  const prizes = [];
  const added = [];
  const store = {
    saves: 0, save() { this.saves++; },
    data: {
      members: [
        { id: 'alex', name: 'Alex', role: 'kid', stars: 10 },
        { id: 'sam', name: 'Sam', role: 'kid', stars: 5 },
        { id: 'mom', name: 'Mom', role: 'parent', stars: 45 }
      ],
      chores: [], routines: [], rewards: [], kidAchievements: { alex: { activityLog: [] }, sam: { activityLog: [] } },
      ...data
    }
  };
  const ledger = new MissionLedger(store, { now: () => new Date(clock.now), addTask: (t) => added.push(t), onPrize: (p) => prizes.push(p) });
  return { ledger, store, clock, prizes, added, d: store.data };
}
const chore = (o) => ({ id: 'c1', title: 'Clear table', memberId: 'alex', points: 2, status: 'pending', routineType: 'general', frequency: 'daily', ...o });
const routine = (o) => ({ id: 'r1', title: 'Make bed', memberId: 'alex', routineType: 'morning', completedToday: false, ...o });
const stars = (d, id) => d.members.find((m) => m.id === id).stars;
const log = (d, id) => d.kidAchievements[id].activityLog;
const ids = (list) => list.map((i) => i.id);

// ---------------------------------------------------------------- ticking missions

test('ticking a chore earns its points once, completes it and logs the activity', () => {
  const { ledger, d } = setup({ data: { chores: [chore()] } });
  const r = ledger.tick('c1');
  assert.equal(r.stars, 2);
  assert.equal(r.item.status, 'completed');
  assert.equal(stars(d, 'alex'), 12);
  assert.equal(log(d, 'alex')[0].title, 'Clear table');
  assert.equal(log(d, 'alex')[0].points, 2);
  assert.equal(ledger.tick('c1'), null, 'a finished chore cannot be ticked again');
  assert.equal(stars(d, 'alex'), 12);
});

test('ticking a routine earns one star per routine per day; unticking and re-ticking cannot farm stars', () => {
  const { ledger, d, clock } = setup({ data: { routines: [routine()] } });
  assert.equal(ledger.tick('r1').stars, 1);
  assert.equal(ledger.tick('r1').stars, 0, 'unticked');
  assert.equal(d.routines[0].completedToday, false);
  assert.equal(ledger.tick('r1').stars, 0, 'ticked again the same day');
  assert.equal(d.routines[0].completedToday, true);
  assert.equal(stars(d, 'alex'), 11);

  clock.now = day(2026, 10, 15);
  d.routines[0].completedToday = false;   // the daily reset
  assert.equal(ledger.tick('r1').stars, 1, 'next day earns again');
  assert.equal(stars(d, 'alex'), 12);
});

test('a chore whose owner no longer exists still completes, for no stars', () => {
  const { ledger, d } = setup({ data: { chores: [chore({ memberId: 'ghost' })] } });
  assert.equal(ledger.tick('c1').stars, 0);
  assert.equal(d.chores[0].status, 'completed');
});

test('wildcards are claimed, not ticked; unknown ids do nothing', () => {
  const { ledger } = setup({ data: { chores: [chore({ memberId: 'either' })] } });
  assert.equal(ledger.tick('c1'), null);
  assert.equal(ledger.tick('missing'), null);
});

// ---------------------------------------------------------------- wildcards

test('claiming a wildcard gives the points to the claimant, once', () => {
  const { ledger, d } = setup({ data: { chores: [chore({ id: 'w', title: 'Wash car', memberId: 'either', points: 8, frequency: 'weekly' })] } });
  const r = ledger.claim('w', 'sam');
  assert.equal(r.chore.completedBy, 'sam');
  assert.equal(stars(d, 'sam'), 13);
  assert.equal(log(d, 'sam')[0].title, 'Wash car (Wildcard Bonus)');
  assert.equal(ledger.claim('w', 'alex'), null);
  assert.equal(stars(d, 'alex'), 10);
});

test('only wildcards can be claimed', () => {
  const { ledger } = setup({ data: { chores: [chore()] } });
  assert.equal(ledger.claim('c1', 'sam'), null);
});

// ---------------------------------------------------------------- adding, editing, removing, moving

test('add creates a pending chore for one kid', () => {
  const { ledger, d } = setup();
  const [c] = ledger.add({ title: 'Feed dog', kid: 'alex', points: 3, routineType: 'afterschool', frequency: 'weekly' });
  assert.deepEqual(d.chores, [{ id: c.id, title: 'Feed dog', memberId: 'alex', points: 3, status: 'pending', routineType: 'afterschool', frequency: 'weekly' }]);
});

test('add for both kids makes one independent chore per kid, found by role, with unique ids', () => {
  const { ledger, d } = setup();
  const made = ledger.add({ title: 'Tidy', kid: 'both' });
  assert.deepEqual(made.map((c) => c.memberId), ['alex', 'sam']);
  const again = ledger.add({ title: 'Tidy again', kid: 'both' });
  assert.equal(new Set(ids(d.chores)).size, 4);
  assert.equal(again.length, 2);
  assert.equal(made[0].points, 3, 'default points');
  assert.equal(made[0].frequency, 'daily', 'default cadence');
});

test('a wildcard is a chore owned by "either"', () => {
  const { ledger, d } = setup();
  ledger.add({ title: 'Wash car', kid: 'either', points: 8, frequency: 'weekly' });
  assert.equal(d.chores[0].memberId, 'either');
});

test('edit changes only what a chore or a routine may change', () => {
  const { ledger, d } = setup({ data: { chores: [chore()], routines: [routine()] } });
  ledger.edit('c1', { title: 'Clear plates', points: 5, frequency: 'weekly', routineType: 'bedtime', memberId: 'sam', status: 'completed' });
  assert.deepEqual([d.chores[0].title, d.chores[0].points, d.chores[0].frequency, d.chores[0].routineType, d.chores[0].memberId, d.chores[0].status], ['Clear plates', 5, 'weekly', 'bedtime', 'sam', 'pending']);
  ledger.edit('r1', { title: 'Make my bed', points: 9, frequency: 'weekly', routineType: 'bedtime' });
  assert.deepEqual([d.routines[0].title, d.routines[0].routineType, d.routines[0].points, d.routines[0].frequency], ['Make my bed', 'bedtime', undefined, undefined]);
  assert.equal(ledger.edit('missing', { title: 'x' }), null);
});

test('remove deletes a chore or a routine', () => {
  const { ledger, d } = setup({ data: { chores: [chore()], routines: [routine()] } });
  assert.equal(ledger.remove('c1').id, 'c1');
  assert.equal(ledger.remove('r1').id, 'r1');
  assert.deepEqual([d.chores.length, d.routines.length], [0, 0]);
  assert.equal(ledger.remove('c1'), null);
});

test('move reassigns a chore to a kid and routine, resets a non-daily cadence, and orders it before another item', () => {
  const { ledger, d } = setup({ data: { chores: [chore({ id: 'a', frequency: 'weekly' }), chore({ id: 'b' }), chore({ id: 'c' })] } });
  assert.equal(ledger.move('a', { kid: 'sam', routine: 'bedtime', beforeId: 'c' }), true);
  const a = d.chores.find((c) => c.id === 'a');
  assert.deepEqual([a.memberId, a.routineType, a.frequency], ['sam', 'bedtime', 'daily']);
  assert.deepEqual(ids(d.chores), ['b', 'a', 'c']);
  ledger.move('b', { kid: 'alex', routine: 'general' });
  assert.deepEqual(ids(d.chores), ['a', 'c', 'b'], 'no beforeId: goes last');
});

test('move into a weekly or monthly section sets the cadence and the general routine; routines cannot take a cadence', () => {
  const { ledger, d } = setup({ data: { chores: [chore({ routineType: 'morning' })], routines: [routine()] } });
  ledger.move('c1', { kid: 'alex', freq: 'monthly' });
  assert.deepEqual([d.chores[0].frequency, d.chores[0].routineType], ['monthly', 'general']);
  assert.equal(ledger.move('r1', { kid: 'alex', freq: 'weekly' }), false);
  assert.equal(ledger.move('r1', { kid: 'sam', routine: 'bedtime' }), true);
  assert.deepEqual([d.routines[0].memberId, d.routines[0].routineType], ['sam', 'bedtime']);
});

test('reset puts a finished chore back to pending', () => {
  const { ledger, d } = setup({ data: { chores: [chore({ status: 'completed', completedBy: 'sam' })] } });
  assert.equal(ledger.reset('c1'), true);
  assert.deepEqual([d.chores[0].status, d.chores[0].completedBy], ['pending', null]);
  assert.equal(ledger.reset('missing'), false);
});

// ---------------------------------------------------------------- stars by hand and prizes

test('a parent can adjust stars; the balance never goes below zero and the activity log is left alone', () => {
  const { ledger, d } = setup();
  const before = log(d, 'alex').length;
  assert.equal(ledger.adjustStars('alex', 5), 15);
  assert.equal(ledger.adjustStars('alex', -100), 0);
  assert.equal(ledger.adjustStars('alex', -1), 0);
  assert.equal(log(d, 'alex').length, before, 'a hand adjustment never pushed real entries out of "Recent stars"');
  assert.equal(ledger.adjustStars('ghost', 1), null);
});

test('the activity log keeps the newest 20 entries', () => {
  const { ledger, d } = setup({ data: { chores: Array.from({ length: 25 }, (_, i) => chore({ id: 'c' + i, title: 'Chore ' + i })) } });
  for (let i = 0; i < 25; i++) ledger.tick('c' + i);
  assert.equal(log(d, 'alex').length, 20);
  assert.equal(log(d, 'alex')[0].title, 'Chore 24');
});

test('prizes are listed cheapest first; the star meter aims at the cheapest one not yet affordable, else the priciest', () => {
  const { ledger, d } = setup({ data: { rewards: [{ id: 'b', title: 'Big', cost: 50 }, { id: 'a', title: 'Small', cost: 8 }] } });
  assert.deepEqual(ids(ledger.rewards()), ['a', 'b']);
  assert.equal(ledger.nextPrize({ stars: 5 }).id, 'a');
  assert.equal(ledger.nextPrize({ stars: 8 }).id, 'b');
  assert.equal(ledger.nextPrize({ stars: 80 }).id, 'b');
  assert.equal(ledger.starPct({ stars: 4 }), 50);
  assert.equal(ledger.starPct({ stars: 80 }), 100);
  d.rewards = [];
  assert.equal(ledger.nextPrize({ stars: 1 }), null);
  assert.equal(ledger.starPct({ stars: 1 }), 0);
});

test('buying a prize spends the stars, logs it, files a to-do for the parents and announces it', () => {
  const { ledger, d, added, prizes } = setup({ data: { rewards: [{ id: 'p', title: 'Lego set', cost: 8 }] } });
  const bought = ledger.buy('alex', 'p');
  assert.equal(bought.id, 'p');
  assert.equal(stars(d, 'alex'), 2);
  assert.deepEqual([log(d, 'alex')[0].title, log(d, 'alex')[0].points, log(d, 'alex')[0].kind], ['Bought: Lego set', -8, 'spend']);
  assert.deepEqual(added, [{ title: 'Give Alex: Lego set', memberId: 'shared', priority: 'high', category: 'family', dueDate: '2026-10-14' }]);
  assert.deepEqual(prizes, [{ memberId: 'alex', title: 'Lego set', cost: 8 }]);
});

test('buying fails without enough stars, or for an unknown prize or kid, and changes nothing', () => {
  const { ledger, d, added, prizes } = setup({ data: { rewards: [{ id: 'p', title: 'Lego set', cost: 80 }] } });
  assert.equal(ledger.buy('alex', 'p'), null);
  assert.equal(ledger.buy('alex', 'nope'), null);
  assert.equal(ledger.buy('ghost', 'p'), null);
  assert.deepEqual([stars(d, 'alex'), added.length, prizes.length, log(d, 'alex').length], [10, 0, 0, 0]);
});

test('prizes can be added, edited and removed; bad input is refused or ignored', () => {
  const { ledger, d } = setup();
  assert.equal(ledger.addReward({ title: '  ', cost: 5 }), null);
  assert.equal(ledger.addReward({ title: 'Movie', cost: 0 }), null);
  const r = ledger.addReward({ title: 'Movie night', cost: 12 });
  assert.deepEqual(d.rewards, [{ id: r.id, title: 'Movie night', cost: 12 }]);
  ledger.editReward(r.id, { title: '  Movie  ', cost: '15' });
  assert.deepEqual([d.rewards[0].title, d.rewards[0].cost], ['Movie', 15]);
  ledger.editReward(r.id, { title: '   ', cost: 'abc' });
  assert.deepEqual([d.rewards[0].title, d.rewards[0].cost], ['Movie', 15], 'blank title and non-number are ignored');
  ledger.editReward(r.id, { cost: -4 });
  assert.equal(d.rewards[0].cost, 1, 'at least one star');
  ledger.removeReward(r.id);
  assert.deepEqual(d.rewards, []);
});

test('init seeds the prize store from the old per-kid goals, once', () => {
  const { ledger, d } = setup();
  d.members[0].targetReward = 'Lego';
  d.members[0].targetStars = 50;
  d.members[1].targetReward = 'Lego';
  d.members[1].targetStars = 50;       // same goal: only one prize
  d.members[2].targetReward = 'Spa';
  d.members[2].targetStars = 100;      // parents' goals are not prizes
  ledger.init();
  assert.deepEqual(d.rewards.map((r) => [r.title, r.cost]), [['Lego', 50]]);
  ledger.init();
  assert.equal(d.rewards.length, 1);
  assert.equal(d.rewardsSeeded, true);
});

// ---------------------------------------------------------------- showing missions

test('itemsFor groups one kid\'s routines and chores by time of day and cadence', () => {
  const { ledger } = setup({ data: {
    routines: [routine({ id: 'r1' }), routine({ id: 'r2', routineType: 'bedtime' }), routine({ id: 'rn', memberId: 'sam' })],
    chores: [chore({ id: 'd1' }), chore({ id: 'd2', frequency: undefined }), chore({ id: 'm1', routineType: 'morning' }),
      chore({ id: 'w1', frequency: 'weekly' }), chore({ id: 'mo1', frequency: 'monthly' }), chore({ id: 'sam', memberId: 'sam' }), chore({ id: 'wild', memberId: 'either' })]
  } });
  const g = ledger.itemsFor('alex');
  assert.deepEqual(ids(g.byRoutine.morning), ['r1', 'm1']);
  assert.deepEqual(ids(g.byRoutine.afterschool), []);
  assert.deepEqual(ids(g.byRoutine.bedtime), ['r2']);
  assert.deepEqual(ids(g.daily), ['d1', 'd2']);
  assert.deepEqual(ids(g.weekly), ['w1']);
  assert.deepEqual(ids(g.monthly), ['mo1']);
  assert.equal(g.byRoutine.morning[0]._routine, true);
  assert.equal(g.byRoutine.morning[1]._routine, undefined);
});

test('wildcards lists the chores anyone may claim', () => {
  const { ledger } = setup({ data: { chores: [chore({ id: 'a' }), chore({ id: 'w', memberId: 'either' })] } });
  assert.deepEqual(ids(ledger.wildcards()), ['w']);
});

test('find locates a chore or a routine by id', () => {
  const { ledger } = setup({ data: { chores: [chore()], routines: [routine()] } });
  assert.equal(ledger.find('c1').kind, 'chore');
  assert.equal(ledger.find('r1').kind, 'routine');
  assert.equal(ledger.find('zzz'), null);
});

// ---------------------------------------------------------------- the daily, weekly and monthly reset

test('resetPeriodic: routines and daily chores reset every day; weekly chores reset on Sunday; monthly on the first', () => {
  const data = {
    routines: [routine({ completedToday: true })],
    chores: [chore({ id: 'd', status: 'completed', completedBy: 'alex' }), chore({ id: 'w', frequency: 'weekly', status: 'completed' }),
      chore({ id: 'm', frequency: 'monthly', status: 'completed' }), chore({ id: 'wild', memberId: 'either', frequency: 'weekly', status: 'completed', completedBy: 'sam' })]
  };
  const { ledger, d, clock } = setup({ now: day(2026, 10, 14), data });
  assert.equal(ledger.resetPeriodic(), true, 'first run');
  assert.deepEqual([d.routines[0].completedToday, d.chores[0].status, d.chores[1].status, d.chores[2].status, d.chores[3].status], [false, 'pending', 'pending', 'pending', 'pending'], 'a first run resets everything');
  assert.deepEqual(d.lastReset, { day: '2026-10-14', week: '2026-10-11', month: '2026-10' });

  d.routines[0].completedToday = true;
  d.chores.forEach((c) => { c.status = 'completed'; });
  assert.equal(ledger.resetPeriodic(), false, 'same day: nothing happens');
  assert.equal(d.routines[0].completedToday, true);

  clock.now = day(2026, 10, 15);            // Thursday, same week and month
  ledger.resetPeriodic();
  assert.deepEqual([d.routines[0].completedToday, d.chores[0].status, d.chores[1].status, d.chores[2].status], [false, 'pending', 'completed', 'completed']);

  d.chores.forEach((c) => { c.status = 'completed'; });
  clock.now = day(2026, 10, 18);            // Sunday: a new week, same month
  ledger.resetPeriodic();
  assert.deepEqual([d.chores[0].status, d.chores[1].status, d.chores[2].status, d.chores[3].status], ['pending', 'pending', 'completed', 'pending']);

  d.chores.forEach((c) => { c.status = 'completed'; });
  clock.now = day(2026, 11, 2);             // Monday in a new month (and the week of Nov 1)
  ledger.resetPeriodic();
  assert.deepEqual(d.chores.map((c) => c.status), ['pending', 'pending', 'pending', 'pending']);
  assert.equal(d.chores[0].completedBy, null);
});
