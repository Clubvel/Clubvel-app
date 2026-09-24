const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
const policy = load('services/contributions.ts');
const record = (changes = {}) => ({ contribution_id: 'personal-obligation', group_id: 'group', group_name: 'Test group',
  amount_due: 321.75, amount_paid: 80, outstanding_amount: 241.75, contribution_status: 'late', status: 'late',
  proof_uploaded: false, proof_eligible: true, month: 8, year: 2026, payment_reference: 'REF', due_date: '2026-08-15', ...changes });

// Execute actual components/hooks without a native runtime, storage or network.
function engine() {
  const slots = []; let cursor = 0; let effects = []; let focused = true;
  const same = (a, b) => a && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    Fragment: 'Fragment',
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  return { react,
    useFocusEffect(fn) { const i = cursor++; if (!slots[i] || slots[i].fn !== fn) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { focus: true, fn, cleanup: focused ? fn() : undefined }; }); },
    render(fn) { cursor = 0; effects = []; const tree = fn(); effects.forEach(f => f()); return tree; },
    blur() { focused = false; slots.filter(s => s?.focus).forEach(s => { s.cleanup?.(); s.cleanup = undefined; }); },
    focus() { focused = true; slots.filter(s => s?.focus).forEach(s => { s.cleanup = s.fn(); }); },
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : tree?.props ? text(tree.props.children) : '';
const button = (tree, label) => nodes(tree).find(n => n.type === 'TouchableOpacity' && text(n).includes(label));
const native = Object.fromEntries(['View', 'Text', 'ScrollView', 'TouchableOpacity', 'ActivityIndicator', 'Image', 'Modal'].map(n => [n, n]));
native.StyleSheet = { create: s => s };
native.Alert = { alert() {} };
const colors = new Proxy({}, { get: (_, name) => name });

function personalHarness(initialRecords = []) {
  const e = engine(); const calls = []; const routes = []; const auth = { user: { id: 'person' }, token: 'local-test-token' };
  let respond = async () => ({ data: { contributions: initialRecords } });
  const axios = { get: async (...args) => { calls.push(args); return respond(); } };
  const router = { push: route => routes.push(route) };
  const routing = { useRouter: () => router, useFocusEffect: e.useFocusEffect };
  const hook = load('hooks/usePersonalContributions.ts', { react: e.react, 'expo-router': routing, axios, '../services/contributions': policy });
  const Screen = load('app/(treasurer)/my-contributions.tsx', {
    react: e.react, 'react-native': native, 'expo-router': routing,
    '../../contexts/AuthContext': { useAuth: () => auth }, '../../components/StatusPill': { StatusPill: 'StatusPill' },
    '../../constants/Colors': { Colors: colors }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../../hooks/usePersonalContributions': hook, '../../services/contributions': policy,
  }).default;
  return { ...e, auth, calls, routes, render: () => e.render(Screen), respond: fn => { respond = fn; } };
}

test('personal screen displays the actual amount/status and routes eligible contributions to shared proofs', async () => {
  const h = personalHarness([record()]); h.render(); await tick(); const tree = h.render();
  assert.ok(text(tree).includes('R321.75')); assert.ok(text(tree).includes('R80.00')); assert.ok(text(tree).includes('R241.75'));
  assert.equal(nodes(tree).find(n => n.type === 'StatusPill').props.status, 'late');
  assert.match(h.calls[0][0], /\/api\/member\/contributions\/person$/);
  assert.equal(h.calls[0][1].headers.Authorization, 'Bearer local-test-token');
  button(tree, 'Upload Proof of Payment').props.onPress();
  assert.deepEqual(h.routes, ['/(treasurer)/personal-proofs']);
  assert.ok(!h.calls.some(([url]) => /treasurer\/|dashboard/.test(url)));
});
test('genuine empty state does not show made-up totals or upload action', async () => {
  const h = personalHarness(); h.render(); await tick(); const tree = h.render();
  assert.ok(text(tree).includes('No personal contributions recorded'));
  assert.equal(button(tree, 'Upload Proof of Payment'), undefined);
  assert.ok(!text(tree).includes('Records'));
});
test('loading and network error differ from empty; Retry recovers', async () => {
  const h = personalHarness(); let reject;
  h.respond(() => new Promise((_, r) => { reject = r; }));
  assert.ok(text(h.render()).includes('Loading your contributions'));
  reject(new Error('offline')); await tick(); const failed = h.render();
  assert.ok(text(failed).includes('Unable to load your contributions'));
  assert.ok(!text(failed).includes('No personal contributions recorded'));
  h.respond(async () => ({ data: { contributions: [] } }));
  button(failed, 'Retry').props.onPress(); await tick();
  assert.ok(text(h.render()).includes('No personal contributions recorded'));
});
test('paid, excused, uploaded and fully paid records do not offer proof', async () => {
  for (const changes of [{ contribution_status: 'confirmed', status: 'confirmed' }, { contribution_status: 'excused', status: 'excused' },
    { contribution_status: 'proof_uploaded', status: 'proof_uploaded', proof_uploaded: true }, { amount_paid: 321.75, status: 'paid' }]) {
    const h = personalHarness([record({ ...changes, proof_eligible: false, outstanding_amount: 0 })]);
    h.render(); await tick(); assert.equal(button(h.render(), 'Upload Proof of Payment'), undefined);
  }
});
test('returning from proofs refreshes current status and removes upload eligibility', async () => {
  const h = personalHarness([record()]); h.render(); await tick(); assert.ok(button(h.render(), 'Upload Proof of Payment'));
  h.blur(); h.respond(async () => ({ data: { contributions: [record({ status: 'proof_uploaded', contribution_status: 'proof_uploaded', proof_uploaded: true, proof_eligible: false })] } }));
  h.focus(); await tick(); const tree = h.render();
  assert.equal(h.calls.length, 2); assert.equal(button(tree, 'Upload Proof of Payment'), undefined);
  assert.ok(text(tree).includes('Awaiting confirmation'));
});
test('late responses cannot expose another person contribution data after identity changes', async () => {
  const h = personalHarness(); let resolve;
  h.respond(() => new Promise(r => { resolve = r; })); h.render();
  h.auth.user = { id: 'other-person' }; h.respond(async () => ({ data: { contributions: [] } }));
  assert.ok(!text(h.render()).includes('R321.75'));
  resolve({ data: { contributions: [record()] } }); await tick();
  assert.ok(text(h.render()).includes('No personal contributions recorded'));
});
test('malformed personal response becomes an error rather than an invented zero', async () => {
  const h = personalHarness([record({ amount_paid: null })]); h.render(); await tick();
  assert.ok(text(h.render()).includes('Unable to load your contributions'));
});

