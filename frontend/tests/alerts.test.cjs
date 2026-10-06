const test = require('node:test');
const assert = require('node:assert/strict');
const { load, engine, tick, nodes, text, button, native, colors } = require('./ui-harness.cjs');

function setup() {
  const ui = engine(), requests = [];
  const auth = { user: { id: 'member' }, token: 'signed-session' };
  const Screen = load('app/(member)/alerts.tsx', {
    react: ui.react,
    'react-native': { ...native, RefreshControl: 'RefreshControl' },
    'expo-router': { useFocusEffect: ui.useFocusEffect, useRouter: () => ({ push() {} }) },
    '../../contexts/AuthContext': { useAuth: () => auth },
    '../../constants/Colors': { Colors: colors }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'date-fns': { format: () => '10:00' },
    axios: { get: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })) },
  }).default;
  const render = () => ui.render(Screen);
  const respond = async (i, message) => {
    requests[i].resolve({ data: { alerts: message ? [{ id: String(i), alert_message: message,
      alert_type: 'payment_reminder', created_at: new Date().toISOString(), read_status: false }] : [] } });
    await tick();
  };
  const refresh = () => nodes(render()).find(n => n.type === 'ScrollView').props.refreshControl.props.onRefresh();
  const initial = render();
  return { ui, requests, auth, render, respond, refresh, initial };
}

test('Alerts initial load sends signed bearer token and shows genuine empty state only after success', async () => {
  const c = setup(); assert.ok(nodes(c.initial).some(n => n.type === 'ActivityIndicator'));
  assert.equal(c.requests[0].url.endsWith('/api/alerts/member'), true);
  assert.equal(c.requests[0].options.headers.Authorization, 'Bearer signed-session');
  assert.doesNotMatch(text(c.initial), /No alerts/);
  await c.respond(0); assert.match(text(c.render()), /No alerts/);
});

test('Alerts failure and Retry never report that the member is caught up', async () => {
  const c = setup(); c.requests[0].reject(new Error('Network failure')); await tick();
  assert.match(text(c.render()), /Unable to load alerts/);
  assert.doesNotMatch(text(c.render()), /No alerts|caught up/);
  button(c.render(), 'Retry').props.onPress(); await c.respond(1, 'Proof declined');
  assert.match(text(c.render()), /Proof declined/);
});

test('focus refresh retains content and shares requests already in flight', async () => {
  const c = setup(); c.ui.blur(); c.ui.focus(); assert.equal(c.requests.length, 1);
  await c.respond(0, 'Old alert'); c.render(); c.ui.blur(); c.ui.focus();
  assert.equal(c.requests.length, 2); assert.match(text(c.render()), /Old alert/);
  c.ui.blur(); c.ui.focus(); assert.equal(c.requests.length, 2);
  await c.respond(1, 'New reminder'); assert.match(text(c.render()), /New reminder/);
});

test('pull refresh supersedes an older Alerts response', async () => {
  const c = setup(); await c.respond(0, 'Initial');
  c.ui.blur(); c.ui.focus(); c.refresh();
  await c.respond(2, 'Newest'); await c.respond(1, 'Stale');
  assert.match(text(c.render()), /Newest/); assert.doesNotMatch(text(c.render()), /Stale/);
});

test('an older failure cannot replace the newest successful Alerts response', async () => {
  const c = setup(); await c.respond(0, 'Initial'); c.refresh(); c.refresh();
  await c.respond(2, 'Newest'); c.requests[1].reject(new Error('Old failure')); await tick();
  assert.match(text(c.render()), /Newest/); assert.doesNotMatch(text(c.render()), /Unable to load/);
});

test('changing account cannot display the previous member alerts or accept their late response', async () => {
  const c = setup(); await c.respond(0, 'Private old account'); c.refresh();
  c.auth.user = { id: 'other' }; c.auth.token = 'other-session'; c.render();
  await c.respond(2, 'Other account'); await c.respond(1, 'Private stale account');
  assert.match(text(c.render()), /Other account/); assert.doesNotMatch(text(c.render()), /Private/);
  assert.equal(c.requests[2].options.headers.Authorization, 'Bearer other-session');
});

test('missing session makes no unauthenticated Alerts request and shows an error', async () => {
  const c = setup(); c.auth.token = null; c.render();
  assert.equal(c.requests.length, 1); assert.match(text(c.render()), /Please sign in again/);
  await c.respond(0, 'Private'); assert.doesNotMatch(text(c.render()), /Private|No alerts/);
});
