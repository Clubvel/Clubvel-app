const test = require('node:test');
const assert = require('node:assert/strict');
const { load, engine, tick, nodes, text, button, native, colors } = require('./ui-harness.cjs');

function setup(screen = 'member', holdInvitations = false, params = {}, initialUser = { id: 'member', full_name: 'Test Member', first_name: 'Test' }, initialContextRole = 'admin') {
  const ui = engine(), requests = [], invitations = [], actions = [], alerts = [], routes = [];
  const contextRequests=[]; const contextState={ handler:null, role:initialContextRole };
  const financialRequests=[]; const financialState={ handler:null };
  const auth = { user: initialUser, token: 'session' };
  const Screen = load(screen === 'member' ? 'app/(member)/home.tsx' : 'app/(treasurer)/dashboard.tsx', {
    react: ui.react,
    'react-native': { ...native, Alert: {alert: (...args) => alerts.push(args)}, RefreshControl: 'RefreshControl', TextInput: 'TextInput',
      KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' },
      Keyboard: { dismiss() {} }, TouchableWithoutFeedback: 'TouchableWithoutFeedback' },
    'expo-router': { useLocalSearchParams:()=>params, useFocusEffect: ui.useFocusEffect, useRouter: () => ({ push: r => routes.push(r) }) },
    '../../components/ProfilePhotoViewer': { default: 'ProfilePhotoViewer' },
    '../../contexts/AuthContext': { useAuth: () => auth },
    '../../components/StatusPill': { StatusPill: 'StatusPill' },
    '../../components/AdBanner': { AdBanner: 'AdBanner' },
    '../../services/paymentReminder': { addPaymentReminder: async () => {} },
    '../../services/paymentSummaryRecords': load('services/paymentSummaryRecords.ts'),
    '../../services/monthlyReport': { ...load('services/monthlyReport.ts'), currentReportPeriod: () => ({ year: 2026, month: 10 }) },
    '../../constants/Colors': { Colors: colors }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '@react-native-async-storage/async-storage': {},
    axios: { get: (url,options) => url.includes('/api/treasurer/reports/') ? (() => {
      financialRequests.push({url,options});
      if(financialState.handler) return financialState.handler(url,options);
      const [,id]=url.match(/reports\/([^/]+)\/monthly/);
      return Promise.resolve({data:{schema_version:1,club:{id:decodeURIComponent(id)},period:{...options.params,timezone:'Africa/Johannesburg'},summary:{confirmed:0,expected:0,outstanding:0,awaiting_review:0},contributions:[]}});
    })() : url.endsWith('/context') ? (() => {
      contextRequests.push({url,options});
      if(contextState.handler) return contextState.handler(url,options);
      const id=decodeURIComponent(url.match(/groups\/([^/]+)\/context/)[1]);
      return Promise.resolve({data:{club:{id,name:id==='group-a'||id==='a'?'WeTravel':'Eighty8'},membership:{id:'membership-'+id,status:'active',role:contextState.role}}});
    })() : url.includes('/invitations/') ? (holdInvitations ? new Promise(resolve => invitations.push({url,resolve})) : Promise.resolve({ data: { invitations: [] } }))
      : new Promise(resolve => requests.push({ url, resolve })), post: (url,body,options) => new Promise((resolve,reject)=>actions.push({url,body,options,resolve,reject})) },
  }).default;
  const render = () => ui.render(Screen);
  const respond = async (index, name, role = 'member') => {
    requests[index].resolve({ data: { user: auth.user,
      summary: { total_saved: 0, confirmed_collected_current_period: 0, confirmed_collected: 0, confirmed_collected_availability: "AVAILABLE", active_clubs: 1, overdue_contributions: 0, upcoming_payments: 0, claims_count: 0 },
      clubs: [{ id: 'group-a', name, role, member_count: 2, collected: 0, expected: 200, due_date: 25, late_count: 0, monthly_contribution: 100, contribution_mode: 'fixed_monthly', status: 'pending' }] } });
    await tick();
    if(screen === 'member') { const toggle=nodes(render()).find(n=>n.props?.accessibilityLabel==='My Clubs & Stokvels'); if(toggle && !toggle.props.accessibilityState?.expanded) toggle.props.onPress(); }
  };
  const refresh = () => nodes(render()).find(n => n.type === 'ScrollView').props.refreshControl.props.onRefresh();
  render();
  return { ui, auth, contextRequests, contextState, financialRequests, financialState, params, render, requests, invitations, actions, alerts, routes, respond, refresh };
}

test('initial Home load uses the existing dashboard endpoint once', async () => {
  const c = setup();
  assert.equal(c.requests.length, 1);
  assert.ok(c.requests[0].url.endsWith('/api/member/dashboard/member'));
  await c.respond(0, 'WeTravel');
  assert.ok(text(c.render()).includes('WeTravel'));
  c.render(); assert.equal(c.requests.length, 1);
});

test('returning to Home replaces WeTravel with the authoritative renamed club', async () => {
  const c = setup(); await c.respond(0, 'WeTravel'); c.render();
  c.ui.blur(); c.ui.focus();
  assert.equal(c.requests.length, 2);
  await c.respond(1, 'WeTraveling');
  assert.ok(text(c.render()).includes('WeTraveling'));
});

test('pull-to-refresh still retrieves the latest name', async () => {
  const c = setup(); await c.respond(0, 'WeTravel');
  c.refresh(); await c.respond(1, 'WeTraveling');
  assert.ok(text(c.render()).includes('WeTraveling'));
});

test('a slower older dashboard response cannot overwrite a newer refresh', async () => {
  const c = setup(); await c.respond(0, 'WeTravel');
  c.refresh(); c.refresh();
  await c.respond(2, 'WeTraveling');
  await c.respond(1, 'WeTravel');
  assert.ok(text(c.render()).includes('WeTraveling'));
});

