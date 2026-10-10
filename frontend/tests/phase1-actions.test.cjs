const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { load, engine, tick, nodes, text, button, native, colors } = require('./ui-harness.cjs');

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

for (const [file, name] of [['app/(member)/home.tsx', 'createGroup'], ['app/(treasurer)/dashboard.tsx', 'handleCreateClub']]) {
  function setup(token = 'signed-session') {
    const calls = [], messages = [], noop = () => {};
    const bindings = { API_URL: 'https://staging.invalid', user: { id: 'person' }, token,
      groupName: 'New Club', clubName: 'New Club', groupType: 'savings', clubType: 'savings',
      monthlyContribution: '100', paymentDueDate: '25',
      axios: { post: async (...args) => { calls.push(args); return { data: { group_id: 'new-group' } }; } },
      Alert: { alert: (...args) => messages.push(args) }, router: { push: noop }, fetchDashboard: async () => {},
      setCreatingGroup: noop, setCreatingClub: noop, setShowCreateGroup: noop, setShowCreateClubModal: noop,
      setGroupName: noop, setClubName: noop, setGroupType: noop, setClubType: noop,
      setMonthlyContribution: noop, setPaymentDueDate: noop,
    };
    return { calls, messages, run: callback(file, name, bindings) };
  }
  test(`${file}: Create Group includes the signed bearer token`, async () => {
    const c = setup(); await c.run();
    assert.equal(c.calls.length, 1); assert.match(c.calls[0][0], /\/api\/groups\/create$/);
    assert.equal(c.calls[0][1].admin_user_id, 'person');
    assert.equal(c.calls[0][2].headers.Authorization, 'Bearer signed-session');
  });
  test(`${file}: missing session prevents Create Group request`, async () => {
    const c = setup(null); await c.run(); assert.equal(c.calls.length, 0);
    assert.equal(c.messages[0][0], 'Sign in required');
  });
}

function reminder() {
  const calls = [], messages = [], opened = [], state = { failOpen: false, failAPI: false };
  const add = load('services/paymentReminder.ts', {
    axios: { post: async (...args) => {
      calls.push(args);
      if (state.failAPI) throw { response: { data: { detail: 'Not authorized' } } };
      return { data: { phone_number: '+27821234567', reminder_message: 'Club reminder R600 & proof' } };
    } },
    'react-native': { Alert: { alert: (...args) => messages.push(args) }, Linking: { openURL: async url => {
      opened.push(url); if (state.failOpen) throw new Error('Unavailable');
    } } },
  }).addPaymentReminder;
  return { calls, messages, opened, state, add };
}

test('reminder persists selected contribution with bearer token before offering optional WhatsApp', async () => {
  const c = reminder(); await c.add('https://staging.invalid', 'session', 'contribution-a');
  assert.equal(c.calls.length, 1);
  assert.deepEqual(c.calls[0][1], { contribution_id: 'contribution-a' });
  assert.equal(c.calls[0][2].headers.Authorization, 'Bearer session');
  assert.equal(c.messages[0][0], 'Reminder added to member Alerts'); assert.equal(c.opened.length, 0);
  await c.messages[0][2].find(a => a.text === 'Open WhatsApp').onPress();
  assert.equal(c.opened[0], 'https://wa.me/27821234567?text=Club%20reminder%20R600%20%26%20proof');
  assert.equal(c.messages.at(-1)[0], 'WhatsApp opened');
  assert.equal(c.calls.length, 1);
});

test('WhatsApp failure or choosing Done cannot roll back the persisted reminder', async () => {
  const c = reminder(); await c.add('https://staging.invalid', 'session', 'contribution-a');
  assert.equal(c.messages[0][2].find(a => a.text === 'Done').style, 'cancel');
  assert.equal(c.calls.length, 1); assert.equal(c.opened.length, 0);
  c.state.failOpen = true;
  await c.messages[0][2].find(a => a.text === 'Open WhatsApp').onPress();
  assert.equal(c.messages.at(-1)[0], 'WhatsApp could not be opened');
  assert.match(c.messages.at(-1)[1], /still saved/); assert.equal(c.calls.length, 1);
});

test('failed persistence never offers WhatsApp or reports reminder success', async () => {
  const c = reminder(); c.state.failAPI = true; await c.add('https://staging.invalid', 'session', 'contribution-a');
  assert.equal(c.messages[0][0], 'Could not add reminder'); assert.equal(c.messages[0][1], 'Not authorized');
  assert.equal(c.messages[0][2], undefined); assert.equal(c.opened.length, 0);
});

