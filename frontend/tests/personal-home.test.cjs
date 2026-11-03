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

const homePolicy = load('services/personalHome.ts');
const workspacePolicy = load('services/workspace.ts');
const club = (extra = {}) => ({ id: 'group', name: 'Test group', membership_id: 'membership', membership_status: 'active', role: 'admin', monthly_contribution: 9999, ...extra });
const claim = { club_name: 'Test group', payout_date: 'October 2026', amount: 987, position: 2 };
function harness({ records = [], claims = [], clubs = [club()], screen = 'home' } = {}) {
  const e = engine(); const calls = []; const routes = [];
  const truth = workspacePolicy.activeMemberships({ clubs });
  let membershipRequests = 0;
  const workspace = { clubs: truth, membershipError: null, refreshMemberships: async () => { membershipRequests++; return truth; }, selectGroup: async () => {} };
  let respond = async url => {
    if (url.includes('/member/contributions/')) return { data: { contributions: records, summary: { total_saved: 999999 } } };
    if (url.includes('/member/payout-schedule/')) return { data: { schedules: claims } };
    if (url.includes('/invitations/pending/')) return { data: { invitations: [] } };
    throw new Error(`Unexpected endpoint ${url}`);
  };
  const axios = { get: (...args) => { calls.push(args); return respond(...args); } };
  const routing = { useRouter: () => ({ push: route => routes.push(route) }), useFocusEffect: e.useFocusEffect };
  const contributionHook = load('hooks/usePersonalContributions.ts', { react: e.react, 'expo-router': routing, axios, '../services/contributions': policy });
  const claimsHook = load('hooks/usePersonalClaims.ts', { react: e.react, 'expo-router': routing, axios, '../services/personalHome': homePolicy });
  const Screen = load(`app/(member)/${screen}.tsx`, {
    react: e.react, 'react-native': { ...native, RefreshControl: 'RefreshControl', TextInput: 'TextInput', Platform: { OS: 'android' } },
    'expo-router': routing, axios, '@react-native-async-storage/async-storage': {},
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'person', full_name: 'Test Person' }, token: 'token' }) },
    '../../contexts/WorkspaceContext': { useWorkspace: () => workspace },
    '../../components/StatusPill': { StatusPill: 'StatusPill' }, '../../components/AdBanner': { AdBanner: 'AdBanner' },
    '../../constants/Colors': { Colors: colors }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../../hooks/usePersonalContributions': contributionHook, '../../hooks/usePersonalClaims': claimsHook, '../../services/personalHome': homePolicy,
  }).default;
  return { ...e, calls, routes, truth, membershipRequests: () => membershipRequests, render: () => e.render(Screen), respond: fn => { respond = fn; } };
}

