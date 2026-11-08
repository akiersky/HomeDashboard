'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compileBundle, SOURCE_FILES } = require('../scripts/build');

test('every source module exists in src/', () => {
  assert.ok(SOURCE_FILES.length >= 15, 'has source modules defined');
  SOURCE_FILES.forEach(file => {
    const full = path.join(__dirname, '..', 'src', file);
    assert.ok(fs.existsSync(full), `Expected src/${file} to exist`);
  });
});

test('js/bundle.js is up to date with src/ (zero-drift check)', () => {
  const current = fs.readFileSync(path.join(__dirname, '..', 'js', 'bundle.js'), 'utf8');
  assert.equal(current, compileBundle(), 'js/bundle.js drifted from src/. Run "node scripts/build.js" to recompile.');
});
