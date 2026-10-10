const test = require('node:test');
const assert = require('node:assert/strict');
const {load,engine,tick,nodes,text,native,colors} = require('./ui-harness.cjs');
function setup(params={}) {
 const ui=engine(),requests=[];
 const Screen=load('app/(treasurer)/members.tsx', {
  react:ui.react,'react-native':{...native,TextInput:'TextInput',KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:'android'},Linking:{}},
  'expo-router':{useFocusEffect:ui.useFocusEffect,useRouter:()=>({push(){}}),useLocalSearchParams:()=>params},
  '../../contexts/AuthContext':{useAuth:()=>({user:{id:'admin',full_name:'Admin',profile_photo:'photo'},token:'signed'})},
  '../../components/ProfilePhotoViewer':{default:'ProfilePhotoViewer'},
  '../../components/StatusPill':{StatusPill:'StatusPill'},'../../components/AdBanner':{AdBanner:'AdBanner'},
  '../../constants/Colors':{Colors:colors},'@expo/vector-icons':{Ionicons:'Icon'},
  axios:{get:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))},
 }).default;
 const render=()=>ui.render(Screen);render();
 const ready=async()=>{requests[0].resolve({data:{clubs:[{id:'travel',name:'WeTraveling'},{id:'eight',name:'Eighty8'}]}});await tick();render();};
 const select=name=>{nodes(render()).find(n=>n.props?.accessibilityLabel==='Select club for members').props.onPress();nodes(render()).find(n=>n.type==='TouchableOpacity'&&text(n)===name&&n.props.onPress).props.onPress();render();};
 return {ui,requests,render,ready,select};
}
const member=name=>({id:name,name,reference:'REF',membership_status:'active',status:'confirmed',amount_paid:100,phone:''});
test('Members navigation honors Eighty8 identity and uses authenticated club endpoint',async()=>{
 const c=setup({groupId:'eight'});await c.ready();assert.match(c.requests[1].url,/club\/eight\?/);assert.equal(c.requests[1].options.headers.Authorization,'Bearer signed');
});
test('rapid WeTraveling to Eighty8 switch cannot display a late response from the previous club',async()=>{
 const c=setup();await c.ready();c.select('Eighty8');
 const travel=c.requests.find(r=>r.url.includes('/club/travel?')),eight=c.requests.find(r=>r.url.includes('/club/eight?'));assert.ok(travel&&eight);
 eight.resolve({data:{members:[member('Eight member')]}});await tick();c.render();travel.resolve({data:{members:[member('Travel member')]}});await tick();
 assert.match(text(c.render()),/Eight member/);assert.doesNotMatch(text(c.render()),/Travel member/);
});
test('selected club failure offers Retry without retaining another clubs members',async()=>{
 const c=setup();await c.ready();c.requests[1].resolve({data:{members:[member('Travel member')]}});await tick();c.render();c.select('Eighty8');
 const original=console.error;try{console.error=()=>{};c.requests.at(-1).reject(new Error('offline'));await tick();}finally{console.error=original;}
 assert.doesNotMatch(text(c.render()),/Travel member/);assert.match(text(c.render()),/Unable to load members/);assert.ok(nodes(c.render()).some(n=>n.type==='TouchableOpacity'&&text(n)==='Retry'));
});
test('full-size viewer preserves real image and closes via button and Android Back',()=>{
 const ui=engine();let closes=0;
 const Viewer=load('components/ProfilePhotoViewer.tsx',{react:ui.react,'react-native':{...native,Pressable:'Pressable',StatusBar:'StatusBar'},'@expo/vector-icons':{Ionicons:'Icon'}}).default;
 const tree=Viewer({visible:true,photoUri:'real-photo',displayName:'Member',onClose:()=>closes++});
 assert.equal(tree.props.visible,true);const image=nodes(tree).find(n=>n.type==='Image');assert.equal(image.props.source.uri,'real-photo');assert.equal(image.props.resizeMode,'contain');
 tree.props.onRequestClose();nodes(tree).find(n=>n.type==='Pressable').props.onPress();assert.equal(closes,2);
 assert.equal(Viewer({visible:true,photoUri:null,onClose(){}}).props.visible,false);
});

test('Members focus refresh keeps manually selected Eighty8 rather than restoring old route club',async()=>{
 const c=setup({groupId:'travel'});await c.ready();c.select('Eighty8');c.requests.at(-1).resolve({data:{members:[member('Eight Member')]}});await tick();c.render();c.ui.blur();c.ui.focus();
 c.requests.at(-1).resolve({data:{clubs:[{id:'travel',name:'WeTraveling'},{id:'eight',name:'Eighty8'}]}});await tick();c.render();assert.match(c.requests.at(-1).url,/club\/eight\?/);
});

test('Members WeTraveling → Eighty8 → WeTraveling rejects both older clubs responses',async()=>{
 const c=setup();await c.ready();const firstTravel=c.requests[1];c.select('Eighty8');const eight=c.requests[2];c.select('WeTraveling');const latestTravel=c.requests[3];
 latestTravel.resolve({data:{members:[member('Current Travel Member')]}});await tick();c.render();
 eight.resolve({data:{members:[member('Wrong Eight Member')]}});firstTravel.resolve({data:{members:[member('Stale Travel Member')]}});await tick();
 assert.match(text(c.render()),/Current Travel Member/);assert.doesNotMatch(text(c.render()),/Wrong Eight Member|Stale Travel Member/);
 for(const request of [firstTravel,eight,latestTravel])assert.equal(request.options.headers.Authorization,'Bearer signed');
});
