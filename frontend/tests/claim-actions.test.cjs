const test=require('node:test');
const assert=require('node:assert/strict');
const {load,engine,tick,nodes,text,button,native,colors}=require('./ui-harness.cjs');
async function setup(){
 const ui=engine(),requests=[],alerts=[];
 const claim={claim_id:'old',group_id:'club',group_name:'Club',amount:20000,reason:'Original reason',status:'rejected',rejection_reason:'Outside policy'};
 const claims={records:[claim],phase:'ready',refreshing:false,reload:async()=>{}};
 const Screen=load('app/(member)/claims.tsx',{
  react:{...ui.react,useMemo:fn=>fn()},
  'react-native':{...native,KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:'android'},TextInput:'TextInput',Alert:{alert:(...a)=>alerts.push(a)}},
  'expo-router':{useLocalSearchParams:()=>({}),useRouter:()=>({push(){}})},'@expo/vector-icons':{Ionicons:'Icon'},
  '../../contexts/AuthContext':{useAuth:()=>({user:{id:'member'},token:'signed'})},
  '../../constants/Colors':{Colors:colors},'../../hooks/usePersonalClaims':{usePersonalClaims:()=>claims},
  axios:{isAxiosError:()=>false,get:async()=>({data:{clubs:[{id:'club',name:'Club'}]}}),post:async(url,data,options)=>{requests.push({url,data,options});}},
 }).default;
 const render=()=>ui.render(Screen);render();await tick();return {render,requests,alerts,claims,claim};
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
