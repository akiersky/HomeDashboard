'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBundle } = require('./helpers/load-bundle');

const { StateManager } = loadBundle();
const KEY = 'family_dashboard_state_v1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const memoryLocal = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return { map, get: (k) => (map.has(k) ? map.get(k) : null), set: (k, v) => { map.set(k, v); } };
};
function fakeRemote({ ready = true, doc = null } = {}) {
  const r = {
    isReady: ready, doc, sets: [], fails: false, gets: 0,
    ready: () => r.isReady,
    async get() { r.gets++; if (r.fails) throw new Error('down'); return r.doc; },
    async set(d) { if (r.fails) throw new Error('down'); r.sets.push(JSON.parse(JSON.stringify(d))); r.doc = d; }
  };
  return r;
}
function make({ stored, remote = fakeRemote({ ready: false }), baseline = async () => null, config } = {}) {
  const local = memoryLocal(stored ? { [KEY]: JSON.stringify(stored) } : {});
  const clock = { t: 1000 };
  const sm = new StateManager({ local, remote, baseline, config, now: () => clock.t, pushDelay: 5 });
  return { sm, local, remote, clock };
}
const savedDoc = (local) => JSON.parse(local.map.get(KEY));

// ---------------------------------------------------------------- loading

test('a first run takes the seed from the baseline and saves it without counting as an edit', async () => {
  let asked = 0;
  const seed = { members: [{ id: 'mom', role: 'parent', stars: 3 }], chores: [{ id: 'c' }], settings: { photoIntervalSeconds: 40 } };
  const { sm, local, remote } = make({ remote: fakeRemote(), baseline: async () => { asked++; return seed; } });
  assert.equal(await sm.loadBaselineIfEmpty(), true);
  assert.equal(sm.data.chores.length, 1);
  assert.equal(sm.data.settings.photoIntervalSeconds, 40);
  assert.equal(sm.data.settings.haUrl, 'http://homeassistant.local:8123', 'settings the seed lacks come from the defaults');
  assert.equal(sm.data.updatedAt, undefined, 'not an edit');
  assert.equal(savedDoc(local).chores.length, 1);
  await sleep(20);
  assert.deepEqual(remote.sets, [], 'and nothing is pushed');

  const again = make({ stored: { chores: [] }, baseline: async () => { asked++; return seed; } });
  assert.equal(await again.sm.loadBaselineIfEmpty(), false);
  assert.equal(asked, 1, 'a saved document means no baseline is fetched');
});

test('a first run without a baseline leaves the empty defaults', async () => {
  const { sm } = make({ baseline: async () => { throw new Error('offline'); } });
  assert.equal(await sm.loadBaselineIfEmpty(), false);
  assert.deepEqual(sm.data.chores, []);
  assert.equal(sm.data.activeMemberId, 'all');
});

test('a saved document is layered over the defaults, settings included', () => {
  const { sm } = make({ stored: { chores: [{ id: 'c1' }], settings: { photoIntervalSeconds: 45 } } });
  assert.deepEqual(sm.data.chores, [{ id: 'c1' }]);
  assert.equal(sm.data.settings.photoIntervalSeconds, 45);
  assert.equal(sm.data.settings.idleSaverMinutes, 2);
  assert.equal(sm.data.schemaVersion, 1);
  assert.deepEqual(sm.data.rewards, []);
});

test('old reminders are migrated into parent tasks on load', () => {
  const { sm } = make({ stored: { recurringReminders: [{ id: 'r1', memberId: 'both', title: 'Filter', category: 'routine', frequency: 'monthly', nextDueDate: '2026-11-01', showOnCalendar: true }] } });
  assert.equal(sm.data.recurringReminders, undefined);
  assert.deepEqual(sm.data.parentTasks[0], { id: 'r1', memberId: 'shared', title: 'Filter', notes: '', priority: 'medium', category: 'home', dueDate: '2026-11-01', frequency: 'monthly', lastCompletedDate: null, showOnCalendar: true, completed: false });
});

test('fields no version reads any more are dropped from a saved document', () => {
  const { sm } = make({ stored: { theme: 'dark', meals: { Mon: 'x' }, chores: [{ id: 'c' }], settings: { haConnected: true, immichEnabled: true, haTasksTodoEntity: 'todo.old', photoIntervalSeconds: 45 } } });
  assert.equal('theme' in sm.data, false);
  assert.equal('meals' in sm.data, false);
  for (const k of ['haConnected', 'immichEnabled', 'haTasksTodoEntity']) assert.equal(k in sm.data.settings, false, k);
  assert.equal(sm.data.settings.photoIntervalSeconds, 45);
  assert.deepEqual(sm.data.chores, [{ id: 'c' }]);
});

