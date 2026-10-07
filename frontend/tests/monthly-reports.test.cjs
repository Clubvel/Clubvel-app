const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { load, engine, tick, nodes, text, button, native, colors } = require('./ui-harness.cjs');
const helpers = load('services/monthlyReport.ts');
function setup(contextualClubId = 'second') {
  const ui = engine(), requests = [];
  const props = { clubs: [{ id: 'first', name: 'First Club' }, { id: 'second', name: 'Second Club' }], token: 'session', contextualClubId, refreshKey: 0 };
  const Screen = load('components/MonthlyReport.tsx', {
    react: ui.react, 'react-native': { ...native, TextInput: 'TextInput' },
    'expo-router': { useFocusEffect: ui.useFocusEffect }, '../constants/Colors': { Colors: colors },
    '../services/monthlyReport': helpers,
    axios: { isAxiosError: () => false, get: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })) },
  }).default;
  const render = () => ui.render(() => Screen(props));
  const initial = render();
  const answer = (request, extra = {}) => ({ schema_version: 1, club: { id: request.url.split('/').at(-2), name: 'Second Club' },
    period: { ...request.options.params, timezone: 'Africa/Johannesburg' }, generated_at: '2026-10-01T10:00:00Z', basis: 'Recorded obligations',
    summary: { expected: 100, confirmed: 0, outstanding: 100, awaiting_review: 100,
      claims_submitted_count: 0, claims_submitted_amount: 0, claims_approved_count: 0, claims_approved_amount: 0, actual_payouts: 0, current_commitments: 0 },
    contributions: [], claim_activity: { submitted: [], approved: [] }, payout_payments: [], current_commitments: [], warnings: [], unallocated_activity: [], empty_period: false, ...extra });
  const action = label => nodes(render()).find(n => n.type === 'TouchableOpacity' && n.props.accessibilityLabel === label);
  return { props, ui, requests, initial, render, answer, action };
}
test('month navigation crosses both year boundaries and Johannesburg defaults use local month', () => {
  assert.deepEqual(helpers.moveReportMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
  assert.deepEqual(helpers.moveReportMonth({ year: 2027, month: 1 }, -1), { year: 2026, month: 12 });
  assert.deepEqual(helpers.currentReportPeriod(new Date('2026-12-31T22:30:00Z')), { year: 2027, month: 1 });
  assert.equal(helpers.reportRand(5500), 'R5,500.00');
});
test('initial load selects contextual club, bearer header, bounded timeout and selected period', async () => {
  const c = setup(); const r = c.requests[0];
  assert.match(r.url, /reports\/second\/monthly$/); assert.equal(r.options.headers.Authorization, 'Bearer session'); assert.equal(r.options.timeout, 20000);
  r.resolve({ data: c.answer(r, { club: { id: 'second', name: 'Authoritative club name' } }) }); await tick();
  assert.match(text(c.render()), /Authoritative club name/);
  assert.match(text(c.render()), /ContributionsExpectedR100.00ConfirmedR0.00/);
  assert.match(text(c.render()), /Awaiting review is included in outstanding/);
});
test('no contextual managed club defaults to first managed club', () => {
  assert.match(setup('unmanaged').requests[0].url, /reports\/first\/monthly$/);
});
test('direct month/year selection drives the actual selected report request', async () => {
  const c = setup(); c.action('Select report month and year').props.onPress();
  nodes(c.render()).find(n => n.type === 'TextInput').props.onChangeText('2024');
  button(c.render(), 'September').props.onPress(); c.render();
  assert.deepEqual(c.requests.at(-1).options.params, { year: 2024, month: 9 });
});
test('rapid switching never displays an old response beneath new period, including before effects finish', async () => {
  const c = setup(); const older = c.requests[0];
  older.resolve({ data: c.answer(older, { summary: { ...c.answer(older).summary, expected: 111 } }) }); await tick();
  assert.match(text(c.render()), /R111.00/);
  c.action('Next report month').props.onPress(); assert.doesNotMatch(text(c.render()), /R111.00/);
  const middle = c.requests.at(-1); c.action('Next report month').props.onPress(); c.render(); const newer = c.requests.at(-1);
  newer.resolve({ data: c.answer(newer, { summary: { ...c.answer(newer).summary, expected: 333 } }) }); await tick();
  middle.resolve({ data: c.answer(middle, { summary: { ...c.answer(middle).summary, expected: 222 } }) }); await tick();
  assert.match(text(c.render()), /R333.00/); assert.doesNotMatch(text(c.render()), /R222.00/);
});
test('club selection refetches one club and rejects the previous club response', async () => {
  const c = setup(); c.action('Select report club').props.onPress(); button(c.render(), 'First Club').props.onPress(); c.render();
  const newer = c.requests.at(-1); newer.resolve({ data: c.answer(newer) }); await tick();
  c.requests[0].resolve({ data: c.answer(c.requests[0], { summary: { ...c.answer(c.requests[0]).summary, expected: 999 } }) }); await tick();
  assert.doesNotMatch(text(c.render()), /R999.00/); assert.match(newer.url, /reports\/first\/monthly$/);
});
test('empty period still displays current commitments independently', async () => {
  const c = setup(); const r = c.requests[0]; r.resolve({ data: c.answer(r, { empty_period: true, summary: { ...c.answer(r).summary, current_commitments: 600 } }) }); await tick();
  assert.match(text(c.render()), /No recorded activity or obligations for Second Club/);
  assert.match(text(c.render()), /CURRENT Approved \/ Unpaid PayoutsR600.00/);
  assert.doesNotMatch(text(c.render()), /Opening Balance|Closing Balance|Available Cash/);
});
test('error ends loading, offers retry, and matching successful response recovers', async () => {
  const c = setup(); c.requests[0].reject(new Error('Offline')); await tick();
  assert.match(text(c.render()), /Offline/); assert.equal(nodes(c.render()).some(n => n.type === 'ActivityIndicator'), false);
  button(c.render(), 'Retry monthly report').props.onPress(); const r = c.requests.at(-1); r.resolve({ data: c.answer(r) }); await tick();
  assert.match(text(c.render()), /Contributions/); assert.doesNotMatch(text(c.render()), /Offline/);
});
test('wrong period response is rejected instead of mislabelled', async () => {
  const c = setup(); const r = c.requests[0]; r.resolve({ data: c.answer(r, { period: { year: 1900, month: 1 } }) }); await tick();
  assert.match(text(c.render()), /Unexpected monthly report response/);
});
test('focus refresh and pull-refresh signal fetch again, obsolete account data is hidden', async () => {
  const c = setup(); c.ui.blur(); c.ui.focus(); assert.equal(c.requests.length, 2);
  c.props.refreshKey++; c.render(); assert.equal(c.requests.length, 3);
  c.props.token = 'another-session'; c.render(); assert.equal(c.requests.length, 4);
  c.requests[2].resolve({ data: c.answer(c.requests[2], { summary: { ...c.answer(c.requests[2]).summary, expected: 999 } }) }); await tick();
  assert.doesNotMatch(text(c.render()), /R999.00/);
});
test('contribution rows remain individually expandable and historical warnings are visible', async () => {
  const c = setup(), r = c.requests[0]; const row = { member_name: 'Member', member_id: 'member', expected: 100, confirmed: 0, outstanding: 100, status: 'pending', proof_review_status: null, confirmation_date: null };
  r.resolve({ data: c.answer(r, { contributions: [{ ...row, id: 'one' }, { ...row, id: 'two' }], warnings: [{ code: 'historical_identity_unavailable', record_id: 'one', message: 'Identity unavailable; retained.' }] }) }); await tick();
  button(c.render(), 'Contribution detail (2)').props.onPress();
  assert.match(text(c.render()), /Record: one/); assert.match(text(c.render()), /Record: two/); assert.match(text(c.render()), /Identity unavailable/);
});
test('physically approved Reports header and PDF service remain byte unchanged; legacy exports clearly separate', () => {
  const root = path.join(__dirname, '../..');
  const file = 'frontend/app/(treasurer)/reports.tsx';
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const baseline = cp.execFileSync('git', ['show', '267b31427060e7d539df7cfd34b0f3d0249c8c59:' + file], { cwd: root, encoding: 'utf8' });
  const header = s => s.slice(s.indexOf('      {/* Header */}'), s.indexOf('      <ScrollView'));
  assert.equal(header(source), header(baseline));
  assert.match(source, /Legacy exports/); assert.match(source, /not the club or period selected above/);
  assert.doesNotMatch(source, /dashboardData\?\.clubs \|\| \[\]\)\.reduce/);
  const pdf = 'frontend/services/pdfReportService.ts';
  assert.equal(fs.readFileSync(path.join(root, pdf), 'utf8'), cp.execFileSync('git', ['show', '267b31427060e7d539df7cfd34b0f3d0249c8c59:' + pdf], { cwd: root, encoding: 'utf8' }));
});