test('admin proof route uses actual Phase 2 selector/upload and preserves contextual workspace on entry, back and re-entry', async () => {
  const e = engine(); const calls = []; const routes = []; let gets = 0;
  const selected = Object.freeze({ id: 'admin-group', role: 'admin', membership_id: 'admin-membership' });
  const workspace = Object.freeze({ ready: true, checking: false, workspaceError: null, selectedClub: selected,
    restoreWorkspace() { throw new Error('Unexpected context restoration'); }, personalHome() { throw new Error('Unexpected Personal Home change'); } });
  const router = { push: r => routes.push(r), replace: r => routes.push(r), back: () => routes.push('back'), canGoBack: () => true };
  const routing = { useRouter: () => router, useFocusEffect: e.useFocusEffect, Tabs: Object.assign('Tabs', {}) };
  const axios = { get: async () => { gets++; return { data: { contributions: [record()] } }; }, post: async (...args) => { calls.push(args); return {}; } };
  const selector = load('hooks/useProofSelector.ts', { react: e.react });
  const ProofScreen = load('app/(member)/proofs.tsx', {
    react: e.react, 'react-native': native, 'expo-router': routing, axios,
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'person' }, token: 'token' }) },
    '../../components/StatusPill': { StatusPill: 'StatusPill' }, '../../constants/Colors': { Colors: colors },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, '../../components/AdBanner': { AdBanner: 'AdBanner' },
    'expo-image-picker': { requestMediaLibraryPermissionsAsync: async () => ({ granted: true }), MediaTypeOptions: { Images: 'images' },
      launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ base64: 'test-proof' }] }) },
    'expo-file-system/legacy': {}, 'expo-sharing': {}, '../../services/contributions': policy, '../../hooks/useProofSelector': selector,
  }).default;
  const Wrapper = load('app/(treasurer)/personal-proofs.tsx', { react: e.react, '../(member)/proofs': { default: ProofScreen, __esModule: true } }).default;
  const wrapped = Wrapper(); assert.equal(wrapped.type, ProofScreen); assert.equal(wrapped.props.personalAdmin, true);
  const render = () => e.render(() => ProofScreen(wrapped.props));
  render(); assert.equal(nodes(render()).find(n => n.type === 'Modal').props.visible, true);
  await tick(); const tree = render(); await button(tree, 'Test group').props.onPress();
  assert.equal(calls[0][1].contribution_id, 'personal-obligation'); assert.equal(calls[0][1].user_id, 'person');
  nodes(render()).find(n => n.props.accessibilityLabel === 'Back to my contributions').props.onPress();
  e.blur(); assert.deepEqual(routes, ['back']); assert.equal(workspace.selectedClub, selected);
  e.focus(); await tick(); assert.equal(gets, 2); assert.equal(nodes(render()).find(n => n.type === 'Modal').props.visible, true);
  // The actual layout remains authorized and the proof route is hidden from the tab bar.
  const gate = engine(); const Tabs = Object.assign(() => {}, { Screen: 'Tabs.Screen' });
  const Layout = load('app/(treasurer)/_layout.tsx', { react: gate.react, 'expo-router': { useRouter: () => router, Tabs },
    'react-native': native, '@expo/vector-icons': { Ionicons: 'Ionicons' }, '../../constants/Colors': { Colors: colors },
    '../../services/workspace': load('services/workspace.ts'), '../../components/WorkspaceControls': { WorkspaceControls: 'WorkspaceControls' },
    '../../contexts/WorkspaceContext': { useWorkspace: () => workspace }, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
  }).default;
  const layout = gate.render(Layout);
  assert.equal(nodes(layout).find(n => n.props.name === 'personal-proofs').props.options.href, null);
  assert.equal(workspace.selectedClub, selected); assert.deepEqual(routes, ['back']);
});
