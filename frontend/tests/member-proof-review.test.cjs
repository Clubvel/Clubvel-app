const test = require('node:test');
const assert = require('node:assert/strict');
const { load, engine, tick, nodes, text, button, native, colors } = require('./ui-harness.cjs');

async function setup(screen = 'proofs', review = 'declined', approved = false, deferred = false, collapsed = false) {
  const ui = engine(), requests = [], alerts = [], routes = [];
  const record = { contribution_id: 'contribution-a', group_id: 'group-a', group_name: 'Club A',
    month: 10, year: 2026, amount_due: 175, amount_paid: 25,
    status: approved ? 'confirmed' : 'proof_uploaded', proof_uploaded: true,
    proof_review_status: review, proof_decline_reason: review === 'declined' ? 'Wrong reference' : null,
    proof_eligible: !approved && review === 'declined',
    proof_version: 'proof-v1', proof_delete_eligible: review === 'pending' && !approved,
    payment_date: '2026-10-05T10:00:00' };
  const statusPill = load('components/StatusPill.tsx', {
    react: ui.react, 'react-native': native, '../constants/Colors': { Colors: colors }
  }).StatusPill;
  const state = { get: null, records: null };
  if (deferred) state.get = () => new Promise(resolve => { state.resolve = resolve; });
  const params = { id: 'group-a', month: '10', year: '2026' };
  const authState = { user: { id: 'member-user' }, token: 'member-session' };
  const auth = { useAuth: () => authState };
  const axios = {
    get: async (url, options) => {
      requests.push({ url, options });
      if (state.get) return state.get(url);
      if (url.includes('/api/member/contributions/')) return { data: { contributions: JSON.parse(JSON.stringify(state.records || [record])) } };
      if (url.includes('/api/member/club/')) return { data: state.club || {
        group: { id: 'group-a', name: 'Club A' }, current_contribution: { ...record, id: record.contribution_id },
        payment_reference: { amount: 150, reference_code: 'REF' }, payment_history: []
      } };
      if (url.includes('/api/member/dashboard/')) return { data: { clubs: [{ id: 'group-a', name: 'Club A', monthly_contribution: 175 }] } };
      return { data: { proof_image: 'data:image/jpeg;base64,image' } };
    },
    post: async (url, data, options) => {
      requests.push({ url, data, options });
      if (url.endsWith('/proof/dismiss')) { record.proof_dismissed = true; return; }
      record.proof_dismissed = false;
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
    'expo-router': { useFocusEffect: ui.useFocusEffect, useLocalSearchParams: () => params,
      useRouter: () => ({ replace: route => routes.push(route), back: () => routes.push('back'), push: route => routes.push(route) }) },
    '../../services/paymentSummaryRecords': load('services/paymentSummaryRecords.ts'),
    '../../../services/paymentSummaryRecords': load('services/paymentSummaryRecords.ts'),
    '../../constants/Colors': { Colors: colors }, '../../../constants/Colors': { Colors: colors },
    '../../components/ClubMemberDirectory': { __esModule: true, default: 'ClubMemberDirectory' },
    '../../components/ProfilePhotoViewer': { default: 'ProfilePhotoViewer' },
    '../../contexts/AuthContext': auth, '../../../contexts/AuthContext': auth,
    '../../../components/ClubMemberDirectory': { __esModule: true, default: 'ClubMemberDirectory' },
    '../../components/StatusPill': { StatusPill: statusPill }, '../../../components/StatusPill': { StatusPill: statusPill },
    '../../components/AdBanner': { AdBanner: 'AdBanner' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-document-picker': { getDocumentAsync: async () => state.picker ? state.picker() : ({ canceled: false,
      assets: [{ uri: 'cache/image.jpg', name: 'image.jpg', mimeType: 'image/jpeg', size: 100 }] }) },
    'expo-file-system/legacy': { EncodingType: { Base64: 'base64' }, readAsStringAsync: async () => 'image' },
    'expo-sharing': {}, axios
  };
  const Screen = load(screen === 'proofs' ? 'app/(member)/proofs.tsx' : 'app/(member)/club/[id].tsx', dependencies).default;
  const render = () => ui.render(Screen);
  const initial = render(); await tick();
  if (screen === 'proofs' && !collapsed) {
    for (const toggle of nodes(render()).filter(n => n.props?.accessibilityLabel?.startsWith('Toggle contributions ') && !n.props.accessibilityState.expanded)) toggle.props.onPress();
  }
  return { render, requests, alerts, routes, record, ui, statusPill, initial, state, params, authState };
}

