const test = require('node:test');
const assert = require('node:assert/strict');
const { load, engine, tick, nodes, text, button, native, colors } = require('./ui-harness.cjs');

async function setup(from = 'member') {
  const ui = engine(), requests = [], alerts = [], files = [], opened = [], routes = [];
  const member = { id: 'member-1', contribution_id: 'contribution-1', name: 'Member One',
    phone: '123', membership_status: 'active', status: 'proof_uploaded',
    amount_paid: 0, amount_due: 175, has_proof: true };
  const club = { id: 'club-1', name: 'Club', collected: 0, expected: 350, member_count: 2,
    members: [member, { ...member, id: 'member-2', contribution_id: null }] };
  const proof = { proof_image: 'data:image/jpeg;base64,image' };
  const state = { available: true, failProof: false, failConfirm: false };
  const Screen = load('app/(treasurer)/club-detail.tsx', {
    react: ui.react,
    'react-native': { ...native, RefreshControl: 'RefreshControl', TextInput: 'TextInput',
      KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' },
      Alert: { alert: (...args) => alerts.push(args) } },
    'expo-router': { useLocalSearchParams: () => ({ id: 'club-1', from }),
      useRouter: () => ({ replace: route => routes.push(route), back: () => routes.push('back') }) },
    '../../constants/Colors': { Colors: colors },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'treasurer-1' }, token: 'session' }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
    'expo-file-system/legacy': { documentDirectory: 'files/', EncodingType: { Base64: 'base64' },
      writeAsStringAsync: async (...args) => files.push(args) },
    'expo-sharing': { isAvailableAsync: async () => state.available,
      shareAsync: async (...args) => opened.push(args) },
    axios: {
      get: async (url, options) => {
        requests.push({ url, options });
        if (url.endsWith('/proof')) {
          if (state.failProof) throw { response: { data: { detail: 'Proof unavailable' } } };
          return { data: proof };
        }
        if (url.endsWith('/claims')) return { data: { claims: [{ claim_id: 'claim-1',
          member_name: 'Claim Member', amount: 90, reason: 'Existing claim', status: 'pending' }] } };
        return { data: club };
      },
      post: async (url, data) => {
        requests.push({ url, data });
        if (state.failConfirm) throw { response: { status: 403 } };
        member.status = 'confirmed'; member.amount_paid = member.amount_due;
      }
    }
  }).default;
  ui.render(Screen); await tick();
  const render = () => ui.render(Screen);
  button(render(), 'Payments').props.onPress();
  return { render, requests, alerts, files, opened, routes, proof, state };
}

test('review opens the selected image, confirms its contribution ID and refreshes', async () => {
  const c = await setup();
  let tree = c.render();
  assert.equal(nodes(tree).filter(n => n.type === 'TouchableOpacity' && text(n) === 'Confirm Payment').length, 1);
  await button(tree, 'View Proof').props.onPress(); tree = c.render();
  assert.ok(c.requests.at(-1).url.endsWith('/api/contributions/contribution-1/proof'));
  assert.deepEqual(c.requests.at(-1).options.params, { user_id: 'treasurer-1' });
  assert.equal(nodes(tree).find(n => n.type === 'Image').props.source.uri, c.proof.proof_image);
  button(tree, 'Close').props.onPress();
  assert.equal(nodes(c.render()).find(n => n.type === 'Image'), undefined);
  button(tree, 'Confirm Payment').props.onPress();
  await c.alerts.at(-1)[2].find(a => a.text === 'Confirm').onPress(); await tick();
  const posted = c.requests.find(r => r.data);
  assert.ok(posted.url.endsWith('/api/treasurer/confirm-payment'));
  assert.deepEqual(posted.data, { contribution_id: 'contribution-1', notes: null, treasurer_id: 'treasurer-1' });
  assert.ok(c.requests.at(-1).url.includes('/api/treasurer/club/club-1'));
  assert.ok(text(c.render()).includes('R175.00 / R175.00'));
  assert.equal(button(c.render(), 'Confirm Payment'), undefined);
});

test('PDF proofs use the existing file and opening APIs', async () => {
  const c = await setup();
  c.proof.proof_image = 'data:application/pdf;base64,pdf';
  c.proof.proof_mime_type = 'application/pdf';
  await button(c.render(), 'View Proof').props.onPress();
  assert.equal(c.files[0][1], 'pdf');
  assert.deepEqual(c.files[0][2], { encoding: 'base64' });
  assert.equal(c.opened[0][0], c.files[0][0]);
  assert.equal(c.opened[0][1].mimeType, 'application/pdf');
  assert.equal(nodes(c.render()).find(n => n.type === 'Image'), undefined);
  c.state.available = false;
  await button(c.render(), 'View Proof').props.onPress();
  assert.equal(c.opened.length, 1);
  assert.match(c.alerts.at(-1)[1], /not available/);
});

test('proof and confirmation failures remain visible without reporting success', async () => {
  const c = await setup(); c.state.failProof = true;
  await button(c.render(), 'View Proof').props.onPress();
  assert.equal(c.alerts.at(-1)[1], 'Proof unavailable');
  c.state.failConfirm = true;
  button(c.render(), 'Confirm Payment').props.onPress();
  await c.alerts.at(-1)[2].find(a => a.text === 'Confirm').onPress();
  assert.equal(c.alerts.at(-1)[0], 'Access Denied');
  assert.ok(button(c.render(), 'Confirm Payment'));
});

test('member return navigation and existing Claims request are preserved', async () => {
  const c = await setup();
  const back = nodes(c.render()).find(n => n.type === 'TouchableOpacity' &&
    nodes(n).some(child => child.props?.name === 'arrow-back'));
  back.props.onPress(); assert.deepEqual(c.routes, ['/(member)/home']);
  button(c.render(), 'Claims').props.onPress(); c.render(); await tick();
  assert.ok(text(c.render()).includes('Claim Member'));
  assert.deepEqual(c.requests.at(-1).options.headers, { Authorization: 'Bearer session' });
  assert.ok(c.requests.at(-1).url.endsWith('/api/treasurer/groups/club-1/claims'));
  // Explicit non-member origin continues to use router.back().
  const admin = await setup('treasurer');
  nodes(admin.render()).find(n => n.type === 'TouchableOpacity' &&
    nodes(n).some(child => child.props?.name === 'arrow-back')).props.onPress();
  assert.deepEqual(admin.routes, ['back']);
});
