const test = require('node:test');
const assert = require('node:assert/strict');
const { load, engine, tick, nodes, text, button, native, colors } = require('./ui-harness.cjs');

async function setup(from = 'member', uploaded = true) {
  const ui = engine(), requests = [], alerts = [], files = [], opened = [], routes = [];
  const member = { id: 'member-1', contribution_id: 'contribution-1', name: 'Member One',
    phone: '123', membership_status: 'active', status: 'proof_uploaded',
    amount_paid: 0, amount_due: 175, has_proof: uploaded, proof_version: 'proof-v1',
    proof_review_status: 'pending' };
  if (!uploaded) member.status = 'pending';
  const club = { id: 'club-1', name: 'Club', collected: 0, expected: 350, member_count: 2,
    members: [member, { ...member, id: 'member-2', contribution_id: null }] };
  const proof = { proof_image: 'data:image/jpeg;base64,image' };
  const state = { available: true, failProof: false, failConfirm: false, clubGet: null };
  const params = { id: 'club-1', from };
  const Screen = load('app/(treasurer)/club-detail.tsx', {
    react: ui.react,
    'react-native': { ...native, RefreshControl: 'RefreshControl', TextInput: 'TextInput',
      KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' },
      Alert: { alert: (...args) => alerts.push(args) } },
    'expo-router': { useLocalSearchParams: () => params, useFocusEffect: ui.useFocusEffect,
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
        if (state.clubGet) return state.clubGet(url);
        return { data: JSON.parse(JSON.stringify(club)) };
      },
      post: async (url, data, options) => {
        requests.push({ url, data, options });
        if (state.failConfirm) throw { response: { status: 403 } };
        if (url.endsWith('/decline-proof')) {
          member.status = 'pending'; member.proof_review_status = 'declined';
          member.proof_decline_reason = data.reason;
        } else {
          member.status = 'confirmed'; member.amount_paid = member.amount_due;
        }
      }
    }
  }).default;
  ui.render(Screen); await tick();
  const render = () => ui.render(Screen);
  button(render(), 'Payments').props.onPress();
  await tick();
  return { render, requests, alerts, files, opened, routes, proof, state, member, ui, params, club };
}

test('review opens the selected image, confirms its contribution ID and refreshes', async () => {
  const c = await setup();
  let tree = c.render();
  assert.equal(nodes(tree).filter(n => n.type === 'TouchableOpacity' && text(n) === 'Approve Payment').length, 1);
  await button(tree, 'View Proof').props.onPress(); tree = c.render();
  assert.ok(c.requests.at(-1).url.endsWith('/api/contributions/contribution-1/proof'));
  assert.deepEqual(c.requests.at(-1).options.params, { user_id: 'treasurer-1' });
  assert.equal(nodes(tree).find(n => n.type === 'Image').props.source.uri, c.proof.proof_image);
  button(tree, 'Close').props.onPress();
  assert.equal(nodes(c.render()).find(n => n.type === 'Image'), undefined);
  button(tree, 'Approve Payment').props.onPress();
  await c.alerts.at(-1)[2].find(a => a.text === 'Confirm').onPress(); await tick();
  const posted = c.requests.find(r => r.data);
  assert.ok(posted.url.endsWith('/api/treasurer/confirm-payment'));
  assert.deepEqual(posted.data, { contribution_id: 'contribution-1', proof_version: 'proof-v1', notes: null, treasurer_id: 'treasurer-1' });
  assert.ok(c.requests.at(-1).url.includes('/api/treasurer/club/club-1'));
  assert.ok(text(c.render()).includes('R175.00 / R175.00'));
  assert.equal(button(c.render(), 'Approve Payment'), undefined);
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
  button(c.render(), 'Approve Payment').props.onPress();
  await c.alerts.at(-1)[2].find(a => a.text === 'Confirm').onPress();
  assert.equal(c.alerts.at(-1)[0], 'Access Denied');
  assert.ok(button(c.render(), 'Approve Payment'));
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


test('new uploads appear on Payments entry and screen refocus without duplicate requests', async () => {
  const c = await setup('member', false);
  assert.equal(button(c.render(), 'View Proof'), undefined);
  const clubRequests = () => c.requests.filter(r => r.url.includes('/api/treasurer/club/')).length;
  const before = clubRequests();
  c.member.status = 'proof_uploaded'; c.member.has_proof = true;
  button(c.render(), 'Members').props.onPress(); c.render();
  button(c.render(), 'Payments').props.onPress(); c.render(); await tick();
  assert.ok(button(c.render(), 'View Proof'));
  assert.equal(clubRequests(), before + 1);
  button(c.render(), 'Payments').props.onPress(); c.render();
  assert.equal(clubRequests(), before + 1);
  c.ui.blur(); c.member.proof_version = 'proof-v2'; c.ui.focus(); await tick();
  assert.equal(clubRequests(), before + 2);
  const again = clubRequests(); c.render(); c.render();
  assert.equal(clubRequests(), again);
  // Focus and tab entry during the same in-flight fetch share one request.
  button(c.render(), 'Members').props.onPress(); c.render();
  c.ui.blur(); c.ui.focus();
  button(c.render(), 'Payments').props.onPress(); c.render(); await tick();
  assert.equal(clubRequests(), again + 1);
});

test('decline sends the specific proof version and session, retaining the unpaid proof', async () => {
  const c = await setup();
  button(c.render(), 'Decline Proof').props.onPress();
  const input = nodes(c.render()).find(n => n.type === 'TextInput' && n.props.placeholder === 'Reason (optional)');
  input.props.onChangeText('Wrong bank reference');
  const decline = nodes(c.render()).find(n => n.type === 'TouchableOpacity' && text(n) === 'Decline');
  await decline.props.onPress(); await tick();
  const request = c.requests.find(r => r.url.endsWith('/decline-proof'));
  assert.ok(request.url.endsWith('/api/contributions/contribution-1/decline-proof'));
  assert.deepEqual(request.data, { proof_version: 'proof-v1', reason: 'Wrong bank reference' });
  assert.deepEqual(request.options.headers, { Authorization: 'Bearer session' });
  assert.equal(c.member.amount_due, 175); assert.equal(c.member.amount_paid, 0);
  assert.equal(c.member.has_proof, true);
  const tree = c.render();
  assert.ok(text(tree).includes('Proof Declined'));
  assert.ok(text(tree).includes('Wrong bank reference'));
  assert.ok(button(tree, 'View Proof'));
  assert.equal(button(tree, 'Approve Payment'), undefined);
});


test('overlapping lifecycle requests for different groups cannot show the previous group', async () => {
  const c = await setup();
  const pending = [];
  c.state.clubGet = url => new Promise(resolve => pending.push({ url, resolve }));
  c.ui.blur(); c.ui.focus();
  c.params.id = 'club-2'; c.render();
  assert.equal(pending.length, 2);
  assert.ok(pending[1].url.includes('/club/club-2'));
  pending[1].resolve({ data: { ...c.club, id: 'club-2', name: 'New Club' } }); await tick();
  assert.ok(text(c.render()).includes('New Club'));
  pending[0].resolve({ data: { ...c.club, name: 'Previous Club' } }); await tick();
  assert.ok(text(c.render()).includes('New Club'));
  assert.equal(text(c.render()).includes('Previous Club'), false);
});
