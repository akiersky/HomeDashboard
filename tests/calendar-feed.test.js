'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBundle } = require('./helpers/load-bundle');

const { CalendarFeed } = loadBundle();

const NOW = new Date(2026, 9, 14, 21, 0);   // Wed 2026-10-14 21:00 local
const ev = (o) => ({ id: 'e', title: 'Event', memberId: 'mom', category: 'family', date: '2026-10-14', time: '9:00 AM - 10:00 AM', location: '', notes: '', ...o });
const ids = (list) => list.map((e) => e.id);

function setup({ events = [], tasks = [], cached = [], ha } = {}) {
  const store = {
    saves: [], save(opts) { this.saves.push(opts); },
    data: { events, members: [{ id: 'mom', role: 'parent', haCalendarEntity: 'calendar.mom' }, { id: 'alex', role: 'kid', haCalendarEntity: 'calendar.alex' }, { id: 'dad', role: 'parent' }] }
  };
  const cache = { events: cached, writes: 0, read() { return this.events; }, write(e) { this.events = e; this.writes++; } };
  const feed = new CalendarFeed({ store, tasks: { asCalendarEvents: () => tasks }, cache, ha, now: () => new Date(NOW) });
  return { feed, store, cache };
}

// ---------------------------------------------------------------- the one time parser

test('parseTime reads display times into minutes from midnight', () => {
  const t = (s) => CalendarFeed.parseTime(s);
  assert.deepEqual(t('9:00 AM - 10:30 AM'), { isAllDay: false, startMinutes: 540, endMinutes: 630, duration: 90 });
  assert.deepEqual(t('2:00 PM'), { isAllDay: false, startMinutes: 840, endMinutes: 900, duration: 60 }, 'no end: one hour');
  assert.equal(t('12:00 AM').startMinutes, 0);
  assert.equal(t('12:30 PM').startMinutes, 750);
  assert.deepEqual(t('9:00 AM - 9:10 AM'), { isAllDay: false, startMinutes: 540, endMinutes: 570, duration: 30 }, 'at least 30 minutes');
  assert.equal(t('11:00 PM - 1:00 AM').endMinutes, 1440, 'an end before the start is clamped to midnight');
  assert.equal(t('14:30').startMinutes, 870, '24-hour times work too');
});

test('event dialog fields round-trip through the stored time', () => {
  const round = (s) => CalendarFeed.timeFromFields(CalendarFeed.timeFields(s));
  assert.equal(round('2:05 PM - 3:30 PM'), '2:05 PM - 3:30 PM');
  assert.equal(round('9:00 AM'), '9:00 AM');
  assert.equal(round('All Day'), 'All Day');
  assert.deepEqual(CalendarFeed.timeFields('2:05 PM - 3:30 PM'), { allDay: false, start: '14:05', end: '15:30' });
  assert.equal(CalendarFeed.timeFromFields({ allDay: false, start: '14:05', end: '' }), '2:05 PM');
});

test('startTime keeps only the start of a display time', () => {
  assert.equal(CalendarFeed.startTime('3:00 PM - 4:00 PM'), '3:00 PM');
  assert.equal(CalendarFeed.startTime('09:00 AM'), '9:00 AM');
  assert.equal(CalendarFeed.startTime('All Day'), '');
  assert.equal(CalendarFeed.startTime(''), '');
  assert.equal(CalendarFeed.startTime(undefined), '');
});

test('parseTime treats missing, "All Day" and unreadable times as all day', () => {
  for (const s of ['All Day', 'all-day', 'ALL DAY', '', undefined, null, 'TBD']) {
    assert.deepEqual(CalendarFeed.parseTime(s), { isAllDay: true, startMinutes: 0, endMinutes: 1440, duration: 1440 }, String(s));
  }
});

