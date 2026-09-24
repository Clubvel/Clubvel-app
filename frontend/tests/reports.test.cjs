const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
function engine() {
  const slots = []; let cursor = 0; let effects = []; let focused = true;
  const same = (a, b) => a && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    Fragment: 'Fragment',
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  return { react,
    useFocusEffect(fn) { const i = cursor++; if (!slots[i] || slots[i].fn !== fn) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { focus: true, fn, cleanup: focused ? fn() : undefined }; }); },
    render(fn) { cursor = 0; effects = []; const tree = fn(); effects.forEach(f => f()); return tree; },
    blur() { focused = false; slots.filter(s => s?.focus).forEach(s => { s.cleanup?.(); s.cleanup = undefined; }); },
    focus() { focused = true; slots.filter(s => s?.focus).forEach(s => { s.cleanup = s.fn(); }); },
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : tree?.props ? text(tree.props.children) : '';
const button = (tree, label) => nodes(tree).find(n => n.type === 'TouchableOpacity' && text(n).includes(label));
const native = Object.fromEntries(['View', 'Text', 'ScrollView', 'TouchableOpacity', 'ActivityIndicator', 'Image', 'Modal'].map(n => [n, n]));
native.StyleSheet = { create: s => s };
native.Alert = { alert() {} };
const colors = new Proxy({}, { get: (_, name) => name });

const reports = load('services/reports.ts');
const now = new Date();
const fixture = (changes = {}) => ({ schema_version: 1, group_id: 'group', group_name: 'Recorded group',
  year: now.getFullYear(), month: now.getMonth() + 1, generated_at: '2026-09-24T10:00:00Z',
  rows: [{ contribution_id: 'actual', member_id: 'membership', person_id: 'person', member_name: 'Actual Person',
    year: now.getFullYear(), month: now.getMonth() + 1, amount_due: 321.75, amount_paid: 80, outstanding: 241.75,
    awaiting_verification: 0, status: 'late', recorded_status: 'pending', payment_date: null }],
  summary: { total_collected: 80, recorded_obligations: 321.75, collection_rate: 24.86, outstanding: 241.75, awaiting_verification: 0, late_members: 1 },
  ...changes });
const empty = () => fixture({ rows: [], summary: { total_collected: 0, recorded_obligations: 0, collection_rate: null, outstanding: 0, awaiting_verification: 0, late_members: 0 } });

function harness() {
  const e = engine(); const calls = []; const exports = []; const shares = []; const alerts = [];
  let club = { id: 'group', name: 'Recorded group', role: 'admin' };
  let response = async () => ({ data: fixture() });
  const routing = { useFocusEffect: e.useFocusEffect, useRouter: () => ({ push() {} }) };
  const hook = load('hooks/useGroupReport.ts', { react: e.react, 'expo-router': routing,
    axios: { get: async (...args) => { calls.push(args); return response(...args); } }, '../services/reports': reports });
  const service = load('services/pdfReportService.ts', {
    './reports': reports,
    'expo-print': { printToFileAsync: async ({ html }) => { exports.push(html); return { uri: 'local.pdf' }; },
      printAsync: async ({ html }) => { exports.push(html); } },
    'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async uri => { shares.push(uri); } },
  });
  const Screen = load('app/(treasurer)/reports.tsx', {
    react: e.react, 'react-native': { ...native, Alert: { alert: (...args) => alerts.push(args) } },
    'expo-router': routing, '../../constants/Colors': { Colors: colors }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'person' }, token: 'token' }) },
    '../../contexts/WorkspaceContext': { useWorkspace: () => ({ selectedClub: club }) },
    '../../components/AdBanner': { AdBanner: 'AdBanner' }, '../../hooks/useGroupReport': hook,
    '../../services/reports': reports, '../../services/pdfReportService': service,
  }).default;
  return { ...e, calls, exports, shares, alerts, render: () => e.render(Screen),
    respond: fn => { response = fn; }, select: value => { club = value; } };
}

test('reject legacy sample responses, mismatched group or period, duplicates and invalid amounts', () => {
  const valid = fixture();
  assert.equal(reports.groupReport(valid, 'group', valid.year, valid.month), valid);
  for (const invalid of [{ clubs: [], summary: {} }, fixture({ group_id: 'other' }), fixture({ year: valid.year - 1 }),
    fixture({ rows: [valid.rows[0], valid.rows[0]] }), fixture({ summary: { ...valid.summary, total_collected: null } }),
    fixture({ summary: { ...valid.summary, recorded_obligations: 0, collection_rate: 0 } })]) {
    assert.throws(() => reports.groupReport(invalid, 'group', valid.year, valid.month));
  }
});

