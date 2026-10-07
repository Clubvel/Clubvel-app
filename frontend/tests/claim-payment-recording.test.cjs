const test=require('node:test');
const assert=require('node:assert/strict');
const {load,engine,tick,nodes,text,button,native,colors}=require('./ui-harness.cjs');
function editor(extra={}){
 const ui=engine(),requests=[],alerts=[];let refreshes=0,post=async()=>{};
 const props={groupId:'group-a',claimId:'claim-a',memberName:'Jimmy Member',status:'approved',approvedAmount:50000,actualAmountPaid:null,
  scheduledDate:'2026-11-20',token:'session',onRecorded:async()=>{refreshes++;},...extra};
 const module=load('components/ClaimPaymentRecord.tsx',{
  react:ui.react,'react-native':{...native,TextInput:'TextInput',KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:'android'},Alert:{alert:(...a)=>alerts.push(a)}},
  '../constants/Colors':{Colors:colors},'./ClaimPayoutDate':{payoutDateLabel:value=>value.slice(0,10)},
  axios:{post:async(...args)=>{requests.push(args);return post(...args);}},
 });
 const render=()=>ui.render(()=>module.ClaimPaymentRecord(props));
 return {render,props,requests,alerts,get refreshes(){return refreshes;},set post(value){post=value;}};
}
function fill(c,amount='50000',date='2026-01-02'){
 button(c.render(),'Mark as Paid').props.onPress();const inputs=nodes(c.render()).filter(n=>n.type==='TextInput');
 inputs[0].props.onChangeText(amount);inputs[1].props.onChangeText(date);
}
const confirm=c=>c.alerts.at(-1)[2].find(a=>a.text==='Confirm Payment Record').onPress;
test('default editable cumulative amount, blank actual date, explicit confirmation and authenticated specific-claim write',async()=>{
 const c=editor();button(c.render(),'Mark as Paid').props.onPress();let inputs=nodes(c.render()).filter(n=>n.type==='TextInput');
 assert.equal(inputs[0].props.value,'50000');assert.equal(inputs[1].props.value,'');assert.equal(c.requests.length,0);
 inputs[1].props.onChangeText('2026-01-02');button(c.render(),'Review Payment').props.onPress();assert.equal(c.requests.length,0);
 const [title,message]=c.alerts.at(-1);assert.equal(title,'Confirm external payout');
 for(const expected of ['Jimmy Member','Approved claim: R','Total paid to date: R','New amount recorded: R','2026-01-02','does not move money'])assert.ok(message.includes(expected));
 confirm(c)();await tick();assert.equal(c.requests.length,1);
 assert.match(c.requests[0][0],/groups\/group-a\/claims\/claim-a\/record-payment$/);
 assert.deepEqual(c.requests[0][1],{actual_amount_paid:50000,expected_actual_amount_paid:0,actual_payment_date:'2026-01-02'});
 assert.equal(c.requests[0][2].headers.Authorization,'Bearer session');assert.equal(c.refreshes,1);
 assert.equal(nodes(c.render()).find(n=>n.type==='Modal').props.visible,false);
});
test('partial amount can be edited; display explains cumulative paid and remaining with actual date',async()=>{
 const c=editor({actualAmountPaid:20000,actualPaymentDate:'2026-01-02'});const tree=c.render();
 assert.match(text(tree),/partially paid/);assert.match(text(tree),/Last payment date: 2026-01-02/);
 assert.ok(text(tree).includes(`Remaining: R${(30000).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2})}`));
 fill(c,'30000','2026-01-03');button(c.render(),'Review Payment').props.onPress();confirm(c)();await tick();
 assert.deepEqual(c.requests[0][1],{actual_amount_paid:30000,expected_actual_amount_paid:20000,actual_payment_date:'2026-01-03'});
 const paid=editor({status:'paid',actualAmountPaid:50000,actualPaymentDate:'2026-01-03'});
 assert.match(text(paid.render()),/Payment date: 2026-01-03/);assert.match(text(paid.render()),/Scheduled payout: 2026-11-20/);
 assert.equal(button(paid.render(),'Mark as Paid'),undefined);
});
test('invalid amount/date, pending/rejected claims, cancellation and absent session cannot submit',async()=>{
 for(const [amount,date] of [['0','2026-01-02'],['-1','2026-01-02'],['50001','2026-01-02'],['20.001','2026-01-02'],['NaN','2026-01-02'],['50000',''],['50000','2026-02-30'],['50000','2999-01-01']]){
  const c=editor();fill(c,amount,date);button(c.render(),'Review Payment').props.onPress();assert.equal(c.requests.length,0);assert.match(c.alerts.at(-1)[0],/Invalid/);
 }
 const c=editor();fill(c);button(c.render(),'Review Payment').props.onPress();c.alerts.at(-1)[2][0].onPress();assert.equal(c.requests.length,0);
 button(c.render(),'Cancel').props.onPress();assert.equal(nodes(c.render()).find(n=>n.type==='Modal').props.visible,false);
 assert.equal(button(editor({token:null}).render(),'Mark as Paid').props.disabled,true);
 for(const status of ['pending_review','rejected','completed'])assert.equal(editor({status}).render(),null);
});
test('duplicate review/confirm taps send once; lost-response retry keeps exact idempotent payload',async()=>{
 const c=editor();let reject;c.post=()=>new Promise((_,r)=>{reject=r;});fill(c);
 const review=button(c.render(),'Review Payment').props.onPress;review();review();assert.equal(c.alerts.length,1);
 const action=confirm(c);action();action();assert.equal(c.requests.length,1);
 reject(new Error('lost response'));await tick();assert.equal(c.refreshes,0);
 assert.match(c.alerts.at(-1)[1],/identical retry will not record it twice/);
 assert.equal(nodes(c.render()).find(n=>n.type==='Modal').props.visible,true);
 c.post=async()=>{};button(c.render(),'Review Payment').props.onPress();confirm(c)();await tick();
 assert.equal(c.requests.length,2);assert.deepEqual(c.requests[1][1],c.requests[0][1]);assert.equal(c.refreshes,1);
});
test('server stale-state refusal stays visible, retryable and never reports success',async()=>{
 const c=editor();c.post=async()=>{throw {response:{data:{detail:'This claim changed. Refresh before recording payment.'}}};};fill(c);
 button(c.render(),'Review Payment').props.onPress();confirm(c)();await tick();
 assert.equal(c.refreshes,0);assert.equal(c.alerts.at(-1)[0],'Unable to record payment');assert.match(c.alerts.at(-1)[1],/claim changed/);
 assert.equal(button(c.render(),'Review Payment').props.disabled,false);
});
