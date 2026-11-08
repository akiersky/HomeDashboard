'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBundle } = require('./helpers/load-bundle');

const { SettingsSchema } = loadBundle();

const DEFAULTS = {
  haUrl: 'http://homeassistant.local:8123', haToken: '', haKioskMode: false, googleKeepUrl: 'https://keep.google.com',
  haGroceryTodoEntity: '', haMealIdeasEntity: 'todo.meal_ideas', haMealPlanEntity: 'todo.weekly_meal_plan',
  immichUrl: 'http://homeassistant.local:2283', immichApiKey: '',
  idleSaverMinutes: 2, photoIntervalSeconds: 30,
  nightMode: 'off', nightStart: '21:00', nightStop: '07:00', nightBrightness: 15,
  photoEntity: 'image.immich_random_favorite_image', doorbellEntity: '', doorbellCamera: '', doorbellSeconds: 30
};

test('defaults give every setting its starting value, as a fresh copy each time', () => {
  assert.deepEqual(SettingsSchema.defaults(), DEFAULTS);
  const a = SettingsSchema.defaults();
  a.idleSaverMinutes = 99;
  a.haUrl = 'changed';
  assert.deepEqual(SettingsSchema.defaults(), DEFAULTS);
});

test('applyConfig copies what config.js sets, under the setting\'s own name', () => {
  const s = SettingsSchema.defaults();
  SettingsSchema.applyConfig(s, {
    homeAssistant: { url: 'http://ha:8123', token: 'TOKEN' }, haKioskMode: true, googleKeepUrl: 'https://keep.example',
    haGroceryTodoEntity: 'todo.shop', haMealIdeasEntity: 'todo.ideas', haMealPlanEntity: 'todo.plan',
    doorbell: { entity: 'event.bell', camera: 'camera.door', seconds: 12 },
    immich: { url: 'http://immich', apiKey: 'KEY' },
    weather: { latitude: 51.5, longitude: -0.12, locationName: 'London' }
  });
  assert.deepEqual(s, {
    ...DEFAULTS, haUrl: 'http://ha:8123', haToken: 'TOKEN', haKioskMode: true, googleKeepUrl: 'https://keep.example',
    haGroceryTodoEntity: 'todo.shop', haMealIdeasEntity: 'todo.ideas', haMealPlanEntity: 'todo.plan',
    doorbellEntity: 'event.bell', doorbellCamera: 'camera.door', doorbellSeconds: 12,
    immichUrl: 'http://immich', immichApiKey: 'KEY', weather: { lat: 51.5, lon: -0.12, locationName: 'London' }
  });
});

test('applyConfig ignores blank and missing values, and tolerates no config at all', () => {
  const s = SettingsSchema.defaults();
  SettingsSchema.applyConfig(s, { homeAssistant: { url: '', token: '' }, haGroceryTodoEntity: '', doorbell: {}, weather: { locationName: '' } });
  assert.deepEqual(s, DEFAULTS);
  SettingsSchema.applyConfig(s, undefined);
  assert.deepEqual(s, DEFAULTS);
  const bare = { haUrl: 'x' };
  SettingsSchema.applyConfig(bare, { weather: { latitude: 3 } });
  assert.deepEqual(bare, { haUrl: 'x', weather: { lat: 3 } }, 'a missing weather block is created');
});

test('normalize puts the default back where a blank is not allowed', () => {
  const s = { ...DEFAULTS, doorbellEntity: '', doorbellCamera: '', haMealIdeasEntity: '', haMealPlanEntity: '', haGroceryTodoEntity: '', googleKeepUrl: 'https://mine', haKioskMode: null };
  SettingsSchema.normalize(s);
  assert.equal(s.doorbellEntity, DEFAULTS.doorbellEntity);
  assert.equal(s.doorbellCamera, DEFAULTS.doorbellCamera);
  assert.equal(s.haMealIdeasEntity, 'todo.meal_ideas');
  assert.equal(s.haMealPlanEntity, 'todo.weekly_meal_plan');
  assert.equal(s.haGroceryTodoEntity, '', 'a shopping list entity may be blank');
  assert.equal(s.googleKeepUrl, 'https://mine');
  assert.equal(s.haKioskMode, false);
});

test('settings travel as far as their scope allows: tokens stay on the device, the PIN is shared but never exported', () => {
  const s = { ...DEFAULTS, haToken: 'T', immichApiKey: 'K', parentPin: '4321', haKioskMode: true };
  const forPush = SettingsSchema.without(s, ['device']);
  assert.equal('haToken' in forPush, false);
  assert.equal('immichApiKey' in forPush, false);
  assert.equal('haKioskMode' in forPush, false);
  assert.equal(forPush.parentPin, '4321');
  const forExport = SettingsSchema.without(s, ['device', 'private']);
  assert.equal('parentPin' in forExport, false);
  assert.equal('haKioskMode' in forExport, false);
  assert.equal(forExport.haUrl, DEFAULTS.haUrl);
  assert.deepEqual(SettingsSchema.pick(s, ['device']), { haToken: 'T', immichApiKey: 'K', haKioskMode: true });
  assert.deepEqual(SettingsSchema.pick(s, ['device', 'private']), { haToken: 'T', immichApiKey: 'K', haKioskMode: true, parentPin: '4321' });
  assert.equal(s.haToken, 'T', 'the original is not changed');
});

