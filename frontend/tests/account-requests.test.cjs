const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Execute the actual request callback with synthetic state and no network.
function callback(file, name, bindings) {
  const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(initializer, `Missing callback ${name}`);
  const code = ts.transpileModule(`module.exports = ${initializer.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function(...Object.keys(bindings), 'module', code)(...Object.values(bindings), module);
  return module.exports;
}

function bindings() {
  const calls = [];
  const axios = Object.fromEntries(['get', 'put', 'delete'].map(method => [method, async (...args) => {
    calls.push([method, ...args]);
    return { data: { clubs: [], schedules: [], contribution_reminders: false, claim_updates: false, group_announcements: false } };
  }]));
  const noop = () => {};
  return { calls, axios, API_URL: 'https://staging.invalid', user: { id: 'owner' }, token: 'synthetic-session',
    setDeleting: noop, setShowDeleteModal: noop, setLoading: noop, setSaving: noop,
    setStats: noop, setClubs: noop, setPayoutSchedules: noop, setPreferences: noop,
    AsyncStorage: { clear: async () => {} }, logout: async () => {}, router: { replace: noop }, Alert: { alert: noop } };
}

for (const [file, name, endpoint, method, args] of [
  ['app/(member)/home.tsx', 'handleDeleteAccount', '/delete-account', 'delete', []],
  ['app/(treasurer)/dashboard.tsx', 'handleDeleteAccount', '/delete-account', 'delete', []],
  ['app/(member)/profile.tsx', 'fetchProfileData', '/stats/', 'get', []],
  ...['member', 'treasurer'].flatMap(role => [
    [`app/(${role})/notifications.tsx`, 'fetchPreferences', '/notification-preferences/', 'get', []],
    [`app/(${role})/notifications.tsx`, 'updatePreference', '/notification-preferences', 'put', ['claim_updates', true]],
  ]),
]) test(`${file}: ${name} sends the signed session to the protected endpoint`, async () => {
  const b = bindings();
  await callback(file, name, b)(...args);
  const call = b.calls.find(c => c[0] === method && c[1].includes(endpoint));
  assert.ok(call);
  const config = call[method === 'put' ? 3 : 2];
  assert.equal(config.headers.Authorization, 'Bearer synthetic-session');
  assert.equal(config.timeout, 15000);
});
