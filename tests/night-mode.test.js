'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBundle } = require('./helpers/load-bundle');

const { NightMode } = loadBundle();

const at = (hh, mm = 0) => new Date(2026, 10, 6, hh, mm);
const SUN = { sunrise: '2026-11-06T06:45', sunset: '2026-11-06T16:58' };

test('off is never night', () => {
  assert.equal(NightMode.isNight({ nightMode: 'off', nightStart: '21:00', nightStop: '07:00' }, at(23)), false);
  assert.equal(NightMode.isNight({}, at(23)), false);
});

test('set times can cross midnight; start counts as night and stop does not', () => {
  const s = { nightMode: 'schedule', nightStart: '21:30', nightStop: '07:00' };
  assert.equal(NightMode.isNight(s, at(21, 29)), false);
  assert.equal(NightMode.isNight(s, at(21, 30)), true);
  assert.equal(NightMode.isNight(s, at(2)), true);
  assert.equal(NightMode.isNight(s, at(6, 59)), true);
  assert.equal(NightMode.isNight(s, at(7)), false);
});

test('set times can stay within one day, and an empty window is never night', () => {
  const s = { nightMode: 'schedule', nightStart: '13:00', nightStop: '15:00' };
  assert.equal(NightMode.isNight(s, at(14)), true);
  assert.equal(NightMode.isNight(s, at(16)), false);
  assert.equal(NightMode.isNight({ ...s, nightStop: '13:00' }, at(13)), false);
});

test('sun mode runs sunset to sunrise', () => {
  const s = { nightMode: 'sun', nightStart: '21:00', nightStop: '07:00' };
  assert.equal(NightMode.isNight(s, at(16, 57), SUN), false);
  assert.equal(NightMode.isNight(s, at(16, 58), SUN), true);
  assert.equal(NightMode.isNight(s, at(6, 44), SUN), true);
  assert.equal(NightMode.isNight(s, at(6, 45), SUN), false);
});

test('sun mode uses the set times until the sun times are known', () => {
  const s = { nightMode: 'sun', nightStart: '21:00', nightStop: '07:00' };
  assert.equal(NightMode.isNight(s, at(20)), false);
  assert.equal(NightMode.isNight(s, at(22)), true);
  assert.equal(NightMode.isNight(s, at(22), { sunrise: undefined, sunset: undefined }), true);
});

test('a malformed saved time is never night', () => {
  assert.equal(NightMode.isNight({ nightMode: 'schedule', nightStart: 'nope', nightStop: '07:00' }, at(3)), false);
});
