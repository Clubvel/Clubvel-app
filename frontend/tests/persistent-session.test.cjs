const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./ui-harness.cjs');
const session = load('services/session.ts');
const now = 1800000000000;
const jwt = exp => 'header.' + Buffer.from(JSON.stringify({user_id:'member', exp})).toString('base64url') + '.signature';
const user = { id:'member', full_name:'Member', phone_number:'+27820000000' };

test('background inactivity and app reopen retain a valid 30-day session without extending expiry', () => {
  const token = jwt(now / 1000 + 30 * 86400);
  for (const elapsed of [60000, 5*60000, 86400000, 29*86400000]) {
    assert.equal(session.sessionExpired(token, now, now + elapsed), false);
    assert.equal(session.restoreStoredSession(token, JSON.stringify(user), String(now), now+elapsed).token, token);
  }
  assert.equal(session.sessionExpired(token, now, now+30*86400000), true);
  assert.equal(session.sessionExpired(jwt(now/1000-1), now, now), true);
});

function storage() {
  const ordinary = new Map(), secure = new Map();
  const adapter = load('services/sessionStorage.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: async k => ordinary.get(k) ?? null,
      setItem: async (k,v) => ordinary.set(k,v), removeItem: async k => ordinary.delete(k),
    },
    'expo-secure-store': {getItemAsync: async k => secure.get(k) ?? null,
      setItemAsync: async (k,v) => secure.set(k,v), deleteItemAsync: async k => secure.delete(k)},
    'react-native': {Platform:{OS:'android'}},
  }).sessionStorage;
  return {adapter,ordinary,secure};
}
test('native token migrates from ordinary storage once and survives adapter recreation', async () => {
  const c=storage(); c.ordinary.set('auth_token','legacy');
  assert.equal(await c.adapter.getToken(),'legacy');
  assert.equal(c.ordinary.has('auth_token'),false); assert.equal(c.secure.get('auth_token'),'legacy');
  await c.adapter.setToken('new'); assert.equal(await c.adapter.getToken(),'new');
  await c.adapter.clearToken(); assert.equal(await c.adapter.getToken(),null);
});