test('focus during an existing refresh reuses its request', async () => {
  const c = setup(); await c.respond(0, 'WeTravel');
  c.refresh(); c.ui.blur(); c.ui.focus();
  assert.equal(c.requests.length, 2);
  await c.respond(1, 'WeTraveling');
  assert.ok(text(c.render()).includes('WeTraveling'));
});

test('member and administrator club cards enter the appropriate Club views', async () => {
  const c = setup(); await c.respond(0, 'WeTraveling');
  button(c.render(), 'WeTraveling').props.onPress();
  assert.deepEqual(c.routes, [{ pathname: '/club/[id]', params: { id: 'group-a', from: 'member' } }]);
  c.refresh(); await c.respond(1, 'WeTraveling', 'admin');
  button(c.render(), 'WeTraveling').props.onPress();
  assert.deepEqual(c.routes[1], { pathname: '/(treasurer)/dashboard',
    params: { groupId: 'group-a' } });
});

test('Home displays its existing header while the first dashboard response is unresolved', async () => {
  const c = setup();
  assert.match(text(c.render()), /Clubvel/);
  assert.ok(nodes(c.render()).some(n => n.type === 'ActivityIndicator'));
  await c.respond(0, 'WeTraveling');
  assert.match(text(c.render()), /WeTraveling/);
});

test('Admin Home displays its existing header before dashboard data arrives', async () => {
  const c = setup('admin');
  assert.match(text(c.render()), /Clubvel/);
  assert.ok(nodes(c.render()).some(n => n.type === 'ActivityIndicator'));
  assert.equal(c.requests.length, 1);
  assert.match(c.requests[0].url, /\/api\/admin\/dashboard\/member$/);
  c.requests[0].resolve({ data: { summary: { total_clubs: 0, total_members: 0 }, clubs: [], urgent_alerts: [], next_claim: null } });
  await tick();
  assert.match(text(c.render()), /Create a Group/);
});

for(const role of ['member','admin'])test(`${role} club count reveals the existing same-snapshot list without another request`,async()=>{
 const c=setup(role);await c.respond(0,'WeTraveling');const tree=c.render();const scroll=nodes(tree).find(n=>n.type==='ScrollView'),calls=[];
 scroll.props.ref.current={scrollTo:options=>calls.push(options)};
 const title=role==='member'?'My Clubs':'All Clubs';
 nodes(tree).find(n=>n.type==='View'&&n.props.onLayout&&text(n).startsWith(title)).props.onLayout({nativeEvent:{layout:{y:410}}});
 const card=nodes(tree).find(n=>n.type==='TouchableOpacity'&&n.props.accessibilityLabel===`Show ${title}`);assert.equal(card.props.accessibilityRole,'button');card.props.onPress();
 assert.deepEqual(calls,[{y:410,animated:true}]);assert.equal(c.requests.length,1);assert.deepEqual(c.routes,[]);
 const labels=role==='member'?['Contributions','Upcoming Payments','Claims']:['Total Members','Collected This Month','Late Members'];
 for(const label of labels)assert.equal(nodes(tree).some(n=>n.type==='TouchableOpacity'&&text(n).startsWith(label)),false,label);
 if(role==='member'){
  nodes(tree).find(n=>n.type==='TouchableOpacity'&&n.props.accessibilityLabel==='Show approved claims awaiting payout').props.onPress();
  assert.deepEqual(c.routes.at(-1),{pathname:'/(member)/claims',params:{view:'payouts',claim_id:''}});
 }
});

const flattenedStyle = node => Object.assign({}, ...[node.props.style].flat().filter(Boolean));
for (const role of ['member', 'admin']) for (const count of [0, 3]) {
  test(`${role} Home keeps semantic colours and downward affordances at count ${count}`, async () => {
    const c = setup(role);
    c.requests[0].resolve({ data: { user: { id: 'member', full_name: 'Test Member', first_name: 'Test' },
      summary: { total_saved: 200, confirmed_collected: 200, confirmed_collected_availability: "AVAILABLE", active_clubs: 1, upcoming_payments: count, claims_count: 2,
        upcoming_payout_amount: 100, total_clubs: 1, total_members: 2,
        total_collected_this_month: 200, confirmed_collected_current_period: 200, late_members_count: count },
      clubs: [], urgent_alerts: [], next_claim: null } });
    await tick();
    const tree = c.render();
    const expectations = role === 'member'
      ? [['Contributions', 'statusPaid'], ['Groups & Clubs', 'textPrimary'], ['Upcoming Payments', 'statusLate'], ['Claims', 'textPrimary'], ['Upcoming Payouts', 'accent']]
      : [['Total Clubs', 'textPrimary'], ['Total Members', 'textPrimary'], ['Collected This Month', 'statusPaid'], ['Late Members', 'statusLate']];
    for (const [label, colour] of expectations) {
      const title = nodes(tree).find(n => n.type === 'Text' && text(n) === label);
      assert.ok(title, label);
      const card = nodes(tree).find(n => ['View', 'TouchableOpacity'].includes(n.type) && n.props.children?.includes(title));
      const value = nodes(card).filter(n => n.type === 'Text')[1];
      assert.equal(flattenedStyle(value).color, colour, label);
      assert.equal(flattenedStyle(title).color, 'textSecondary');
      const icons = nodes(card).filter(n => n.type === 'Ionicons');
      if (card.type === 'TouchableOpacity') {
        assert.equal(icons.length, 1);
        assert.equal(icons[0].props.name, 'chevron-down');
        assert.equal(icons[0].props.size, 14);
        assert.equal(icons[0].props.color, 'textSecondary');
        assert.deepEqual(flattenedStyle(icons[0]), { position: 'absolute', top: '100%', left: 0 });
        const valueGroup = nodes(card).find(n => n.type === 'View' && n.props.children?.includes(value));
        assert.ok(valueGroup.props.children.includes(icons[0]), label);
      } else assert.equal(icons.length, 0, label);
      if (['Upcoming Payments', 'Late Members'].includes(label)) assert.equal(text(value), String(count));
      if (card.type === 'TouchableOpacity') {
        assert.equal(card.props.accessibilityRole, 'button');
        assert.ok(card.props.accessibilityLabel);
        assert.equal(card.props.activeOpacity, 0.75);
        assert.equal(typeof card.props.onPress, 'function');
      }
    }
  });
}

