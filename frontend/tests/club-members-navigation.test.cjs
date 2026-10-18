const test = require('node:test');
const assert = require('node:assert/strict');
const { load, engine, tick, nodes, text, native, colors } = require('./ui-harness.cjs');
function setup(from='member') {
 const ui=engine(),requests=[],routes=[],auth={user:{id:'brown'},token:'session-a',loading:false},params={id:'travel',from};
 const Screen=load('app/club/[id]/members.tsx',{
  react:ui.react,'react-native':{...native,TextInput:'TextInput'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:16})},
  'expo-router':{Redirect:'Redirect',useFocusEffect:ui.useFocusEffect,useLocalSearchParams:()=>params,useRouter:()=>({push:r=>routes.push(r),replace:r=>routes.push(r)})},
  axios:{get:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))},
  '../../../contexts/AuthContext':{useAuth:()=>auth},'../../../constants/Colors':{Colors:colors},
  '../../../components/ClubMemberDirectory':{__esModule:true,default:'ClubMemberDirectory'},
 }).default;
 const render=()=>ui.render(Screen);const tap=label=>nodes(render()).find(n=>n.props?.accessibilityLabel===label).props.onPress();
 const reply=async(i,id=params.id,role='member')=>{requests[i].resolve({data:{club:{id,name:id==='travel'?'WeTraveling':'Eighty8'},membership:{id:'membership-'+id,status:'active',role},own_financial_summary:{secret:999},private_phone:'PRIVATE'}});await tick();return render();};
 render();return {ui,requests,routes,auth,params,render,tap,reply};
}
test('Member directory route fetches only authenticated context and renders shared private-field-free directory',async()=>{
 const c=setup();assert.equal(nodes(c.render()).filter(n=>n.type==='ClubMemberDirectory').length,0);await c.reply(0);
 assert.equal(c.requests.length,1);assert.ok(c.requests[0].url.endsWith('/api/groups/travel/context'));assert.equal(c.requests[0].options.headers.Authorization,'Bearer session-a');
 const directory=nodes(c.render()).find(n=>n.type==='ClubMemberDirectory');assert.equal(directory.props.groupId,'travel');assert.equal(directory.props.renderDetails,undefined);
 assert.doesNotMatch(text(c.render()),/PRIVATE|999|Manage member/);
 nodes(c.render()).find(n=>n.type==='TextInput').props.onChangeText('Jimmy');assert.equal(nodes(c.render()).find(n=>n.type==='ClubMemberDirectory').props.search,'Jimmy');
});
test('Back preserves club and account origin for Member and Admin',async()=>{
 for(const from of ['member','admin']){const c=setup(from);await c.reply(0);c.tap('Back to Club Home');assert.deepEqual(c.routes.at(-1),{pathname:'/club/[id]',params:{id:'travel',from}});}
});
test('management links use authoritative club role and preserve existing handlers via existing routes',async()=>{
 const c=setup('admin');await c.reply(0,'travel','member');assert.doesNotMatch(text(c.render()),/Manage member|Admin invitations/);
 c.params.id='eight';c.render();await c.reply(1,'eight','treasurer');c.tap('Manage member invitations');assert.deepEqual(c.routes.at(-1),{pathname:'/(treasurer)/members',params:{groupId:'eight'}});
 c.tap('Manage club members and Admin invitations');assert.deepEqual(c.routes.at(-1),{pathname:'/(treasurer)/club-detail',params:{id:'eight',name:'Eighty8',from:'club'}});
 assert.equal(c.requests.length,2);assert.ok(c.requests.every(r=>r.url.endsWith('/context')));
});
test('account and session changes immediately unmount old directory and reject stale context',async()=>{
 const c=setup();await c.reply(0);c.ui.blur();c.ui.focus();c.auth.user={id:'jimmy'};c.auth.token='session-b';assert.equal(nodes(c.render()).filter(n=>n.type==='ClubMemberDirectory').length,0);
 await c.reply(1,'travel','admin');assert.doesNotMatch(text(c.render()),/WeTraveling|Manage member/);await c.reply(2);assert.match(text(c.render()),/WeTraveling/);
});
test('rapid A-B-A switching rejects stale privileges and club information',async()=>{
 const c=setup();c.params.id='eight';c.render();c.params.id='travel';c.render();await c.reply(2);await c.reply(1,'eight','admin');await c.reply(0,'travel','admin');
 assert.match(text(c.render()),/WeTraveling Members/);assert.doesNotMatch(text(c.render()),/Eighty8|Manage member/);assert.equal(nodes(c.render()).find(n=>n.type==='ClubMemberDirectory').props.groupId,'travel');
});
test('revoked, inactive or unauthorized context blocks directory and allows retry',async()=>{
 for(const status of [401,403,404]){const c=setup();await c.reply(0);c.ui.blur();c.ui.focus();c.requests[1].reject({response:{status}});await tick();assert.equal(nodes(c.render()).filter(n=>n.type==='ClubMemberDirectory').length,0);assert.match(text(c.render()),/active membership/);c.tap('Retry club members');await c.reply(2);assert.match(text(c.render()),/WeTraveling/);}
});
test('malformed or inactive context never mounts directory and signed-out users redirect',async()=>{
 const c=setup();c.requests[0].resolve({data:{club:{id:'travel',name:'Private'},membership:{id:'m',role:'admin',status:'inactive'}}});await tick();assert.equal(nodes(c.render()).filter(n=>n.type==='ClubMemberDirectory').length,0);
 c.auth.user=null;c.auth.token=null;assert.equal(c.render().type,'Redirect');
});
test('focus requests coalesce and directory closes on blur before refocusing',async()=>{
 const c=setup();c.ui.focus();assert.equal(c.requests.length,1);await c.reply(0);c.ui.blur();assert.equal(nodes(c.render()).filter(n=>n.type==='ClubMemberDirectory').length,0);c.ui.focus();c.ui.focus();assert.equal(c.requests.length,2);
});
