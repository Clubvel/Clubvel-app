const test = require('node:test');
const assert = require('node:assert/strict');
const { load, engine, tick, nodes, text, button, native, colors } = require('./ui-harness.cjs');

async function setup(wait = false) {
  const ui = engine(), requests = [], routes = [], files = [], opened = [], alerts = [];
  const records = [200, 300, 600, 5000, 300, 300].map((amount, i) => ({
    id: `c-${i}`, member_id: 'one-member', member_name: `Payment ${i}`, reference_code: 'REF',
    amount_due: amount, amount_paid: i === 0 ? 200 : 0,
    status: i === 0 ? 'confirmed' : i === 5 ? 'pending' : 'proof_uploaded',
    contribution_status: i === 0 ? 'confirmed' : i === 5 ? 'pending' : 'proof_uploaded',
    proof_uploaded: i !== 5, proof_version: i === 1 ? 'legacy:c-1:date' : `v-${i}`,
    proof_review_status: i === 0 ? 'approved' : i === 1 ? null : 'pending'
  }));
  const result = { contributions: records, summary: { collected: 200, outstanding: 6500, total_expected: 6700, collection_rate: 3 } };
  const state = { monthly: null, clubs: wait ? () => new Promise(resolve => { state.resolveClubs = resolve; }) : null, proof: 'data:image/jpeg;base64,image', conflict: false };
  const Screen = load('app/(treasurer)/contributions.tsx', {
    '../../services/paymentSummaryRecords': load('services/paymentSummaryRecords.ts'),
    react: ui.react,
    'react-native': { ...native, TextInput: 'TextInput', RefreshControl: 'RefreshControl', Alert: { alert: (...args) => alerts.push(args) } },
    '../../constants/Colors': { Colors: colors }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../../components/StatusPill': { StatusPill: 'StatusPill' }, '../../components/AdBanner': { AdBanner: 'AdBanner' },
    '../../components/ProfilePhotoViewer': { default: 'ProfilePhotoViewer' },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'admin' }, token: 'session' }) },
    'expo-router': { useLocalSearchParams: () => ({}), useFocusEffect: ui.useFocusEffect, useRouter: () => ({ push: path => routes.push(path) }) },
    'expo-file-system/legacy': { documentDirectory: 'files/', EncodingType: { Base64: 'base64' }, writeAsStringAsync: async (...args) => files.push(args) },
    'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async (...args) => opened.push(args) },
    axios: {
      get: async (url, options) => {
        requests.push({ url, options });
        if (url.includes('/admin/clubs/')) return state.clubs ? state.clubs() : { data: { clubs: [{ id: 'a', name: 'Club A' }, { id: 'b', name: 'Club B' }] } };
        if (url.endsWith('/proof')) return { data: { proof_image: state.proof } };
        return state.monthly ? state.monthly(url) : { data: JSON.parse(JSON.stringify(result)) };
      },
      post: async (url, data, options) => {
        requests.push({ url, data, options });
        if (state.conflict) throw { response: { status: 409, data: { detail: 'Proof changed' } } };
      }
    }
  }).default;
  const render = () => ui.render(Screen);
  const initial = render(); await tick(); render(); await tick(); render();
  return { ui, render, initial, requests, routes, files, opened, alerts, state, records, result };
}
const payments = c => c.requests.filter(r => r.url.includes('/treasurer/contributions/'));
const exact = (tree, label) => nodes(tree).filter(n => n.type === 'TouchableOpacity' && text(n) === label);

test('actual Payments shell renders before data and requests existing managed-club endpoint', async () => {
  const c = await setup(true);
  assert.match(text(c.initial), /Payments/);
  assert.equal(c.requests.length, 1);
  assert.match(c.requests[0].url, /\/api\/admin\/clubs\/admin$/);
  assert.ok(nodes(c.initial).some(n => n.type === 'ActivityIndicator'));
  c.state.resolveClubs({ data: { clubs: [{ id: 'a', name: 'Club A' }] } }); await tick(); c.render(); await tick();
  assert.equal(payments(c).length, 1);
});

test('all six financial records render; confirmed first cannot hide legacy and versioned pending proofs', async () => {
  const c = await setup(); const tree = c.render();
  for (let i = 0; i < 6; i++) assert.match(text(tree), new RegExp(`Payment ${i}`));
  assert.equal(exact(tree, 'Approve Payment').length, 4);
  assert.equal(exact(tree, 'Decline Proof').length, 4);
  assert.equal(exact(tree, 'View Proof').length, 5);
  assert.match(text(tree), /R200.00/); assert.match(text(tree), /R6500.00/);
  assert.equal(payments(c).length, 1);
  assert.deepEqual(payments(c)[0].options.params, { treasurer_id: 'admin' });
  assert.equal(c.requests.some(r => r.url.endsWith('/proof')), false);
});

test('View Proof retrieves only the selected contribution; image and PDF remain usable', async () => {
  const c = await setup();
  await exact(c.render(), 'View Proof')[2].props.onPress();
  assert.match(c.requests.at(-1).url, /\/contributions\/c-2\/proof$/);
  assert.equal(nodes(c.render()).find(n => n.type === 'Image').props.source.uri, c.state.proof);
  c.state.proof = 'data:application/pdf;base64,pdf';
  await exact(c.render(), 'View Proof')[1].props.onPress();
  assert.equal(c.files[0][1], 'pdf'); assert.equal(c.opened[0][1].mimeType, 'application/pdf');
});

