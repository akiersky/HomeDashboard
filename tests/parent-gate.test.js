'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBundle } = require('./helpers/load-bundle');

const { ParentGate } = loadBundle();

// The gate talks to its dialog through a view; this one records what the gate shows and lets a test type or dismiss.
function fakeView({ canShow = true } = {}) {
  let onKey, onDismiss;
  const v = {
    shown: false, filled: 0, error: null, desc: null, title: null,
    open({ title, desc }) { if (!canShow) return false; Object.assign(v, { shown: true, title, desc, filled: 0, error: null }); return true; },
    close() { v.shown = false; },
    digits(n) { v.filled = n; },
    setDesc(text) { v.desc = text; },
    setError(text) { v.error = text; },
    onKey(fn) { onKey = fn; },
    onDismiss(fn) { onDismiss = fn; },
    press(keys) { for (const k of String(keys)) onKey(k); },
    back() { onKey('back'); },
    dismiss() { v.shown = false; onDismiss(); }
  };
  return v;
}

function setup({ pin, canShow } = {}) {
  const store = { data: { settings: pin ? { parentPin: pin } : {} }, saves: 0, save() { this.saves++; } };
  const view = fakeView({ canShow });
  return { gate: new ParentGate(store, view), store, view };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const settledFlag = (p) => { const f = { done: false }; p.then(() => { f.done = true; }); return f; };

test('the default PIN approves the action and closes the dialog', async () => {
  const { gate, view } = setup();
  const asked = gate.ask('Add Chore', 'Enter the PIN');
  assert.equal(view.shown, true);
  assert.equal(view.title, 'Add Chore');
  assert.equal(view.desc, 'Enter the PIN');
  view.press('1234');
  assert.equal(await asked, true);
  assert.equal(view.shown, false);
});

test('a stored PIN replaces the default', async () => {
  const { gate, view } = setup({ pin: '9876' });
  const asked = gate.ask();
  view.press('1234');
  assert.equal(view.error, 'Incorrect PIN — try again.');
  view.press('9876');
  assert.equal(await asked, true);
});

test('a wrong PIN shows an error, clears the digits and keeps waiting', async () => {
  const { gate, view } = setup();
  const asked = gate.ask();
  const flag = settledFlag(asked);
  view.press('0000');
  await tick();
  assert.equal(flag.done, false);
  assert.equal(view.shown, true);
  assert.equal(view.filled, 0);
  assert.equal(view.error, 'Incorrect PIN — try again.');
  view.press('1234');
  assert.equal(await asked, true);
});

test('nothing is decided until four digits are entered; backspace removes the last one', async () => {
  const { gate, view } = setup();
  const asked = gate.ask();
  const flag = settledFlag(asked);
  view.press('129');
  assert.equal(view.filled, 3);
  await tick();
  assert.equal(flag.done, false);
  view.back();
  assert.equal(view.filled, 2);
  view.press('34');
  assert.equal(await asked, true);
});

test('dismissing the dialog (cancel, close, escape, backdrop) refuses the action', async () => {
  const { gate, view } = setup();
  const asked = gate.ask();
  view.dismiss();
  assert.equal(await asked, false);
});

test('asking again replaces the earlier request, which is refused', async () => {
  const { gate, view } = setup();
  const first = gate.ask('First');
  const second = gate.ask('Second');
  assert.equal(await first, false);
  assert.equal(view.title, 'Second');
  view.press('1234');
  assert.equal(await second, true);
});

test('fails closed when the dialog cannot be shown', async () => {
  const { gate } = setup({ canShow: false });
  assert.equal(await gate.ask(), false);
});

test('keys typed while nothing is asked are ignored', async () => {
  const { gate, view } = setup();
  view.press('1234');
  const asked = gate.ask();
  assert.equal(view.filled, 0, 'earlier keys must not leak into the next request');
  view.press('1234');
  assert.equal(await asked, true);
});

test('each request starts with an empty keypad after a refusal', async () => {
  const { gate, view } = setup();
  const first = gate.ask();
  view.press('12');
  view.dismiss();
  await first;
  const second = gate.ask();
  assert.equal(view.filled, 0);
  view.press('1234');
  assert.equal(await second, true);
});

test('a new PIN must be typed twice, is saved, and then replaces the old one', async () => {
  const { gate, store, view } = setup();
  const changed = gate.setNewPin();
  assert.equal(view.title, 'New PIN');
  view.press('4321');
  assert.equal(view.desc, 'Enter it again to confirm.');
  assert.equal(store.data.settings.parentPin, undefined, 'not saved before it is confirmed');
  view.press('4321');
  assert.equal(await changed, true);
  assert.equal(store.data.settings.parentPin, '4321');
  assert.equal(store.saves, 1);

  const asked = gate.ask();
  view.press('1234');
  assert.equal(view.error, 'Incorrect PIN — try again.');
  view.press('4321');
  assert.equal(await asked, true);
});

test('mismatched confirmation starts the new-PIN entry again', async () => {
  const { gate, store, view } = setup();
  const changed = gate.setNewPin();
  view.press('4321');
  view.press('1111');
  assert.equal(view.error, 'PINs did not match — start again.');
  assert.equal(view.desc, 'Enter a new 4-digit PIN.');
  assert.equal(store.data.settings.parentPin, undefined);
  view.press('2468');
  view.press('2468');
  assert.equal(await changed, true);
  assert.equal(store.data.settings.parentPin, '2468');
});

test('dismissing the new-PIN dialog keeps the old PIN', async () => {
  const { gate, store, view } = setup({ pin: '1357' });
  const changed = gate.setNewPin();
  view.press('4321');
  view.dismiss();
  assert.equal(await changed, false);
  assert.equal(store.data.settings.parentPin, '1357');
  assert.equal(store.saves, 0);
});