test('the doorbell is off until the user sets an entity; a blank photo entity falls back to the default', () => {
  const { sm } = make({ stored: { settings: { doorbellEntity: '', doorbellCamera: '', photoEntity: '' } } });
  assert.equal(sm.data.settings.doorbellEntity, '');
  assert.equal(sm.data.settings.doorbellCamera, '');
  assert.match(sm.data.settings.photoEntity, /^image\./);
});

// ---------------------------------------------------------------- config.js

test('config.js settings override what was saved, when they are set', () => {
  const { sm } = make({
    stored: { settings: { haUrl: 'http://saved', googleKeepUrl: 'https://saved-keep', haToken: 'SAVED' } },
    config: { homeAssistant: { url: 'http://from-config', token: '' }, googleKeepUrl: '' }
  });
  assert.equal(sm.data.settings.haUrl, 'http://from-config');
  assert.equal(sm.data.settings.googleKeepUrl, 'https://saved-keep', 'a blank config value changes nothing');
  assert.equal(sm.data.settings.haToken, 'SAVED');
});

test('config.js decides who the members are, but what was saved for them survives a reload', () => {
  const config = { members: [
    { id: 'alex', name: 'Alex', role: 'kid', avatar: '👦', color: '#f59e0b', haCalendarEntity: 'calendar.alex', targetReward: 'Lego', targetStars: 50 },
    { id: 'sam', name: 'Sam', role: 'kid', avatar: '👧', color: '#8b5cf6', haCalendarEntity: 'calendar.sam', stars: 4 },
    { id: 'dad', name: 'Dad', role: 'parent', avatar: '👨', color: '#0284c7' }
  ] };
  const { sm } = make({ config, stored: { members: [
    { id: 'alex', name: 'Renamed', color: '#111111', avatar: '🦖', haCalendarEntity: 'calendar.custom', stars: 12, targetReward: 'Bike', goalDoneFor: 'Bike' },
    { id: 'sam', haCalendarEntity: '' },
    { id: 'gone', name: 'Not in config' }
  ] } });
  const by = Object.fromEntries(sm.data.members.map((m) => [m.id, m]));
  assert.deepEqual(Object.keys(by), ['alex', 'sam', 'dad'], 'members come from config.js, in its order');
  assert.deepEqual([by.alex.name, by.alex.color], ['Alex', '#f59e0b'], 'name and colour come from config.js');
  assert.deepEqual([by.alex.avatar, by.alex.haCalendarEntity, by.alex.stars, by.alex.targetReward, by.alex.goalDoneFor], ['🦖', 'calendar.custom', 12, 'Bike', 'Bike'], 'edits made in Settings and earned stars survive');
  assert.equal(by.alex.targetStars, 50, 'a target the saved copy lacks comes from config.js');
  assert.equal(by.sam.haCalendarEntity, '', 'a calendar cleared in Settings stays cleared');
  assert.equal(by.sam.stars, 4);
  assert.equal(by.dad.stars, 0, 'a new member starts with no stars');
});

// ---------------------------------------------------------------- saving and sharing

test('save stamps the time, stores the document on this device and tells subscribers', () => {
  const { sm, local, clock } = make();
  const seen = [];
  sm.subscribe((data) => seen.push(data.chores.length));
  clock.t = 5000;
  sm.data.chores.push({ id: 'c' });
  sm.save();
  assert.equal(sm.data.updatedAt, 5000);
  assert.equal(savedDoc(local).updatedAt, 5000);
  assert.deepEqual(seen, [1]);
});

test('a save that is not an edit keeps the stamp and does not push', async () => {
  const { sm, remote, clock } = make({ remote: fakeRemote() });
  clock.t = 7000;
  sm.save({ stamp: false, push: false });
  await sleep(20);
  assert.equal(sm.data.updatedAt, undefined);
  assert.deepEqual(remote.sets, []);
});

test('saves are pushed to Home Assistant once, a moment later, without tokens or this tablet\'s view', async () => {
  const { sm, remote } = make({ remote: fakeRemote(), stored: { settings: { haToken: 'SECRET', immichApiKey: 'KEY', parentPin: '4321' }, activeMemberId: 'alex', chores: [{ id: 'c1' }] } });
  sm.save();
  sm.save();
  sm.save();
  assert.deepEqual(remote.sets, [], 'not at once');
  await sleep(30);
  assert.equal(remote.sets.length, 1, 'one push for three saves');
  const doc = remote.sets[0];
  assert.equal('haToken' in doc.settings, false);
  assert.equal('immichApiKey' in doc.settings, false);
  assert.equal(doc.settings.parentPin, '4321', 'the PIN is shared between tablets');
  assert.equal('activeMemberId' in doc, false);
  assert.deepEqual(doc.chores, [{ id: 'c1' }]);
  assert.ok(doc.updatedAt > 0);
});

