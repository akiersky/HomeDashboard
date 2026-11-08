'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBundle } = require('./helpers/load-bundle');

const { kioskSearch, setHaKioskMode } = loadBundle();

const ON = 'wp_enabled=true&wp_hide_toolbar=true&wp_hide_sidebar=true&wp_idle_time=0';

// A Home Assistant document whose page URL we can watch change.
function haDoc(search = '', hash = '') {
  const doc = { defaultView: { location: { search, pathname: '/dashboard-kitchen/home', hash, replaced: null, replace(url) { this.replaced = url; } } } };
  return doc;
}

test('kioskSearch adds the WallPanel options and keeps other parameters', () => {
  assert.equal(kioskSearch('', true), `?${ON}`);
  assert.equal(kioskSearch('?x=1', true), `?x=1&${ON}`);
});

test('kioskSearch is a no-op when the URL is already right', () => {
  assert.equal(kioskSearch(`?${ON}`, true), null);
  assert.equal(kioskSearch('', false), null);
  assert.equal(kioskSearch('?x=1', false), null);
});

test('kioskSearch removes the WallPanel options and keeps other parameters', () => {
  assert.equal(kioskSearch(`?${ON}`, false), '');
  assert.equal(kioskSearch(`?x=1&${ON}`, false), '?x=1');
  assert.equal(kioskSearch('?wp_enabled=true&wp_idle_time=30', true), `?${ON}`);
});

test('setHaKioskMode reloads the page with kiosk on or off, and keeps the path and hash', () => {
  const on = haDoc('', '#top');
  setHaKioskMode(true, on);
  assert.equal(on.defaultView.location.replaced, `/dashboard-kitchen/home?${ON}#top`);

  const off = haDoc(`?${ON}`);
  setHaKioskMode(false, off);
  assert.equal(off.defaultView.location.replaced, '/dashboard-kitchen/home');
});

test('setHaKioskMode does not reload when nothing changes', () => {
  const doc = haDoc(`?${ON}`);
  setHaKioskMode(true, doc);
  assert.equal(doc.defaultView.location.replaced, null);
});

test('?disable_kiosk and ?kiosk=0 are a safety escape: kiosk is never added, and removed if present', () => {
  const blocked = haDoc('?disable_kiosk');
  setHaKioskMode(true, blocked);
  assert.equal(blocked.defaultView.location.replaced, null);

  const stuck = haDoc(`?kiosk=0&${ON}`);
  setHaKioskMode(true, stuck);
  assert.equal(stuck.defaultView.location.replaced, '/dashboard-kitchen/home?kiosk=0');
});

test('setHaKioskMode does nothing outside Home Assistant', () => {
  assert.doesNotThrow(() => setHaKioskMode(true, null));
});
