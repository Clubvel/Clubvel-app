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

function gate() {
  const slots = []; let cursor = 0, effects = [];
  const auth = { user: null, loading: true }, workspace = { workspaceError: null };
  let segments = [], fonts = [false, null], hides = 0, retains = 0;
  const routes = [];
  const router = { replace: route => routes.push(route) };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useEffect(fn) { effects.push(fn); },
  };
  const { StartupGate } = load('components/StartupGate.tsx', {
    react: React, 'react-native': { View: 'View' },
    'expo-router': { useRouter: () => router, useSegments: () => segments },
    'expo-font': { useFonts: () => fonts }, '@expo/vector-icons': { Ionicons: { font: {} } },
    'expo-splash-screen': { preventAutoHideAsync: async () => { retains++; }, setOptions() {}, hideAsync: async () => { hides++; } },
    '../contexts/AuthContext': { useAuth: () => auth }, '../contexts/WorkspaceContext': { useWorkspace: () => workspace },
  });
  return { auth, workspace, routes, get hides() { return hides; }, get retains() { return retains; },
    setSegments(value) { segments = value; }, setFonts(value) { fonts = value; },
    render() { cursor = 0; effects = []; const view = StartupGate({ children: 'screen' }); effects.forEach(fn => fn()); return view; } };
}

test('splash stays until session, fonts, destination and root layout are ready, then hides once', () => {
  const g = gate(); assert.equal(g.retains, 1);
  g.render().props.onLayout(); g.auth.loading = false; g.setFonts([true, null]); g.render();
  assert.equal(g.hides, 0); // index still resolving
  g.setSegments(['auth']); g.render(); assert.equal(g.hides, 1);
  g.render(); assert.equal(g.hides, 1);
});
test('a restored session remains behind the splash while group routing resolves', () => {
  const g = gate(); g.auth.loading = false; g.auth.user = user; g.setFonts([true, null]);
  g.render().props.onLayout(); g.render(); assert.equal(g.hides, 0);
  g.setSegments(['(member)', 'home']); g.render(); assert.equal(g.hides, 1);
});
test('membership error reveals recovery controls rather than trapping the native splash', () => {
  const g = gate(); g.auth.loading = false; g.auth.user = user; g.setFonts([true, null]);
  g.render().props.onLayout(); g.workspace.workspaceError = 'Offline'; g.render(); assert.equal(g.hides, 1);
});
test('a signed-out protected deep link redirects before the splash can dismiss', () => {
  const g = gate(); g.auth.loading = false; g.setFonts([true, null]); g.setSegments(['(member)', 'home']);
  g.render().props.onLayout(); g.render(); assert.ok(g.routes.includes('/auth')); assert.equal(g.hides, 0);
  g.setSegments(['auth']); g.render(); assert.equal(g.hides, 1);
});
test('font failure cannot permanently trap the splash, and layout is still required', () => {
  const g = gate(); g.auth.loading = false; g.setFonts([false, new Error('Font unavailable')]); g.setSegments(['auth']);
  const view = g.render(); assert.equal(g.hides, 0);
  view.props.onLayout(); g.render(); assert.equal(g.hides, 1);
});
