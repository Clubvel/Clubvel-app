const test=require('node:test');const assert=require('node:assert/strict');
const {load,engine,tick,nodes,text,button,native,colors}=require('./ui-harness.cjs');
function setup(params={}) {
 const ui=engine(),requests=[];
 const Screen=load('app/(treasurer)/claims.tsx',{react:ui.react,'react-native':{...native,TextInput:'TextInput',Platform:{OS:'android'}},'expo-router':{useFocusEffect:ui.useFocusEffect,useRouter:()=>({push(){}}),useLocalSearchParams:()=>params},'../../contexts/AuthContext':{useAuth:()=>({user:{id:'admin'},token:'signed'})},'../../components/ProfilePhotoViewer':{default:'ProfilePhotoViewer'},'../../components/ClaimPaymentRecord':{ClaimPaymentRecord:'ClaimPaymentRecord'},'../../components/ClaimPayoutDate':{ClaimPayoutDate:'ClaimPayoutDate'},'../../components/AdBanner':{AdBanner:'AdBanner'},'../../constants/Colors':{Colors:colors},'@expo/vector-icons':{Ionicons:'Icon'},axios:{get:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))}}).default;
 const render=()=>ui.render(Screen);render();
 const ready=async()=>{requests[0].resolve({data:{clubs:[{id:'travel',name:'WeTraveling'},{id:'eight',name:'Eighty8'}]}});await tick();render();};
 let current='WeTraveling';
 const select=(name='Eighty8')=>{button(render(),current).props.onPress();button(render(),name).props.onPress();current=name;render();};
 return {ui,requests,render,ready,select};
}
const claim=(id,group,name)=>({claim_id:id,group_id:group,member_name:name,amount:100,status:'approved',actual_amount_paid:0});
test('Claims honors an explicitly requested authorized club',async()=>{
 const c=setup({groupId:'eight'});await c.ready();assert.match(c.requests[1].url,/groups\/eight\/claims/);assert.equal(c.requests[1].options.headers.Authorization,'Bearer signed');
});
test('slow previous-club claims cannot replace current club records',async()=>{
 const c=setup();await c.ready();c.select();c.requests[2].resolve({data:{claims:[claim('e','eight','Eight Member')]}});await tick();c.render();
 c.requests[1].resolve({data:{claims:[claim('t','travel','Travel Member')]}});await tick();assert.match(text(c.render()),/Eight Member/);assert.doesNotMatch(text(c.render()),/Travel Member/);
});
test('post-payment callback from a previously selected club cannot refresh that club into the current view',async()=>{
 const c=setup();await c.ready();c.requests[1].resolve({data:{claims:[claim('t','travel','Travel Member')]}});await tick();const payment=nodes(c.render()).find(n=>n.type==='ClaimPaymentRecord');c.select();const count=c.requests.length;await payment.props.onRecorded();assert.equal(c.requests.length,count);
});

test('Claims focus refresh retains Eighty8 even when the original route requested WeTraveling',async()=>{
 const c=setup({groupId:'travel'});await c.ready();c.select();c.requests[2].resolve({data:{claims:[claim('e','eight','Eight Member')]}});await tick();c.render();c.ui.blur();c.ui.focus();
 const groups=c.requests.findLast(r=>r.url.includes('/dashboard/'));groups.resolve({data:{clubs:[{id:'travel',name:'WeTraveling'},{id:'eight',name:'Eighty8'}]}});await tick();c.render();assert.match(c.requests.at(-1).url,/groups\/eight\/claims/);
});

test('Claims WeTraveling → Eighty8 → WeTraveling keeps only the latest financial records',async()=>{
 const c=setup();await c.ready();const firstTravel=c.requests[1];c.select('Eighty8');const eight=c.requests[2];c.select('WeTraveling');const latestTravel=c.requests[3];
 latestTravel.resolve({data:{claims:[{...claim('current','travel','Current Travel Claim'),amount:375,actual_amount_paid:25}]}});await tick();c.render();
 eight.resolve({data:{claims:[{...claim('wrong','eight','Wrong Eight Claim'),amount:9999}]}});firstTravel.resolve({data:{claims:[claim('stale','travel','Stale Travel Claim')]}});await tick();
 const tree=c.render();assert.match(text(tree),/Current Travel Claim/);assert.doesNotMatch(text(tree),/Wrong Eight Claim|Stale Travel Claim/);
 const payment=nodes(tree).find(n=>n.type==='ClaimPaymentRecord');assert.equal(payment.props.approvedAmount,375);assert.equal(payment.props.actualAmountPaid,25);
 for(const request of [firstTravel,eight,latestTravel])assert.equal(request.options.headers.Authorization,'Bearer signed');
});
