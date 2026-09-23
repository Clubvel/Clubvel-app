const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, dependencies = {}) {
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
const policy = load('services/workspace.ts');
const club = (id, role = 'member', extra = {}) => ({ id, name: `Group ${id}`, membership_id: `membership-${id}`, membership_status: 'active', role, monthly_contribution: 500, ...extra });
test('one active membership produces one shared club; pending/removed memberships do not count', () => {
  const list = policy.activeMemberships({ clubs: [club('a'), club('b', 'member', { membership_status: 'pending' }), club('c', 'admin', { membership_status: 'removed' })] });
  assert.equal(list.length, 1); assert.equal(list[0].id, 'a');
});
test('roles are derived separately for each group, including demotion and removal', () => {
  const list = policy.activeMemberships({ clubs: [club('a', 'admin'), club('b'), club('c', 'treasurer')] });
  assert.equal(policy.workspaceRoute(policy.selectedMembership(list, 'a')).pathname, '/(treasurer)/club-detail');
  assert.equal(policy.workspaceRoute(policy.selectedMembership(list, 'b')).pathname, '/(member)/club/[id]');
  assert.equal(policy.workspaceRoute(policy.selectedMembership(list, 'c')).pathname, '/(treasurer)/club-detail');
  assert.equal(policy.workspaceRoute(policy.selectedMembership(list, 'removed')).pathname, '/(member)/home');
  assert.equal(policy.workspaceRoute(club('a', 'member')).pathname, '/(member)/club/[id]');
});
test('missing roles and conflicting memberships fail closed rather than guessing admin', () => {
  assert.throws(() => policy.activeMemberships({ clubs: [{ id: 'a', name: 'A' }] }));
  assert.throws(() => policy.activeMemberships({ clubs: [club('a'), club('a', 'admin')] }));
  assert.notEqual(policy.workspaceStorageKey('person-a'), policy.workspaceStorageKey('person-b'));
});

// Minimal hook harness: runs the actual provider with in-memory storage and HTTP,
// without loading native modules, calling remote services, or installing a renderer.
function harness(initialClubs, saved = null) {
  const slots = []; let cursor = 0; let effects = []; const routes = []; const storage = new Map();
  const key = policy.workspaceStorageKey('person'); if (saved) storage.set(key, saved);
  let response = () => Promise.resolve({ data: { clubs: initialClubs } }); let requests = 0; let resume;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const React = {
    createContext: () => ({ Provider: 'Provider' }),
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const router = { replace: route => routes.push(route) };
  const auth = { user: { id: 'person' }, token: 'test-token' };
  const loaded = load('contexts/WorkspaceContext.tsx', {
    react: React,
    'react-native': { AppState: { currentState: 'active', addEventListener: (_, cb) => { resume = cb; return { remove() {} }; } } },
    '@react-native-async-storage/async-storage': { getItem: async k => storage.get(k) ?? null, setItem: async (k, v) => { storage.set(k, v); }, removeItem: async k => { storage.delete(k); } },
    axios: { get: () => { requests++; return response(); } },
    'expo-router': { useRouter: () => router },
    './AuthContext': { useAuth: () => auth },
    '../services/workspace': policy,
  });
  const session = loaded.WorkspaceProvider({ children: null }).type;
  const render = () => { cursor = 0; effects = []; const tree = session({ children: null }); effects.forEach(fn => fn()); return tree.props.value; };
  return { render, routes, storage, key, requests: () => requests, respond: fn => { response = fn; }, appState: state => resume(state), tick: () => new Promise(resolve => setImmediate(resolve)) };
}
test('restores only a group identity and derives a freshly fetched role', async () => {
  const h = harness([club('a', 'member')], 'a'); await h.render().restoreWorkspace();
  assert.equal(h.routes.at(-1).pathname, '/(member)/club/[id]');
  assert.equal(h.render().selectedClub.role, 'member'); assert.equal(h.storage.get(h.key), 'a');
});
test('removed membership clears saved selection and routes to Personal Home', async () => {
  const h = harness([], 'a'); await h.render().restoreWorkspace();
  assert.equal(h.routes.at(-1).pathname, '/(member)/home'); assert.equal(h.storage.has(h.key), false);
});
test('switches admin/member groups and Personal Home without persisting a role', async () => {
  const h = harness([club('a', 'admin'), club('b')]);
  await h.render().selectGroup('a'); assert.equal(h.storage.get(h.key), 'a');
  await h.render().selectGroup('b'); assert.equal(h.routes.at(-1).pathname, '/(member)/club/[id]');
  await h.render().personalHome(); assert.equal(h.storage.has(h.key), false); assert.equal(h.routes.at(-1), '/(member)/home');
});
test('concurrent membership consumers share one request', async () => {
  const h = harness([club('a')]); const value = h.render();
  const [a, b] = await Promise.all([value.refreshMemberships(), value.refreshMemberships()]);
  assert.equal(h.requests(), 1); assert.equal(a, b);
});
test('Personal Home wins over an older in-flight group selection', async () => {
  const h = harness([]); let resolve;
  h.respond(() => new Promise(r => { resolve = r; }));
  const selecting = h.render().selectGroup('a'); await h.render().personalHome();
  resolve({ data: { clubs: [club('a', 'admin')] } }); await selecting;
  assert.equal(h.routes.at(-1), '/(member)/home'); assert.equal(h.storage.has(h.key), false);
});
test('network failure preserves selection for retry, does not route with cached authority', async () => {
  const h = harness([], 'a'); h.respond(() => Promise.reject(new Error('offline')));
  await h.render().restoreWorkspace(); assert.equal(h.routes.length, 0);
  assert.ok(h.render().workspaceError); assert.equal(h.storage.get(h.key), 'a');
});
test('background/resume revalidates and respects a changed contextual role', async () => {
  const h = harness([club('a', 'admin')], 'a'); await h.render().restoreWorkspace(); h.render();
  h.respond(() => Promise.resolve({ data: { clubs: [club('a', 'member')] } }));
  h.appState('background'); h.appState('active'); await h.tick();
  assert.equal(h.routes.at(-1).pathname, '/(member)/club/[id]');
});
