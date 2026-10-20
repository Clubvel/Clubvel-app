const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, deps = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (!(name in deps)) throw new Error(`Unexpected dependency: ${name}`);
    return deps[name];
  }, module, module.exports);
  return module.exports;
}
const session = load('services/session.ts');
const now = 1800000000000;
const user = { id: 'person', full_name: 'Test Person', phone_number: '+27821234567' };
const token = (claims = {}) => 'header.' + Buffer.from(JSON.stringify({ user_id: 'person', exp: now / 1000 + 600, ...claims })).toString('base64url') + '.signature';

test('valid stored identity restores, with no reset of token lifetime', () => {
  const saved = session.restoreStoredSession(token(), JSON.stringify(user), String(now - 1000), now);
  assert.equal(saved.user.id, 'person'); assert.equal(saved.lastActivity, now - 1000);
});
test('expired, idle, corrupt, partial and mismatched saved sessions route to sign-in', () => {
  for (const [t, u, a] of [
    [token({ exp: now / 1000 }), JSON.stringify(user), String(now - 1000)],
    [token(), JSON.stringify(user), String(now - session.SESSION_TIMEOUT_MS)],
    [token(), '{broken', String(now)], [null, JSON.stringify(user), String(now)],
    [token({ user_id: 'other' }), JSON.stringify(user), String(now)],
    [token(), JSON.stringify(user), null], ['garbage', JSON.stringify(user), String(now)],
    [token(), JSON.stringify(user), String(now + 10000)],
  ]) assert.equal(session.restoreStoredSession(t, u, a, now), null);
});
test('server token expiry wins even when local activity is recent', () => {
  assert.equal(session.sessionExpired(token({ exp: now / 1000 - 1 }), now, now), true);
});
