const test=require('node:test');
const assert=require('node:assert/strict');
const {load,engine,tick,nodes,text,button,native,colors}=require('./ui-harness.cjs');
async function setup(){
 const ui=engine(),requests=[],alerts=[],params={};
 const claim={claim_id:'old',group_id:'club',group_name:'Club',amount:20000,reason:'Original reason',status:'rejected',rejection_reason:'Outside policy'};
 const claims={records:[claim],phase:'ready',refreshing:false,reload:async()=>{}};
 const Screen=load('app/(member)/claims.tsx',{
  react:{...ui.react,useMemo:fn=>fn()},
  'react-native':{...native,KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:'android'},TextInput:'TextInput',Alert:{alert:(...a)=>alerts.push(a)}},
  'expo-router':{useFocusEffect:ui.useFocusEffect,useLocalSearchParams:()=>params,useRouter:()=>({push(){}})},'@expo/vector-icons':{Ionicons:'Icon'},
  '../../contexts/AuthContext':{useAuth:()=>({user:{id:'member'},token:'signed'})},
  '../../constants/Colors':{Colors:colors},'../../hooks/usePersonalClaims':{usePersonalClaims:()=>claims},
  axios:{isAxiosError:()=>false,get:async()=>({data:{clubs:[{id:'club',name:'Club'}]}}),post:async(url,data,options)=>{requests.push({url,data,options});}},
 }).default;
 const render=()=>ui.render(Screen);render();await tick();return {render,requests,alerts,claims,claim,params,ui};
}
test('rejected claim shows reason, resubmit prefills form and creates a linked corrected submission',async()=>{
 const c=await setup();assert.match(text(c.render()),/Reason for rejectionOutside policy/);
 button(c.render(),'Resubmit').props.onPress();let tree=c.render();
 assert.equal(nodes(tree).find(n=>n.type==='Modal').props.visible,true);
 const inputs=nodes(tree).filter(n=>n.type==='TextInput');assert.equal(inputs[0].props.value,'20000');assert.equal(inputs[1].props.value,'Original reason');
 inputs[1].props.onChangeText('Corrected reason');tree=c.render();
 const submit=nodes(tree).find(n=>n.type==='TouchableOpacity'&&text(n)==='Submit Claim');
 assert.ok(submit);await submit.props.onPress();await tick();
 assert.equal(c.requests[0].data.resubmitted_from_claim_id,'old');assert.equal(c.requests[0].data.reason,'Corrected reason');assert.equal(c.requests[0].options.headers.Authorization,'Bearer signed');
 assert.equal(c.claim.reason,'Original reason');assert.equal(c.claim.status,'rejected');
});
test('Remove rejected claim calls owned dismissal endpoint, never deletion',async()=>{
 const c=await setup();button(c.render(),'Remove').props.onPress();
 await c.alerts.at(-1)[2].find(a=>a.text==='Remove').onPress();
 assert.equal(c.requests[0].url.endsWith('/api/member/claims/old/dismiss'),true);assert.equal(c.requests[0].options.timeout,15000);
});
test('Android claim modal resizes for keyboard and scrolls focused Reason after layout',async()=>{
 const c=await setup();const tree=c.render();const avoiding=nodes(tree).find(n=>n.type==='KeyboardAvoidingView');assert.equal(avoiding.props.behavior,'height');
 const scroll=nodes(avoiding).find(n=>n.type==='ScrollView');const calls=[];scroll.props.ref.current={scrollToEnd:o=>calls.push(o)};
 const reason=nodes(tree).find(n=>n.type==='TextInput'&&n.props.multiline);reason.props.onFocus();scroll.props.onLayout();assert.equal(calls.length,2);reason.props.onBlur();scroll.props.onLayout();assert.equal(calls.length,2);
});

test('Member sees approved payout date or honest unscheduled state and cannot edit it',async()=>{
 const c=await setup();c.claim.status='approved';c.claim.amount=50000;
 let tree=c.render();assert.match(text(tree),/Payout date: To be scheduled/);
 assert.equal(button(tree,'Set payout date'),undefined);assert.equal(button(tree,'Change payout date'),undefined);
 c.claim.scheduled_claim_date='2026-11-20T00:00:00';tree=c.render();
 assert.match(text(tree),new RegExp(`Payout date: ${new Date(c.claim.scheduled_claim_date).toLocaleDateString()}`));
 assert.doesNotMatch(text(tree),/To be scheduled/);
});

test('Member Claims shows partial remaining and full paid actual date separately from schedule without mutation controls',async()=>{
 const c=await setup();Object.assign(c.claim,{status:'approved',amount:50000,actual_amount_paid:20000,actual_payment_date:'2026-01-02',scheduled_claim_date:'2026-11-20'});
 let tree=c.render();assert.match(text(tree),/Paid: R20,000 \(partially paid\)/);assert.match(text(tree),/Remaining: R30,000/);
 assert.ok(text(tree).includes(`Last payment date: ${new Date('2026-01-02').toLocaleDateString()}`));
 c.claim.status='paid';c.claim.actual_amount_paid=50000;tree=c.render();
 assert.match(text(tree),/Paid: R50,000/);assert.match(text(tree),/Remaining: R0/);
 assert.ok(text(tree).includes(`Payment date: ${new Date('2026-01-02').toLocaleDateString()}`));
 assert.ok(text(tree).includes(`Scheduled payout ${new Date('2026-11-20').toLocaleDateString()}`));
 assert.equal(button(tree,'Mark as Paid'),undefined);assert.equal(button(tree,'Review Payment'),undefined);
});

test('Upcoming Payouts shows only approved remaining balances, latest total and Show all',async()=>{
 const c=await setup();const record=(id,status,amount,paid)=>({...c.claim,claim_id:id,group_name:id,status,amount,actual_amount_paid:paid});
 c.claims.records=[record('partial','approved',1000,250),record('unpaid','approved',500,0),record('pending','pending',900,0),record('rejected','rejected',700,0),record('full','approved',100,100),record('paid','paid',300,300)];c.params.view='payouts';c.render();
 const tree=c.render();assert.match(text(tree),/Upcoming Payouts/);assert.match(text(tree),/Remaining total: R1[\s,]250[.,]00/);
 const ids=nodes(tree).filter(n=>n.type==='View'&&n.props.key).map(n=>n.props.key);assert.deepEqual(ids,['partial','unpaid']);
 assert.match(text(tree),/Remaining: R750[.,]00/);assert.match(text(tree),/Remaining: R500[.,]00/);
 button(tree,'Show all claims').props.onPress();assert.match(text(c.render()),/Your Claims/);assert.ok(nodes(c.render()).some(n=>n.props.key==='pending'));
 c.ui.blur();c.ui.focus();assert.match(text(c.render()),/Upcoming Payouts/);
 c.params.view=undefined;c.render();c.params.view='payouts';c.render();assert.match(text(c.render()),/Upcoming Payouts/);
 c.params.claim_id='rejected';assert.match(text(c.render()),/Your Claims/);assert.ok(nodes(c.render()).some(n=>n.props.key==='rejected'));c.params.claim_id=undefined;
 c.claims.records=[];assert.match(text(c.render()),/No payouts awaiting payment/);
 c.claims.phase='error';assert.match(text(c.render()),/Unable to load claims/);assert.doesNotMatch(text(c.render()),/Remaining total/);
});