test('persisted declined proof and reason are shown after opening or returning to Proofs', async () => {
  const c = await setup(); const tree = c.render();
  assert.ok(text(tree).includes('Club A')); assert.ok(text(tree).includes('Decline reason: Wrong reference'));
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

for (const screen of ['proofs', 'club']) {
  test(`${screen}: focus retains data and overlapping requests are deduplicated`, async () => {
    const c = await setup(screen); let resolve;
    c.state.get = () => new Promise(done => { resolve = done; });
    c.ui.blur(); c.ui.focus(); c.render();
    assert.match(text(c.render()), /Club A/);
    assert.match(text(c.render()), /Wrong reference/);
    c.ui.blur(); c.ui.focus(); c.render();
    assert.equal(c.requests.length, 2);
    const record = { ...c.record, group_name: 'Renamed Club', proof_decline_reason: 'Fresh reason' };
    resolve({ data: screen === 'proofs' ? { contributions: [record] } : {
      group: { id: 'group-a', name: 'Renamed Club' }, current_contribution: record,
      payment_reference: { amount: 150 }, payment_history: []
    } }); await tick();
    assert.match(text(c.render()), /Renamed Club/); assert.match(text(c.render()), /Fresh reason/);
  });

  test(`${screen}: initial screen shell renders while data is unresolved`, async () => {
    const c = await setup(screen, 'declined', false, true);
    assert.match(text(c.initial), screen === 'proofs' ? /Payments|Proof/ : /Club/);
    assert.ok(nodes(c.render()).some(n => n.type === 'ActivityIndicator'));
    if (screen === 'club') assert.ok(nodes(c.initial).some(n => n.props?.name === 'arrow-back'));
    c.state.resolve({ data: screen === 'proofs' ? { contributions: [] } : null }); await tick();
  });
}

test('member club ignores an older request after navigating to a different club', async () => {
  const c = await setup('club'); const pending = [];
  c.state.get = url => new Promise(resolve => pending.push({ url, resolve }));
  c.ui.blur(); c.ui.focus(); c.render();
  c.params.id = 'group-b'; c.render();
  // Commit the route-context effect before starting the new club read, as React does.
  c.render(); assert.equal(pending.length, 2);
  pending[1].resolve({ data: { group: { id: 'group-b', name: 'New Club' }, current_contribution: c.record,
    payment_reference: { amount: 150 }, payment_history: [] } }); await tick(); c.render();
  pending[0].resolve({ data: { group: { id: 'group-a', name: 'Old Club' }, current_contribution: c.record,
    payment_reference: { amount: 150 }, payment_history: [] } }); await tick();
  assert.match(text(c.render()), /New Club/); assert.doesNotMatch(text(c.render()), /Old Club/);
});

test('Member Payments ignores an older focus response after deleting a proof and forcing a fresh read', async () => {
  const c = await setup('proofs', 'pending'); const pending = [];
  c.state.get = () => new Promise(resolve => pending.push(resolve));
  c.ui.blur(); c.ui.focus(); c.render();
  button(c.render(), 'Delete Pending Proof').props.onPress();
  const deleting = c.alerts.at(-1)[2].find(a => a.text === 'Delete').onPress(); await tick();
  assert.equal(pending.length, 2);
  pending[1]({ data: { contributions: [] } }); await deleting; c.render();
  pending[0]({ data: { contributions: [{ ...c.record, proof_uploaded: true, group_name: 'Stale Proof' }] } }); await tick();
  assert.match(text(c.render()), /No proofs uploaded yet/); assert.doesNotMatch(text(c.render()), /Stale Proof/);
});


test('missing decline reason does not display a blank reason line', async () => {
  const c = await setup(); c.record.proof_decline_reason = null;
  c.ui.blur(); c.ui.focus(); await tick();
  assert.doesNotMatch(text(c.render()), /Decline reason:/);
  assert.ok(button(c.render(), 'View Proof')); assert.ok(button(c.render(), 'Replace Proof'));
});

test('member club initial and focus reads send the current bearer token', async () => {
  const c = await setup('club');
  const reads = () => c.requests.filter(r => r.url.includes('/api/member/club/'));
  assert.equal(reads().length, 1);
  assert.deepEqual(reads()[0].options.headers, { Authorization: 'Bearer member-session' });
  c.ui.blur(); c.ui.focus(); await tick();
  assert.equal(reads().length, 2);
  assert.deepEqual(reads()[1].options.headers, { Authorization: 'Bearer member-session' });
  assert.deepEqual(c.routes, []);
});


test('declined Remove persists a version-specific dismissal and leaves the proof and amounts intact', async () => {
  const c = await setup();
  button(c.render(), 'Remove').props.onPress();
  await c.alerts.at(-1)[2].find(a => a.text === 'Remove').onPress(); await tick();
  const request=c.requests.find(r=>r.url.endsWith('/proof/dismiss'));
  assert.equal(request.data.proof_version,'proof-v1');
  assert.equal(request.options.headers.Authorization,'Bearer member-session');
  assert.equal(c.record.proof_uploaded,true);assert.equal(c.record.amount_paid,25);assert.equal(c.record.amount_due,175);
  assert.equal(button(c.render(),'View Proof'),undefined);
  c.ui.blur();c.ui.focus();await tick();assert.equal(button(c.render(),'View Proof'),undefined);
});

test('approved proof has no Remove action and remains viewable', async () => {
  const c=await setup('proofs','approved',true);
  assert.equal(button(c.render(),'Remove'),undefined);assert.ok(button(c.render(),'View Proof'));
});

test('Proof cards use identical count/list predicates, whole-card accessibility and reversible empty filters', async()=>{
 const c=await setup();c.state.records=[{...c.record,contribution_id:'confirmed',group_name:'Confirmed Club',status:'confirmed',proof_review_status:'approved'},{...c.record,contribution_id:'pending',group_name:'Pending Club',proof_review_status:'pending'},{...c.record,contribution_id:'declined',group_name:'Declined Club',proof_review_status:'declined'},{...c.record,contribution_id:'paid',group_name:'Paid Club',status:'paid',proof_review_status:'approved'}];
 c.ui.blur();c.ui.focus();await tick();
 const proofSection=()=>nodes(c.render()).find(n=>n.type==='View'&&n.props.children?.[0]?.props?.children?.[0]==='Proofs of Payment');
 const tap=label=>nodes(c.render()).find(n=>n.type==='TouchableOpacity'&&n.props.accessibilityLabel===label);
 assert.match(text(tap('Show total proofs')),/Total Proofs4/);assert.match(text(tap('Show confirmed')),/Confirmed2/);assert.match(text(tap('Show pending')),/Pending1/);
 tap('Show confirmed').props.onPress();assert.equal(tap('Show confirmed').props.accessibilityState.selected,true);assert.match(text(proofSection()),/Confirmed Club/);assert.match(text(proofSection()),/Paid Club/);assert.doesNotMatch(text(proofSection()),/Pending Club|Declined Club/);
 tap('Show pending').props.onPress();assert.match(text(proofSection()),/Pending Club/);assert.doesNotMatch(text(proofSection()),/Confirmed Club|Declined Club|Paid Club/);
 tap('Show all proofs').props.onPress();assert.match(text(proofSection()),/Declined Club/);tap('Show total proofs').props.onPress();assert.equal(tap('Show all proofs'),undefined);
 c.state.records=[];c.ui.blur();c.ui.focus();await tick();tap('Show confirmed').props.onPress();assert.match(text(proofSection()),/No proofs match this filter/);assert.ok(tap('Show all proofs'));
});


test('new member with no contribution opens club without inventing an obligation', async () => {
  const c = await setup('club');
  c.state.club = { group: { id: 'group-a', name: 'Club A' }, current_contribution: null,
    payment_reference: { amount: null, reference_code: 'REF' }, payment_history: [] };
  c.ui.blur(); c.ui.focus(); await tick();
  assert.ok(text(c.render()).includes('No contribution recorded for this month.'));
  assert.ok(text(c.render()).includes('Not recorded'));
  assert.equal(button(c.render(), 'Upload Proof of Payment'), undefined);
});

test('revoked club access clears financial content and offers Retry', async () => {
  const c = await setup('club');
  c.state.get = async () => { throw { response: { status: 403 } }; };
  c.ui.blur(); c.ui.focus(); await tick();
  assert.ok(text(c.render()).includes('You no longer have access'));
  assert.ok(button(c.render(), 'Retry'));
  assert.ok(!text(c.render()).includes('Wrong reference'));
});

test('malformed club response becomes controlled retry instead of render exception', async () => {
  const c = await setup('club');
  c.state.club = { group: { id: 'group-a', name: 'Club A' }, payment_reference: {}, payment_history: null };
  c.ui.blur(); c.ui.focus(); await tick();
  assert.ok(button(c.render(), 'Retry'));
});

test('member selects distinct monthly contributions and uploads only the selected ID', async () => {
 const c=await setup('club','pending');
 const first={...c.record,contribution_id:'first',amount_due:100,status:'confirmed',payment_state:'confirmed',confirmed_amount:100,outstanding_amount:0,proof_eligible:false};
 const second={...c.record,contribution_id:'second',amount_due:200,status:'pending',payment_state:'awaiting_payment',confirmed_amount:0,outstanding_amount:200,proof_uploaded:false,proof_eligible:true};
 c.state.club={group:{id:'group-a',name:'Club A'},current_contribution:{...first,id:'first'},contributions:[first,second],payment_reference:{amount:0,reference_code:'REF'},payment_history:[]};
 c.ui.blur();c.ui.focus();await tick();
 assert.match(text(c.render()),/Select a contribution record/);
  button(c.render(),'Contribution 1').props.onPress();
  assert.ok(button(c.render(),'Payment Confirmed'));
 button(c.render(),'Contribution 2').props.onPress();
 assert.ok(nodes(c.render()).some(n=>n.type?.name==='StatusPill' && text(n.type(n.props))==='Awaiting Payment'));
 assert.match(text(c.render()),/Outstanding: R200.00/);
 await button(c.render(),'Upload Proof of Payment').props.onPress();
 assert.equal(c.requests.find(r=>r.url.endsWith('/upload-proof')).data.contribution_id,'second');
});
test('historical member record cannot expose upload or delete controls',async()=>{
 const c=await setup('club','pending');
 const history={...c.record,contribution_id:'history',historical_only:true,payment_state:'awaiting_confirmation',proof_eligible:false,proof_delete_eligible:false};
 c.state.club={group:{id:'group-a',name:'Club A'},current_contribution:{...history,id:'history'},contributions:[history],payment_reference:{amount:150,reference_code:'REF'},payment_history:[]};
 c.ui.blur();c.ui.focus();await tick();
 assert.match(text(c.render()),/Historical contribution/);
 assert.equal(button(c.render(),'Upload Proof of Payment'),undefined);
 assert.equal(button(c.render(),'Delete Pending Proof'),undefined);
});


test('Payments shows unpaid obligations and isolates selected clubs and periods', async () => {
 const c=await setup();
 c.state.records=[{...c.record,group_name:'WeTraveling',proof_uploaded:false,payment_state:'awaiting_payment',expected_amount:175,confirmed_amount:0,recorded_unconfirmed_amount:25,outstanding_amount:150},
 {...c.record,contribution_id:'eighty8',group_id:'group-b',group_name:'Eighty8',proof_uploaded:false},
 {...c.record,contribution_id:'september',month:9,group_name:'WeTraveling',proof_uploaded:false}];
 c.ui.blur();c.ui.focus();await tick();
 assert.match(text(c.render()),/WeTraveling/);assert.match(text(c.render()),/Eighty8/);
 nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Select contribution club WeTraveling').props.onPress();
 assert.doesNotMatch(text(c.render()),/Expected:.*Eighty8/);
 assert.equal(nodes(c.render()).filter(n=>n.props?.accessibilityLabel==='Open contribution eighty8').length,0);
 assert.match(text(c.render()),/Confirmed Collected: R0.00/);
 nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Previous payment month').props.onPress();
 assert.ok(nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Open contribution september'));
});

test('Payments exact obligation upload uses no club lookup and cancellation sends no write',async()=>{
 const c=await setup();
 c.state.records=[{...c.record,proof_uploaded:false,proof_eligible:true,payment_state:'awaiting_payment'}];
 c.ui.blur();c.ui.focus();await tick();
 const upload=()=>nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Upload proof for contribution contribution-a');
 c.state.picker=async()=>({canceled:true});await upload().props.onPress();
 assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,0);
 c.state.picker=async()=>({canceled:false,assets:[{uri:'image',size:1,name:'image.jpg'}]});
 await upload().props.onPress();
 const request=c.requests.find(r=>r.url.endsWith('/upload-proof'));
 assert.equal(request.data.contribution_id,'contribution-a');assert.deepEqual(request.options.headers,{Authorization:'Bearer member-session'});
 assert.equal(c.requests.filter(r=>r.url.includes('/api/member/club/')).length,0);
});

test('Payments cancels an old-account picker and immediately masks old financial data',async()=>{
 const c=await setup();let resolve;
 c.state.picker=()=>new Promise(r=>{resolve=r;});
 const pending=button(c.render(),'Replace Proof').props.onPress();
 c.authState.user={id:'other-member'};c.authState.token='other-session';
 assert.doesNotMatch(text(c.render()),/Expected: R175/);
 resolve({canceled:false,assets:[{uri:'image',size:1,name:'image.jpg'}]});await pending;
 assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,0);
});

test('member banking shows holder, context navigation and unavailable missing fields',async()=>{
 const c=await setup('club');
 c.state.club={group:{id:'group-a',name:'Club A',bank_account_holder:'Club holder'},current_contribution:null,contributions:[],payment_reference:{amount:null,reference_code:null},payment_history:[]};
 c.ui.blur();c.ui.focus();await tick();
 assert.match(text(c.render()),/Club holder/);assert.match(text(c.render()),/Not available/);
 nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Open club payments').props.onPress();
 assert.equal(c.routes.at(-1).params.group_id,'group-a');assert.equal(c.routes.at(-1).params.month,'10');
});


test('rapid club switching preserves context without extra reads or wrong-club records',async()=>{
 const c=await setup();
 c.state.records=[{...c.record,group_name:'WeTraveling',proof_uploaded:false}, {...c.record,contribution_id:'eighty',group_id:'group-b',group_name:'Eighty8',proof_uploaded:false}];
 c.ui.blur();c.ui.focus();await tick();c.render();const before=c.requests.length;
 const select=name=>nodes(c.render()).find(n=>n.props?.accessibilityLabel===`Select contribution club ${name}`).props.onPress();
 select('WeTraveling');assert.equal(nodes(c.render()).some(n=>n.props?.accessibilityLabel==='Open contribution eighty'),false);
 select('Eighty8');assert.equal(nodes(c.render()).some(n=>n.props?.accessibilityLabel==='Open contribution contribution-a'),false);
 select('WeTraveling');assert.ok(nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Open contribution contribution-a'));
 assert.equal(c.requests.length,before);
});

test('historical obligations remain visible without current banking or upload access',async()=>{
 const c=await setup();c.state.records=[{...c.record,historical_only:true,proof_uploaded:false,proof_eligible:false}];
 c.ui.blur();c.ui.focus();await tick();
 assert.match(text(c.render()),/Historical contribution — read only/);
 assert.equal(nodes(c.render()).some(n=>n.props?.accessibilityLabel==='Open contribution contribution-a'),false);
 assert.equal(nodes(c.render()).some(n=>n.props?.accessibilityLabel==='Upload proof for contribution contribution-a'),false);
});


test('Payments groups legitimate same-month records into one collapsed club without extra requests', async () => {
 const c=await setup('proofs','declined',false,false,true);
 c.state.records=[{...c.record,payment_state:'proof_declined',outstanding_amount:150},{...c.record,contribution_id:'second',payment_state:'awaiting_payment',proof_uploaded:false,outstanding_amount:200}];
 c.ui.blur();c.ui.focus();await tick();let tree=c.render();
 assert.equal(nodes(tree).filter(n=>n.props?.accessibilityLabel==='Toggle contributions Club A').length,1);
 assert.match(text(tree),/2 contributions/);assert.match(text(tree),/Outstanding: R150.00/);assert.match(text(tree),/Outstanding: R200.00/);
 assert.ok(!nodes(tree).some(n=>n.props?.accessibilityLabel==='Select contribution second'));
 const before=c.requests.length;nodes(tree).find(n=>n.props?.accessibilityLabel==='Toggle contributions Club A').props.onPress();tree=c.render();
 assert.ok(nodes(tree).some(n=>n.props?.accessibilityLabel==='Select contribution second'));assert.equal(c.requests.length,before);
 nodes(tree).find(n=>n.props?.accessibilityLabel==='Toggle contributions Club A').props.onPress();assert.ok(!nodes(c.render()).some(n=>n.props?.accessibilityLabel==='Select contribution second'));
});
test('Every proof is classified, including declined and unsupported statuses, without inflating pending',async()=>{
 const c=await setup('proofs','declined',false,false,true);
 c.state.records=[1,2,3].map(id=>({...c.record,contribution_id:`paid-${id}`,payment_state:'confirmed',status:'confirmed'}));
 c.state.records.push({...c.record,contribution_id:'declined',payment_state:'proof_declined'});c.ui.blur();c.ui.focus();await tick();
 assert.match(text(c.render()),/Declined: 1/);assert.match(text(c.render()),/Other: 0/);
 nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Show pending').props.onPress();assert.match(text(c.render()),/pending review proofs \(0\)/);
 nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Show declined proofs').props.onPress();assert.match(text(c.render()),/declined proofs \(1\)/);
 c.state.records.push({...c.record,contribution_id:'unknown',payment_state:'unknown',status:'unrecognised',proof_review_status:null});c.ui.blur();c.ui.focus();await tick();assert.match(text(c.render()),/Other: 1/);
});
test('Repeated contribution identity is rejected rather than rendered or counted twice',async()=>{
 const c=await setup();c.state.records=[c.record,{...c.record}];c.ui.blur();c.ui.focus();await tick();assert.match(text(c.render()),/Unable to load proofs/);
});
test('Club accordion expansion does not carry into another account',async()=>{
 const c=await setup();assert.ok(nodes(c.render()).some(n=>n.props?.accessibilityLabel==='Select contribution contribution-a'));
 c.authState.user={id:'other'};c.authState.token='other-token';assert.doesNotMatch(text(c.render()),/Club A|Wrong reference/);
});

test('October club-scoped proofs reconcile 4 = 3 confirmed + 0 pending + 1 declined, excluding other periods/clubs',async()=>{
 const c=await setup();c.params.scope='club';c.params.group_id='group-a';c.params.year='2026';c.params.month='10';
 c.state.records=[1,2,3].map(n=>({...c.record,contribution_id:`confirmed-${n}`,status:'confirmed',proof_review_status:'approved',proof_eligible:false}));
 c.state.records.push({...c.record,contribution_id:'declined',status:'proof_uploaded',proof_review_status:'declined'});
 c.state.records.push({...c.record,contribution_id:'other-club',group_id:'group-b',group_name:'Other club'}, {...c.record,contribution_id:'september',month:9});
 c.render();c.ui.blur();c.ui.focus();await tick();const tree=c.render();
 assert.match(text(nodes(tree).find(n=>n.props.accessibilityLabel==='Show total proofs')),/Total Proofs4/);
 assert.match(text(nodes(tree).find(n=>n.props.accessibilityLabel==='Show confirmed')),/Confirmed3/);
 assert.match(text(nodes(tree).find(n=>n.props.accessibilityLabel==='Show pending')),/Pending0/);
 assert.match(text(nodes(tree).find(n=>n.props.accessibilityLabel==='Show declined proofs')),/Declined: 1/);
 assert.match(text(nodes(tree).find(n=>n.props.accessibilityLabel==='Show other proofs')),/Other: 0/);
 assert.doesNotMatch(text(tree),/Other club/);
});