test('to24 and from24 convert between the form field and the display time', () => {
  assert.equal(CalendarFeed.to24('9:00 AM - 10:00 AM'), '09:00');
  assert.equal(CalendarFeed.to24('2:05 PM'), '14:05');
  assert.equal(CalendarFeed.to24('12:15 AM'), '00:15');
  assert.equal(CalendarFeed.to24('14:30'), '14:30');
  assert.equal(CalendarFeed.to24('All Day'), '09:00');
  assert.equal(CalendarFeed.to24(''), '09:00');
  assert.equal(CalendarFeed.from24('14:05'), '2:05 PM');
  assert.equal(CalendarFeed.from24('00:15'), '12:15 AM');
  assert.equal(CalendarFeed.from24('12:00'), '12:00 PM');
  assert.equal(CalendarFeed.from24(''), '09:00 AM');
});

// ---------------------------------------------------------------- Home Assistant events

test('fromHa turns Home Assistant events into dashboard events', () => {
  const member = { id: 'alex', role: 'kid' };
  const [timed, allDay, loose] = CalendarFeed.fromHa(member, [
    { uid: 'abc', summary: 'Soccer', start: '2026-10-14T16:00:00', end: '2026-10-14T17:30:00', location: 'Field 3', description: 'Bring water' },
    { uid: 'xyz', recurrence_id: '20261015', summary: 'Holiday', start: '2026-10-15', end: '2026-10-16' },
    { start: '2026-10-16 08:00:00', end: '2026-10-16 08:45:00' }
  ]);
  assert.deepEqual(timed, { id: 'ha-alex-abc-2026-10-14', title: 'Soccer', memberId: 'alex', category: 'school', date: '2026-10-14', time: '4:00 PM - 5:30 PM', location: 'Field 3', notes: 'Bring water' });
  assert.deepEqual([allDay.id, allDay.date, allDay.time], ['ha-alex-xyz-20261015', '2026-10-15', 'All Day']);
  assert.deepEqual([loose.id, loose.title, loose.date, loose.time], ['ha-alex-event-2026-10-16-8_00_AM_-_8_45_AM', 'Untitled Event', '2026-10-16', '8:00 AM - 8:45 AM']);
  assert.equal(CalendarFeed.fromHa({ id: 'mom', role: 'parent' }, [{ uid: 'q', summary: 'x', start: '2026-10-14' }])[0].category, 'family');
});