test('nothing is pushed while Home Assistant is not configured, and a failed push is only a warning', async () => {
  const idle = make({ remote: fakeRemote({ ready: false }) });
  idle.sm.save();
  await sleep(20);
  assert.deepEqual(idle.remote.sets, []);
  const failing = make({ remote: Object.assign(fakeRemote(), { fails: true }) });
  failing.sm.save();
  await sleep(20);
  assert.ok(true, 'no unhandled rejection');
});

test('choosing a member to view is this tablet\'s own business: kept locally, never stamped or pushed', async () => {
  const { sm, local, remote, clock } = make({ remote: fakeRemote() });
  let told = 0;
  sm.subscribe(() => { told++; });
  clock.t = 9000;
  sm.setActiveMember('sam');
  await sleep(20);
  assert.equal(sm.data.activeMemberId, 'sam');
  assert.equal(savedDoc(local).activeMemberId, 'sam');
  assert.equal(sm.data.updatedAt, undefined);
  assert.deepEqual(remote.sets, []);
  assert.equal(told, 1);
});

// ---------------------------------------------------------------- syncing with Home Assistant

const remoteDoc = (extra) => ({ chores: [{ id: 'remote-chore' }], settings: { photoIntervalSeconds: 99 }, updatedAt: 5000, ...extra });

test('sync does nothing when Home Assistant is not configured', async () => {
  const { sm, remote } = make({ remote: fakeRemote({ ready: false }) });
  await sm.syncRemote();
  assert.equal(remote.gets, 0);
});

test('a newer Home Assistant copy is adopted; this tablet keeps its tokens and its view', async () => {
  const { sm, local, remote } = make({
    remote: fakeRemote({ doc: remoteDoc({ activeMemberId: 'mom' }) }),
    stored: { updatedAt: 1000, activeMemberId: 'alex', settings: { haToken: 'LOCAL-TOKEN', immichApiKey: 'LOCAL-KEY' }, chores: [{ id: 'local-chore' }] }
  });
  await sm.syncRemote();
  assert.deepEqual(sm.data.chores, [{ id: 'remote-chore' }]);
  assert.equal(sm.data.settings.photoIntervalSeconds, 99);
  assert.equal(sm.data.settings.haToken, 'LOCAL-TOKEN');
  assert.equal(sm.data.settings.immichApiKey, 'LOCAL-KEY');
  assert.equal(sm.data.activeMemberId, 'alex');
  assert.equal(sm.data.updatedAt, 5000);
  assert.deepEqual(savedDoc(local).chores, [{ id: 'remote-chore' }]);
  await sleep(20);
  assert.deepEqual(remote.sets, [], 'adopting is not an edit, so it is not pushed back');
});

test('when this tablet is newer, or Home Assistant has nothing, this copy is pushed', async () => {
  const newer = make({ remote: fakeRemote({ doc: remoteDoc({ updatedAt: 500 }) }), stored: { updatedAt: 1000, chores: [{ id: 'mine' }] } });
  await newer.sm.syncRemote();
  assert.deepEqual(newer.remote.sets.map((d) => d.chores), [[{ id: 'mine' }]]);
  const empty = make({ remote: fakeRemote({ doc: null }), stored: { updatedAt: 1000 } });
  await empty.sm.syncRemote();
  assert.equal(empty.remote.sets.length, 1);
});

test('equal copies are left alone', async () => {
  const { sm, remote } = make({ remote: fakeRemote({ doc: remoteDoc({ updatedAt: 1000 }) }), stored: { updatedAt: 1000, chores: [{ id: 'mine' }] } });
  await sm.syncRemote();
  assert.deepEqual(sm.data.chores, [{ id: 'mine' }]);
  assert.deepEqual(remote.sets, []);
});

test('a local edit still waiting to be pushed wins over the sync', async () => {
  const { sm, remote } = make({ remote: fakeRemote({ doc: remoteDoc() }), stored: { updatedAt: 1000, chores: [{ id: 'mine' }] } });
  sm.save();
  await sm.syncRemote();
  assert.deepEqual(sm.data.chores, [{ id: 'mine' }]);
  assert.equal(remote.gets, 0, 'it does not even ask');
});

