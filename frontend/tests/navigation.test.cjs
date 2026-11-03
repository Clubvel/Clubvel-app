const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, engine, tick, nodes, text, button, native, colors } = require('./ui-harness.cjs');

function screenHarness(screen, options = {}) {
  const e = engine(); const calls = [], routes = [], warnings = [];
  const auth = { user: { id: 'person', full_name: 'Person' }, token: 'actual-jwt', logout: async () => {}, updateProfilePhoto: async () => {} };
  let params = options.showClubs ? { showClubs: 'true' } : {};
  const router = { push: route => routes.push(route), setParams: value => { params = value; } };
  const workspace = { clubs: [], membershipError: null, selectGroup: async () => {}, refreshMemberships: async () => { calls.push(['memberships']); return workspace.clubs; } };
  let respond = async url => {
    if (url.includes('/stats/')) return { data: { total_saved: 0, on_time_percentage: 0, date_joined: null } };
    if (url.includes('/alerts/')) return { data: { alerts: [] } };
    return { data: { contribution_reminders: false, claim_updates: false, group_announcements: false } };
  };
  const axios = { get: (...args) => { calls.push(args); return respond(...args); }, put: async (...args) => { calls.push(['PUT', ...args]); return {}; } };
  const Screen = load(`app/(${options.role || 'member'})/${screen}.tsx`, {
    react: e.react, 'react-native': { ...native, Switch: 'Switch', RefreshControl: 'RefreshControl', TextInput: 'TextInput', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' },
      Alert: { alert: (...args) => warnings.push(args) }, Linking: { openURL: async url => calls.push(['email', url]) } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0 }) },
    'expo-router': { useRouter: () => router, useLocalSearchParams: () => params },
    '../../contexts/AuthContext': { useAuth: () => auth }, '../../contexts/WorkspaceContext': { useWorkspace: () => workspace },
    '../../constants/Colors': { Colors: colors }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-image-picker': {}, axios, 'date-fns': { format: () => '12:00' },
    '../../hooks/usePersonalClaims': { usePersonalClaims: () => ({ records: [], phase: 'empty', reload: async () => {} }) },
  }).default;
  return { ...e, calls, routes, auth, workspace, warnings, respond: fn => { respond = fn; }, render: () => e.render(Screen) };
}

test('Profile via My Clubs issues one stats request; clubs and menus do not wait for stats', async () => {
  const h = screenHarness('profile', { showClubs: true }); let finish;
  h.respond(() => new Promise(resolve => { finish = resolve; }));
  h.render(); const pending = h.render();
  assert.equal(h.calls.filter(([url]) => url.includes('/stats/')).length, 1);
  assert.equal(h.calls.filter(([url]) => url === 'memberships').length, 1);
  assert.equal(text(button(pending, 'My Clubs')), 'My Clubs0');
  assert.ok(text(pending).includes('No Clubs Available'));
  button(pending, 'Privacy Policy').props.onPress(); assert.equal(h.routes[0], '/(member)/privacy');
  finish({ data: { total_saved: 0, on_time_percentage: 0 } }); await tick();
  assert.ok(text(h.render()).includes('R0,00'));
  const request = h.calls.find(([url]) => url.includes('/stats/'));
  assert.equal(request[1].headers.Authorization, 'Bearer actual-jwt'); assert.equal(request[1].timeout, 15000);
});

test('Profile displays real zero clubs, loading, and failure distinctly without a large wrapping error value', async () => {
  const h = screenHarness('profile');
  h.workspace.clubs = null; h.render(); let tree = h.render();
  assert.equal(text(button(tree, 'My Clubs')), 'My ClubsLoading…');
  h.workspace.membershipError = 'offline'; tree = h.render();
  assert.equal(text(button(tree, 'My Clubs')), 'My ClubsUnavailable');
  const unavailable = nodes(tree).find(n => n.props.accessibilityLabel === 'Clubs unavailable');
  assert.equal(text(unavailable), '—');
  h.workspace.membershipError = null; h.workspace.clubs = []; tree = h.render();
  assert.equal(text(button(tree, 'My Clubs')), 'My Clubs0');
});

test('Profile statistics error and invalid payload never fabricate zero savings', async () => {
  for (const response of [new Error('offline'), { data: {} }]) {
    const h = screenHarness('profile'); h.respond(async () => { if (response instanceof Error) throw response; return response; });
    h.render(); await tick(); const tree = h.render();
    assert.ok(text(tree).includes('Could not load your statistics'));
    assert.ok(!text(tree).includes('R0,00'));
  }
});

test('Alerts header appears before network completion and failed requests never appear as no alerts', async () => {
  const h = screenHarness('alerts'); let reject;
  h.respond(() => new Promise((_, fail) => { reject = fail; }));
  const initial = h.render(); assert.ok(text(initial).includes('Alerts')); assert.ok(!text(initial).includes('No alerts'));
  assert.equal(h.calls[0][1].headers.Authorization, 'Bearer actual-jwt'); assert.equal(h.calls[0][1].timeout, 15000);
  reject(new Error('offline')); await tick(); let tree = h.render();
  assert.ok(text(tree).includes('Unable to load alerts')); assert.ok(!text(tree).includes('No alerts'));
  h.respond(async () => ({ data: { alerts: [] } })); button(tree, 'Tap to retry').props.onPress(); await tick();
  assert.ok(text(h.render()).includes('No alerts'));
});

test('malformed alert dates are an error, not a render crash or invented empty list', async () => {
  const h = screenHarness('alerts'); h.respond(async () => ({ data: { alerts: [{ id: 'a', created_at: 'bad', alert_message: 'message' }] } }));
  h.render(); await tick(); assert.ok(text(h.render()).includes('Unable to load alerts'));
});

for (const role of ['member', 'treasurer']) test(`${role} preferences header/back remain available; failed reads cannot overwrite settings`, async () => {
  const h = screenHarness('notifications', { role }); let reject;
  h.respond(() => new Promise((_, fail) => { reject = fail; }));
  assert.ok(text(h.render()).includes('Notification Preferences'));
  reject(new Error('offline')); await tick(); let tree = h.render();
  assert.equal(nodes(tree).filter(n => n.type === 'Switch').length, 0);
  assert.ok(text(tree).includes('Unable to load preferences'));
  h.respond(async () => ({ data: { contribution_reminders: true, claim_updates: false, group_announcements: false } }));
  button(tree, 'Tap to retry').props.onPress(); await tick(); tree = h.render();
  const toggle = nodes(tree).find(n => n.type === 'Switch'); assert.equal(toggle.props.value, true);
  await toggle.props.onValueChange(false);
  assert.equal(h.calls.find(([kind]) => kind === 'PUT')[3].headers.Authorization, 'Bearer actual-jwt');
});

test('Contact Us and Privacy open without data requests', () => {
  for (const screen of ['support', 'privacy']) {
    const h = screenHarness(screen); const tree = h.render();
    assert.ok(text(tree).includes(screen === 'support' ? 'Contact Us' : 'Privacy Policy'));
    assert.equal(h.calls.length, 0);
  }
});