test('toForm shows each setting in its field, falling back to the default where a blank would not do', () => {
  const form = SettingsSchema.toForm({ ...DEFAULTS, haToken: 'TOK', haGroceryTodoEntity: '', haMealIdeasEntity: '', photoIntervalSeconds: 0, idleSaverMinutes: 7, haKioskMode: true });
  assert.equal(form['ha-url-input'], DEFAULTS.haUrl);
  assert.equal(form['ha-token-input'], 'TOK');
  assert.equal(form['ha-kiosk-mode-toggle'], 'true');
  assert.equal(form['keep-url-input'], 'https://keep.google.com');
  assert.equal(form['grocery-entity-input'], '');
  assert.equal(form['meal-ideas-entity-input'], 'todo.meal_ideas');
  assert.equal(form['meal-plan-entity-input'], 'todo.weekly_meal_plan');
  assert.equal(form['photo-interval-input'], '30');
  assert.equal(form['idle-minutes-input'], '7');
  assert.equal(form['doorbell-entity-input'], DEFAULTS.doorbellEntity);
  assert.equal(form['doorbell-seconds-input'], '30');
  assert.deepEqual(Object.keys(form).sort(), SettingsSchema.fields().sort());
});

test('fields lists every form field the settings own', () => {
  assert.deepEqual(SettingsSchema.fields().sort(), [
    'doorbell-camera-input', 'doorbell-entity-input', 'doorbell-seconds-input', 'grocery-entity-input', 'ha-kiosk-mode-toggle', 'ha-token-input', 'ha-url-input',
    'idle-minutes-input', 'keep-url-input', 'meal-ideas-entity-input', 'meal-plan-entity-input', 'night-brightness-input', 'night-mode-select', 'night-start-input', 'night-stop-input',
    'photo-entity-input', 'photo-interval-input'
  ]);
});

test('fromForm turns what was typed into setting changes, with each setting\'s own rules', () => {
  const patch = SettingsSchema.fromForm({
    'ha-url-input': 'http://new:8123', 'ha-token-input': '', 'ha-kiosk-mode-toggle': 'true', 'keep-url-input': '',
    'grocery-entity-input': '', 'meal-ideas-entity-input': '', 'meal-plan-entity-input': 'todo.plan',
    'photo-interval-input': '45', 'idle-minutes-input': '3', 'doorbell-seconds-input': '20',
    'doorbell-entity-input': '', 'doorbell-camera-input': 'camera.x'
  });
  assert.deepEqual(patch, {
    haUrl: 'http://new:8123',
    haKioskMode: true,
    haGroceryTodoEntity: '',
    haMealIdeasEntity: 'todo.meal_ideas',
    haMealPlanEntity: 'todo.plan',
    photoIntervalSeconds: 45, idleSaverMinutes: 3, doorbellSeconds: 20,
    doorbellEntity: DEFAULTS.doorbellEntity, doorbellCamera: 'camera.x'
  });
  assert.equal('haToken' in patch, false, 'a blank token field keeps the saved token');
  assert.equal('googleKeepUrl' in patch, false);
});

test('fromForm parses boolean checkboxes correctly', () => {
  assert.deepEqual(SettingsSchema.fromForm({ 'ha-kiosk-mode-toggle': 'true' }), { haKioskMode: true });
  assert.deepEqual(SettingsSchema.fromForm({ 'ha-kiosk-mode-toggle': 'on' }), { haKioskMode: true });
  assert.deepEqual(SettingsSchema.fromForm({ 'ha-kiosk-mode-toggle': true }), { haKioskMode: true });
  assert.deepEqual(SettingsSchema.fromForm({ 'ha-kiosk-mode-toggle': 'false' }), { haKioskMode: false });
  assert.deepEqual(SettingsSchema.fromForm({ 'ha-kiosk-mode-toggle': 'off' }), { haKioskMode: false });
});

test('fromForm ignores numbers below their minimum or not numbers, and fields that are not on the page', () => {
  assert.deepEqual(SettingsSchema.fromForm({ 'photo-interval-input': '9', 'idle-minutes-input': '0', 'doorbell-seconds-input': 'abc' }), {});
  assert.deepEqual(SettingsSchema.fromForm({ 'photo-interval-input': '10', 'idle-minutes-input': '1', 'doorbell-seconds-input': '5' }), { photoIntervalSeconds: 10, idleSaverMinutes: 1, doorbellSeconds: 5 });
  assert.deepEqual(SettingsSchema.fromForm({}), {});
});
