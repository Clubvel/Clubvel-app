const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, engine, tick } = require('./ui-harness.cjs');

test('actual provider restores valid storage, expires on resume without awaiting an alert, then signs in again', async () => {
  const e = engine(); let listener; const alerts = [], reads = [];
  const person = { id: 'person', full_name: 'Test Person', phone_number: '+27821234567' };
  const originalNow = Date.now, originalInterval = global.setInterval, originalClear = global.clearInterval;
  let now = 1800000000000;
  const jwt = exp => 'header.' + Buffer.from(JSON.stringify({ user_id: 'person', exp })).toString('base64url') + '.sig';
  const data = new Map([['auth_token', jwt(now / 1000 + 60)], ['user_data', JSON.stringify(person)], ['last_activity', String(now - 1000)]]);
  const storage = { getItem: async key => { reads.push(key); return data.get(key) ?? null; }, setItem: async (key, value) => data.set(key, value),
    multiRemove: async keys => keys.forEach(key => data.delete(key)), multiSet: async entries => entries.forEach(([key, value]) => data.set(key, value)) };
  Date.now = () => now; global.setInterval = () => 1; global.clearInterval = () => {};
  try {
    const { AuthProvider } = load('contexts/AuthContext.tsx', {
      react: { ...e.react, createContext: () => ({ Provider: 'Provider' }) },
      '@react-native-async-storage/async-storage': storage, axios: {},
      'react-native': { AppState: { currentState: 'active', addEventListener: (_, fn) => { listener = fn; return { remove() {} }; } }, Alert: { alert: (...args) => alerts.push(args) } },
      '../services/session': load('services/session.ts'),
      '../services/sessionStorage': { sessionStorage: { getToken: () => storage.getItem('auth_token'), setToken: value => storage.setItem('auth_token', value), clearToken: async () => data.delete('auth_token') } },
      '../services/authentication': { authentication: { login: async () => ({ access_token: jwt(now / 1000 + 600), user: person }) }, authenticationError: error => error },
    });
    const render = () => e.render(() => AuthProvider({ children: null })).props.value;
    assert.equal(render().loading, true); assert.equal(reads.length, 3);
    await tick(); assert.equal(render().user.id, 'person'); assert.equal(render().loading, false);
    listener('background'); now += 61000; listener('active'); await tick();
    assert.equal(render().user, null); assert.equal(data.size, 0); assert.equal(alerts.length, 1);
    await render().login('0821234567', 'password'); assert.equal(render().user.id, 'person');
    await render().logout(); assert.equal(render().token, null); assert.equal(data.size, 0);
  } finally { Date.now = originalNow; global.setInterval = originalInterval; global.clearInterval = originalClear; }
});