test('Member dashboard is usable without waiting for a slow invitations request', async () => {
 const c=setup('member',true);await c.respond(0,'WeTraveling');
 assert.match(text(c.render()),/WeTraveling/);
 assert.equal(nodes(c.render()).some(n=>n.type==='Text'&&text(n)==='Loading dashboard…'),false);
});
test('Admin focus refresh coalesces an active request and stale refresh cannot overwrite latest',async()=>{
 const c=setup('admin');c.ui.blur();c.ui.focus();assert.equal(c.requests.length,1);
 await c.respond(0,'WeTraveling');c.refresh();c.refresh();await c.respond(2,'Eighty8');await c.respond(1,'WeTraveling');
 assert.match(text(c.render()),/Eighty8/);assert.doesNotMatch(text(c.render()),/WeTraveling/);
 c.ui.blur();c.ui.focus();assert.equal(c.requests.length,4);
});
test('both Homes retain real identity and menu while initial requests are pending',()=>{
 for(const role of ['member','admin']) {
  const c=setup(role);assert.ok(nodes(c.render()).some(n=>n.props?.accessibilityLabel==='Open profile menu'));
  assert.ok(nodes(c.render()).some(n=>n.type==='ActivityIndicator'));
 }
});

for (const role of ['member', 'admin']) {
 test(`${role} Home hides the prior account snapshot immediately and accepts only the new account response`, async () => {
  const c=setup(role); await c.respond(0,'WeTraveling'); assert.match(text(c.render()),/WeTraveling/);
  c.auth.user={id:'other',full_name:'Other Member'}; c.auth.token='other-session';
  assert.doesNotMatch(text(c.render()),/WeTraveling/); assert.equal(c.requests.length,2);
  await c.respond(1,'Eighty8'); assert.match(text(c.render()),/Eighty8/);
 });
 test(`${role} Home rejects an old response after logout even without a replacement request`, async () => {
  const c=setup(role); c.auth.user=null; c.auth.token=null; c.render();
  await c.respond(0,'Old Account Club'); assert.doesNotMatch(text(c.render()),/Old Account Club/);
 });
 test(`${role} Home rejects old-session responses during account switching and keeps current-session background data`, async () => {
  const c=setup(role); await c.respond(0,'WeTraveling'); c.render(); c.refresh();
  assert.match(text(c.render()),/WeTraveling/);
  c.auth.token='new-session'; assert.doesNotMatch(text(c.render()),/WeTraveling/);
  await c.respond(2,'Eighty8'); await c.respond(1,'Old Account Club');
  assert.match(text(c.render()),/Eighty8/); assert.doesNotMatch(text(c.render()),/Old Account Club/);
 });
}

test('Member Home never carries pending invitations into another account',async()=>{
 const c=setup('member',true);await c.respond(0,'WeTraveling');
 c.invitations[0].resolve({data:{invitations:[{id:'private-invite',group_id:'private-group',group_name:'Private Old Account Club',expires_at:'2099-01-01'}]}});await tick();
 assert.match(text(c.render()),/Private Old Account Club/);
 c.auth.user={id:'other',full_name:'Other Account'};c.auth.token='other-session';assert.doesNotMatch(text(c.render()),/Private Old Account Club/);
 await c.respond(1,'Eighty8');assert.doesNotMatch(text(c.render()),/Private Old Account Club/);
});
test('Member Home ignores late invitations belonging to a logged-out session',async()=>{
 const c=setup('member',true);c.auth.user=null;c.auth.token=null;c.render();
 c.invitations[0].resolve({data:{invitations:[{id:'old',group_name:'Wrong Session Invitation',expires_at:'2099-01-01'}]}});await tick();
 assert.doesNotMatch(text(c.render()),/Wrong Session Invitation/);
});

for(const role of ['member','admin'])test(`${role} old dashboard callback cannot supersede the new account request`,async()=>{
 const c=setup(role);await c.respond(0,'WeTraveling');const oldRefresh=nodes(c.render()).find(n=>n.type==='ScrollView').props.refreshControl.props.onRefresh;
 c.auth.user={id:'other',full_name:'Other Account'};c.auth.token='other-session';c.render();assert.equal(c.requests.length,2);
 oldRefresh();assert.equal(c.requests.length,2);await c.respond(1,'Eighty8');assert.match(text(c.render()),/Eighty8/);
});
for(const action of ['Accept','Decline'])test(`Member old-account invitation ${action} completion cannot refresh or alert in the new account`,async()=>{
 const c=setup('member',true);await c.respond(0,'WeTraveling');
 c.invitations[0].resolve({data:{invitations:[{id:'old-invitation',group_id:'old-group',group_name:'Old Private Club',expires_at:'2099-01-01'}]}});await tick();
 const work=button(c.render(),action).props.onPress();assert.equal(c.actions.length,1);assert.equal(c.actions[0].options.headers.Authorization,'Bearer session');
 c.auth.user={id:'other',full_name:'Other Account'};c.auth.token='other-session';c.render();assert.equal(c.requests.length,2);
 c.actions[0].resolve({data:{}});await tick();assert.equal(c.requests.length,2);await work;
 assert.deepEqual(c.alerts,[]);await c.respond(1,'Eighty8');assert.match(text(c.render()),/Eighty8/);assert.doesNotMatch(text(c.render()),/Old Private Club/);
});


