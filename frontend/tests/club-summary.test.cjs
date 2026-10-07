const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const { load, engine, tick, nodes, text, button, native, colors } = require('./ui-harness.cjs');
const service = load('services/clubSummary.ts');
const periods = load('services/monthlyReport.ts');
function fixture(year = 2026, month = 10) {
  const data = { schema_version: '1', scope: 'club_admin', club: { id: 'club', name: 'WeTraveling' }, period: { year, month, timezone: 'Africa/Johannesburg' }, membership: {}, contributions: {}, claims: {}, payouts: {}, warnings: [], availability: {},
    basis: { version: '1', definitions: {}, awaiting_review_overlaps_outstanding: true, liability_state: 'current_not_historical_month_end', verified_bank_balance: false, bank_receipt_timing_used_for_period: false } };
  for (const field of Object.keys(service.summaryLabels)) {
    const [family, name] = field.split('.'); data[family][name] = 0;
    data.availability[field] = { status: 'AVAILABLE', reasons: [] }; data.basis.definitions[field] = {};
  } return data;
}
function setup() {
  const ui = engine(), requests = []; let closed = 0; const destinations = [];
  const props = { clubId: 'club', token: 'session', onClose: () => closed++ };
  const Screen = load('components/ClubSummary.tsx', { react: ui.react, 'react-native': { ...native, TextInput: 'TextInput', RefreshControl: 'RefreshControl' },
    'expo-router': { useFocusEffect: ui.useFocusEffect, useRouter: () => ({ replace: p => destinations.push(p) }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 30 }) },
    '../constants/Colors': { Colors: colors }, '../services/monthlyReport': periods, '../services/clubSummary': service,
    axios: { isAxiosError: e => !!e.response, get: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })) } }).default;
  const render = () => ui.render(() => Screen(props)); const initial = render();
  const answer = r => { const d = fixture(r.options.params.year, r.options.params.month); d.club.id = props.clubId; return d; };
  const action = label => nodes(render()).find(n => n.props.accessibilityLabel === label);
  return { ui, props, requests, render, initial, answer, action, destinations, closed: () => closed };
}
for (const field of Object.keys(service.summaryLabels)) test(`direct mapping and available zero: ${field}`, () => {
  const data = fixture(); assert.equal(service.validateSummary(data, 'club', 2026, 10), data);
  assert.equal(service.displayMetric(data, field), field.endsWith('_cents') ? 'R0.00' : '0');
  const [family, name] = field.split('.'); data[family][name] = null; data.availability[field] = { status: 'UNAVAILABLE', reasons: [{ code: 'INVALID_AMOUNT' }] };
  assert.equal(service.displayMetric(service.validateSummary(data, 'club', 2026, 10), field), 'Unavailable');
});
test('Rand formatting and independent count/amount availability', () => {
  const d = fixture(); d.claims.submitted_count = 2; d.claims.submitted_amount_cents = null;
  d.availability['claims.submitted_amount_cents'] = { status: 'UNAVAILABLE', reasons: [{ code: 'INVALID_AMOUNT' }] };
  d.contributions.confirmed_cents = 123456;
  service.validateSummary(d, 'club', 2026, 10);
  assert.equal(service.displayMetric(d, 'claims.submitted_count'), '2'); assert.equal(service.displayMetric(d, 'claims.submitted_amount_cents'), 'Unavailable');
  assert.equal(service.displayMetric(d, 'contributions.confirmed_cents'), 'R1,234.56');
});
for (const code of Object.keys(service.warningCopy)) test(`human warning: ${code}`, () => {
  assert.ok(service.explainWarning(code).length > 15); assert.ok(!service.explainWarning(code).includes(code));
});
test('unknown warning remains neutral', () => assert.equal(service.explainWarning('FUTURE'), 'Some source information needs checking.'));
for (const [name, change] of [
  ['schema', d => d.schema_version = 1], ['club', d => d.club.id = 'other'], ['period', d => d.period.month = 9],
  ['basis', d => d.basis.version = '2'], ['missing availability', d => delete d.availability['claims.submitted_count']],
  ['contradiction', d => d.claims.submitted_count = null], ['malformed', d => d.warnings = null],
  ['warning fields', d => d.warnings = [{ code: 'FUTURE', fields: ['invalid'] }]],
]) test(`reject ${name}`, () => { const d = fixture(); change(d); assert.throws(() => service.validateSummary(d, 'club', 2026, 10)); });
test('Johannesburg month and year boundaries', () => {
  assert.deepEqual(periods.currentReportPeriod(new Date('2026-12-31T22:30:00Z')), { year: 2027, month: 1 });
  assert.deepEqual(periods.moveReportMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
  assert.deepEqual(periods.moveReportMonth({ year: 2027, month: 1 }, -1), { year: 2026, month: 12 });
});
test('opening uses only summary bearer request and one loader; all fields rendered', async () => {
  const c = setup(), r = c.requests[0]; assert.match(r.url, /intelligence\/club\/summary$/);
  assert.deepEqual(Object.keys(r.options.params).sort(), ['month', 'year']); assert.equal(r.options.headers.Authorization, 'Bearer session'); assert.equal(r.options.timeout, 20000);
  assert.equal(nodes(c.initial).filter(n => n.type === 'ActivityIndicator').length, 1);
  r.resolve({ data: c.answer(r) }); await tick(); const tree = c.render();
  for (const label of Object.values(service.summaryLabels)) assert.ok((text(tree) + nodes(tree).map(n => n.props.accessibilityLabel || '').join(' ')).includes(label));
  assert.equal(nodes(tree).filter(n => n.type === 'ActivityIndicator').length, 0);
  assert.doesNotMatch(text(tree), /Some records need checking/);
  assert.equal(nodes(tree).filter(n => n.type === 'TouchableOpacity' && /R0/.test(text(n))).length, 0);
});
test('nonfatal warning preserves money and associates backend fields', async () => {
  const c = setup(), r = c.requests[0], d = c.answer(r); d.contributions.confirmed_cents = 100;
  d.warnings = [{ code: 'CONFIRMATION_DATE_UNAVAILABLE', fields: ['contributions.confirmed_cents'] }]; r.resolve({ data: d }); await tick();
  button(c.render(), 'Some records').props.onPress(); assert.match(text(c.render()), /R1.00/); assert.match(text(c.render()), /Affects: Confirmed contributions/);
  button(c.render(), 'About these').props.onPress(); assert.match(text(c.render()), /not a verified bank balance/);
});
test('month and year selection changes request and clears old money immediately', async () => {
  const c = setup(), old = c.requests[0], d = c.answer(old); d.contributions.confirmed_cents = 11100; old.resolve({ data: d }); await tick(); c.render();
  c.action('Next summary month').props.onPress(); assert.doesNotMatch(text(c.render()), /R111.00/);
  c.action('Select summary month and year').props.onPress(); nodes(c.render()).find(n => n.type === 'TextInput').props.onChangeText('2024');
  button(c.render(), 'September').props.onPress(); c.render(); assert.deepEqual(c.requests.at(-1).options.params, { year: 2024, month: 9 });
});
for (const kind of ['month', 'session', 'club', 'close']) test(`stale response after ${kind} is discarded`, async () => {
  const c = setup(), old = c.requests[0];
  if (kind === 'month') c.action('Next summary month').props.onPress();
  if (kind === 'session') c.props.token = 'new';
  if (kind === 'club') c.props.clubId = 'new';
  if (kind === 'close') button(c.render(), 'Close').props.onPress();
  c.render(); const d = fixture(old.options.params.year, old.options.params.month); d.contributions.confirmed_cents = 99900; old.resolve({ data: d }); await tick();
  assert.doesNotMatch(text(c.render()), /R999.00/);
});
test('focus and pull refresh clear previous figures, retry recovers', async () => {
  const c = setup(); c.ui.blur(); c.ui.focus(); assert.equal(c.requests.length, 2);
  const r = c.requests.at(-1); r.resolve({ data: c.answer(r) }); await tick(); c.render();
  nodes(c.render()).find(n => n.type === 'ScrollView').props.refreshControl.props.onRefresh(); assert.doesNotMatch(text(c.render()), /R0.00/);
  assert.equal(nodes(c.render()).filter(n => n.type === 'ActivityIndicator').length, 0);
  c.requests.at(-1).reject(new Error('private error')); await tick(); assert.doesNotMatch(text(c.render()), /private error/);
  button(c.render(), 'Retry').props.onPress(); const retry = c.requests.at(-1); retry.resolve({ data: c.answer(retry) }); await tick(); assert.match(text(c.render()), /R0.00/);
});
for (const status of [401, 403, 404, 422, 500]) test(`safe ${status} response`, async () => {
  const c = setup(); c.requests[0].reject({ response: { status, data: { detail: 'secret' } } }); await tick();
  assert.ok(text(c.render()).includes(service.summaryError(status))); assert.doesNotMatch(text(c.render()), /secret|R0.00/);
  if (status === 401) { button(c.render(), 'Sign in').props.onPress(); assert.deepEqual(c.destinations, ['/auth']); }
});
for (const mode of ['button', 'backdrop', 'android']) test(`${mode} closes sheet`, () => {
  const c = setup(); if (mode === 'button') button(c.render(), 'Close').props.onPress();
  if (mode === 'backdrop') c.action('Close Club Summary backdrop').props.onPress();
  if (mode === 'android') nodes(c.render()).find(n => n.type === 'Modal').props.onRequestClose(); assert.equal(c.closed(), 1);
  assert.equal(nodes(c.render()).find(n => n.type === 'ScrollView').props.contentContainerStyle.paddingBottom, 24);
});
test('integration leaves existing tabs and actions unchanged and no Member exposure', () => {
  const file = 'app/(treasurer)/club-detail.tsx', current = fs.readFileSync(require('node:path').join(__dirname, '..', file), 'utf8');
  const baseline = cp.execFileSync('git', ['show', `HEAD:frontend/${file}`], { encoding: 'utf8' });
  const stripped = current.replace("import ClubSummary from '../../components/ClubSummary';\n", '').replace('  const [showClubSummary, setShowClubSummary] = useState(false);\n', '')
    .replace(/      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open Club Summary"[\s\S]*?      \{\/\* Tabs \*\/\}/, '      {/* Tabs */}');
  assert.equal(stripped, baseline);
  const memberDir = require('node:path').join(__dirname, '../app/(member)');
  for (const f of fs.readdirSync(memberDir).filter(f => f.endsWith('.tsx'))) assert.doesNotMatch(fs.readFileSync(require('node:path').join(memberDir, f), 'utf8'), /ClubSummary/);
});
