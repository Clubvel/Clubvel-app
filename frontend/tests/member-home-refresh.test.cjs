const test = require('node:test');
const assert = require('node:assert/strict');
const { load, engine, tick, nodes, text, button, native, colors } = require('./ui-harness.cjs');

function setup(screen = 'member', holdInvitations = false) {
  const ui = engine(), requests = [], routes = [];
  const auth = { user: { id: 'member', full_name: 'Test Member', first_name: 'Test' }, token: 'session' };
  const Screen = load(screen === 'member' ? 'app/(member)/home.tsx' : 'app/(treasurer)/dashboard.tsx', {
    react: ui.react,
    'react-native': { ...native, RefreshControl: 'RefreshControl', TextInput: 'TextInput',
      KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' },
      Keyboard: { dismiss() {} }, TouchableWithoutFeedback: 'TouchableWithoutFeedback' },
    'expo-router': { useFocusEffect: ui.useFocusEffect, useRouter: () => ({ push: r => routes.push(r) }) },
    '../../components/ProfilePhotoViewer': { default: 'ProfilePhotoViewer' },
    '../../contexts/AuthContext': { useAuth: () => auth },
    '../../components/StatusPill': { StatusPill: 'StatusPill' },
    '../../components/AdBanner': { AdBanner: 'AdBanner' },
    '../../services/paymentReminder': { addPaymentReminder: async () => {} },
    '../../constants/Colors': { Colors: colors }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '@react-native-async-storage/async-storage': {},
    axios: { get: url => url.includes('/invitations/') ? (holdInvitations ? new Promise(() => {}) : Promise.resolve({ data: { invitations: [] } }))
      : new Promise(resolve => requests.push({ url, resolve })) },
  }).default;
  const render = () => ui.render(Screen);
  const respond = async (index, name, role = 'member') => {
    requests[index].resolve({ data: { user: auth.user,
      summary: { total_saved: 0, active_clubs: 1, overdue_contributions: 0, upcoming_payments: 0, claims_count: 0 },
      clubs: [{ id: 'group-a', name, role, member_count: 2, collected: 0, expected: 200, due_date: 25, late_count: 0, monthly_contribution: 100, status: 'pending' }] } });
    await tick();
  };
  const refresh = () => nodes(render()).find(n => n.type === 'ScrollView').props.refreshControl.props.onRefresh();
  render();
  return { ui, render, requests, routes, respond, refresh };
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

test('member and administrator club navigation remains unchanged', async () => {
  const c = setup(); await c.respond(0, 'WeTraveling');
  button(c.render(), 'WeTraveling').props.onPress();
  assert.deepEqual(c.routes, ['/(member)/club/group-a']);
  c.refresh(); await c.respond(1, 'WeTraveling', 'admin');
  button(c.render(), 'WeTraveling').props.onPress();
  assert.deepEqual(c.routes[1], { pathname: '/(treasurer)/club-detail',
    params: { id: 'group-a', name: 'WeTraveling', from: 'member' } });
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
      summary: { total_saved: 200, active_clubs: 1, upcoming_payments: count, claims_count: 2,
        upcoming_payout_amount: 100, total_clubs: 1, total_members: 2,
        total_collected_this_month: 200, late_members_count: count },
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
