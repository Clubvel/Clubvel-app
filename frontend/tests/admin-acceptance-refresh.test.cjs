const test = require('node:test');
const assert = require('node:assert/strict');
const { load, engine, tick, nodes, button, native, colors } = require('./ui-harness.cjs');

const invitation = { id: 'invite', group_id: 'group', group_name: 'Test Club', intended_role: 'admin' };
function setup() {
  const ui = engine(), requests = [], posts = [], alerts = [], routes = [];
  const Screen = load('app/(member)/home.tsx', {
    react: ui.react,
    'react-native': { ...native, RefreshControl: 'RefreshControl', TextInput: 'TextInput',
      KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' },
      Alert: { alert: (...args) => alerts.push(args) } },
    'expo-router': { useFocusEffect: ui.useFocusEffect, useRouter: () => ({ push: route => routes.push(route) }) },
    '../../components/ProfilePhotoViewer': { default: 'ProfilePhotoViewer' },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'recipient' }, token: 'session' }) },
    '../../components/StatusPill': { StatusPill: 'StatusPill' }, '../../components/AdBanner': { AdBanner: 'AdBanner' },
    '../../constants/Colors': { Colors: colors }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '@react-native-async-storage/async-storage': {},
    axios: { get: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })),
      post: (url, data, options) => new Promise((resolve, reject) => posts.push({ url, data, options, resolve, reject })) },
  }).default;
  const render = () => ui.render(Screen);
  const dashboard = role => ({ user: { first_name: 'Recipient', full_name: 'Recipient Test' }, summary: { total_saved: 0, active_clubs: 1 },
    clubs: [{ id: 'group', name: 'Test Club', role, member_count: 2, monthly_contribution: 100 }] });
  const pair = async (index, role, invitations = []) => {
    requests[index].resolve({ data: dashboard(role) });
    requests[index + 1].resolve({ data: { invitations } }); await tick();
  };
  const refresh = () => nodes(render()).find(n => n.type === 'ScrollView').props.refreshControl.props.onRefresh();
  render();
  return { ui, render, requests, posts, alerts, routes, pair, refresh };
}

for (const action of ['Accept', 'Decline']) {
  for (const olderFirst of [false, true]) {
    test(`${action} forces a fresh dashboard after success; older request ${olderFirst ? 'first' : 'last'} cannot win`, async () => {
      const c = setup(); await c.pair(0, 'member', [invitation]);
      c.refresh();
      const decision = button(c.render(), action).props.onPress();
      if (olderFirst) await c.pair(2, 'member', [invitation]);
      c.posts[0].resolve({ data: { admin_access: action === 'Accept' } }); await tick();
      assert.equal(c.requests.length, 6); // initial, old refresh, mandatory post-decision refresh
      await c.pair(4, action === 'Accept' ? 'admin' : 'member'); await decision;
      if (!olderFirst) await c.pair(2, 'member', [invitation]);
      assert.equal(button(c.render(), 'Accept'), undefined);
      button(c.render(), 'Test Club').props.onPress();
      assert.deepEqual(c.routes.at(-1), action === 'Accept'
        ? { pathname: '/(treasurer)/club-detail', params: { id: 'group', name: 'Test Club', from: 'member' } }
        : '/(member)/club/group');
      assert.equal(c.posts[0].options.headers.Authorization, 'Bearer session');
    });
  }
}

test('repeated refresh after promotion never permits an older response to restore Member routing', async () => {
  const c = setup(); await c.pair(0, 'member', [invitation]);
  const accepting = button(c.render(), 'Accept').props.onPress();
  c.posts[0].resolve({ data: { admin_access: true } }); await tick();
  c.refresh(); c.refresh();
  await c.pair(6, 'admin'); await c.pair(4, 'member', [invitation]);
  await c.pair(2, 'member', [invitation]); await accepting;
  assert.equal(button(c.render(), 'Accept'), undefined);
  button(c.render(), 'Test Club').props.onPress();
  assert.equal(c.routes.at(-1).pathname, '/(treasurer)/club-detail');
});

test('an old Join Group fetch cannot put the accepted invitation back', async () => {
  const c = setup(); await c.pair(0, 'member', [invitation]);
  const opening = button(c.render(), 'Join Group').props.onPress();
  const accepting = button(c.render(), 'Accept').props.onPress();
  c.posts[0].resolve({ data: { admin_access: true } }); await tick();
  await c.pair(3, 'admin'); await accepting;
  c.requests[2].resolve({ data: { invitations: [invitation] } }); await opening;
  assert.equal(button(c.render(), 'Accept'), undefined);
});

for (const outcome of ['newly_granted', 'already_granted', 'recovered', 'access_revoked', 'legacy']) {
  test(`Admin success wording follows authoritative access for ${outcome}`, async () => {
    const c = setup(); await c.pair(0, 'member', [invitation]);
    const accepting = button(c.render(), 'Accept').props.onPress();
    const active = !['access_revoked', 'legacy'].includes(outcome);
    c.posts[0].resolve({ data: outcome === 'legacy' ? {} : { admin_access: active, acceptance_outcome: outcome } });
    await tick(); await c.pair(2, active ? 'admin' : 'member'); await accepting;
    assert.equal(c.alerts.at(-1)[0], active ? 'Admin invitation accepted' : 'Invitation processed');
    assert.equal(c.alerts.at(-1)[1].includes('You are now an Admin'), active);
  });
}


for (const action of ['Accept', 'Decline']) {
  test(`${action} failure restarts the invalidated refresh and clears its spinner`, async () => {
    const c = setup(); await c.pair(0, 'member', [invitation]);
    c.refresh(); const decision = button(c.render(), action).props.onPress();
    c.posts[0].reject({ response: { data: { detail: 'Access denied' } } }); await decision;
    assert.equal(c.requests.length, 6);
    await c.pair(4, 'member', [invitation]); await c.pair(2, 'member', [invitation]);
    const scroll = nodes(c.render()).find(n => n.type === 'ScrollView');
    assert.equal(scroll.props.refreshControl.props.refreshing, false);
    assert.equal(c.alerts.at(-1)[0], action === 'Accept' ? 'Could not accept invitation' : 'Could not decline invitation');
    assert.ok(button(c.render(), 'Accept'));
  });
}