test('a failing sync changes nothing and does not throw', async () => {
  const { sm, remote } = make({ remote: Object.assign(fakeRemote({ doc: remoteDoc() }), { fails: true }), stored: { updatedAt: 1000, chores: [{ id: 'mine' }] } });
  await sm.syncRemote();
  assert.deepEqual(sm.data.chores, [{ id: 'mine' }]);
  assert.deepEqual(remote.sets, []);
});

// ---------------------------------------------------------------- backup

test('an export leaves out tokens, the PIN and this tablet\'s view', () => {
  const { sm } = make({ stored: { activeMemberId: 'alex', chores: [{ id: 'c1' }], settings: { haToken: 'T', immichApiKey: 'K', parentPin: '4321', haUrl: 'http://ha' } } });
  const exported = JSON.parse(sm.exportJson());
  assert.deepEqual(exported.chores, [{ id: 'c1' }]);
  assert.equal(exported.settings.haUrl, 'http://ha');
  for (const secret of ['haToken', 'immichApiKey', 'parentPin']) assert.equal(secret in exported.settings, false, secret);
  assert.equal('activeMemberId' in exported, false);
});

test('an import replaces the household data but keeps this tablet\'s tokens, PIN and view', () => {
  const { sm, local, clock } = make({ stored: { activeMemberId: 'alex', settings: { haToken: 'LOCAL', parentPin: '4321' }, chores: [{ id: 'old' }] } });
  clock.t = 8000;
  const result = sm.importData(JSON.stringify({ chores: [{ id: 'imported' }], activeMemberId: 'mom', settings: { haToken: 'THEIRS', parentPin: '0000', photoIntervalSeconds: 60 } }));
  assert.deepEqual(result, { success: true });
  assert.deepEqual(sm.data.chores, [{ id: 'imported' }]);
  assert.equal(sm.data.settings.photoIntervalSeconds, 60);
  assert.equal(sm.data.settings.haToken, 'LOCAL');
  assert.equal(sm.data.settings.parentPin, '4321');
  assert.equal(sm.data.activeMemberId, 'alex');
  assert.equal(sm.data.updatedAt, 8000);
  assert.deepEqual(savedDoc(local).chores, [{ id: 'imported' }]);
});

test('an import refuses things that are not dashboard backups, and changes nothing', () => {
  const { sm } = make({ stored: { chores: [{ id: 'keep' }] } });
  for (const bad of ['not json', '"text"', '[]', '{"unrelated": true}']) {
    const r = sm.importData(bad);
    assert.equal(r.success, false, bad);
    assert.equal(typeof r.error, 'string');
  }
  assert.deepEqual(sm.data.chores, [{ id: 'keep' }]);
});

test('resetting to the baseline replaces the data; a baseline that cannot be fetched changes nothing', async () => {
  const ok = make({ stored: { chores: [{ id: 'mine' }] }, baseline: async () => ({ chores: [{ id: 'seed' }] }) });
  assert.equal(await ok.sm.resetToBaseline(), true);
  assert.deepEqual(ok.sm.data.chores, [{ id: 'seed' }]);
  for (const baseline of [async () => null, async () => { throw new Error('offline'); }]) {
    const bad = make({ stored: { chores: [{ id: 'mine' }] }, baseline });
    assert.equal(await bad.sm.resetToBaseline(), false);
    assert.deepEqual(bad.sm.data.chores, [{ id: 'mine' }]);
  }
});

// ---------------------------------------------------------------- upgrade safety

