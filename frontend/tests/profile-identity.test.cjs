const test = require('node:test');
const assert = require('node:assert/strict');
const {load,engine,tick,nodes,text,button,native,colors}=require('./ui-harness.cjs');

async function setup(screen='home',photo='data:image/jpeg;base64,existing') {
 const ui=engine(),routes=[],pickerOptions=[],updates=[],alerts=[];
 const auth={user:{id:'member',full_name:'Alexandra Very Long Member Name That Must Stay Readable',first_name:'Alexandra',profile_photo:photo},token:'session',logout:async()=>{},updateProfilePhoto:async value=>{updates.push(value);auth.user.profile_photo=value;}};
 const response={user:auth.user,summary:{total_saved:0,active_clubs:0,upcoming_payments:0,claims_count:0},clubs:[],invitations:[],schedules:[],clubs_count:0,total_saved:0,on_time_percentage:0,trust_score:null};
 const picker={requestMediaLibraryPermissionsAsync:async()=>({granted:true}),MediaTypeOptions:{Images:'Images'},launchImageLibraryAsync:async options=>{pickerOptions.push(options);return {canceled:false,assets:[{base64:'replacement'}]};}};
 const Screen=load(`app/(member)/${screen}.tsx`,{
  react:ui.react,'react-native':{...native,RefreshControl:'RefreshControl',TextInput:'TextInput',KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:'android'} ,Alert:{alert:(...a)=>alerts.push(a)}},
  'expo-router':{useFocusEffect:ui.useFocusEffect,useRouter:()=>({push:r=>routes.push(r),replace:r=>routes.push(r)})},
  '../../contexts/AuthContext':{useAuth:()=>auth},'../../components/StatusPill':{StatusPill:'StatusPill'},'../../components/AdBanner':{AdBanner:'AdBanner'},
  '../../constants/Colors':{Colors:colors},'@expo/vector-icons':{Ionicons:'Ionicons'},
  '@react-native-async-storage/async-storage':{},'expo-image-picker':picker,
  axios:{get:async()=>({data:response})},
 }).default;
 const render=()=>ui.render(Screen);render();await tick();return {render,auth,routes,picker,pickerOptions,updates,alerts};
}
const style=n=>Object.assign({},...([n.props.style].flat().filter(Boolean)));

test('Home photo is 68px, circular, covered and retains its clementine ring',async()=>{
 const c=await setup();const image=nodes(c.render()).find(n=>n.type==='Image');
 assert.deepEqual([style(image).width,style(image).height,style(image).borderRadius],[68,68,34]);
 assert.equal(style(image).borderWidth,2);assert.equal(style(image).borderColor,'gold');assert.equal(image.props.resizeMode,'cover');
 assert.equal(image.props.source.uri,'data:image/jpeg;base64,existing');
});
test('Home fallback matches 68px photo footprint and scales existing person icon',async()=>{
 const c=await setup('home',null);const tree=c.render();const avatar=nodes(tree).find(n=>n.props?.accessibilityLabel==='Open profile menu');
 const circle=nodes(avatar).find(n=>n.type==='View');assert.deepEqual([style(circle).width,style(circle).height,style(circle).borderRadius],[68,68,34]);
 assert.equal(nodes(avatar).find(n=>n.type==='Ionicons').props.size,32);
});
test('Home header keeps existing menu/profile route and reserves space on a 320px screen',async()=>{
 const c=await setup();let tree=c.render();const avatar=nodes(tree).find(n=>n.props?.accessibilityLabel==='Open profile menu');
 const header=nodes(tree).find(n=>n.type==='View'&&n.props?.children?.includes(avatar));
 assert.equal(style(header).alignItems,'center');assert.equal(style(header).gap,16);assert.equal(style(avatar).flexShrink,0);
 const logo=nodes(header).find(n=>n.type==='Text');assert.equal(text(logo),'Clubvel');assert.equal(style(logo).flexShrink,1);
 assert.ok(320-2*style(header).paddingHorizontal-68-2*style(avatar).padding-style(header).gap>=100);
 avatar.props.onPress();tree=c.render();assert.match(text(tree),/Alexandra Very Long Member Name/);
 nodes(tree).find(n=>n.type==='TouchableOpacity' && text(n)==='My Profile').props.onPress();
 assert.deepEqual(c.routes,['/(member)/profile']);
});
test('Profile keeps 80px identity, safe fallback and wraps long names',async()=>{
 for(const photo of ['data:image/jpeg;base64,existing',null]){
  const c=await setup('profile',photo),tree=c.render();
  const avatar=nodes(tree).find(n=>n.props?.accessibilityLabel==='Change profile photo');
  const imageOrCircle=nodes(avatar).find(n=>n.type===(photo?'Image':'View'));
  assert.deepEqual([style(imageOrCircle).width,style(imageOrCircle).height,style(imageOrCircle).borderRadius],[80,80,40]);
  const name=nodes(tree).find(n=>n.type==='Text'&&text(n)===c.auth.user.full_name);assert.equal(style(name).textAlign,'center');assert.equal(style(name).alignSelf,'stretch');
  assert.ok(button(tree,'Change photo'));
 }
});
test('visible Change photo control retains permission, square crop, compression and existing update function',async()=>{
 const c=await setup('profile');await button(c.render(),'Change photo').props.onPress();
 assert.deepEqual(c.pickerOptions[0],{mediaTypes:'Images',allowsEditing:true,aspect:[1,1],quality:0.5,base64:true});
 assert.deepEqual(c.updates,['data:image/jpeg;base64,replacement']);
 assert.equal(nodes(c.render()).find(n=>n.type==='Image').props.source.uri,'data:image/jpeg;base64,replacement');
});
test('photo-picker cancellation and permission refusal do not update photo',async()=>{
 const c=await setup('profile');c.picker.launchImageLibraryAsync=async()=>({canceled:true});await button(c.render(),'Change photo').props.onPress();assert.equal(c.updates.length,0);
 c.picker.requestMediaLibraryPermissionsAsync=async()=>({granted:false});await button(c.render(),'Change photo').props.onPress();assert.equal(c.updates.length,0);assert.equal(c.alerts.at(-1)[0],'Permission Required');
});
