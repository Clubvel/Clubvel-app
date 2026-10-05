const test = require('node:test');
const assert = require('node:assert/strict');
const { load, engine, tick, nodes, text, button, native, colors } = require('./ui-harness.cjs');

async function setup(screen = 'proofs', review = 'declined', approved = false) {
  const ui = engine(), requests = [], alerts = [], routes = [];
  const record = { contribution_id: 'contribution-a', group_id: 'group-a', group_name: 'Club A',
    month: 10, year: 2026, amount_due: 175, amount_paid: 25,
    status: approved ? 'confirmed' : 'proof_uploaded', proof_uploaded: true,
    proof_review_status: review, proof_decline_reason: review === 'declined' ? 'Wrong reference' : null,
    proof_version: 'proof-v1', proof_delete_eligible: review === 'pending' && !approved,
    payment_date: '2026-10-05T10:00:00' };
  const statusPill = load('components/StatusPill.tsx', {
    react: ui.react, 'react-native': native, '../constants/Colors': { Colors: colors }
  }).StatusPill;
  const auth = { useAuth: () => ({ user: { id: 'member-user' }, token: 'member-session' }) };
  const axios = {
    get: async (url, options) => {
      requests.push({ url, options });
      if (url.includes('/api/member/contributions/')) return { data: { contributions: [JSON.parse(JSON.stringify(record))] } };
      if (url.includes('/api/member/club/')) return { data: {
        group: { id: 'group-a', name: 'Club A' }, current_contribution: { ...record, id: record.contribution_id },
        payment_reference: { amount: 150, reference_code: 'REF' }, payment_history: []
      } };
      if (url.includes('/api/member/dashboard/')) return { data: { clubs: [{ id: 'group-a', name: 'Club A', monthly_contribution: 175 }] } };
      return { data: { proof_image: 'data:image/jpeg;base64,image' } };
    },
    post: async (url, data, options) => {
      requests.push({ url, data, options });
      record.proof_review_status = 'pending'; record.proof_decline_reason = null;
      record.status = 'proof_uploaded'; record.proof_version = 'proof-v2'; record.proof_delete_eligible = true;
    },
    delete: async (url, options) => {
      requests.push({ url, options });
      record.proof_uploaded = false; record.status = 'pending'; record.proof_review_status = null;
      record.proof_version = null; record.proof_delete_eligible = false;
    }
  };
  const dependencies = {
    react: ui.react,
    'react-native': { ...native, RefreshControl: 'RefreshControl', TextInput: 'TextInput',
      KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' },
      Alert: { alert: (...args) => alerts.push(args) } },
    'expo-router': { useFocusEffect: ui.useFocusEffect, useLocalSearchParams: () => ({ id: 'group-a' }),
      useRouter: () => ({ back: () => routes.push('back'), push: route => routes.push(route) }) },
    '../../constants/Colors': { Colors: colors }, '../../../constants/Colors': { Colors: colors },
    '../../contexts/AuthContext': auth, '../../../contexts/AuthContext': auth,
    '../../components/StatusPill': { StatusPill: statusPill }, '../../../components/StatusPill': { StatusPill: statusPill },
    '../../components/AdBanner': { AdBanner: 'AdBanner' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-document-picker': { getDocumentAsync: async () => ({ canceled: false,
      assets: [{ uri: 'cache/image.jpg', name: 'image.jpg', mimeType: 'image/jpeg', size: 100 }] }) },
    'expo-file-system/legacy': { EncodingType: { Base64: 'base64' }, readAsStringAsync: async () => 'image' },
    'expo-sharing': {}, axios
  };
  const Screen = load(screen === 'proofs' ? 'app/(member)/proofs.tsx' : 'app/(member)/club/[id].tsx', dependencies).default;
  const render = () => ui.render(Screen);
  render(); await tick();
  return { render, requests, alerts, routes, record, ui, statusPill };
}

