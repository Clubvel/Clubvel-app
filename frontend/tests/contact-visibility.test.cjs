const test=require('node:test'),assert=require('node:assert/strict');
const {load,engine,native,nodes,text,tick,colors}=require('./ui-harness.cjs');
function setup(){
 const ui=engine(),requests=[],auth={user:{id:'jimmy'},token:'session-a'};
 const request=method=>(url,...args)=>new Promise((resolve,reject)=>requests.push({method,url,args,resolve,reject}));
 const Screen=load('components/ContactVisibilityPreference.tsx',{react:ui.react,'react-native':{...native,Switch:'Switch'},'expo-router':{useFocusEffect:ui.useFocusEffect},axios:{get:request('get'),put:request('put')},'../contexts/AuthContext':{useAuth:()=>auth},'../constants/Colors':{Colors:colors}}).default;
 const render=()=>ui.render(Screen),reply=async(index,value)=>{requests[index].resolve({data:{share_mobile_with_clubs:value}});await tick();};render();return{ui,auth,requests,render,reply};
}
test('contact preference requires an authenticated read before owner opt-in and opt-out',async()=>{
 const c=setup();assert.equal(nodes(c.render()).find(n=>n.type==='Switch').props.disabled,true);assert.equal(c.requests.length,1);await c.reply(0,false);
 let control=nodes(c.render()).find(n=>n.type==='Switch');assert.equal(control.props.value,false);control.props.onValueChange(true);assert.equal(c.requests[1].method,'put');assert.deepEqual(c.requests[1].args[0],{share_mobile_with_clubs:true});assert.equal(c.requests[1].args[1].headers.Authorization,'Bearer session-a');
 assert.equal(nodes(c.render()).find(n=>n.type==='Switch').props.disabled,true);await c.reply(1,true);control=nodes(c.render()).find(n=>n.type==='Switch');assert.equal(control.props.value,true);control.props.onValueChange(false);await c.reply(2,false);assert.equal(nodes(c.render()).find(n=>n.type==='Switch').props.value,false);
});
test('unavailable or malformed preferences are unknown rather than a confirmed private default',async()=>{
 for(const value of [null,'false',1]){const c=setup();await c.reply(0,value);assert.match(text(c.render()),/Sharing preference unavailable/);assert.equal(nodes(c.render()).some(n=>n.type==='Switch'),false);nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Retry contact visibility').props.onPress();await c.reply(1,false);assert.equal(nodes(c.render()).find(n=>n.type==='Switch').props.disabled,false);}
});
test('account and session A-B-A switching reject stale preference replies and saved controls',async()=>{
 const c=setup();await c.reply(0,true);const stale=nodes(c.render()).find(n=>n.type==='Switch').props.onValueChange;
 c.auth.user={id:'brown'};c.auth.token='session-b';c.render();stale(false);assert.equal(c.requests.length,2);c.auth.user={id:'jimmy'};c.auth.token='session-a';c.render();await c.reply(1,true);assert.equal(nodes(c.render()).find(n=>n.type==='Switch').props.disabled,true);await c.reply(2,false);assert.equal(nodes(c.render()).find(n=>n.type==='Switch').props.value,false);
});
test('failed save can be refreshed without automatically repeating the write',async()=>{
 const c=setup();await c.reply(0,false);nodes(c.render()).find(n=>n.type==='Switch').props.onValueChange(true);c.requests[1].reject(new Error('offline'));await tick();assert.match(text(c.render()),/unavailable/);nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Retry contact visibility').props.onPress();assert.equal(c.requests[2].method,'get');await c.reply(2,true);assert.equal(nodes(c.render()).find(n=>n.type==='Switch').props.value,true);
});
test('contact URLs reject unsafe numbers and never contain message contents',()=>{
 const {directoryMobile,directoryContactUrl}=load('services/directoryContact.ts');assert.equal(directoryMobile('082 123 4567'),'+27821234567');assert.equal(directoryContactUrl('sms','0821234567'),'sms:+27821234567');
 for(const value of [null,'javascript:123','+27821234567?body=hello','+27111234567','12345'])assert.equal(directoryMobile(value),null);
});