test('Member Home uses authoritative confirmed total and never substitutes the legacy number',async()=>{
 const c=setup();c.requests[0].resolve({data:{user:c.auth.user,summary:{total_saved:999,confirmed_collected:25,confirmed_collected_availability:'AVAILABLE',active_clubs:0,upcoming_payments:0,claims_count:0},clubs:[]}});await tick();
 assert.match(text(c.render()),/R25.00/);assert.doesNotMatch(text(c.render()),/R999.00/);
});
test('Member Home renders unavailable authoritative amount without invented zero',async()=>{
 const c=setup();c.requests[0].resolve({data:{user:c.auth.user,summary:{total_saved:25,confirmed_collected:null,confirmed_collected_availability:'UNAVAILABLE',active_clubs:0,upcoming_payments:0,claims_count:0},clubs:[]}});await tick();
 assert.match(text(c.render()),/Unable to load · Retry/);
 assert.doesNotMatch(text(c.render()),/Not available|R25.00/);
 assert.ok(nodes(c.render()).some(n=>n.type==='Text'&&text(n)==='Contributions'));
});
test('Member Home shows controlled dashboard 409 and keeps its shell',async()=>{
 const c=setup(); // Replace the queued response with a rejecting request on refresh.
 await c.respond(0,'WeTraveling');
 c.refresh();c.requests[1].resolve(Promise.reject({response:{status:409}}));await tick();
 assert.match(text(c.render()),/payment records need checking/);assert.match(text(c.render()),/Clubvel/);
});


