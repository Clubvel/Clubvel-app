const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { load, engine, tick, nodes, text, native, colors } = require('./ui-harness.cjs');

function callback(file, name, bindings) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(initializer);
  const code = ts.transpileModule(`module.exports = ${initializer.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function(...Object.keys(bindings), 'module', code)(...Object.values(bindings), module);
  return module.exports;
}


function admin(token = 'session') {
  const calls = [], alerts = [], opened = [], state = { failAPI: false, failOpen: false, status: 'submitted', wait: null };
  const bindings = { inviteAdminPhone: '0821234567', token, id: 'group', API_URL: 'https://staging.invalid',
    adminInvitationInFlight: { current: false }, setActionLoading() {}, setShowInviteAdminModal() {}, setInviteAdminPhone() {},
    axios: { post: async (...args) => {
      calls.push(args); if (state.wait) await state.wait;
      if (state.failAPI) throw { response: { data: { detail: 'Access denied' } } };
      return { data: { phone_number: '+27821234567', invitation_message: 'Admin & Club → Accept', delivery_status: state.status } };
    } }, Alert: { alert: (...args) => alerts.push(args) },
    Linking: { openURL: async url => { opened.push(url); if (state.failOpen) throw Error('Unavailable'); } },
  };
  return { calls, alerts, opened, state, run: callback('app/(treasurer)/club-detail.tsx', 'handleInviteAdmin', bindings) };
}

test('Admin invitation persists with bearer session before offering delivery; no immediate membership request', async () => {
  const c = admin(); await c.run();
  assert.equal(c.calls.length, 1); assert.match(c.calls[0][0], /groups\/admin\/invite$/);
  assert.deepEqual(c.calls[0][1], { group_id: 'group', new_admin_phone: '0821234567' });
  assert.equal(c.calls[0][2].headers.Authorization, 'Bearer session');
  assert.equal(c.alerts[0][0], 'Admin invitation created');
  assert.match(c.alerts[0][1], /must accept/); assert.equal(c.opened.length, 0);
  assert.deepEqual(c.alerts[0][2].map(b => b.text), ['Done', 'WhatsApp', 'SMS']);
});

test('WhatsApp uses prepared recipient/message; failure and cancellation never undo invitation', async () => {
  const c = admin(); await c.run();
  assert.equal(c.alerts[0][2][0].style, 'cancel'); assert.equal(c.calls.length, 1);
  const send = c.alerts[0][2].find(b => b.text === 'WhatsApp').onPress;
  await send(); assert.equal(c.opened[0], 'https://wa.me/27821234567?text=' + encodeURIComponent('Admin & Club → Accept'));
  c.state.failOpen = true; await send();
  assert.match(c.alerts.at(-1)[1], /remains pending/); assert.equal(c.calls.length, 1);
});

test('SMS reuses creation endpoint and preserves pending invitation on mock/failure', async () => {
  for (const status of ['submitted', 'mock', 'failed']) {
    const c = admin(); await c.run(); c.state.status = status;
    await c.alerts[0][2].find(b => b.text === 'SMS').onPress();
    assert.equal(c.calls.length, 2); assert.equal(c.calls[1][1].channel, 'sms');
    assert.equal(c.calls[1][1].new_admin_phone, c.calls[0][1].new_admin_phone);
    assert.equal(c.alerts.at(-1)[0], status === 'submitted' ? 'SMS submitted' : 'Invitation saved');
    assert.equal(c.opened.length, 0);
  }
});

test('missing authentication and failed persistence offer no delivery', async () => {
  const missing = admin(null); await missing.run(); assert.equal(missing.calls.length, 0);
  const c = admin(); c.state.failAPI = true; await c.run();
  assert.equal(c.alerts[0][2], undefined); assert.equal(c.opened.length, 0);
});

test('overlapping Admin invitation taps are blocked', async () => {
  const c = admin(); let finish; c.state.wait = new Promise(resolve => { finish = resolve; });
  const first = c.run(); const second = c.run(); assert.equal(c.calls.length, 1);
  finish(); await Promise.all([first, second]);
});

test('Member Home clearly identifies Admin privilege, retains Member wording and supplies Accept/Decline', async () => {
  const ui = engine();
  const Screen = load('app/(member)/home.tsx', {
    react: ui.react,
    '@react-native-async-storage/async-storage': { getItem: async () => null },
    'react-native': { ...native, RefreshControl: 'RefreshControl', TextInput: 'TextInput', KeyboardAvoidingView: 'KeyboardAvoidingView',
      Platform: { OS: 'android' }, Alert: { alert() {} }, TouchableWithoutFeedback: 'TouchableWithoutFeedback', Keyboard: { dismiss() {} } },
    'expo-router': { useRouter: () => ({ push() {}, replace() {} }), useFocusEffect: fn => ui.useFocusEffect(fn) },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'recipient' }, token: 'session', logout() {} }) },
    '../../components/AdBanner': { AdBanner: 'AdBanner' }, '../../components/StatusPill': { StatusPill: 'StatusPill' },
    '../../constants/Colors': { Colors: colors }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    axios: { get: async url => ({ data: url.includes('/invitations/') ? {
      invitations: [{ id: 'admin-invite', group_name: 'WeTraveling', intended_role: 'admin', invited_by_name: 'Kenneth' },
        { id: 'legacy', group_name: 'Member Club' }],
    } : { user: { first_name: 'Member', full_name: 'Member' }, clubs: [], summary: { total_saved: 0, active_clubs: 0, days_until_next_claim: null, overdue_contributions: 0, upcoming_payments: 0, claims_count: 0 } } }) },
  }).default;
  ui.render(Screen); await tick(); const tree = ui.render(Screen);
  assert.match(text(tree), /Invitation to become an Admin of WeTraveling/);
  assert.match(text(tree), /Invitation to join Member Club/);
  assert.ok(nodes(tree).some(n => n.type === 'TouchableOpacity' && text(n) === 'Decline'));
  assert.ok(nodes(tree).some(n => n.type === 'TouchableOpacity' && text(n) === 'Accept'));
});

test('Home Accept/Decline post selected invitation with bearer token; Admin acceptance success is explicit', async () => {
  const calls = [], alerts = [];
  const bindings = { API_URL: 'https://staging.invalid', token: 'session', user: { id: 'recipient' },
    dashboardRequest: { current: 0 }, dashboardInFlight: { current: null },
    setAcceptingInvitation() {}, fetchDashboard: async () => {},
    axios: { post: async (...args) => { calls.push(args); return { data: { admin_access: true } }; } }, Alert: { alert: (...args) => alerts.push(args) } };
  const invite = { id: 'admin-invite', group_name: 'WeTraveling', intended_role: 'admin' };
  await callback('app/(member)/home.tsx', 'acceptInvitation', bindings)(invite);
  assert.equal(calls[0][2].headers.Authorization, 'Bearer session');
  assert.equal(calls[0][1].invitation_id, 'admin-invite'); assert.match(alerts[0][1], /an Admin/);
  await callback('app/(member)/home.tsx', 'declineInvitation', bindings)(invite);
  assert.match(calls[1][0], /invitations\/decline$/); assert.equal(calls[1][1].invitation_id, 'admin-invite');
  assert.equal(calls[1][2].headers.Authorization, 'Bearer session');
});
