const test=require('node:test');
const assert=require('node:assert/strict');
const {load,engine,tick,nodes,text,button,native,colors}=require('./ui-harness.cjs');
function editor(date=null,token='session',status='approved'){
 const ui=engine(),requests=[],alerts=[];let refreshes=0,post=async()=>{};
 const module=load('components/ClaimPayoutDate.tsx',{
  react:ui.react,'react-native':{...native,TextInput:'TextInput',KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:'android'},Alert:{alert:(...a)=>alerts.push(a)}},
  '../constants/Colors':{Colors:colors},axios:{post:async(...args)=>{requests.push(args);return post(...args);}},
 });
 const render=()=>ui.render(()=>module.ClaimPayoutDate({groupId:'group-a',claimId:'claim-a',status,scheduledDate:date,token,onSaved:async()=>{refreshes++;}}));
 return {render,requests,alerts,module,get refreshes(){return refreshes;},set post(value){post=value;}};
}
test('approved date display is honest and editor sends only structured date and bearer for specific claim',async()=>{
 const c=editor();assert.match(text(c.render()),/Payout date: To be scheduled/);
 button(c.render(),'Set payout date').props.onPress();
 nodes(c.render()).find(n=>n.type==='TextInput').props.onChangeText('2026-11-20');
 button(c.render(),'Save payout date').props.onPress();await tick();
 assert.equal(c.requests.length,1);assert.match(c.requests[0][0],/groups\/group-a\/claims\/claim-a\/payout-date$/);
 assert.deepEqual(c.requests[0][1],{scheduled_claim_date:'2026-11-20'});assert.equal(c.requests[0][2].headers.Authorization,'Bearer session');
 assert.equal(c.refreshes,1);assert.equal(nodes(c.render()).find(n=>n.type==='Modal').props.visible,false);
 const existing=editor('2026-11-20T00:00:00');assert.match(text(existing.render()),/Payout date:/);assert.doesNotMatch(text(existing.render()),/To be scheduled/);
 button(existing.render(),'Change payout date').props.onPress();assert.equal(nodes(existing.render()).find(n=>n.type==='TextInput').props.value,'2026-11-20');
});
test('invalid dates, cancellation and missing session cannot send scheduling requests',async()=>{
 for(const value of ['2026-02-30','tomorrow','2026-13-01']){
  const c=editor();button(c.render(),'Set payout date').props.onPress();nodes(c.render()).find(n=>n.type==='TextInput').props.onChangeText(value);
  button(c.render(),'Save payout date').props.onPress();await tick();assert.equal(c.requests.length,0);assert.equal(c.alerts.at(-1)[0],'Invalid date');
 }
 const c=editor();button(c.render(),'Set payout date').props.onPress();button(c.render(),'Cancel').props.onPress();assert.equal(c.requests.length,0);
 const signedOut=editor(null,null);assert.equal(button(signedOut.render(),'Set payout date').props.disabled,true);
 for(const status of ['pending_review','rejected','paid','completed'])assert.equal(editor(null,'session',status).render(),null);
});
test('duplicate Save taps send once; server rejection keeps date editor retryable',async()=>{
 const c=editor();let reject;c.post=()=>new Promise((_,r)=>{reject=r;});
 button(c.render(),'Set payout date').props.onPress();nodes(c.render()).find(n=>n.type==='TextInput').props.onChangeText('2026-11-20');
 const save=button(c.render(),'Save payout date').props.onPress;save();save();assert.equal(c.requests.length,1);
 reject({response:{data:{detail:'Only approved claims awaiting payout can be scheduled'}}});await tick();
 assert.equal(c.refreshes,0);assert.equal(nodes(c.render()).find(n=>n.type==='Modal').props.visible,true);
 assert.equal(button(c.render(),'Save payout date').props.disabled,false);
 assert.equal(c.alerts.at(-1)[1],'Only approved claims awaiting payout can be scheduled');
});
test('Member Home renders approved payout monetary total separately from unchanged contributions card',async()=>{
 const ui=engine();const summary={upcoming_payments:3,upcoming_payout_amount:70000,total_saved:1200,active_clubs:1,claims_count:4};
 const Home=load('app/(member)/home.tsx',{
  react:ui.react,'react-native':{...native,RefreshControl:'RefreshControl',TextInput:'TextInput',KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:'android'}},
  'expo-router':{useFocusEffect:ui.useFocusEffect,useRouter:()=>({push(){}})},
  '../../components/ProfilePhotoViewer': { default: 'ProfilePhotoViewer' },
    '../../contexts/AuthContext':{useAuth:()=>({user:{id:'member'},token:'session'})},
  '../../components/StatusPill':{StatusPill:'StatusPill'},'../../components/AdBanner':{AdBanner:'AdBanner'},
  '../../constants/Colors':{Colors:colors},'@expo/vector-icons':{Ionicons:'Ionicons'},'@react-native-async-storage/async-storage':{},
  axios:{get:async()=>({data:{summary,user:{first_name:'Jimmy',full_name:'Jimmy'},clubs:[],invitations:[]}})},
 }).default;
 ui.render(Home);await tick();let tree=ui.render(Home);
 assert.match(text(tree),/Upcoming Payments3/);
 const payout=nodes(tree).find(n=>n.type==='View'&&nodes(n).some(k=>k.type==='Text'&&text(k)==='Upcoming Payouts')&&nodes(n).filter(k=>k.type==='Text').length===2);
 assert.equal(text(payout),`Upcoming PayoutsR${(70000).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2})}`);
 summary.upcoming_payout_amount=0;tree=ui.render(Home);assert.match(text(tree),/Upcoming PayoutsR0[.,]00/);
});
