const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, engine, tick, nodes, text, native, colors } = require('./ui-harness.cjs');
function setup(from = 'member') {
  const ui = engine(), requests = [], routes = [], auth = { user: { id: 'jimmy' }, token: 'session-a', loading: false }, params = { id: 'travel', from };
  const Screen = load('app/club/[id].tsx', {
    react: ui.react, 'react-native': native, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
    'expo-router': { Redirect: 'Redirect', useFocusEffect: ui.useFocusEffect, useLocalSearchParams: () => params, useRouter: () => ({ push: route => routes.push(route), replace: route => routes.push(route) }) },
    axios: { get: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })) },
    '../../contexts/AuthContext': { useAuth: () => auth }, '../../constants/Colors': { Colors: colors },
  }).default;
  const render = () => ui.render(Screen);
  const tap = label => nodes(render()).find(n => n.props?.accessibilityLabel === label).props.onPress();
  const reply = async (index, id = params.id, role = 'member', amount = 100, count = 1) => {
    requests[index].resolve({ data: { club: { id, name: id === 'travel' ? 'WeTraveling' : 'Eighty8' }, membership: { id: id + '-member', role, status: 'active' }, clubs: [{ id: 'travel', name: 'WeTraveling' }, { id: 'eight', name: 'Eighty8' }], period: { month: 10, year: 2026, timezone: 'Africa/Johannesburg' }, record_count: count, own_financial_summary: { total_expected: amount, collected: amount, outstanding: 0, awaiting_confirmation: 0 }, availability: { total_expected: amount === null ? 'UNAVAILABLE' : 'AVAILABLE', collected: amount === null ? 'UNAVAILABLE' : 'AVAILABLE', outstanding: 'AVAILABLE', awaiting_confirmation: 'AVAILABLE' } } });
    await tick(); return render();
  };
  render(); return { ui, requests, routes, auth, params, render, tap, reply };
}
test('Member Club Home loads one authenticated context and only own financial position', async () => {
  const c = setup(); await c.reply(0); assert.equal(c.requests.length, 1); assert.ok(c.requests[0].url.endsWith('/api/groups/travel/context')); assert.equal(c.requests[0].options.headers.Authorization, 'Bearer session-a');
  assert.match(text(c.render()), /WeTraveling/); assert.match(text(c.render()), /Confirmed Collected: R100.00/); assert.doesNotMatch(text(c.render()), /Club management|Announcements|Events|Documents/);
  c.ui.focus(); assert.equal(c.requests.length, 2); c.ui.focus(); assert.equal(c.requests.length, 2);
});
test('Admin entry points depend on the selected membership role, not account identity', async () => {
  const c = setup('admin'); await c.reply(0, 'travel', 'member'); assert.doesNotMatch(text(c.render()), /Manage club/);
  c.params.id = 'eight'; c.render(); await c.reply(1, 'eight', 'treasurer'); assert.match(text(c.render()), /Manage club/); c.tap('Review Payments'); assert.deepEqual(c.routes.at(-1), { pathname: '/(treasurer)/contributions', params: { groupId: 'eight' } });
});
test('Member destinations preserve selected club and obligation period where supported', async () => {
  const c = setup(); await c.reply(0); c.tap('My Contributions'); assert.deepEqual(c.routes.at(-1), { pathname: '/(member)/club/[id]', params: { id: 'travel', month: '10', year: '2026', contribution_id: '', scope: 'club', from: 'member' } });
  c.tap('Members'); assert.deepEqual(c.routes.at(-1), { pathname: '/club/[id]/members', params: { id: 'travel', from: 'member' } }); c.tap('Payments and Proofs'); assert.equal(c.routes.at(-1).params.group_id, 'travel'); assert.equal(c.routes.at(-1).params.month, '10');
  c.tap('Payouts and Claims'); assert.equal(c.routes.at(-1), '/(member)/claims'); assert.match(text(c.render()), /across your active clubs/);
});
test('Admin management destinations carry the current club and existing routes remain usable', async () => {
  const c = setup('admin'); await c.reply(0, 'travel', 'admin');
  for (const [label, route, key] of [['Manage club', '/(treasurer)/club-detail', 'id'], ['Manage Members', '/(treasurer)/members', 'groupId'], ['Manage Claims and Payouts', '/(treasurer)/claims', 'groupId'], ['Reports', '/(treasurer)/reports', 'group_id']]) { c.tap(label); assert.equal(c.routes.at(-1).pathname, route); assert.equal(c.routes.at(-1).params[key], 'travel'); if (label === 'Manage club') assert.equal(c.routes.at(-1).params.from, 'club'); }
});
test('club switch masks the old club immediately and invalidates an in-flight refresh', async () => {
  const c = setup(); await c.reply(0); c.tap('Refresh Club Home'); c.tap('Open Eighty8'); assert.doesNotMatch(text(c.render()), /WeTraveling|R100/); await c.reply(1, 'travel'); assert.doesNotMatch(text(c.render()), /WeTraveling|R100/);
  c.params.id = 'eight'; c.render(); await c.reply(2, 'eight'); assert.match(text(c.render()), /Eighty8/);
});
test('rapid A-B-A switching rejects older responses even with the same club ID', async () => {
  const c = setup(); c.params.id = 'eight'; c.render(); c.params.id = 'travel'; c.render(); await c.reply(2, 'travel', 'member', 300); await c.reply(1, 'eight', 'admin', 999); await c.reply(0, 'travel', 'admin', 777);
  assert.equal(nodes(c.render()).find(n => n.type === 'Text' && n.props.style?.fontSize === 24).props.children[0], 'WeTraveling'); assert.match(text(c.render()), /R300.00/); assert.doesNotMatch(text(c.render()), /R999|R777|Manage club/);
});
test('account and token changes immediately mask previous context and stale responses', async () => {
  const c = setup(); await c.reply(0); c.tap('Refresh Club Home'); c.auth.user = { id: 'brown' }; c.auth.token = 'session-b'; assert.doesNotMatch(text(c.render()), /WeTraveling|R100/); await c.reply(1, 'travel', 'admin', 888); assert.doesNotMatch(text(c.render()), /R888|Manage club/); await c.reply(2, 'travel', 'member', 200); assert.match(text(c.render()), /R200.00/);
});
test('revocation failure clears financial information and exposes a bounded retry', async () => {
  const c = setup(); await c.reply(0); c.ui.blur(); c.ui.focus(); c.requests[1].reject({ response: { status: 403 } }); await tick(); assert.doesNotMatch(text(c.render()), /WeTraveling|R100/); assert.match(text(c.render()), /active membership/); c.tap('Retry Club Home'); await c.reply(2); assert.match(text(c.render()), /WeTraveling/);
});
test('unavailable financial information is never rendered as an invented zero', async () => {
  const c = setup(); await c.reply(0, 'travel', 'member', null); assert.match(text(c.render()), /Confirmed Collected: Unavailable/); assert.doesNotMatch(text(c.render()), /Confirmed Collected: R0/);
  c.tap('Refresh Club Home'); await c.reply(1, 'travel', 'member', 0, 0); assert.match(text(c.render()), /No contribution recorded for this month/);
});
test('Back returns to the originating account Home and unauthenticated users redirect', async () => {
  for (const from of ['member', 'admin']) { const c = setup(from); c.tap('Back to account Home'); assert.equal(c.routes.at(-1), from === 'admin' ? '/(treasurer)/dashboard' : '/(member)/home'); }
  const c = setup(); c.auth.user = null; c.auth.token = null; assert.equal(c.render().type, 'Redirect');
});
test('account tabs and existing financial screens are unchanged from Phase 3C', () => {
  const cp = require('node:child_process'), root = path.join(__dirname, '../..');
  for (const file of ['frontend/app/(member)/_layout.tsx', 'frontend/app/(treasurer)/_layout.tsx', 'frontend/app/(member)/claims.tsx', 'frontend/app/(treasurer)/club-detail.tsx']) assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), cp.execFileSync('git', ['show', '3aff743a88b3b128e5e9f58c6c62368e8d3df370:' + file], { cwd: root, encoding: 'utf8' }));
});