test('persisted declined proof and reason are shown after opening or returning to Proofs', async () => {
  const c = await setup(); const tree = c.render();
  assert.ok(text(tree).includes('Club A')); assert.ok(text(tree).includes('Wrong reference'));
  const pill = nodes(tree).find(n => n.type === c.statusPill);
  assert.equal(pill.props.status, 'proof_declined');
  assert.equal(text(c.statusPill(pill.props)), 'Proof Declined');
  assert.ok(button(tree, 'View Proof')); assert.ok(button(tree, 'Replace Proof'));
  assert.equal(button(tree, 'Delete Pending Proof'), undefined);
  assert.deepEqual(c.requests[0].options.headers, { Authorization: 'Bearer member-session' });
  const before = c.requests.length; c.ui.blur(); c.ui.focus(); await tick();
  assert.equal(c.requests.length, before + 1);
});

test('Replace Proof uploads to the same declined contribution with the session token', async () => {
  const c = await setup();
  await button(c.render(), 'Replace Proof').props.onPress(); await tick();
  const request = c.requests.find(r => r.url.endsWith('/upload-proof'));
  assert.equal(request.data.contribution_id, 'contribution-a');
  assert.deepEqual(request.options.headers, { Authorization: 'Bearer member-session' });
  assert.equal(c.record.amount_due, 175); assert.equal(c.record.amount_paid, 25);
  assert.equal(button(c.render(), 'Replace Proof'), undefined);
  assert.ok(button(c.render(), 'Delete Pending Proof'));
  const pill = nodes(c.render()).find(n => n.type === c.statusPill);
  assert.equal(text(c.statusPill(pill.props)), 'Pending Confirmation');
});

test('Delete Pending Proof sends the selected version and session, then reloads persisted records', async () => {
  const c = await setup('proofs', 'pending');
  button(c.render(), 'Delete Pending Proof').props.onPress();
  await c.alerts.at(-1)[2].find(a => a.text === 'Delete').onPress(); await tick();
  const request = c.requests.find(r => r.options?.data);
  assert.ok(request.url.endsWith('/api/contributions/contribution-a/proof'));
  assert.deepEqual(request.options, { data: { proof_version: 'proof-v1' }, headers: { Authorization: 'Bearer member-session' } });
  assert.equal(c.record.amount_due, 175); assert.equal(c.record.amount_paid, 25);
  assert.ok(text(c.render()).includes('No proofs uploaded yet'));
});

test('approved and Admin-uploaded proofs have no member delete action', async () => {
  const approved = await setup('proofs', 'approved', true);
  assert.equal(button(approved.render(), 'Delete Pending Proof'), undefined);
  assert.equal(button(approved.render(), 'Replace Proof'), undefined);
  const admin = await setup('proofs', 'pending');
  admin.record.proof_delete_eligible = false; admin.ui.blur(); admin.ui.focus(); await tick();
  assert.equal(button(admin.render(), 'Delete Pending Proof'), undefined);
});

test('member club shows the same declined state/replacement and preserves back navigation', async () => {
  const c = await setup('club');
  assert.ok(text(c.render()).includes('Proof Declined')); assert.ok(text(c.render()).includes('Wrong reference'));
  assert.equal(button(c.render(), 'Delete Pending Proof'), undefined);
  await button(c.render(), 'Replace Proof').props.onPress(); await tick();
  const request = c.requests.find(r => r.url.endsWith('/upload-proof'));
  assert.equal(request.data.contribution_id, 'contribution-a');
  assert.deepEqual(request.options.headers, { Authorization: 'Bearer member-session' });
  assert.ok(button(c.render(), 'Delete Pending Proof'));
  nodes(c.render()).find(n => n.type === 'TouchableOpacity' &&
    nodes(n).some(child => child.props?.name === 'arrow-back')).props.onPress();
  assert.deepEqual(c.routes, ['back']);
});

test('member club deletes a pending proof, preserves amounts and restores the upload action', async () => {
  const c = await setup('club', 'pending');
  button(c.render(), 'Delete Pending Proof').props.onPress();
  await c.alerts.at(-1)[2].find(a => a.text === 'Delete').onPress(); await tick();
  assert.equal(c.record.amount_due, 175); assert.equal(c.record.amount_paid, 25);
  assert.equal(button(c.render(), 'Delete Pending Proof'), undefined);
  assert.ok(button(c.render(), 'Upload Proof of Payment'));
});