test('Admin Home hides only the self-reminder action and sends the other contribution identity', async () => {
  const ui = engine(), messages = [], calls = [];
  const Screen = load('app/(treasurer)/dashboard.tsx', {
    react: ui.react,
    'react-native': { ...native, RefreshControl: 'RefreshControl', TextInput: 'TextInput', KeyboardAvoidingView: 'KeyboardAvoidingView',
      Platform: { OS: 'android' }, Keyboard: { dismiss() {} }, TouchableWithoutFeedback: 'TouchableWithoutFeedback',
      Alert: { alert: (...args) => messages.push(args) } },
    'expo-router': { useFocusEffect: ui.useFocusEffect, useLocalSearchParams: () => ({}), useRouter: () => ({ push() {} }) },
    '../../components/ProfilePhotoViewer': { default: 'ProfilePhotoViewer' },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'admin', full_name: 'Admin' }, token: 'session' }) },
    '../../components/AdBanner': { AdBanner: 'AdBanner' }, '../../constants/Colors': { Colors: colors },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, '@react-native-async-storage/async-storage': {},
    '../../services/paymentReminder': { addPaymentReminder: async (...args) => calls.push(args) },
    axios: { get: async () => ({ data: { clubs: [], summary: { total_clubs: 0, total_members: 2, total_collected_this_month: 0, late_members_count: 2 },
      urgent_alerts: [{ user_id: 'admin', contribution_id: 'self', member_name: 'Self Member', amount: 300 },
        { user_id: 'other', contribution_id: 'other-payment', member_name: 'Other Member', amount: 600 }] } }) },
  }).default;
  ui.render(Screen); await tick(); const tree = ui.render(Screen);
  assert.match(text(tree), /Self Member/); assert.match(text(tree), /Other Member/);
  assert.equal(nodes(tree).filter(n => n.type === 'TouchableOpacity' && text(n) === 'Remind').length, 1);
  button(tree, 'Remind').props.onPress();
  await messages.at(-1)[2].find(a => a.text === 'Add Reminder').onPress();
  assert.equal(calls[0][1], 'session'); assert.equal(calls[0][2], 'other-payment');
});

test('Reports keeps Quick Actions absent and retains functioning exports and handlers', async () => {
  const ui = engine();
  const Screen = load('app/(treasurer)/reports.tsx', {
    react: ui.react, 'react-native': native,
    'expo-router': { useFocusEffect: ui.useFocusEffect, useLocalSearchParams: () => ({}), useRouter: () => ({ push() {} }) },
    '../../components/ProfilePhotoViewer': { default: 'ProfilePhotoViewer' },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'admin' }, token: 'session' }) },
    '../../constants/Colors': { Colors: colors }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../../components/MonthlyReport': { default: 'MonthlyReport' },
    '../../components/AdBanner': { AdBanner: 'AdBanner' }, '../../services/pdfReportService': {},
    axios: { get: async () => ({ data: { clubs: [{id:'managed-club'}] } }) },
  }).default;
  ui.render(Screen); await tick(); const tree = ui.render(Screen);
  assert.doesNotMatch(text(tree), /Quick Actions/);
  assert.match(text(tree), /Other available exports/);
  button(tree, 'Other available exports').props.onPress();
  const exports = ui.render(Screen);
  assert.doesNotMatch(text(exports), /Member Statement|legacy shortcut/i);
  assert.match(text(exports), /Current-month contribution export|Current-year contribution export/);
  assert.equal(nodes(exports).filter(n => n.type === 'Ionicons' && n.props.name === 'download').length, 2);
  assert.equal(nodes(exports).filter(n => n.type === 'Ionicons' && n.props.name === 'logo-whatsapp').length, 2);
  const b = { isGenerating: false, setIsGenerating() {}, setGeneratingType() {}, dashboardData: {},
    Alert: { alert() {} }, buildReportData: async type => ({ reportType: type }),
    generatePDF: async () => ({ success: true, uri: 'report.pdf' }),
    sharePDFReport: async uri => { assert.equal(uri, 'report.pdf'); } };
  await callback('app/(treasurer)/reports.tsx', 'handleShareWhatsApp', b)('monthly');
});