test('plugin upgrade preserves all user data, custom members, earned stars, and chores without reverting to seed baseline', async () => {
  const userStoredData = {
    schemaVersion: 1,
    familyName: 'The Simpsons',
    members: [
      { id: 'kid1', name: 'Bart', stars: 85, targetReward: 'Skateboard', targetStars: 100, avatar: '🛹' },
      { id: 'kid2', name: 'Lisa', stars: 120, targetReward: 'Saxophone', targetStars: 150, avatar: '🎷' }
    ],
    chores: [
      { id: 'custom-chore-1', title: 'Feed Santa\'s Little Helper', memberId: 'kid1', points: 5, status: 'completed' }
    ],
    routines: [
      { id: 'custom-rt-1', title: 'Brush teeth', memberId: 'kid1', completedToday: true }
    ],
    rewards: [
      { id: 'rew-1', title: 'Comic book', cost: 10 }
    ],
    parentTasks: [
      { id: 'pt-1', title: 'Fix roof', priority: 'high', memberId: 'shared' }
    ],
    kidAchievements: {
      kid1: { rank: 'Star Explorer', streak: 12, badges: [], activityLog: [{ id: 'a1', title: 'Did chores', points: 5 }] }
    },
    groceries: [
      { id: 'g-1', name: 'Donuts', bought: false }
    ],
    mealIdeas: [
      { id: 'm-1', name: 'Pork Chops' }
    ],
    settings: {
      haUrl: 'http://my-ha:8123',
      haToken: 'MY-DEVICE-TOKEN',
      haKioskMode: true,
      parentPin: '9876',
      idleSaverMinutes: 5,
      photoIntervalSeconds: 60
    },
    updatedAt: 1729000000000
  };

  let baselineFetched = 0;
  const newPluginBaseline = {
    familyName: 'Default Baseline Family',
    members: [{ id: 'alex', name: 'Alex', stars: 0 }],
    chores: [{ id: 'seed-chore', title: 'Seed Chore' }],
    settings: { idleSaverMinutes: 2 }
  };

  // User loads the newly upgraded plugin
  const { sm } = make({
    stored: userStoredData,
    baseline: async () => { baselineFetched++; return newPluginBaseline; }
  });

  // loadBaselineIfEmpty is called on startup
  const loadedBaseline = await sm.loadBaselineIfEmpty();
  assert.equal(loadedBaseline, false, 'baseline must NOT load when user already has saved state');
  assert.equal(baselineFetched, 0, 'baseline fetch must be skipped entirely');

  // Verify all user data is intact
  assert.equal(sm.data.familyName, 'The Simpsons');
  assert.equal(sm.data.members[0].name, 'Bart');
  assert.equal(sm.data.members[0].stars, 85);
  assert.equal(sm.data.members[0].avatar, '🛹');
  assert.equal(sm.data.chores[0].title, 'Feed Santa\'s Little Helper');
  assert.equal(sm.data.rewards[0].title, 'Comic book');
  assert.equal(sm.data.parentTasks[0].title, 'Fix roof');
  assert.equal(sm.data.groceries[0].name, 'Donuts');
  assert.equal(sm.data.mealIdeas[0].name, 'Pork Chops');
  assert.equal(sm.data.kidAchievements.kid1.rank, 'Star Explorer');

  // Verify settings survived
  assert.equal(sm.data.settings.haUrl, 'http://my-ha:8123');
  assert.equal(sm.data.settings.haToken, 'MY-DEVICE-TOKEN');
  assert.equal(sm.data.settings.haKioskMode, true);
  assert.equal(sm.data.settings.parentPin, '9876');
  assert.equal(sm.data.settings.idleSaverMinutes, 5);
  assert.equal(sm.data.settings.photoIntervalSeconds, 60);

  // Verify new defaults from schema exist without overwriting existing settings
  assert.equal(typeof sm.data.settings.doorbellEntity, 'string');
});

test('when local storage is empty on a new tablet or after clearing cache, syncRemote restores existing user data from Home Assistant rather than staying on the seed', async () => {
  const remoteUserData = {
    familyName: 'Home Assistant Synced Family',
    members: [{ id: 'k1', name: 'Charlie', stars: 42 }],
    chores: [{ id: 'remote-chore', title: 'Walk the dog' }],
    settings: { idleSaverMinutes: 10 },
    updatedAt: 1729000500000
  };

  const seedBaseline = {
    familyName: 'Seed Family',
    members: [{ id: 'alex', name: 'Alex', stars: 0 }],
    chores: [{ id: 'seed-chore', title: 'Seed Chore' }]
  };

  const remote = fakeRemote({ ready: true, doc: remoteUserData });
  const { sm } = make({
    stored: null, // empty localStorage
    remote,
    baseline: async () => seedBaseline
  });

  // 1. Startup loads baseline temporarily without stamping or pushing
  await sm.loadBaselineIfEmpty();
  assert.equal(sm.data.familyName, 'Seed Family');
  assert.equal(sm.data.updatedAt, undefined);

  // 2. HA sync runs immediately on boot
  await sm.syncRemote();

  // 3. User\'s real data in Home Assistant overwrote the baseline seed!
  assert.equal(sm.data.familyName, 'Home Assistant Synced Family');
  assert.equal(sm.data.members[0].name, 'Charlie');
  assert.equal(sm.data.members[0].stars, 42);
  assert.equal(sm.data.chores[0].title, 'Walk the dog');
  assert.equal(sm.data.settings.idleSaverMinutes, 10);
  assert.equal(sm.data.updatedAt, 1729000500000);
});

