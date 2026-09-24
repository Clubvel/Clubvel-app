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

const payoutPolicy = load('services/payouts.ts');
const claimPolicy = load('services/personalHome.ts');
const payout = { claim_id: 'stored-claim', club_name: 'Recorded group', recipient: 'Recorded recipient', payout_date: '2031-07-09', amount: 123.45, status: 'upcoming' };

function profileHarness(kind = 'treasurer', rows = []) {
  const e = engine(); const calls = []; let response = async () => ({ data: { schedules: rows } });
  const axios = { get: async url => {
    calls.push(url);
    if (url.includes('payout-schedule')) return response();
    if (url.includes('/clubs/')) return { data: { clubs: [] } };
    return { data: { clubs_managed: 1, total_members: 1, total_collected: 500, clubs_count: 1, total_saved: 500, on_time_percentage: 100, trust_score: null } };
  } };
  const routing = { useFocusEffect: e.useFocusEffect, useRouter: () => ({ push() {}, setParams() {} }), useLocalSearchParams: () => ({}) };
  const hooks = kind === 'treasurer'
    ? load('hooks/usePayoutSchedules.ts', { react: e.react, 'expo-router': routing, axios, '../services/payouts': payoutPolicy })
    : load('hooks/usePersonalClaims.ts', { react: e.react, 'expo-router': routing, axios, '../services/personalHome': claimPolicy });
  const hookName = kind === 'treasurer' ? 'usePayoutSchedules' : 'usePersonalClaims';
  const Screen = load(`app/(${kind})/profile.tsx`, {
    react: e.react, 'react-native': { ...native, Platform: { OS: 'android' } }, 'expo-router': routing, axios,
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'person', full_name: 'Test Person' }, token: 'token' }) },
    '../../contexts/WorkspaceContext': { useWorkspace: () => ({ clubs: [], membershipError: null, refreshMemberships: async () => [], selectGroup() {} }) },
    '../../constants/Colors': { Colors: colors }, '@expo/vector-icons': { Ionicons: 'Ionicons' }, 'expo-image-picker': {},
    [`../../hooks/${hookName}`]: hooks,
  }).default;
  return { ...e, calls, render: () => e.render(Screen), respond: fn => { response = fn; } };
}

test('legacy inferred payout payload is rejected rather than rendered as a real schedule', () => {
  assert.throws(() => payoutPolicy.recordedPayouts({ schedules: [{ club_name: 'Group', next_payout_member: 'First member', payout_date: 'Next Month', amount: 500 }] }));
  assert.deepEqual(payoutPolicy.recordedPayouts({ schedules: [] }), []);
  assert.deepEqual(payoutPolicy.recordedPayouts({ schedules: [payout] }), [payout]);
});
test('admin Profile shows honest empty schedule despite existing contributions and members', async () => {
  const h = profileHarness(); h.render(); await tick(); let tree = h.render();
  button(tree, 'Payout Schedule').props.onPress(); tree = h.render();
  const modal = nodes(tree).find(n => n.type === 'Modal' && n.props.visible);
  assert.ok(text(modal).includes('No payout schedule set'));
  assert.ok(!text(modal).includes('Next:')); assert.ok(!text(modal).includes('Next Month')); assert.ok(!text(modal).includes('R500'));
});
test('admin Profile renders only stored recipient date amount, without labelling arbitrary next recipient', async () => {
  const h = profileHarness('treasurer', [payout]); h.render(); await tick();
  button(h.render(), 'Payout Schedule').props.onPress();
  const modal = nodes(h.render()).find(n => n.type === 'Modal' && n.props.visible);
  assert.ok(text(modal).includes('Recipient: Recorded recipient'));
  assert.ok(text(modal).includes('2031-07-09')); assert.ok(text(modal).includes(`R${(123.45).toLocaleString()}`));
  assert.ok(!text(modal).includes('Next:')); assert.ok(!text(modal).includes('No payout schedule set'));
});
test('both Profile modals distinguish loading and network failure from a verified empty state', async () => {
  for (const kind of ['member', 'treasurer']) {
    const h = profileHarness(kind); let reject;
    h.respond(() => new Promise((_, r) => { reject = r; }));
    h.render(); await tick(); let tree = h.render();
    assert.ok(text(button(tree, 'Payout Schedule')).includes('Loading...'));
    button(tree, 'Payout Schedule').props.onPress(); tree = h.render();
    assert.ok(!text(nodes(tree).find(n => n.type === 'Modal' && n.props.visible)).includes('No payout schedule set'));
    reject(new Error('offline')); await tick(); tree = h.render();
    const modal = nodes(tree).find(n => n.type === 'Modal' && n.props.visible);
    assert.ok(text(modal).includes('Unable to load payout records'));
    assert.ok(!text(modal).includes('No payout schedule set'));
    h.respond(async () => ({ data: { schedules: [] } })); button(modal, 'Retry').props.onPress(); await tick();
    assert.ok(text(nodes(h.render()).find(n => n.type === 'Modal' && n.props.visible)).includes('No payout schedule set'));
  }
});
test('member Profile never displays membership join-order as a payout position', async () => {
  const h = profileHarness('member', [{ club_name: 'Recorded group', payout_date: 'July 2031', amount: 123.45, position: 99 }]);
  h.render(); await tick(); button(h.render(), 'Payout Schedule').props.onPress();
  const modal = nodes(h.render()).find(n => n.type === 'Modal' && n.props.visible);
  assert.ok(text(modal).includes(`R${(123.45).toLocaleString()}`)); assert.ok(!text(modal).includes('#99'));
});
test('unknown stored payout details show unavailable rather than guessed values', async () => {
  const h = profileHarness('treasurer', [{ ...payout, recipient: null, amount: null, payout_date: null }]);
  h.render(); await tick(); button(h.render(), 'Payout Schedule').props.onPress();
  const modal = nodes(h.render()).find(n => n.type === 'Modal' && n.props.visible);
  assert.ok(text(modal).includes('Recipient unavailable')); assert.ok(text(modal).includes('Amount unavailable')); assert.ok(text(modal).includes('Date unavailable'));
});

