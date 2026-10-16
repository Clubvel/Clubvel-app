const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, engine, tick, nodes, text, native, colors } = require('./ui-harness.cjs');
function setup(from = 'member') {
  const ui = engine(), requests = [], claimRequests=[], routes = [], auth = { user: { id: 'jimmy',full_name:'Jimmy',profile_photo:'data:image/jpeg;base64,current' }, token: 'session-a', loading: false }, params = { id: 'travel', from }, claimState={records:[]};
  const axios={get:(url,options)=>url.includes('/api/member/claims/') ? (claimRequests.push({url,options}),Promise.resolve({data:{claims:claimState.records}})) : new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))};
  const Screen = load('app/club/[id].tsx', {
    react: ui.react, 'react-native': native, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
    'expo-router': { Redirect: 'Redirect', useFocusEffect: ui.useFocusEffect, useLocalSearchParams: () => params, useRouter: () => ({ push: route => routes.push(route), replace: route => routes.push(route) }) },
    axios,
    '../../components/ClubMemberDirectory':{__esModule:true,default:'ClubMemberDirectory'},'../../components/ProfilePhotoViewer':{__esModule:true,default:'ProfilePhotoViewer'},
    '../../services/clubGreeting':load('services/clubGreeting.ts'),
    '../../hooks/usePersonalClaims':load('hooks/usePersonalClaims.ts',{react:ui.react,'expo-router':{useFocusEffect:ui.useFocusEffect},axios}),
    '../../contexts/AuthContext': { useAuth: () => auth }, '../../constants/Colors': { Colors: colors },
  }).default;
  const render = () => ui.render(Screen);
  const tap = label => nodes(render()).find(n => n.props?.accessibilityLabel === label).props.onPress();
  const reply = async (index, id = params.id, role = 'member', amount = 100, count = 1) => {
    requests[index].resolve({ data: { club: { id, name: id === 'travel' ? 'WeTraveling' : 'Eighty8' }, membership: { id: id + '-member', role, status: 'active' }, clubs: [{ id: 'travel', name: 'WeTraveling' }, { id: 'eight', name: 'Eighty8' }], period: { month: 10, year: 2026, timezone: 'Africa/Johannesburg' }, record_count: count, own_financial_summary: { total_expected: amount, collected: amount, outstanding: 0, awaiting_confirmation: 0 }, availability: { total_expected: amount === null ? 'UNAVAILABLE' : 'AVAILABLE', collected: amount === null ? 'UNAVAILABLE' : 'AVAILABLE', outstanding: 'AVAILABLE', awaiting_confirmation: 'AVAILABLE' } } });
    await tick(); return render();
  };
  render(); return { ui, requests, claimRequests, claimState, routes, auth, params, render, tap, reply };
}
test('Member Club Home loads one authenticated context and only own financial position', async () => {
  const c = setup(); await c.reply(0); assert.equal(c.requests.length, 1); assert.ok(c.requests[0].url.endsWith('/api/groups/travel/context')); assert.equal(c.requests[0].options.headers.Authorization, 'Bearer session-a');
  assert.match(text(c.render()), /WeTraveling/); assert.match(text(c.render()), /Confirmed Collected: R100.00/); assert.doesNotMatch(text(c.render()), /Club management|Documents/);
  assert.match(text(c.render()), /Announcements are not available in this version/);assert.match(text(c.render()), /Events are not available in this version/);
  assert.ok(!nodes(c.render()).some(n=>n.props?.accessibilityLabel==='Announcements'||n.props?.accessibilityLabel==='Events'));
  c.ui.focus(); assert.equal(c.requests.length, 2); c.ui.focus(); assert.equal(c.requests.length, 2);
});
test('Admin entry points depend on the selected membership role, not account identity', async () => {
  const c = setup('admin'); await c.reply(0, 'travel', 'member'); assert.doesNotMatch(text(c.render()), /Manage club/);
  c.params.id = 'eight'; c.render(); await c.reply(1, 'eight', 'treasurer'); assert.match(text(c.render()), /Manage club/); c.tap('Review Payments'); assert.deepEqual(c.routes.at(-1), { pathname: '/(treasurer)/contributions', params: { groupId: 'eight' } });
});
test('Member destinations preserve selected club and obligation period where supported', async () => {
  const c = setup(); await c.reply(0); c.tap('Contribution history'); assert.deepEqual(c.routes.at(-1), { pathname: '/(member)/club/[id]', params: { id: 'travel', month: '10', year: '2026', contribution_id: '', scope: 'club', from: 'member', section: 'history' } }); c.tap('My Contributions'); assert.deepEqual(c.routes.at(-1), { pathname: '/(member)/club/[id]', params: { id: 'travel', month: '10', year: '2026', contribution_id: '', scope: 'club', from: 'member' } });
  c.tap('My Club'); assert.deepEqual(c.routes.at(-1), { pathname: '/club/[id]/info', params: { id: 'travel', from: 'member', month: '10', year: '2026' } }); c.tap('Payments and Proofs'); assert.equal(c.routes.at(-1).params.group_id, 'travel'); assert.equal(c.routes.at(-1).params.month, '10');
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
  assert.equal(nodes(c.render()).find(n => n.type === 'Text' && n.props.accessibilityRole === 'header').props.children[0], 'WeTraveling'); assert.match(text(c.render()), /R300.00/); assert.doesNotMatch(text(c.render()), /R999|R777|Manage club/);
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
  for (const file of ['frontend/app/(member)/_layout.tsx', 'frontend/app/(treasurer)/_layout.tsx', 'frontend/app/(treasurer)/club-detail.tsx']) {
    let expected=cp.execFileSync('git', ['show', '3aff743a88b3b128e5e9f58c6c62368e8d3df370:' + file], { cwd: root, encoding: 'utf8' });
    if (file.endsWith('_layout.tsx')) expected = expected.replace('tabBarActiveTintColor: Colors.mediumGreen', 'tabBarActiveTintColor: Colors.royalBlue');
    if (file.endsWith('club-detail.tsx')) expected = expected.replace(/(approveClaimButton: \{[^{}]*?backgroundColor: )Colors.accent/, '$1Colors.primary');
    if (file.endsWith('club-detail.tsx')) expected=expected.replace(/(memberAvatar: \{[^{}]*)(\})/, '$1 borderWidth: 2, borderColor: Colors.avatarRing, $2');
    if (file.endsWith('club-detail.tsx')) expected = expected
      .replace('name="image-outline" size={18} color={Colors.gold}', 'name="image-outline" size={18} color={Colors.corporateBlue}')
      .replace('name="notifications" size={18} color={Colors.gold}', 'name="notifications" size={18} color={Colors.corporateBlue}')
      .replace(/(remindButton: \{[^{}]*?backgroundColor: )Colors.lightGold/, '$1Colors.iceBlue')
      .replace(/(remindButtonText: \{[^{}]*?color: )Colors.gold/, '$1Colors.corporateBlue');
    assert.equal(fs.readFileSync(path.join(root,file), 'utf8').replace(/\r\n/g, '\n'),expected);
  }
  // claims.tsx has intentional status color and rejection panel changes
  const claimsFile = 'frontend/app/(member)/claims.tsx';
  let claimsExpected = cp.execFileSync('git', ['show', '077f3ad379b33d92eb86f01ac80e2000c0b4472c:' + claimsFile], { cwd: root, encoding: 'utf8' });
  claimsExpected = claimsExpected.replace(/(profilePlaceholder: \{[^{}]*)(\})/, '$1 borderWidth: 2, borderColor: Colors.accent, $2');
  claimsExpected = claimsExpected.replace(/(confirmButton: \{[^{}]*?backgroundColor: )Colors.accent/, '$1Colors.primary');
  const claimsActual = fs.readFileSync(path.join(root, claimsFile), 'utf8').replace(/\r\n/g, '\n');
  // Permit only the explicitly reviewed status-colour and rejection-panel edits.
  const presentationOnly = claimsActual
      .replace("import ProfilePhotoFrame from '../../components/ProfilePhotoFrame';\n", '')
      .replaceAll('<ProfilePhotoFrame>', '').replaceAll('</ProfilePhotoFrame>', '')
      .replace(/(profileImage: \{[^{}]*?borderWidth: )1/, '$12')
      .replace(/(profileImage: \{[^{}]*?borderColor: )Colors.white/, '$1Colors.accent')
      .replace(/(profilePlaceholder: \{[^{}]*?borderWidth: )1/, '$12')
      .replace(/(profilePlaceholder: \{[^{}]*?borderColor: )Colors.white/, '$1Colors.accent')
    .replace(/const getStatusColor = \(status: string\) => \{[\s\S]*?\n\};\n\n/, '')
    .replace('style={[styles.statusText, { color: getStatusColor(claim.status) }]}', 'style={styles.statusText}')
    .replace(/(statusText: \{\n    fontSize: 13,\n)/, '$1    color: Colors.accent;\n'.replace(';', ','))
      .replace(/(rejectionBox: \{[\s\S]*?backgroundColor: )Colors.errorSurface/, '$1Colors.softSage')
      .replace(/(rejectionLabel: \{[\s\S]*?color: )Colors.statusLate/, '$1Colors.sage')
      .replace(/(rejectionText: \{[\s\S]*?color: )Colors.textPrimary/, '$1Colors.textSecondary');
  assert.equal(presentationOnly, claimsExpected);

});


test('Jimmy Admin fixture and Brown Member fixture use authenticated club roles after session restoration', async () => {
 const c=setup('member'); c.auth.user={id:'jimmy'}; c.auth.token='jimmy-restored-session'; c.render();
 await c.reply(1,'travel','admin'); assert.match(text(c.render()),/Manage club/);
 c.tap('Review Payments'); assert.equal(c.routes.at(-1).params.groupId,'travel');
 c.auth.user={id:'brown'}; c.auth.token='brown-session'; assert.doesNotMatch(text(c.render()),/Manage club|Review Payments/);
 await c.reply(2,'travel','member'); assert.doesNotMatch(text(c.render()),/Manage club|Review Payments/);
 c.tap('Back to account Home'); assert.equal(c.routes.at(-1),'/(member)/home');
});
test('Admin role refresh immediately removes management controls when selected membership is demoted', async () => {
 const c=setup('member'); await c.reply(0,'travel','admin'); assert.match(text(c.render()),/Manage club/);
 c.tap('Refresh Club Home'); await c.reply(1,'travel','member'); assert.doesNotMatch(text(c.render()),/Manage club|Review Payments/);
});


test('Shared Club Home exposes both interfaces only when selected club grants administration',async()=>{
 const c=setup('member');await c.reply(0,'travel','admin');c.tap('Admin Home');assert.deepEqual(c.routes.at(-1),{pathname:'/(treasurer)/dashboard',params:{groupId:'travel'}});c.tap('Member Home');assert.equal(c.routes.at(-1),'/(member)/home');
 c.params.id='eight';c.render();await c.reply(1,'eight','member');assert.doesNotMatch(text(c.render()),/Admin Home/);assert.match(text(c.render()),/Member Home/);
});

test('shared club header centres its regular title, retains 112px portrait and reuses directory photo data',async()=>{
 const c=setup();c.auth.user.full_name='Brown Member';await c.reply(0);const tree=c.render();
 const title=nodes(tree).find(n=>n.props.accessibilityRole==='header');assert.equal(title.props.style.textAlign,'center');assert.equal(title.props.style.fontWeight,'400');
 assert.match(text(tree),/Good (morning|afternoon|evening), Brown!/);assert.doesNotMatch(text(tree),/Member Dashboard|Here's what's happening|Morning\/Afternoon/);
 const image=nodes(tree).find(n=>n.type==='Image');assert.deepEqual([image.props.style.width,image.props.style.height,image.props.style.borderRadius],[112,112,56]);assert.equal(image.props.resizeMode,'cover');
 assert.equal(nodes(tree).find(n=>n.type==='ClubMemberDirectory'),undefined); c.tap('My Club'); assert.equal(c.routes.at(-1).params.id,'travel');
 for(const width of [320,360,393,412])assert.ok(width-48-116-16>=140,'greeting can wrap beside the unchanged photo');
 assert.equal(c.claimRequests.length,1);c.render();c.render();assert.equal(c.claimRequests.length,1);
});
test('photo viewer closes on dismissal, club/account changes and rapid A-B-A; old Admin shortcuts cannot navigate',async()=>{
 const c=setup();await c.reply(0,'travel','admin');c.tap('View your profile photo');let viewer=nodes(c.render()).find(n=>n.type==='ProfilePhotoViewer');assert.equal(viewer.props.visible,true);viewer.props.onClose();assert.equal(nodes(c.render()).find(n=>n.type==='ProfilePhotoViewer').props.visible,false);
 c.tap('View your profile photo');const old=nodes(c.render()).find(n=>n.props.accessibilityLabel==='Admin Home');c.params.id='eight';c.render();assert.equal(nodes(c.render()).find(n=>n.type==='ProfilePhotoViewer').props.visible,false);
 c.params.id='travel';c.render();await c.reply(2,'travel','member');old.props.onPress();assert.deepEqual(c.routes,[]);assert.equal(nodes(c.render()).find(n=>n.type==='ProfilePhotoViewer').props.visible,false);
 c.tap('View your profile photo');c.auth.user={id:'brown',full_name:'Brown',profile_photo:'data:image/png;base64,new'};c.auth.token='new-session';c.render();assert.equal(nodes(c.render()).find(n=>n.type==='ProfilePhotoViewer').props.visible,false);
});
test('club claims preview filters own records by the active club without refetching for every club switch',async()=>{
 const c=setup();await c.reply(0);c.claimState.records=[{claim_id:'mine',group_id:'travel',group_name:'WeTraveling',status:'approved',amount:1250},{claim_id:'other',group_id:'eight',group_name:'Eighty8',status:'approved',amount:999}];
 c.ui.blur();c.ui.focus();await c.reply(1);assert.match(text(c.render()),/R1250.00/);assert.doesNotMatch(text(c.render()),/R999.00/);
 const reads=c.claimRequests.length;c.params.id='eight';c.render();assert.doesNotMatch(text(c.render()),/R1250.00/);await c.reply(2,'eight');assert.match(text(c.render()),/R999.00/);assert.equal(c.claimRequests.length,reads);
 c.auth.user={id:'brown'};c.auth.token='other-account';assert.doesNotMatch(text(c.render()),/R999.00|R1250.00/);
});

test('claim preview retains backend pending_review and legacy upcoming states without inventing missing amounts',async()=>{
 const c=setup();await c.reply(0);c.claimState.records=[{claim_id:'pending',group_id:'travel',group_name:'WeTraveling',status:'pending_review',amount:null},{claim_id:'legacy',group_id:'travel',group_name:'WeTraveling',status:'upcoming',amount:250}];
 c.ui.blur();c.ui.focus();await c.reply(1);const card=nodes(c.render()).find(n=>n.type==='View'&&text(n.props.children?.[0])==='Your upcoming claims and payouts');
 assert.match(text(card),/Claim awaiting reviewAmount unavailable/);assert.match(text(card),/Upcoming claimR250.00/);assert.doesNotMatch(text(card),/R0.00/);
});


test('club dashboard alerts use the existing authenticated destination and stale account callbacks cannot navigate',async()=>{
 const c=setup();await c.reply(0);const old=nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Club alerts');c.tap('Club alerts');assert.equal(c.routes.at(-1),'/(member)/alerts');c.auth.user={id:'other'};c.auth.token='other-session';c.render();old.props.onPress();assert.equal(c.routes.length,1);assert.equal(nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Club alerts'),undefined);
});
