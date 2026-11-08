'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBundle } = require('./helpers/load-bundle');

test('bundle loads without a DOM and exposes its modules for tests', () => {
  const api = loadBundle();
  assert.equal(typeof api, 'object');
});
