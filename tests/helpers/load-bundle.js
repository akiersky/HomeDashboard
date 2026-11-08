'use strict';
// Loads js/bundle.js into this process with a stub window and returns the modules it exposes for tests.
// The bundle skips booting when window.__FD_TEST__ is set (see "Test seam" at the end of the file).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BUNDLE = path.join(__dirname, '..', '..', 'js', 'bundle.js');

function loadBundle({ config, storage = {} } = {}) {
  const data = new Map(Object.entries(storage));
  const localStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); }
  };
  const win = { __FD_TEST__: {}, FAMILY_DASHBOARD_CONFIG: config, localStorage, addEventListener() {}, dispatchEvent() {} };
  globalThis.window = win;
  globalThis.localStorage = localStorage;
  vm.runInThisContext(fs.readFileSync(BUNDLE, 'utf8'), { filename: BUNDLE });
  return { ...win.__FD_TEST__.api, storage: data };
}

module.exports = { loadBundle };