test('Approve targets selected legacy/versioned proof and refreshes the list', async () => {
  const c = await setup();
  await exact(c.render(), 'Approve Payment')[0].props.onPress();
  const posted = c.requests.find(r => r.data);
  assert.deepEqual(posted.data, { contribution_id: 'c-1', proof_version: 'legacy:c-1:date', notes: 'Payment confirmed by treasurer', treasurer_id: 'admin' });
  assert.equal(payments(c).length, 2);
  await exact(c.render(), 'Approve Payment')[1].props.onPress();
  assert.equal(c.requests.filter(r => r.data).at(-1).data.proof_version, 'v-2');
});

test('Decline targets selected contribution/version and optional reason with authenticated session', async () => {
  const c = await setup(); exact(c.render(), 'Decline Proof')[2].props.onPress();
  nodes(c.render()).find(n => n.type === 'TextInput').props.onChangeText('Wrong reference');
  await button(c.render(), 'Confirm Decline').props.onPress();
  const posted = c.requests.find(r => r.data);
  assert.match(posted.url, /\/contributions\/c-3\/decline-proof$/);
  assert.deepEqual(posted.data, { proof_version: 'v-3', reason: 'Wrong reference' });
  assert.deepEqual(posted.options.headers, { Authorization: 'Bearer session' });
});

test('focus retains visible records and deduplicates an overlapping request', async () => {
  const c = await setup(); let resolve;
  c.state.monthly = () => new Promise(done => { resolve = done; });
  c.ui.blur(); c.ui.focus(); c.render();
  assert.match(text(c.render()), /Payment 5/);
  c.ui.blur(); c.ui.focus(); c.render();
  assert.equal(payments(c).length, 2);
  resolve({ data: { ...c.result, contributions: [{ ...c.records[1], member_name: 'Fresh proof' }] } }); await tick();
  assert.match(text(c.render()), /Fresh proof/);
});

test('club/month switches isolate data and an older response cannot overwrite the current context', async () => {
  const c = await setup(); const pending = [];
  c.state.monthly = url => new Promise(resolve => pending.push({ url, resolve }));
  c.ui.blur(); c.ui.focus(); c.render();
  button(c.render(), 'Club A').props.onPress(); c.render(); button(c.render(), 'Club B').props.onPress(); c.render();
  assert.doesNotMatch(text(c.render()), /Payment 5/);
  assert.match(pending[1].url, /\/contributions\/b\/month\//);
  pending[1].resolve({ data: { ...c.result, contributions: [{ ...c.records[1], member_name: 'New Club Record' }] } }); await tick(); c.render();
  pending[0].resolve({ data: c.result }); await tick();
  assert.match(text(c.render()), /New Club Record/); assert.doesNotMatch(text(c.render()), /Payment 5/);
  const forward = nodes(c.render()).find(n => n.type === 'TouchableOpacity' && nodes(n).some(child => child.props?.name === 'chevron-forward'));
  forward.props.onPress(); c.render();
  assert.notEqual(pending[2].url, pending[1].url);
  assert.doesNotMatch(text(c.render()), /New Club Record/);
  pending[2].resolve({ data: { ...c.result, contributions: [] } }); await tick();
});

test('stale proof conflict is shown and triggers a fresh list; profile navigation stays unchanged', async () => {
  const c = await setup(); c.state.conflict = true;
  await exact(c.render(), 'Approve Payment')[0].props.onPress();
  assert.equal(c.alerts.at(-1)[1], 'Proof changed'); assert.equal(payments(c).length, 2);
  const profile = nodes(c.render()).find(n => n.type === 'TouchableOpacity' && nodes(n).some(child => child.props?.name === 'person'));
  profile.props.onPress(); assert.deepEqual(c.routes, ['/(treasurer)/profile']);
});

const labelled = (c, label) => nodes(c.render()).find(n => n.type === 'TouchableOpacity' && n.props.accessibilityLabel === label);
test('Collected and Outstanding reveal their exact records with clear filters and amount labels', async () => {
 const c=await setup();
 labelled(c,'Show records contributing to collected').props.onPress();
 assert.match(text(c.render()),/Recorded paymentR200.00/);assert.match(text(c.render()),/Payment 0/);assert.doesNotMatch(text(c.render()),/Payment 1/);
 labelled(c,'Show all payment records').props.onPress();assert.match(text(c.render()),/Payment 1/);
 labelled(c,'Show records contributing to outstanding').props.onPress();
 assert.doesNotMatch(text(c.render()),/Payment 0/);for(let i=1;i<6;i++)assert.match(text(c.render()),new RegExp(`Payment ${i}`));
 assert.match(text(c.render()),/Remaining balance/);assert.equal(payments(c).length,1);
 const previous=nodes(c.render()).find(n=>n.type==='TouchableOpacity'&&nodes(n).some(i=>i.props.name==='chevron-back'));
 previous.props.onPress();c.render();await tick();c.render();assert.equal(labelled(c,'Show all payment records'),undefined);
});
test('Payments summary mismatch leaves the affected card passive; percentage explains authoritative values', async () => {
 const c=await setup();c.result.summary.collected=999;
 nodes(c.render()).find(n=>n.type==='ScrollView').props.refreshControl.props.onRefresh();await tick();c.render();
 assert.equal(labelled(c,'Show records contributing to collected').props.disabled,true);
 assert.equal(labelled(c,'Show records contributing to collected').props.accessibilityRole,undefined);
 labelled(c,'Explain collection rate').props.onPress();assert.match(c.alerts.at(-1)[1],/Expected: R6700.00/);assert.match(c.alerts.at(-1)[1],/Collected: R999.00/);assert.match(c.alerts.at(-1)[1],/not yet confirmed/);
});
