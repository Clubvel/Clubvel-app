const test = require('node:test');
const assert = require('node:assert/strict');
const { load, engine, tick, nodes, text, button, native, colors } = require('./ui-harness.cjs');

function setup(screen = 'member') {
  const ui = engine(), requests = [], routes = [];
  const auth = { user: { id: 'member', full_name: 'Test Member', first_name: 'Test' }, token: 'session' };
  const Screen = load(screen === 'member' ? 'app/(member)/home.tsx' : 'app/(treasurer)/dashboard.tsx', {
    react: ui.react,
    'react-native': { ...native, RefreshControl: 'RefreshControl', TextInput: 'TextInput',
      KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' },
      Keyboard: { dismiss() {} }, TouchableWithoutFeedback: 'TouchableWithoutFeedback' },
    'expo-router': { useFocusEffect: ui.useFocusEffect, useRouter: () => ({ push: r => routes.push(r) }) },
    '../../contexts/AuthContext': { useAuth: () => auth },
    '../../components/StatusPill': { StatusPill: 'StatusPill' },
    '../../components/AdBanner': { AdBanner: 'AdBanner' },
    '../../constants/Colors': { Colors: colors }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '@react-native-async-storage/async-storage': {},
    axios: { get: url => url.includes('/invitations/') ? Promise.resolve({ data: { invitations: [] } })
      : new Promise(resolve => requests.push({ url, resolve })) },
  }).default;
  const render = () => ui.render(Screen);
  const respond = async (index, name, role = 'member') => {
    requests[index].resolve({ data: { user: auth.user,
      summary: { total_saved: 0, active_clubs: 1, overdue_contributions: 0, upcoming_payments: 0, claims_count: 0 },
      clubs: [{ id: 'group-a', name, role, member_count: 2, monthly_contribution: 100, status: 'pending' }] } });
    await tick();
  };
  const refresh = () => nodes(render()).find(n => n.type === 'ScrollView').props.refreshControl.props.onRefresh();
  render();
  return { ui, render, requests, routes, respond, refresh };
}

test('initial Home load uses the existing dashboard endpoint once', async () => {
  const c = setup();
  assert.equal(c.requests.length, 1);
  assert.ok(c.requests[0].url.endsWith('/api/member/dashboard/member'));
  await c.respond(0, 'WeTravel');
  assert.ok(text(c.render()).includes('WeTravel'));
  c.render(); assert.equal(c.requests.length, 1);
});

test('returning to Home replaces WeTravel with the authoritative renamed club', async () => {
  const c = setup(); await c.respond(0, 'WeTravel'); c.render();
  c.ui.blur(); c.ui.focus();
  assert.equal(c.requests.length, 2);
  await c.respond(1, 'WeTraveling');
  assert.ok(text(c.render()).includes('WeTraveling'));
});

test('pull-to-refresh still retrieves the latest name', async () => {
  const c = setup(); await c.respond(0, 'WeTravel');
  c.refresh(); await c.respond(1, 'WeTraveling');
  assert.ok(text(c.render()).includes('WeTraveling'));
});

test('a slower older dashboard response cannot overwrite a newer refresh', async () => {
  const c = setup(); await c.respond(0, 'WeTravel');
  c.refresh(); c.refresh();
  await c.respond(2, 'WeTraveling');
  await c.respond(1, 'WeTravel');
  assert.ok(text(c.render()).includes('WeTraveling'));
});

test('focus during an existing refresh reuses its request', async () => {
  const c = setup(); await c.respond(0, 'WeTravel');
  c.refresh(); c.ui.blur(); c.ui.focus();
  assert.equal(c.requests.length, 2);
  await c.respond(1, 'WeTraveling');
  assert.ok(text(c.render()).includes('WeTraveling'));
});

test('member and administrator club navigation remains unchanged', async () => {
  const c = setup(); await c.respond(0, 'WeTraveling');
  button(c.render(), 'WeTraveling').props.onPress();
  assert.deepEqual(c.routes, ['/(member)/club/group-a']);
  c.refresh(); await c.respond(1, 'WeTraveling', 'admin');
  button(c.render(), 'WeTraveling').props.onPress();
  assert.deepEqual(c.routes[1], { pathname: '/(treasurer)/club-detail',
    params: { id: 'group-a', name: 'WeTraveling', from: 'member' } });
});

test('Home displays its existing header while the first dashboard response is unresolved', async () => {
  const c = setup();
  assert.match(text(c.render()), /Clubvel/);
  assert.ok(nodes(c.render()).some(n => n.type === 'ActivityIndicator'));
  await c.respond(0, 'WeTraveling');
  assert.match(text(c.render()), /WeTraveling/);
});

test('Admin Home displays its existing header before dashboard data arrives', async () => {
  const c = setup('admin');
  assert.match(text(c.render()), /Clubvel/);
  assert.ok(nodes(c.render()).some(n => n.type === 'ActivityIndicator'));
  assert.equal(c.requests.length, 1);
  assert.match(c.requests[0].url, /\/api\/admin\/dashboard\/member$/);
  c.requests[0].resolve({ data: { summary: { total_clubs: 0, total_members: 0 }, clubs: [], urgent_alerts: [], next_claim: null } });
  await tick();
  assert.match(text(c.render()), /Create a Group/);
});