test('Home count equals active membership truth and opens the shared Profile My Clubs experience', async () => {
  const h = harness({ clubs: [club(), club({ id: 'removed', membership_status: 'removed' })] });
  h.render(); await tick(); const tree = h.render();
  assert.equal(text(button(tree, 'Groups & Clubs')), `Groups & Clubs${h.truth.length}`);
  button(tree, 'Groups & Clubs').props.onPress();
  assert.deepEqual(h.routes[0], { pathname: '/(member)/profile', params: { showClubs: 'true' } });
  assert.equal(h.membershipRequests(), 1);
});
test('Home contributions and modal use actual personal amounts, not group configuration or aggregates', async () => {
  const h = harness({ records: [record(), record({ contribution_id: 'paid', amount_paid: 40, amount_due: 40, outstanding_amount: 0, status: 'confirmed' })] });
  h.render(); await tick(); let tree = h.render();
  assert.equal(text(button(tree, 'Contributions')), 'ContributionsR120.00');
  button(tree, 'Contributions').props.onPress(); tree = h.render();
  const modal = nodes(tree).find(n => n.type === 'Modal' && n.props.visible);
  assert.ok(text(modal).includes('Recorded paid contributions: R120.00'));
  assert.ok(text(modal).includes('Paid: R80.00')); assert.ok(text(modal).includes('Paid: R40.00'));
  assert.ok(!text(modal).includes('9999'));
  const close = nodes(modal).find(n => n.props.accessibilityLabel === 'Close');
  assert.equal(close.props.accessibilityRole, 'button');
  assert.ok(nodes(close).some(n => n.props.name === 'close'));
  close.props.onPress(); assert.ok(!nodes(h.render()).some(n => n.type === 'Modal' && n.props.visible));
});
test('Upcoming Payments counts and lists exactly real outstanding records including late and actual flexible obligations', async () => {
  const records = [record(), record({ contribution_id: 'travel', group_id: 'travel', group_name: 'Travel', due_date: null }),
    record({ contribution_id: 'paid', status: 'paid', outstanding_amount: 0 }), record({ contribution_id: 'excused', status: 'excused', outstanding_amount: 0 })];
  const h = harness({ records }); h.render(); await tick(); let tree = h.render();
  assert.equal(text(button(tree, 'Upcoming Payments')), 'Upcoming Payments2');
  button(tree, 'Upcoming Payments').props.onPress(); tree = h.render();
  const modal = nodes(tree).find(n => n.type === 'Modal' && n.props.visible);
  assert.equal(nodes(modal).filter(n => n.props.key === 'personal-obligation' || n.props.key === 'travel').length, 2);
  assert.ok(!nodes(modal).some(n => n.props.key === 'paid' || n.props.key === 'excused'));
});
test('no genuine record yields honest zero even with a flexible Travel membership', async () => {
  const h = harness({ clubs: [club({ group_type: 'travel', contribution_mode: 'flexible_goal' })] });
  h.render(); await tick(); const tree = h.render();
  assert.equal(text(button(tree, 'Contributions')), 'ContributionsR0.00');
  assert.equal(text(button(tree, 'Upcoming Payments')), 'Upcoming Payments0');
  button(tree, 'Upcoming Payments').props.onPress();
  assert.ok(text(nodes(h.render()).find(n => n.type === 'Modal' && n.props.visible)).includes('No outstanding contributions recorded.'));
});
test('loading is not zero, requests start concurrently once, and financial failures remain unavailable', async () => {
  const h = harness(); let rejectContributions; let rejectClaims;
  h.respond(url => url.includes('/contributions/') ? new Promise((_, r) => { rejectContributions = r; })
    : url.includes('/payout-schedule/') ? new Promise((_, r) => { rejectClaims = r; }) : Promise.resolve({ data: { invitations: [] } }));
  h.render(); await tick(); let tree = h.render();
  assert.equal(h.calls.length, 3); assert.equal(h.membershipRequests(), 1);
  assert.ok(h.calls.every(([url]) => !url.includes('/dashboard/')));
  assert.equal(text(button(tree, 'Contributions')), 'ContributionsLoading...');
  assert.equal(text(button(tree, 'Upcoming Payments')), 'Upcoming PaymentsLoading...');
  assert.equal(text(button(tree, 'Claims')), 'ClaimsLoading...');
  rejectContributions(new Error('offline')); rejectClaims(new Error('offline')); await tick(); tree = h.render();
  assert.equal(text(button(tree, 'Contributions')), 'ContributionsUnavailable');
  assert.equal(text(button(tree, 'Claims')), 'ClaimsUnavailable');
});
test('Claims count and destination render the same validated records; errors do not become empty', async () => {
  const h = harness({ claims: [claim] }); h.render(); await tick(); const tree = h.render();
  assert.equal(text(button(tree, 'Claims')), 'Claims1'); button(tree, 'Claims').props.onPress();
  assert.equal(h.routes[0], '/(member)/claims');
  const destination = harness({ claims: [claim], screen: 'claims' }); destination.render(); await tick();
  assert.ok(text(destination.render()).includes('R987'));
  destination.blur(); destination.respond(async () => { throw new Error('offline'); }); destination.focus(); await tick();
  assert.ok(text(destination.render()).includes('Unable to load claims'));
  assert.ok(!text(destination.render()).includes('No recorded claims yet'));
  destination.respond(async () => ({ data: { schedules: [] } }));
  button(destination.render(), 'Retry').props.onPress(); await tick();
  assert.ok(text(destination.render()).includes('No recorded claims yet'));
});
test('Home cards remain tappable plain light surfaces without clementine top borders', async () => {
  const h = harness(); h.render(); await tick(); const tree = h.render();
  for (const label of ['Contributions', 'Groups & Clubs', 'Upcoming Payments', 'Claims']) {
    const card = button(tree, label);
    assert.equal(typeof card.props.onPress, 'function'); assert.equal(card.props.style.backgroundColor, 'white');
    assert.equal(card.props.style.borderTopWidth, undefined); assert.equal(card.props.style.borderTopColor, undefined);
  }
});
test('invalid claims response fails validation rather than producing a zero', () => {
  assert.throws(() => homePolicy.personalClaims({}));
  assert.throws(() => homePolicy.personalClaims({ schedules: [{ ...claim, amount: '987' }] }));
  assert.deepEqual(homePolicy.personalClaims({ schedules: [] }), []);
});


test('Home header/cards render and navigate before slow invitations and financial requests settle', () => {
  const h = harness(); h.respond(() => new Promise(() => {}));
  const tree = h.render();
  assert.ok(text(tree).includes('Clubvel'));
  assert.equal(text(button(tree, 'Contributions')), 'ContributionsLoading...');
  button(tree, 'Claims').props.onPress(); assert.equal(h.routes[0], '/(member)/claims');
  assert.equal(h.calls.length, 3); assert.equal(h.membershipRequests(), 1);
  h.render(); assert.equal(h.calls.length, 3);
});

test('returning to Home retains verified personal figures while fresh requests run in background', async () => {
  const h = harness({ records: [record()], claims: [claim] });
  h.render(); await tick(); h.render(); h.blur();
  h.respond(() => new Promise(() => {})); h.focus();
  const tree = h.render();
  assert.equal(text(button(tree, 'Contributions')), 'ContributionsR80.00');
  assert.equal(text(button(tree, 'Claims')), 'Claims1');
  assert.ok(text(tree).includes('Updating your information'));
  assert.equal(h.calls.length, 6); // Fresh reads still occur on every return.
});