test('screen PDF share and print reuse identical normalized values without another network request', async () => {
  const h = harness(); h.render(); await tick(); let tree = h.render();
  const html = reports.generateReportHTML(fixture());
  for (const [label, value] of reports.reportSummary(fixture())) {
    assert.ok(text(tree).includes(label)); assert.ok(text(tree).includes(value)); assert.ok(html.includes(value));
  }
  button(tree, 'Share').props.onPress(); await tick(); h.render();
  button(h.render(), 'Print').props.onPress(); await tick(); h.render();
  button(h.render(), 'PDF').props.onPress(); await tick();
  assert.equal(h.calls.length, 1); assert.deepEqual(h.exports, [html, html, html]);
  assert.deepEqual(h.shares, ['local.pdf']);
  assert.ok(!JSON.stringify(h.alerts).includes('sent'));
});

test('loading does not render financial zeros or export controls', async () => {
  const h = harness(); h.respond(() => new Promise(() => {}));
  const tree = h.render(); assert.ok(text(tree).includes('Loading report'));
  assert.ok(!text(tree).includes('R0')); assert.equal(button(tree, 'PDF'), undefined);
});

test('network failure differs from genuinely empty period and Retry recovers', async () => {
  const h = harness(); h.respond(async () => { throw new Error('offline'); });
  h.render(); await tick(); let tree = h.render();
  assert.ok(text(tree).includes('Unable to load report')); assert.ok(!text(tree).includes('R0'));
  assert.ok(!text(tree).includes('No contribution records')); assert.equal(button(tree, 'Share'), undefined);
  h.respond(async () => ({ data: empty() })); button(tree, 'Retry').props.onPress(); await tick(); tree = h.render();
  assert.ok(text(tree).includes('No contribution records for this period.')); assert.ok(text(tree).includes('Not applicable'));
  assert.ok(!text(tree).includes('0.00%'));
});

test('selected group scopes request and obsolete response cannot replace new group', async () => {
  const h = harness(); let resolveOld;
  h.respond(() => new Promise(resolve => { resolveOld = resolve; })); h.render();
  h.select({ id: 'second', name: 'Second', role: 'treasurer' });
  h.respond(async () => ({ data: fixture({ group_id: 'second', group_name: 'Second' }) }));
  assert.ok(text(h.render()).includes('Loading report')); await tick();
  resolveOld({ data: fixture() }); await tick();
  const tree = h.render(); assert.ok(text(tree).includes('Second'));
  assert.ok(h.calls[1][0].endsWith('/second')); assert.equal(h.calls[1][1].headers.Authorization, 'Bearer token');
  button(tree, 'Share').props.onPress(); await tick(); assert.ok(h.exports[0].includes('<h2>Second</h2>'));
});

test('member context cannot request administrative report', async () => {
  const h = harness(); h.select({ id: 'group', role: 'member' }); h.render(); await tick();
  assert.equal(h.calls.length, 0); assert.ok(text(h.render()).includes('Unable to load report'));
});

test('period selection filters requests; annual removes month and export uses returned period', async () => {
  const h = harness(); h.render(); await tick();
  h.respond(async (_, { params }) => ({ data: fixture({ year: params.year, month: params.month ?? null,
    rows: [{ ...fixture().rows[0], year: params.year, month: params.month ?? 2 }] }) }));
  nodes(h.render()).find(n => n.props?.accessibilityLabel === 'Previous period').props.onPress();
  assert.ok(text(h.render()).includes('Loading report')); await tick();
  assert.equal(h.calls.length, 2); assert.notDeepEqual(h.calls[1][1].params, h.calls[0][1].params);
  button(h.render(), 'View Annual').props.onPress(); h.render(); await tick();
  assert.equal(h.calls[2][1].params.month, undefined);
  button(h.render(), 'Share').props.onPress(); await tick(); assert.ok(h.exports[0].includes('(full year)'));
});

test('exports escape stored names and never insert executable markup', () => {
  const html = reports.generateReportHTML(fixture({ group_name: '<script>bad</script>', rows: [{ ...fixture().rows[0], member_name: '<img src=x>' }] }));
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img'));
});

test('PDF and native sharing failures return explicit failure, not a sent confirmation', async () => {
  const service = load('services/pdfReportService.ts', { './reports': reports,
    'expo-print': { printToFileAsync: async () => { throw new Error('unavailable'); } },
    'expo-sharing': { isAvailableAsync: async () => false } });
  assert.equal((await service.generatePDFReport(fixture())).success, false);
  assert.equal((await service.sharePDFReport('local.pdf')).success, false);
});

test('production reporting contains no sample generator or hard-coded financial summaries', () => {
  for (const file of ['app/(treasurer)/reports.tsx', 'services/pdfReportService.ts', 'services/reports.ts']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.ok(!/generateSampleReportData|Soshanguve|Mamelodi|R500|>50%|Thabo Mokoena/.test(source));
  }
});
