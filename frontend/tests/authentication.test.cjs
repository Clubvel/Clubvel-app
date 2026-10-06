const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, dependencies) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

function service() {
  const calls = [];
  let response = { data: { notification_mode: 'mock', mock_otp: '1234' } };
  const axios = { post: async (...args) => { calls.push(args); if (response instanceof Error) throw response; return response; } };
  return { ...load('services/authentication.ts', { axios }), calls, respond: value => { response = value; } };
}

test('all SA forms resolve to one identity; malformed inputs are rejected', () => {
  const { normalizePhone } = service();
  for (const phone of ['0821234567', '+27821234567', '27821234567', '0027821234567', '821234567', '(082) 123-4567', '+27 (82) 123 4567']) {
    assert.equal(normalizePhone(phone), '+27821234567');
  }
  for (const phone of ['', '082123', '+270821234567', '+2727821234567', '0821234567x', '0000000000']) assert.throws(() => normalizePhone(phone));
  assert.equal(normalizePhone('+44 7700 900123'), '+447700900123');
});

test('registration, resend, verification, login and reset all use the same backend', async () => {
  process.env.EXPO_PUBLIC_BACKEND_URL = 'https://staging.invalid/';
  const s = service(), a = s.authentication;
  await a.register(' Test Person ', '(082) 123-4567', 'secret');
  await a.sendOTP('0821234567');
  await a.verifyOTP('+27821234567', ' 1234 ');
  await a.login('27821234567', 'secret');
  await a.forgotPassword('0821234567');
  await a.verifyResetOTP('0821234567', '1234');
  await a.resetPassword('0821234567', '1234', 'changed');
  assert.deepEqual(s.calls.map(c => c[0].split('/').pop()), ['register', 'send-otp', 'verify-otp', 'login', 'forgot-password', 'verify-reset-otp', 'reset-password']);
  for (const [url, body, config] of s.calls) {
    assert.ok(url.startsWith('https://staging.invalid/api/auth/'));
    assert.equal(body.phone_number, '+27821234567'); assert.equal(config.timeout, 20000);
  }
  assert.equal(s.calls[0][1].full_name, 'Test Person');
  assert.equal(s.calls[2][1].otp, '1234');
  assert.equal(s.calls[6][1].new_password, 'changed');
});

test('mock delivery is explicit; live messages never invent a demo code', () => {
  const { otpMessage } = service();
  assert.match(otpMessage({ notification_mode: 'mock', mock_otp: '5678' }), /5678.*No SMS/);
  assert.doesNotMatch(otpMessage({ notification_mode: 'live', channel: 'sms' }), /1234|Test environment/);
});

test('network, timeout, validation and verification-required errors remain actionable', () => {
  const { authenticationError } = service();
  assert.match(authenticationError({ isAxiosError: true }).message, /Could not connect/);
  assert.match(authenticationError({ code: 'ECONNABORTED' }).message, /timed out/);
  assert.match(authenticationError({ response: { data: { detail: [{ msg: 'missing' }] } } }).message, /check the information/);
  assert.equal(authenticationError({ response: { data: { detail: { code: 'verification_required', message: 'Verify phone' } } } }).code, 'verification_required');
});

test('invalid phone or missing server configuration sends no request', async () => {
  const s = service(); process.env.EXPO_PUBLIC_BACKEND_URL = 'https://staging.invalid';
  await assert.rejects(s.authentication.login('invalid', 'secret'), /valid phone/);
  delete process.env.EXPO_PUBLIC_BACKEND_URL;
  await assert.rejects(s.authentication.login('0821234567', 'secret'), /configuration/);
  assert.equal(s.calls.length, 0);
});

test('real AuthProvider can sign in, sign out and sign in again without Firebase', async () => {
  const slots = []; let cursor = 0;
  const React = {
    createContext: () => ({ Provider: 'Provider' }),
    createElement: (type, props) => ({ type, props }),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = v; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useEffect() {}, useContext() {}, useCallback(fn) { return fn; },
  };
  const data = new Map(); let failStorage = false;
  const storage = {
    async multiSet(pairs) { if (failStorage) throw new Error('Storage unavailable'); pairs.forEach(([k,v]) => data.set(k,v)); },
    async multiRemove(keys) { keys.forEach(key => data.delete(key)); },
  };
  const s = service(); s.authentication.login = async () => ({ access_token: 'session', user: { id: 'same-person', full_name: 'Person' } });
  const { AuthProvider } = load('contexts/AuthContext.tsx', {
    react: React, '@react-native-async-storage/async-storage': storage, axios: {},
    'react-native': { AppState: { currentState: 'active' }, Alert: {} }, '../services/authentication': s,
    '../services/session': load('services/session.ts', {}),
    '../services/sessionStorage': { sessionStorage: { getToken: async () => data.get('auth_token'), setToken: async value => data.set('auth_token',value), clearToken: async () => data.delete('auth_token') } },
  });
  const render = () => { cursor = 0; return AuthProvider({ children: null }).props.value; };
  await render().login('0821234567', 'secret');
  assert.equal(render().user.id, 'same-person'); assert.equal(data.get('auth_token'), 'session');
  await render().logout();
  assert.equal(render().user, null); assert.equal(render().token, null); assert.equal(data.size, 0);
  await render().login('+27821234567', 'secret'); assert.equal(render().user.id, 'same-person');
  await render().logout(); failStorage = true;
  await assert.rejects(render().login('0821234567', 'secret'), /Storage unavailable/);
  assert.equal(render().user, null);
});