test('an event without a readable start becomes an all-day event today', () => {
  const [e] = CalendarFeed.fromHa({ id: 'mom', role: 'parent' }, [{ uid: 'q', summary: 'Odd', start: 'not a date' }]);
  assert.deepEqual([e.date, e.time], [new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0'), 'All Day']);
});

test('sync replaces the cached Home Assistant events and leaves the household document alone', async () => {
  const calls = [];
  const ha = { getCalendarEvents: async (entityIds, from, to) => { calls.push({ entityIds, from, to }); return { 'calendar.mom': { events: [{ uid: '1', summary: 'Dentist', start: '2026-10-15T09:00:00', end: '2026-10-15T10:00:00' }] }, 'calendar.alex': { events: [{ uid: '2', summary: 'Soccer', start: '2026-10-15T16:00:00', end: '2026-10-15T17:00:00' }] } }; } };
  const { feed, store, cache } = setup({ ha, events: [ev({ id: 'evt-mine', title: 'Mine' })], cached: [ev({ id: 'ha-old-1', title: 'Stale' })] });
  const saves = store.saves.length;
  assert.equal(await feed.sync(), 2);
  assert.deepEqual(calls[0].entityIds, ['calendar.mom', 'calendar.alex'], 'members without a calendar are skipped');
  const daysFromNow = (iso) => Math.round((Date.parse(iso) - NOW.getTime()) / 86400000);
  assert.equal(daysFromNow(calls[0].from), -30, 'a month back');
  assert.equal(daysFromNow(calls[0].to), 60, 'two months ahead');
  assert.deepEqual(ids(cache.events), ['ha-mom-1-2026-10-15', 'ha-alex-2-2026-10-15']);
  assert.deepEqual(ids(feed.all()).sort(), ['evt-mine', 'ha-alex-2-2026-10-15', 'ha-mom-1-2026-10-15']);
  assert.deepEqual(ids(store.data.events), ['evt-mine'], 'fetched events never enter the household document');
  assert.equal(store.saves.length, saves, 'and syncing does not save the household document');
});

test('sync keeps what it had when Home Assistant fails or returns nothing', async () => {
  const cached = [ev({ id: 'ha-keep' })];
  const failing = setup({ cached, ha: { getCalendarEvents: async () => { throw new Error('down'); } } });
  assert.equal(await failing.feed.sync(), 0);
  assert.deepEqual(ids(failing.cache.events), ['ha-keep']);
  const empty = setup({ cached, ha: { getCalendarEvents: async () => ({ 'calendar.mom': { events: [] } }) } });
  assert.equal(await empty.feed.sync(), 0);
  assert.deepEqual(ids(empty.feed.all()), ['ha-keep']);
  const none = setup({ cached, ha: { getCalendarEvents: async () => { throw new Error('must not be called'); } } });
  none.store.data.members.forEach((m) => delete m.haCalendarEntity);
  assert.equal(await none.feed.sync(), 0, 'no calendars configured: nothing to ask');
});

test('sync tells listeners when new events arrived', async () => {
  const ha = { getCalendarEvents: async () => ({ 'calendar.mom': { events: [{ uid: '1', summary: 'A', start: '2026-10-15' }] } }) };
  const { feed } = setup({ ha });
  let told = 0;
  feed.onChange = () => { told++; };
  await feed.sync();
  assert.equal(told, 1);
});

// ---------------------------------------------------------------- what the feed holds

test('all combines your events, the Home Assistant cache and tasks marked for the calendar', () => {
  const { feed } = setup({ events: [ev({ id: 'mine' })], cached: [ev({ id: 'ha-1' })], tasks: [ev({ id: 'task-1' })] });
  assert.deepEqual(ids(feed.all()), ['mine', 'ha-1', 'task-1']);
});

test('old documents that carried Home Assistant events are cleaned up without touching the sync stamp', () => {
  const { feed, store, cache } = setup({ events: [ev({ id: 'mine' }), ev({ id: 'ha-old' }), ev({ id: 'evt-3', title: 'Old sample' })] });
  assert.deepEqual(ids(store.data.events), ['mine']);
  assert.deepEqual(ids(cache.events), ['ha-old'], 'moved into the cache until the next sync');
  assert.deepEqual(store.saves, [{ stamp: false, push: false }]);
  assert.deepEqual(ids(feed.all()), ['mine', 'ha-old']);

  const second = setup({ events: [ev({ id: 'ha-x' })], cached: [ev({ id: 'ha-fresh' })] });
  assert.deepEqual(ids(second.cache.events), ['ha-fresh'], 'an existing cache wins');
});

test('a copy of Home Assistant events that arrives inside the document is not counted twice', () => {
  const { feed, store } = setup({ events: [ev({ id: 'mine' })], cached: [ev({ id: 'ha-1' })] });
  store.data.events.push(ev({ id: 'ha-1' }));   // e.g. adopted from an older tablet's copy
  assert.deepEqual(ids(feed.all()), ['mine', 'ha-1']);
});

test('save adds a new event with an id, replaces an existing one, and saves', () => {
  const { feed, store } = setup({ events: [ev({ id: 'a', title: 'Old' })] });
  const before = store.saves.length;
  const made = feed.save({ title: 'New', memberId: 'dad', date: '2026-10-20', time: '2:00 PM' });
  assert.match(made.id, /^evt-/);
  assert.equal(store.data.events.length, 2);
  feed.save({ ...ev({ id: 'a' }), title: 'Renamed' });
  assert.equal(store.data.events.find((e) => e.id === 'a').title, 'Renamed');
  assert.equal(store.data.events.length, 2);
  assert.equal(store.saves.length, before + 2);
  assert.equal(new Set(ids(store.data.events)).size, 2);
});

test('a Home Assistant event is not saved as your own: it would be filtered out and the edit would vanish', () => {
  const { feed, store } = setup({ cached: [ev({ id: 'ha-mom-1', title: 'Soccer' })] });
  assert.throws(() => feed.save({ ...ev({ id: 'ha-mom-1' }), title: 'Renamed' }), /cannot be edited/);
  assert.deepEqual(store.data.events, []);
  assert.equal(feed.day('2026-10-14')[0].title, 'Soccer');
});

test('remove deletes your event, or hides a Home Assistant one until the next sync', () => {
  const { feed, store, cache } = setup({ events: [ev({ id: 'a' })], cached: [ev({ id: 'ha-1' })] });
  feed.remove('a');
  feed.remove('ha-1');
  assert.deepEqual(store.data.events, []);
  assert.deepEqual(cache.events, []);
  assert.deepEqual(feed.all(), []);
});

// ---------------------------------------------------------------- one day, one agenda, tonight

test('day gives the merged events of a date, filtered to a member plus shared events', () => {
  const { feed } = setup({ events: [
    ev({ id: 'm', title: 'Meeting', memberId: 'mom' }), ev({ id: 'd', title: 'Meeting', memberId: 'dad' }),
    ev({ id: 'o', title: 'Soccer', memberId: 'alex', time: '4:00 PM - 5:00 PM' }), ev({ id: 's', title: 'Dinner out', memberId: 'shared', time: '7:00 PM - 8:00 PM' }),
    ev({ id: 'x', title: 'Other day', date: '2026-10-15' })
  ] });
  const everyone = feed.day('2026-10-14', 'all');
  assert.deepEqual(ids(everyone), ['m', 'o', 's'], 'the two Meeting copies merge');
  assert.deepEqual(everyone[0].memberIds, ['mom', 'dad']);
  assert.deepEqual(ids(feed.day('2026-10-14', 'alex')), ['o', 's']);
  assert.deepEqual(ids(feed.day('2026-10-14', 'mom')), ['m', 's']);
  assert.equal(feed.day('2026-10-14').length, 3, 'everyone is the default');
  assert.deepEqual(feed.day('2026-12-25', 'all'), []);
});

test('day includes tasks marked for the calendar', () => {
  const { feed } = setup({ tasks: [ev({ id: 'task-1', title: 'Pay rent', memberId: 'shared', time: 'All Day' })] });
  assert.deepEqual(ids(feed.day('2026-10-14', 'dad')), ['task-1']);
});

test('merge joins identical events (title ignoring case and spaces, date, time) across calendars', () => {
  const merged = CalendarFeed.merge([ev({ id: '1', title: 'Soccer ', memberId: 'mom' }), ev({ id: '2', title: 'soccer', memberId: 'dad' }), ev({ id: '3', title: 'Soccer', memberId: 'alex', time: '5:00 PM' }), ev({ id: '4', title: 'Soccer', memberId: 'mom', time: '' })]);
  assert.deepEqual(ids(merged), ['1', '3', '4']);
  assert.deepEqual(merged[0].memberIds, ['mom', 'dad']);
  assert.equal(merged[0].memberId, 'mom');
  assert.equal(merged[1].memberIds, undefined, 'a single copy is left as it is');
});

test('agenda lists one member\'s upcoming events by date and start time, shared events included', () => {
  const { feed } = setup({ events: [
    ev({ id: 'past', date: '2026-10-13' }), ev({ id: 'late', date: '2026-10-15', time: '3:00 PM' }), ev({ id: 'early', date: '2026-10-15', time: '8:00 AM' }),
    ev({ id: 'allday', date: '2026-10-15', time: 'All Day' }), ev({ id: 'later', date: '2026-10-20' }), ev({ id: 'dad', memberId: 'dad', date: '2026-10-15' }),
    ev({ id: 'shared', memberId: 'shared', date: '2026-10-14', time: '6:00 PM' })
  ] });
  const groups = feed.agenda('mom', '2026-10-14');
  assert.deepEqual(groups.map((g) => g.date), ['2026-10-14', '2026-10-15', '2026-10-20']);
  assert.deepEqual(ids(groups[1].events), ['allday', 'early', 'late'], 'all-day first, then by start time');
});

test('agenda falls back to everything the member has when nothing lies ahead', () => {
  const { feed } = setup({ events: [ev({ id: 'a', date: '2026-10-01' }), ev({ id: 'b', date: '2026-10-02' })] });
  assert.deepEqual(feed.agenda('mom', '2026-10-14').map((g) => g.date), ['2026-10-01', '2026-10-02']);
  assert.deepEqual(feed.agenda('dad', '2026-10-14'), []);
});

test('remaining gives today\'s timed events that are not over yet, soonest first, merged', () => {
  const { feed } = setup({ events: [
    ev({ id: 'done', time: '9:00 AM - 10:00 AM' }), ev({ id: 'now', time: '8:00 PM - 10:00 PM' }), ev({ id: 'later', time: '11:00 PM' }),
    ev({ id: 'allday', time: 'All Day' }), ev({ id: 'tomorrow', date: '2026-10-15', time: '11:00 PM' }),
    ev({ id: 'dup1', title: 'Show', time: '10:30 PM - 11:30 PM', memberId: 'mom' }), ev({ id: 'dup2', title: 'Show', time: '10:30 PM - 11:30 PM', memberId: 'dad' })
  ] });
  assert.deepEqual(ids(feed.remaining(NOW)), ['now', 'dup1', 'later']);
});

test('copiesOf gathers every copy of an event across calendars, with any location and notes one copy has', () => {
  const { feed } = setup({ events: [ev({ id: '1', title: 'Soccer', memberId: 'mom' }), ev({ id: '2', title: 'soccer', memberId: 'dad', location: 'Field 3', notes: 'Bring water' }), ev({ id: '3', title: 'Other' })] });
  const merged = feed.copiesOf(feed.all()[0]);
  assert.deepEqual(merged.memberIds, ['mom', 'dad']);
  assert.equal(merged.location, 'Field 3');
  assert.equal(merged.notes, 'Bring water');
  const lone = feed.copiesOf(ev({ id: 'new', title: 'Nowhere' }));
  assert.deepEqual(lone.memberIds, ['mom']);
});

// ---------------------------------------------------------------- laying a day out

test('layout puts events in columns side by side only where they overlap', () => {
  const day = [ev({ id: 'a', time: '9:00 AM - 10:00 AM' }), ev({ id: 'b', time: '9:30 AM - 10:30 AM' }), ev({ id: 'c', time: '1:00 PM - 2:00 PM' }), ev({ id: 'allday', time: 'All Day' })];
  const { timed, allDay } = CalendarFeed.layout(day, 54);
  assert.deepEqual(ids(allDay), ['allday']);
  assert.deepEqual(timed.map((t) => [t.event.id, t.topPx, t.heightPx, t.leftPct, t.widthPct]), [
    ['a', 486, 52, 0, 50], ['b', 513, 52, 50, 50], ['c', 702, 52, 0, 100]
  ]);
});

test('layout gives short events a minimum height and reuses a free column', () => {
  const { timed } = CalendarFeed.layout([ev({ id: 'a', time: '9:00 AM - 10:00 AM' }), ev({ id: 'b', time: '9:15 AM - 9:45 AM' }), ev({ id: 'c', time: '10:00 AM - 10:20 AM' })], 54);
  const by = Object.fromEntries(timed.map((t) => [t.event.id, t]));
  assert.equal(by.b.leftPct, 50);
  assert.equal(by.c.leftPct, 0, 'c starts when the cluster ends, so it has the whole width');
  assert.equal(by.c.heightPx, 25, 'a 30-minute minimum, minus the 2px gap: 27 - 2');
  assert.deepEqual(CalendarFeed.layout([], 54), { timed: [], allDay: [] });
});
