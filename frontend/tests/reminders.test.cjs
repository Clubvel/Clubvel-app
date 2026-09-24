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

const policy = load('services/contributions.ts');
const reminders = load('services/reminders.ts', { './contributions': policy });
const row = (changes = {}) => ({ contribution_id: 'record', member_id: 'member', group_id: 'group', group_name: 'Actual Group',
  member_name: 'Actual Person', phone: '082 123 4567', amount_due: 321.75, amount_paid: 80,
  status: 'late', contribution_status: 'pending', proof_uploaded: false, month: 8, year: 2026, ...changes });
const link = data => reminders.reminderLink(data, 'group', 'member', 'record');
test('actual partial balance first name group and no invented date form exact message', () => {
  const url = new URL(link(row()));
  assert.equal(url.searchParams.get('phone'), '27821234567');
  assert.equal(url.searchParams.get('text'), 'Hi Actual, this is a friendly reminder that your R241.75 contribution for Actual Group is still outstanding. Please make your payment when convenient. Thank you.');
});
test('settled excused awaiting review unknown and nonpositive balances cannot be reminded', () => {
  for (const state of ['confirmed', 'paid', 'excused', 'proof_uploaded', 'unknown']) {
    assert.throws(() => link(row({ contribution_status: state })));
    assert.throws(() => link(row({ status: state })));
  }
  for (const changes of [{ proof_uploaded: true }, { amount_paid: 321.75 }, { amount_paid: 400 }, { amount_paid: null }]) assert.throws(() => link(row(changes)));
});
test('no record Travel membership or mismatched context never manufacture eligibility', () => {
  for (const data of [null, { group_type: 'travel', monthly_contribution: 500 }, row({ group_id: 'other' }), row({ member_id: 'other' }), row({ contribution_id: 'other' })]) assert.throws(() => link(data));
});
test('phone formatting is conservative and missing required names fail safely', () => {
  for (const phone of ['+27 82 123 4567', '0027821234567', '27821234567']) assert.ok(link(row({ phone })).includes('phone=27821234567'));
  assert.ok(link(row({ phone: '+44 7700 900123' })).includes('phone=447700900123'));
  for (const changes of [{ phone: null }, { phone: '0821' }, { phone: '0821234567 ext5' }, { member_name: '' }, { group_name: '' }]) assert.throws(() => link(row(changes)));
});
function harness(open = async () => {}, response = async () => ({ data: row() })) {
  const e = engine(); const urls = []; const calls = []; const alerts = [];
  let selectedClub = { id: 'group', role: 'admin' };
  const Screen = load('app/(treasurer)/club-detail.tsx', {
    react: e.react, 'react-native': { ...native, Platform: { OS: 'android' }, Linking: { openURL: async url => { urls.push(url); await open(); } }, Alert: { alert: (...a) => alerts.push(a) } },
    'expo-router': { useRouter: () => ({ replace() {}, back() {} }), useLocalSearchParams: () => ({ id: 'group' }), Stack: {} },
    '../../constants/Colors': { Colors: colors }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'admin' }, token: 'token' }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../../contexts/WorkspaceContext': { useWorkspace: () => ({ selectedClub, personalHome() {} }) },
    '../../services/workspace': { workspaceRoute: () => ({}) }, '../../services/contributions': policy, '../../services/reminders': reminders,
    axios: { isAxiosError: () => false, get: async (url, options) => {
      calls.push([url, options]);
      if (url.endsWith('/reminder')) return response();
      return { data: { id: 'group', name: 'Actual Group', member_count: 1, collected: 80, expected: 321.75, monthly_contribution: 9999,
        members: [{ id: 'member', contribution_id: 'record', name: 'Stale Name', phone: 'invalid', status: 'late', amount_due: 321.75, amount_paid: 80 }] } };
    } },
  }).default;
  return { render: () => e.render(Screen), urls, calls, alerts, select: club => { selectedClub = club; } };
}
async function modal(h) {
  h.render(); await tick(); button(h.render(), 'Payments').props.onPress();
  button(h.render(), 'Send Reminder').props.onPress(); return h.render();
}
test('existing modal revalidates exact record with token; opens WhatsApp without sent claim or write', async () => {
  const h = harness(); let tree = await modal(h); assert.ok(text(tree).includes('Send reminder via'));
  button(tree, 'WhatsApp').props.onPress(); await tick();
  assert.equal(h.urls.length, 1); assert.ok(decodeURIComponent(h.urls[0]).includes('Hi Actual,'));
  assert.equal(h.calls[1][1].headers.Authorization, 'Bearer token'); assert.equal(h.calls[1][1].params.group_id, 'group');
  assert.ok(h.calls[1][0].endsWith('/record/reminder')); assert.deepEqual(h.alerts, []);
  assert.equal(nodes(h.render()).find(n => n.type === 'Modal').props.visible, false);
});
test('WhatsApp unavailable or failed verification shows useful error without success', async () => {
  const h = harness(async () => { throw Error('not installed'); });
  button(await modal(h), 'WhatsApp').props.onPress(); await tick();
  assert.ok(text(h.render()).includes('Could not open WhatsApp')); assert.deepEqual(h.alerts, []);
  const bad = harness(undefined, async () => { throw Error('Record no longer payable'); });
  button(await modal(bad), 'WhatsApp').props.onPress(); await tick();
  assert.equal(bad.urls.length, 0); assert.ok(text(bad.render()).includes('Record no longer payable'));
});
test('cancel or changed selected group prevents delayed response opening WhatsApp', async () => {
  for (const cancel of [true, false]) {
    let resolve; const h = harness(undefined, () => new Promise(r => { resolve = r; }));
    button(await modal(h), 'WhatsApp').props.onPress();
    if (cancel) button(h.render(), 'Cancel').props.onPress();
    else { h.select({ id: 'other', role: 'member' }); h.render(); }
    resolve({ data: row() }); await tick(); assert.equal(h.urls.length, 0);
  }
});
test('dashboard no longer claims a reminder was sent', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/(treasurer)/dashboard.tsx'), 'utf8');
  assert.ok(!source.includes('Reminder Sent')); assert.ok(!source.includes('handleRemindMember'));
});
