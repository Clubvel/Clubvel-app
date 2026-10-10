const test = require('node:test');
const assert = require('node:assert/strict');
const {load,engine,tick,nodes,text,button,native,colors} = require('./ui-harness.cjs');
function setup() {
 const ui=engine(), saves=[],alerts=[];
 const auth={user:{full_name:'Alexandra van der Merwe'},updateProfile:name=>new Promise((resolve,reject)=>saves.push({name,resolve,reject}))};
 const Edit=load('components/EditProfile.tsx', {react:ui.react,'react-native':{...native,TextInput:'TextInput',KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:'android'},Alert:{alert:(...a)=>alerts.push(a)}},'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:24})},'../contexts/AuthContext':{useAuth:()=>auth},'../constants/Colors':{Colors:colors}}).default;
 const render=()=>ui.render(Edit);const input=label=>nodes(render()).find(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label);
 button(render(),'Edit Profile').props.onPress();render();return {ui,auth,saves,alerts,render,input};
}
test('editor displays first name and complete compound surname; Cancel makes no request',()=>{
 const c=setup();assert.equal(c.input('First name').props.value,'Alexandra');assert.equal(c.input('Surname').props.value,'van der Merwe');
 button(c.render(),'Cancel').props.onPress();assert.equal(nodes(c.render()).find(n=>n.type==='Modal').props.visible,false);assert.equal(c.saves.length,0);
});
test('valid Unicode names save once despite duplicate taps, show success and close',async()=>{
 const c=setup();c.input('First name').props.onChangeText('Zoë');c.input('Surname').props.onChangeText('Dlamini');const save=button(c.render(),'Save').props.onPress;save();save();
 assert.equal(c.saves.length,1);assert.equal(c.saves[0].name,'Zoë Dlamini');assert.equal(c.input('Surname').props.editable,false);
 c.saves[0].resolve();await tick();assert.equal(nodes(c.render()).find(n=>n.type==='Modal').props.visible,false);assert.equal(c.alerts[0][0],'Profile updated');
});
test('invalid or blank names stay editable and make no request',()=>{
 const c=setup();c.input('Surname').props.onChangeText('');button(c.render(),'Save').props.onPress();assert.equal(c.saves.length,0);assert.match(text(c.render()),/Enter your first name and surname/);
});
test('save failure retains entered name, shows error, and permits retry',async()=>{
 const c=setup();c.input('Surname').props.onChangeText('New Surname');button(c.render(),'Save').props.onPress();c.saves[0].reject(new Error('Offline'));await tick();assert.equal(c.input('Surname').props.value,'New Surname');assert.match(text(c.render()),/Offline/);button(c.render(),'Save').props.onPress();assert.equal(c.saves.length,2);
});
test('reopening uses latest shared identity; safe-area padding and Android Back retained',()=>{
 const c=setup();nodes(c.render()).find(n=>n.type==='Modal').props.onRequestClose();c.auth.user.full_name='Alexandra New Surname';button(c.render(),'Edit Profile').props.onPress();assert.equal(c.input('Surname').props.value,'New Surname');assert.ok(nodes(c.render()).some(n=>n.props?.style?.some?.(s=>s?.paddingBottom===24)));
});
