const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const ts = require('typescript');
const { load, engine, tick, nodes, text, native, colors } = require('./ui-harness.cjs');
const file = 'app/(treasurer)/dashboard.tsx';
const style = n => Object.assign({}, ...[n.props.style].flat().filter(Boolean));
function setup(photo = 'data:image/jpeg;base64,current') {
  const ui = engine(), requests = [], routes = [], alerts = [], deletes = [];
  let logouts = 0, clears = 0;
  const auth = { user: { id: 'admin', full_name: 'Alexandra Very Long Administrator Name', profile_photo: photo }, token: 'session', logout: async () => { logouts++; } };
  const Screen = load(file, {
    react: ui.react,
    'react-native': { ...native, RefreshControl: 'RefreshControl', TextInput: 'TextInput', KeyboardAvoidingView: 'KeyboardAvoidingView', TouchableWithoutFeedback: 'TouchableWithoutFeedback', Keyboard: {}, Linking: {}, Platform: { OS: 'android' }, Alert: { alert: (...args) => alerts.push(args) } },
    'expo-router': { useFocusEffect: ui.useFocusEffect, useLocalSearchParams: () => ({}), useRouter: () => ({ push: route => routes.push(route), replace: route => routes.push(route) }) },
    '../../components/ProfilePhotoViewer': { default: 'ProfilePhotoViewer' },
    '../../contexts/AuthContext': { useAuth: () => auth }, '../../components/AdBanner': { AdBanner: 'AdBanner' },
    '../../constants/Colors': { Colors: colors }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../../services/paymentReminder': { addPaymentReminder: async () => {} },
    '@react-native-async-storage/async-storage': { clear: async () => { clears++; } },
    axios: { get: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })), delete: async (url, options) => { deletes.push({ url, options }); return {}; } },
  }).default;
  const render = () => ui.render(Screen);
  const action = label => nodes(render()).find(n => n.type === 'TouchableOpacity' && n.props.accessibilityLabel === label);
  const accountModal = () => nodes(render()).find(n => n.type === 'Modal');
  const panel = () => nodes(render()).find(n => n.props.accessibilityViewIsModal);
  const answer = count => ({ summary: { total_clubs: count, total_members: 0, total_collected_this_month: 0, late_members_count: 0 }, clubs: [], urgent_alerts: [], next_claim: null });
  const ready = async (count = 2) => { requests[0].resolve({ data: answer(count) }); await tick(); render(); };
  const open = () => { action('Open profile menu').props.onPress(); };
  render();
  return { ui, auth, requests, routes, alerts, deletes, render, action, accountModal, panel, answer, ready, open, counts: () => ({ logouts, clears }) };
}
test('Admin drawer uses approved Member dimensions, scrollable structure and typography', async () => {
  const c = setup(); await c.ready(); c.open(); const panel = c.panel();
  assert.deepEqual([style(panel).width, style(panel).maxWidth, style(panel).flex], ['92%', 420, 1]);
  assert.ok(nodes(panel).some(n => n.type === 'ScrollView' && style(n).flex === 1));
  const member = fs.readFileSync(path.join(__dirname, '../app/(member)/home.tsx'), 'utf8');
  const start = member.indexOf('const styles = StyleSheet.create(');
  const reference = new Function('StyleSheet', 'Colors', member.slice(start) + '; return styles;')(native.StyleSheet, colors);
  assert.deepEqual(style(panel), reference.dropdownMenu);
  const name = nodes(panel).find(n => n.type === 'Text' && text(n) === c.auth.user.full_name);
  assert.deepEqual(style(name), reference.dropdownUserName);
  assert.equal(name.props.numberOfLines, undefined);
  assert.equal(c.requests.length, 1);
});
test('Admin photo shares authenticated header image with 112px cover/circle/ring and no extra request', async () => {
  const c = setup(); await c.ready(); c.open();
  const avatar = nodes(c.panel()).find(n => n.type === 'Image');
  assert.equal(avatar.props.source.uri, c.auth.user.profile_photo);
  assert.equal(avatar.props.resizeMode, 'cover');
  assert.deepEqual([style(avatar).width, style(avatar).height, style(avatar).borderRadius], [112, 112, 56]);
  assert.equal(style(avatar).borderWidth, 2); assert.equal(style(avatar).borderColor, 'gold');
  const header = nodes(c.render()).find(n => n.type === 'Image' && style(n).width === 112);
  assert.equal(header.props.source.uri, avatar.props.source.uri);
  c.auth.user.profile_photo = 'data:image/jpeg;base64,replacement';
  assert.equal(nodes(c.panel()).find(n => n.type === 'Image').props.source.uri, c.auth.user.profile_photo);
  assert.equal(c.requests.length, 1);
});
test('Admin initials fallback has the same 112px treatment and safely handles missing names', async () => {
  const c = setup(null); await c.ready(); c.open();
  const avatar = nodes(c.panel()).find(n => style(n).width === 112);
  assert.equal(avatar.type, 'View'); assert.equal(text(avatar), 'A');
  assert.deepEqual([style(avatar).height, style(avatar).borderRadius, style(avatar).borderColor], [112, 56, 'gold']);
  c.auth.user.full_name = ''; assert.equal(text(nodes(c.panel()).find(n => style(n).width === 112)), '?');
});
for (const count of [0, 1, 3]) {
  test(`successful authoritative count ${count} has truthful singular/plural subtitle`, async () => {
    const c = setup(); await c.ready(count); c.open();
    assert.ok(text(c.panel()).includes(`Managing ${count} ${count === 1 ? 'Group' : 'Groups'}`));
    assert.equal(c.requests[0].options.headers.Authorization, 'Bearer session');
  });
}
test('failed or missing dashboard count uses neutral context, and successful retry restores it', async () => {
  const c = setup(), original = console.error;
  try { console.error = () => {}; c.requests[0].reject(new Error('Offline')); await tick(); } finally { console.error = original; }
  c.render(); c.open(); assert.match(text(c.panel()), /Club administration/); assert.doesNotMatch(text(c.panel()), /Managing 0/);
  nodes(c.render()).find(n => n.type === 'ScrollView' && n.props.refreshControl).props.refreshControl.props.onRefresh(); c.render();
  c.requests[1].resolve({ data: c.answer(undefined) }); await tick();
  assert.match(text(c.panel()), /Club administration/);
  nodes(c.render()).find(n => n.type === 'ScrollView' && n.props.refreshControl).props.refreshControl.props.onRefresh(); c.render();
  c.requests[2].resolve({ data: c.answer(2) }); await tick(); assert.match(text(c.panel()), /Managing 2 Groups/);
});
test('menu follows approved order with descriptions, chevrons and accessible wrapping rows', async () => {
  const c = setup(); await c.ready(); c.open();
  const rows = nodes(c.panel()).filter(n => n.type === 'TouchableOpacity' && !['Close account panel', 'View full-size profile photo'].includes(n.props.accessibilityLabel));
  assert.deepEqual(rows.map(n => n.props.accessibilityLabel), ['My Profile', 'Notification Preferences', 'Privacy Policy', 'Contact Us', 'About Clubvel', 'Sign Out', 'Delete My Account']);
  const descriptions = ['Photo, personal details and account', 'Choose which Clubvel alerts you receive', 'How Clubvel protects your information', 'Get help with Clubvel', 'Information about Clubvel'];
  rows.slice(0, 5).forEach((row, i) => {
    assert.ok(text(row).includes(descriptions[i]));
    assert.ok(nodes(row).some(n => n.type === 'Ionicons' && n.props.name === 'chevron-forward'));
  });
  for (const row of rows) {
    assert.ok(style(row).minHeight >= 48); assert.equal(style(row).height, undefined);
    for (const label of nodes(row).filter(n => n.type === 'Text')) { assert.equal(label.props.numberOfLines, undefined); assert.notEqual(label.props.allowFontScaling, false); }
  }
});
test('Close X, backdrop and Android Back dismiss only the account panel', async () => {
  const c = setup(); await c.ready();
  for (const label of ['Close account panel', 'Close account panel backdrop']) {
    c.open(); assert.equal(c.accountModal().props.visible, true); c.action(label).props.onPress(); assert.equal(c.accountModal().props.visible, false);
  }
  c.open(); c.accountModal().props.onRequestClose(); assert.equal(c.accountModal().props.visible, false);
  assert.deepEqual(c.routes, []); assert.deepEqual(c.counts(), { logouts: 0, clears: 0 });
});
test('every original Treasurer destination still closes the panel and uses the same route', async () => {
  const c = setup(); await c.ready();
  for (const [label, destination] of [['My Profile', 'profile'], ['Notification Preferences', 'notifications'], ['Privacy Policy', 'privacy'], ['Contact Us', 'support'], ['About Clubvel', 'about']]) {
    c.open(); c.action(label).props.onPress(); assert.equal(c.routes.at(-1), `/(treasurer)/${destination}`); assert.equal(c.accountModal().props.visible, false);
  }
});
test('Sign Out still confirms before logout and retains auth replacement route', async () => {
  const c = setup(); await c.ready(); c.open(); await c.action('Sign Out').props.onPress();
  assert.equal(c.accountModal().props.visible, false); assert.equal(c.alerts.at(-1)[0], 'Sign Out');
  assert.deepEqual(c.counts(), { logouts: 0, clears: 0 }); assert.deepEqual(c.routes, []);
  assert.ok(c.alerts.at(-1)[2].some(n => n.text === 'Cancel'));
  await c.alerts.at(-1)[2].find(n => n.text === 'Sign Out').onPress();
  assert.equal(c.counts().logouts, 1); assert.deepEqual(c.routes, ['/auth']);
});
test('Delete retains confirmation/cancellation and authenticated original deletion flow', async () => {
  const c = setup(); await c.ready(); c.open(); c.action('Delete My Account').props.onPress();
  assert.equal(c.accountModal().props.visible, false);
  const deletion = () => nodes(c.render()).find(n => n.type === 'Modal' && text(n).includes('Delete Your Account?'));
  assert.equal(deletion().props.visible, true); assert.equal(c.deletes.length, 0);
  nodes(deletion()).find(n => n.type === 'TouchableOpacity' && text(n) === 'Cancel').props.onPress(); assert.equal(deletion().props.visible, false);
  c.open(); c.action('Delete My Account').props.onPress();
  await nodes(deletion()).find(n => n.type === 'TouchableOpacity' && text(n) === 'Delete My Account').props.onPress();
  assert.equal(c.deletes.length, 1); assert.ok(c.deletes[0].url.endsWith('/api/user/delete-account'));
  assert.equal(c.deletes[0].options.headers.Authorization, 'Bearer session'); assert.equal(c.deletes[0].options.timeout, 15000);
  assert.deepEqual(c.deletes[0].options.data, { user_id: 'admin', confirmation: 'DELETE' });
  assert.equal(c.counts().clears, 1); assert.equal(deletion().props.visible, false);
  c.alerts.at(-1)[2].find(n => n.text === 'OK').onPress(); assert.equal(c.counts().logouts, 1); assert.equal(c.routes.at(-1), '/');
});
test('Approved account panels, header styles and existing security/action handlers remain unchanged', () => {
  const root = path.join(__dirname, '../..');
  const baseline = name => cp.execFileSync('git', ['show', `e74ebcf3fe2603564ccc0691dde1959cc85690a4:frontend/${name}`], { cwd: root, encoding: 'utf8' });
  for (const name of ['components/MonthlyReport.tsx']) {
    assert.equal(fs.readFileSync(path.join(root, 'frontend', name), 'utf8'), baseline(name));
  }
  const current = fs.readFileSync(path.join(root, 'frontend', file), 'utf8'), previous = baseline(file);
  const handlers = source => {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), found = {};
    const names = ['handleLogout', 'handleDeleteAccount', 'navigateToProfile', 'navigateToNotifications', 'navigateToSupport', 'navigateToPrivacy', 'navigateToAbout', 'handleCreateClub', 'handleRemindMember'];
    const walk = node => { if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast))) found[node.name.getText(ast)] = node.initializer.getText(ast); ts.forEachChild(node, walk); };
    walk(ast); assert.equal(Object.keys(found).length, names.length); return found;
  };
  assert.deepEqual(handlers(current), handlers(previous));
  const styles = source => new Function('StyleSheet', 'Colors', source.slice(source.indexOf('const styles = StyleSheet.create(')) + '; return styles;')(native.StyleSheet, colors);
  const oldStyles = styles(previous), newStyles = styles(current);
  for (const [name, value] of Object.entries(oldStyles)) {
    if (name !== 'modalOverlay' && !name.startsWith('dropdown') && !['header','brandName','avatar','avatarImage','accountToolbar','accountTitle'].includes(name)) assert.deepEqual(newStyles[name], value, name);
  }

  const checkpoint = name => cp.execFileSync('git', ['show', `0d2fdf99c00a2647953fc8f6706b6b52415cd1a1:frontend/${name}`], { cwd: root, encoding: 'utf8' });
  for (const [name, marker, endMarker] of [['app/(member)/home.tsx', '    {/* Member Account Panel */}', '    {/* Delete'], [file, '    {/* Admin Account Panel */}', '    {/* Create']]) {
    const before = checkpoint(name), after = fs.readFileSync(path.join(root, 'frontend', name), 'utf8');
    const panel = source => { const start = source.indexOf(marker); assert.ok(start >= 0); const end = source.indexOf(endMarker, start + marker.length); return source.slice(source.indexOf('<View style={styles.dropdownDivider}', start), end < 0 ? source.indexOf('const styles =', start) : end); };
    assert.equal(panel(after), panel(before));
  }
});

test('Member/Admin Clubvel menu has continuous charcoal identity, white menu and expandable 112px photo',async()=>{
 const c=setup();await c.ready();c.open();const panel=c.panel();
 const toolbar=nodes(panel).find(n=>n.type==='View'&&style(n).paddingLeft===24);
 assert.equal(style(toolbar).backgroundColor,'primary');
 const title=nodes(panel).find(n=>n.type==='Text'&&text(n)==='Clubvel');assert.equal(style(title).color,'white');assert.equal(style(title).fontSize,24);
 const name=nodes(panel).find(n=>n.type==='Text'&&text(n)===c.auth.user.full_name);assert.equal(style(name).color,'white');assert.equal(style(name).textAlign,'center');
 assert.equal(style(panel).backgroundColor,'white');
 const photo=nodes(panel).find(n=>n.props?.accessibilityLabel==='View full-size profile photo');photo.props.onPress();assert.ok(!c.accountModal() || c.accountModal().props.visible === false);assert.equal(nodes(c.render()).find(n=>n.props?.photoUri===c.auth.user.profile_photo && typeof n.props?.onClose==='function').props.visible,true);
});