test('Member Contributions displays genuine zero numerically', async () => {
 const c=setup(); await c.respond(0,'WeTravel');
 const card=nodes(c.render()).find(n=>n.type==='View'&&text(n).includes('Contributions')&&text(n).includes('R0.00'));
 assert.ok(card); assert.doesNotMatch(text(c.render()),/could not be verified|Not available/);
});
for (const amount of [undefined, null, NaN, Infinity, -1, '20']) test(`Member Home never turns unreliable amount ${amount} into zero`, async () => {
 const c=setup(); c.requests[0].resolve({data:{user:c.auth.user,summary:{total_saved:99,confirmed_collected:amount,confirmed_collected_availability:'AVAILABLE',active_clubs:0,upcoming_payments:0,claims_count:0},clubs:[]}}); await tick();
 assert.match(text(c.render()),/Unable to load · Retry/);
 assert.ok(nodes(c.render()).some(n=>n.type==='Text'&&text(n)==='Contributions'));
 assert.doesNotMatch(text(c.render()),/R99.00|Not available/);
});
for (const [mode,type,monthly,target,label] of [
 ['flexible_goal','travel',0,1000,'R1000.00 goal per member'],
 ['flexible_goal','savings',0,null,'Flexible contributions'],
 ['fixed_monthly','travel',0,null,'Flexible contributions'],
 ['fixed_monthly','savings',100,null,'R100.00/month'],
 ['fixed_monthly','savings',0,null,'No fixed monthly amount'],
 [undefined,'savings',0,null,'Contribution details could not be verified'],
]) test(`Compact club list omits ${mode}/${type} financial clutter without inventing monthly obligations`, async () => {
 const c=setup(); c.requests[0].resolve({data:{user:c.auth.user,summary:{total_saved:0,confirmed_collected:0,confirmed_collected_availability:'AVAILABLE',active_clubs:1,upcoming_payments:0,claims_count:0},clubs:[{id:'travel',name:'WeTravel',member_count:2,role:'member',monthly_contribution:monthly,contribution_mode:mode,group_type:type,target_amount_per_member:target,status:'pending'}]}}); await tick();
 nodes(c.render()).find(n=>n.props?.accessibilityLabel==='My Clubs & Stokvels').props.onPress();assert.match(text(c.render()),/WeTravel/);assert.doesNotMatch(text(c.render()),new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.doesNotMatch(text(c.render()),/R0\/month/);
});


test('Club administration menu follows loaded club roles and disappears on account change',async()=>{
 const c=setup();await c.respond(0,'WeTravel','admin');assert.ok(button(c.render(),'Club administration'));
 c.auth.user={id:'brown'};c.auth.token='brown-session';assert.equal(button(c.render(),'Club administration'),undefined);
 await c.respond(1,'WeTravel','member');assert.equal(button(c.render(),'Club administration'),undefined);
});

test('mixed club roles route Members, Admins and Treasurers using each selected club role', async () => {
 const c=setup();
 c.requests[0].resolve({data:{user:c.auth.user,summary:{total_saved:0,confirmed_collected:0,confirmed_collected_availability:'AVAILABLE',active_clubs:3},clubs:[
  {id:'travel',name:'WeTravel',role:'admin',member_count:2},
  {id:'eight',name:'Eighty8',role:'member',member_count:2},
  {id:'third',name:'Third Club',role:'treasurer',member_count:2}
 ]}});await tick();
 for(const [name,id,pathname] of [['WeTravel','travel','/(treasurer)/dashboard'],['Eighty8','eight','/club/[id]'],['Third Club','third','/(treasurer)/dashboard']]){
  const toggle=nodes(c.render()).find(n=>n.props?.accessibilityLabel==='My Clubs & Stokvels');if(!toggle.props.accessibilityState.expanded)toggle.props.onPress();button(c.render(),name).props.onPress();assert.equal(c.routes.at(-1).pathname,pathname);assert.equal(c.routes.at(-1).params[ pathname === '/club/[id]' ? 'id' : 'groupId'],id);
 }
});


test('all five summary cards remain visible while the first dashboard request is pending', () => {
 const c=setup();const tree=c.render();for(const label of ['Contributions','Groups & Clubs','Upcoming Payments','Claims','Upcoming Payouts']) assert.ok(nodes(tree).some(n=>n.type==='Text'&&text(n)===label),label);
 assert.ok(nodes(tree).some(n=>n.props?.accessibilityLabel==='Loading contribution total'));
 assert.doesNotMatch(text(tree),/ContributionsR0/);
});
test('initial controlled error retains Contributions with retry and no invented money', async () => {
 const c=setup();c.requests[0].resolve(Promise.reject({response:{status:409}}));await tick();
 assert.match(text(c.render()),/ContributionsUnable to load · Retry/);assert.doesNotMatch(text(c.render()),/ContributionsR0/);
 nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Retry contribution total').props.onPress();assert.equal(c.requests.length,2);
 await c.respond(1,'WeTravel');assert.match(text(c.render()),/ContributionsR0.00/);
});
test('missing authoritative contract keeps Contributions visible without using total_saved',async()=>{
 const c=setup();c.requests[0].resolve({data:{user:c.auth.user,summary:{total_saved:999,active_clubs:0,upcoming_payments:0,claims_count:0},clubs:[]}});await tick();
 assert.match(text(c.render()),/ContributionsUnable to load · Retry/);assert.doesNotMatch(text(c.render()),/R999|ContributionsR0/);
});


test('missing or malformed secondary dashboard values never invent numeric zeros', async () => {
 for (const value of [undefined, null, '0', -1, NaN]) {
  const c=setup(); c.requests[0].resolve({data:{user:c.auth.user,summary:{total_saved:0,confirmed_collected:0,confirmed_collected_availability:'AVAILABLE',active_clubs:value,upcoming_payments:value,claims_count:value,upcoming_payout_amount:value},clubs:[]}}); await tick();
  const content=text(c.render()); assert.match(content,/ContributionsR0.00/);
  for (const label of ['Groups & Clubs','Upcoming Payments','Claims','Upcoming Payouts']) assert.ok(content.includes(label+'—'),label);
 }
});

for(const role of ['admin','treasurer']) test(`Club administration selects the authorised ${role} club and enters its dashboard`,async()=>{
 const c=setup();await c.respond(0,'WeTravel',role);button(c.render(),'Club administration').props.onPress();
 const choose=nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Administer WeTravel');assert.ok(choose);choose.props.onPress();
 assert.deepEqual(c.routes.at(-1),{pathname:'/(treasurer)/dashboard',params:{groupId:'group-a'}});
});
test('stale Club administration choice cannot navigate after an account switch or role revocation',async()=>{
 for(const switchAccount of [true,false]){
 const c=setup();await c.respond(0,'WeTravel','admin');button(c.render(),'Club administration').props.onPress();const choose=nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Administer WeTravel');
 if(switchAccount){c.auth.user={id:'Brown'};c.auth.token='new-session';c.render();}
 else{c.refresh();await c.respond(1,'WeTravel','member');c.render();}
 choose.props.onPress();assert.deepEqual(c.routes,[]);
 }
});

test('many authorised administration choices stay scrollable without hiding Sign Out',async()=>{
 const c=setup();c.requests[0].resolve({data:{user:c.auth.user,summary:{active_clubs:4},clubs:['A','B','C','D'].map((name,index)=>({id:String(index),name,role:'admin'}))}});await tick();
 button(c.render(),'Club administration').props.onPress();const choices=nodes(c.render()).filter(n=>n.props?.accessibilityLabel?.startsWith('Administer '));assert.equal(choices.length,4);
 choices[3].props.onPress();assert.equal(c.routes.at(-1).params.groupId,'3');
});

const managedData=(clubs)=>({summary:{total_clubs:clubs.length,total_members:9,total_collected_this_month:999,confirmed_collected_current_period:999,late_members_count:9},clubs,urgent_alerts:[],next_claim:null});
test('Jimmy completes the club picker, authenticated Admin layout and selected-club management journey',async()=>{
 const member=setup('member',false,{}, {id:'jimmy',full_name:'Jimmy',first_name:'Jimmy'});await member.respond(0,'WeTravel','admin');
 button(member.render(),'Open your authorised club dashboard').props.onPress();let tree=member.render();
 assert.match(text(tree),/Choose a club to administer/);assert.ok(nodes(tree).some(n=>n.type==='ScrollView'&&n.props.key==='administration'));
 nodes(tree).find(n=>n.props.accessibilityLabel==='Administer WeTravel').props.onPress();const route=member.routes.at(-1);assert.equal(route.pathname,'/(treasurer)/dashboard');assert.equal(route.params.groupId,'group-a');
 const ui=engine();const Layout=load('app/(treasurer)/_layout.tsx',{react:ui.react,'react-native':native,'expo-router':{Tabs:{Screen:'Screen'},Redirect:'Redirect'},'../../contexts/AuthContext':{useAuth:()=>({user:member.auth.user,loading:false})},'../../constants/Colors':{Colors:colors},'@expo/vector-icons':{Ionicons:'Ionicons'}}).default;
 assert.notEqual(ui.render(Layout).type,'Redirect');
 const admin=setup('admin',false,route.params,member.auth.user);assert.ok(admin.requests[0].url.endsWith('/api/admin/dashboard/jimmy'));
 admin.requests[0].resolve({data:managedData([{id:'group-a',name:'WeTravel',member_count:2,late_count:0,financial_summary:{collected:500,total_expected:700,collection_rate:71.4}}])});await tick();
 assert.match(text(admin.render()),/WeTravel administration/);assert.doesNotMatch(text(admin.render()),/R999.00/);
 for(const [label,destination,key] of [['Manage members','members','groupId'],['Manage payments','contributions','groupId'],['Manage claims','claims','groupId'],['Monthly reports','reports','group_id']]){
  nodes(admin.render()).find(n=>n.props.accessibilityLabel===label).props.onPress();assert.equal(admin.routes.at(-1).pathname,`/(treasurer)/${destination}`);assert.equal(admin.routes.at(-1).params[key],'group-a');
 }
});
test('Brown and an explicitly unauthorized club never receive Admin controls or another club fallback',async()=>{
 const member=setup();await member.respond(0,'WeTravel','member');assert.equal(button(member.render(),'Club administration'),undefined);
 for(const clubs of [[],[{id:'other',name:'Other Club',member_count:2,late_count:0}]]){
  const c=setup('admin',false,{groupId:'group-a'},{id:'brown',full_name:'Brown'},'member');c.requests[0].resolve({data:managedData(clubs)});await tick();
  assert.match(text(c.render()),/Administration access to this club is unavailable/);assert.equal(button(c.render(),'Manage members'),undefined);assert.doesNotMatch(text(c.render()),/Other Club|R999/);
 }
});
test('rapid selected-club switching and revoked rights reject stale Admin management callbacks',async()=>{
 const c=setup('admin',false,{groupId:'a'});c.requests[0].resolve({data:managedData([{id:'a',name:'WeTravel',member_count:2,late_count:0},{id:'b',name:'Eighty8',member_count:1,late_count:0}])});await tick();const old=nodes(c.render()).find(n=>n.props.accessibilityLabel==='Manage members');
 c.params.groupId='b';c.render();await tick();assert.match(text(c.render()),/Eighty8 administration/);assert.doesNotMatch(text(c.render()),/WeTravel administration/);old.props.onPress();assert.deepEqual(c.routes,[]);
 c.params.groupId='a';c.render();c.auth.token='new-session';c.render();old.props.onPress();assert.deepEqual(c.routes,[]);assert.equal(button(c.render(),'Manage members'),undefined);
});
test('older backend response shows explicit unverified totals, never a fabricated or legacy collection value',async()=>{
 const c=setup('admin');const data=managedData([]);delete data.summary.confirmed_collected_current_period;c.requests[0].resolve({data});await tick();assert.match(text(c.render()),/Collected This MonthTotal not verified—/);assert.doesNotMatch(text(c.render()),/R999.00/);
});

test('denied Admin refresh immediately masks prior data and invalidates old management callbacks',async()=>{
 const c=setup('admin',false,{groupId:'a'});c.requests[0].resolve({data:managedData([{id:'a',name:'WeTravel',member_count:2,late_count:0}])});await tick();const old=nodes(c.render()).find(n=>n.props.accessibilityLabel==='Manage members');
 c.refresh();c.requests[1].resolve(Promise.reject({response:{status:403}}));await tick();assert.doesNotMatch(text(c.render()),/WeTravel administration/);assert.match(text(c.render()),/Administration access has been denied/);old.props.onPress();assert.deepEqual(c.routes,[]);
});

test('verified club Admin controls remain usable when financial dashboard fails, without inventing totals',async()=>{
 const c=setup('admin',false,{groupId:'group-a'},{id:'jimmy',full_name:'Jimmy'});
 c.requests[0].resolve(Promise.reject({response:{status:500}}));await tick();
 assert.match(text(c.render()),/WeTravel administration/);assert.match(text(c.render()),/Could not load administration/);assert.doesNotMatch(text(c.render()),/R0.00|R999.00/);
 nodes(c.render()).find(n=>n.props.accessibilityLabel==='Manage members').props.onPress();assert.equal(c.routes.at(-1).params.groupId,'group-a');
 assert.equal(c.contextRequests.length,1);assert.equal(c.contextRequests[0].options.headers.Authorization,'Bearer session');
});
test('Admin A-B-A context tickets reject old callbacks and delayed B responses',async()=>{
 const c=setup('admin',false,{groupId:'a'});c.requests[0].resolve({data:managedData([{id:'a',name:'WeTravel',member_count:2,late_count:0},{id:'b',name:'Eighty8',member_count:2,late_count:0}])});await tick();const old=nodes(c.render()).find(n=>n.props.accessibilityLabel==='Manage members');
 const pending=[];c.contextState.handler=url=>new Promise(resolve=>pending.push({url,resolve}));
 c.params.groupId='b';c.render();c.params.groupId='a';c.render();assert.equal(button(c.render(),'Manage members'),undefined);old.props.onPress();assert.deepEqual(c.routes,[]);
 pending[1].resolve({data:{club:{id:'a',name:'Current WeTravel'},membership:{id:'a',role:'admin',status:'active'}}});await tick();assert.match(text(c.render()),/Current WeTravel administration/);
 pending[0].resolve({data:{club:{id:'b',name:'Stale Eighty8'},membership:{id:'b',role:'admin',status:'active'}}});await tick();assert.doesNotMatch(text(c.render()),/Stale Eighty8/);old.props.onPress();assert.deepEqual(c.routes,[]);
});

const monthlyReply=(url,changes={})=>{
 const [,id]=url.match(/reports\/([^/]+)\/monthly/);
 return {schema_version:1,club:{id:decodeURIComponent(id)},period:{month:10,year:2026,timezone:'Africa/Johannesburg'},summary:{confirmed:5500,expected:6700,outstanding:1200,awaiting_review:300},...changes};
};
async function olderClubDashboard(c){
 c.requests[0].resolve({data:managedData([{id:c.params.groupId,name:'WeTravel',member_count:2,late_count:0,collected:90000,expected:90000}])});
 await tick();c.render();await tick();return c.render();
}
test('older dashboard obtains R5500 confirmed for the exact authorized October club, never the legacy lifetime figure',async()=>{
 const c=setup('admin',false,{groupId:'group-a'},{id:'jimmy',full_name:'Jimmy'});
 c.financialState.handler=url=>Promise.resolve({data:monthlyReply(url)});
 const tree=await olderClubDashboard(c);
 assert.match(text(tree),/Confirmed · October 2026R5500.00/);assert.doesNotMatch(text(tree),/R90000|Total not verified/);
 assert.equal(c.financialRequests.length,1);const r=c.financialRequests[0];
 assert.ok(r.url.endsWith('/api/treasurer/reports/group-a/monthly'));
 assert.deepEqual(r.options.params,{month:10,year:2026});assert.equal(r.options.headers.Authorization,'Bearer session');
 assert.ok(nodes(tree).some(n=>Array.isArray(n.props?.style)&&n.props.style.some(s=>s?.width==='82.1%')));
 c.render();assert.equal(c.financialRequests.length,1);
});
test('modern authoritative totals and explicit nulls never trigger another financial request',async()=>{
 for(const collected of [5500,0,null]){
  const c=setup('admin',false,{groupId:'group-a'});
  c.requests[0].resolve({data:managedData([{id:'group-a',name:'WeTravel',member_count:2,late_count:0,financial_summary:{collected,total_expected:6700,collection_rate:collected===null?null:0}}])});await tick();c.render();await tick();const content=text(c.render());
  assert.equal(c.financialRequests.length,0);
  if(collected===null)assert.match(content,/Total not verified—/);else assert.ok(content.includes(`R${collected.toFixed(2)}`));
 }
});
test('an empty verified obligation month is genuine zero; explicitly unavailable monthly totals remain unknown',async()=>{
 for(const collected of [0,null]){
  const c=setup('admin',false,{groupId:'group-a'});c.financialState.handler=url=>Promise.resolve({data:monthlyReply(url,{summary:{confirmed:collected,expected:collected,outstanding:collected,awaiting_review:collected}})});
  const tree=await olderClubDashboard(c);
  if(collected===0)assert.match(text(tree),/Confirmed · October 2026R0.00/);else{assert.match(text(tree),/Total not verified—/);assert.doesNotMatch(text(tree),/R0.00/);}
 }
});
test('wrong club, wrong month/year and malformed monthly aggregates are rejected without invented zeros',async()=>{
 for(const change of [{club:{id:'other'}},{period:{month:9,year:2026,timezone:'Africa/Johannesburg'}},{period:{month:10,year:2025,timezone:'Africa/Johannesburg'}},{period:{month:10,year:2026,timezone:'UTC'}},{schema_version:0},{summary:{confirmed:'5500'}},{summary:{confirmed:NaN}},{summary:{confirmed:-1}}]){
  const c=setup('admin',false,{groupId:'group-a'});c.financialState.handler=url=>Promise.resolve({data:monthlyReply(url,change)});
  const tree=await olderClubDashboard(c);assert.match(text(tree),/Total not verified—/);assert.doesNotMatch(text(tree),/R5500|R90000|R0.00/);assert.ok(nodes(tree).some(n=>n.props.accessibilityLabel==='Retry monthly club totals'));
 }
});
test('financial read failure permits retry while verified administration stays available',async()=>{
 const c=setup('admin',false,{groupId:'group-a'});c.financialState.handler=()=>Promise.reject({response:{status:500}});
 const tree=await olderClubDashboard(c);assert.ok(nodes(tree).some(n=>n.props.accessibilityLabel==='Manage members'));
 c.financialState.handler=url=>Promise.resolve({data:monthlyReply(url)});
 nodes(tree).find(n=>n.props.accessibilityLabel==='Retry monthly club totals').props.onPress();await tick();assert.match(text(c.render()),/R5500.00/);assert.equal(c.financialRequests.length,2);
});
test('financial authorization denial masks management and old callbacks; Members never initiate the read',async()=>{
 const c=setup('admin',false,{groupId:'group-a'});let reject;
 c.financialState.handler=()=>new Promise((_,r)=>{reject=r;});await olderClubDashboard(c);const old=nodes(c.render()).find(n=>n.props.accessibilityLabel==='Manage members');
 reject({response:{status:403}});await tick();const tree=c.render();assert.doesNotMatch(text(tree),/WeTravel administration/);old.props.onPress();assert.deepEqual(c.routes,[]);
 const member=setup('admin',false,{groupId:'group-a'},{id:'brown'},'member');await olderClubDashboard(member);assert.equal(member.financialRequests.length,0);
});
test('A-B-A and account switching reject delayed monthly totals and retain newer request ownership',async()=>{
 const c=setup('admin',false,{groupId:'a'});const pending=[];
 c.financialState.handler=url=>new Promise((resolve,reject)=>pending.push({url,resolve,reject}));
 c.requests[0].resolve({data:managedData(['a','b'].map(id=>({id,name:id,member_count:2,late_count:0})))});await tick();c.render();await tick();
 c.params.groupId='b';c.render();await tick();c.render();await tick();
 c.params.groupId='a';c.render();await tick();c.render();await tick();assert.equal(pending.length,3);
 pending[0].reject({response:{status:500}});pending[1].resolve({data:monthlyReply(pending[1].url)});await tick();c.render();assert.doesNotMatch(text(c.render()),/R5500.00|Monthly totals could not/);
 pending[2].resolve({data:monthlyReply(pending[2].url,{summary:{confirmed:200,expected:300,outstanding:100,awaiting_review:0}})});await tick();assert.match(text(c.render()),/R200.00/);
 c.refresh();c.render();const final=pending.at(-1);c.contextState.role='member';c.auth.user={id:'brown'};c.auth.token='other-session';assert.doesNotMatch(text(c.render()),/R5500.00|R200.00|WeTravel administration/);final.resolve({data:monthlyReply(final.url)});await tick();assert.doesNotMatch(text(c.render()),/R5500.00|R200.00|WeTravel administration/);
});
test('Johannesburg reporting month changes at the local boundary rather than UTC midnight',()=>{
 const {currentReportPeriod}=load('services/monthlyReport.ts');assert.deepEqual(currentReportPeriod(new Date('2026-09-30T22:30:00Z')),{year:2026,month:10});
});

test('Jimmy and Treasurer fixtures enter their selected Admin dashboard directly from the club card and can still enter as Members',async()=>{
 for(const role of ['admin','treasurer']){
  const c=setup();await c.respond(0,'WeTravel',role);
  nodes(c.render()).find(n=>n.props.accessibilityLabel==='Open WeTravel administration').props.onPress();
  assert.deepEqual(c.routes.at(-1),{pathname:'/(treasurer)/dashboard',params:{groupId:'group-a'}});assert.equal(c.routes.length,1);
  nodes(c.render()).find(n=>n.props?.accessibilityLabel==='My Clubs & Stokvels').props.onPress();nodes(c.render()).find(n=>n.props.accessibilityLabel==='View WeTravel as member').props.onPress();assert.deepEqual(c.routes.at(-1),{pathname:'/club/[id]',params:{id:'group-a',from:'member'}});
 }
});
test('Brown Member fixture has no card Admin action; a stale shortcut cannot survive role revocation or account switching',async()=>{
 const brown=setup();await brown.respond(0,'WeTravel','member');assert.equal(nodes(brown.render()).find(n=>n.props.accessibilityLabel==='Open WeTravel administration'),undefined);
 const c=setup();await c.respond(0,'WeTravel','admin');const old=nodes(c.render()).find(n=>n.props.accessibilityLabel==='Open WeTravel administration');
 c.refresh();await c.respond(1,'WeTravel','member');c.render();old.props.onPress();assert.deepEqual(c.routes,[]);
 c.auth.user={id:'brown'};c.auth.token='brown-session';c.render();old.props.onPress();assert.deepEqual(c.routes,[]);
});

test('reference Admin and Treasurer layouts derive tiles from the selected club role and keep existing management actions',async()=>{
 for(const role of ['admin','treasurer']){
  const c=setup('admin',false,{groupId:'group-a'},{id:'jimmy',full_name:'Jimmy'},role);
  c.requests[0].resolve({data:managedData([{id:'group-a',name:'WeTravel',member_count:2,late_count:0,financial_summary:{collected:0,total_expected:0,collection_rate:0}}])});await tick();const tree=c.render();
  assert.match(text(tree),/WeTravel/);assert.ok(button(tree,'Manage members'));
  if(role==='treasurer'){assert.ok(nodes(tree).some(n=>n.type==='PendingConfirmations'));assert.ok(nodes(tree).some(n=>n.props?.accessibilityLabel==='Confirm Payments'));assert.equal(nodes(tree).some(n=>n.props?.accessibilityLabel==='Invitations'),false);}
  else {assert.ok(nodes(tree).some(n=>n.props?.accessibilityLabel==='Invitations'));assert.ok(nodes(tree).some(n=>n.props?.accessibilityLabel==='Settings'));assert.equal(nodes(tree).some(n=>n.type==='PendingConfirmations'),false);}
  const old=nodes(tree).find(n=>n.props?.accessibilityLabel==='Members');old.props.onPress();assert.equal(c.routes.at(-1).params.groupId,'group-a');
  c.auth.user={id:'brown'};c.auth.token='new';c.render();const count=c.routes.length;old.props.onPress();assert.equal(c.routes.length,count);assert.equal(nodes(c.render()).some(n=>n.type==='PendingConfirmations'),false);
 }
});
test('ordinary Member context never receives the Admin or Treasurer layout',async()=>{
 const c=setup('admin',false,{groupId:'group-a'},{id:'brown'},'member');c.requests[0].resolve({data:managedData([{id:'group-a',name:'WeTravel',member_count:2,late_count:0}])});await tick();const t=c.render();assert.equal(nodes(t).some(n=>n.type==='PendingConfirmations'),false);assert.equal(nodes(t).some(n=>n.props?.accessibilityLabel==='Invitations'||n.props?.accessibilityLabel==='Confirm Payments'),false);
});


test('My Clubs header matches selected-club title styling and greets the authenticated first name', async () => {
 const c=setup();c.auth.user.full_name='Brown Example';await c.respond(0,'WeTravel');
 const tree=c.render(),style=n=>Object.assign({},...[n.props.style].flat().filter(Boolean));
 const title=nodes(tree).find(n=>n.props?.accessibilityRole==='header'&&text(n)==='Clubvel');
 assert.deepEqual([style(title).fontSize,style(title).fontWeight,style(title).textAlign,style(title).color],[26,'400','center','white']);
 assert.match(text(tree),/Good (morning|afternoon|evening), Brown!/);assert.doesNotMatch(text(tree),/Welcome back|Member!/);
 c.auth.user.full_name='  ';assert.match(text(c.render()),/Good (morning|afternoon|evening)!/);assert.doesNotMatch(text(c.render()),/Member!/);
 assert.ok(nodes(tree).some(n=>n.props?.accessibilityLabel==='Open profile menu'));
});
for(const count of [undefined,null,0,-1,'2',1.5,1,2])test('My Clubs presents trustworthy active member count '+String(count),async()=>{
 const c=setup();await c.respond(0,'WeTravel');c.refresh();
 c.requests[1].resolve({data:{user:c.auth.user,summary:{total_saved:0,confirmed_collected:0,confirmed_collected_availability:'AVAILABLE',active_clubs:1,upcoming_payments:0,claims_count:0},clubs:[{id:'group-a',name:'WeTravel',role:'member',member_count:count,contribution_mode:'flexible_goal'}]}});await tick();
 const content=text(c.render());if(count===1||count===2)assert.ok(content.includes(count===1?'1 member':'2 members'));else {assert.match(content,/Member count unavailable/);assert.doesNotMatch(content,/0 members|-1 members|1.5 members|2 members/);}
});


test('My Clubs is collapsed by default, scrolls many memberships and collapses after selection',async()=>{
 const c=setup();c.requests[0].resolve({data:{user:c.auth.user,summary:{total_saved:0,confirmed_collected:0,confirmed_collected_availability:'AVAILABLE',active_clubs:20},clubs:Array.from({length:20},(_,i)=>({id:'club-'+i,name:'Stokvel '+i,role:'member',member_count:2}))}});await tick();
 const toggle=()=>nodes(c.render()).find(n=>n.props?.accessibilityLabel==='My Clubs & Stokvels');assert.equal(toggle().props.accessibilityState.expanded,false);assert.doesNotMatch(text(c.render()),/Stokvel 19/);toggle().props.onPress();assert.match(text(c.render()),/Stokvel 19/);assert.ok(nodes(c.render()).some(n=>n.type==='ScrollView'&&n.props.nestedScrollEnabled));nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Open Stokvel 19').props.onPress();assert.equal(toggle().props.accessibilityState.expanded,false);assert.equal(c.routes.at(-1).params.id,'club-19');
});
