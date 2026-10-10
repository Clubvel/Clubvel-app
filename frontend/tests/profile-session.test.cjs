const test=require('node:test');const assert=require('node:assert/strict');
const {load,engine,tick,native}=require('./ui-harness.cjs');
async function setup(){
 const ui=engine(),requests=[],saved=new Map([['user_data','stored'],['last_activity','0']]);
 const original={id:'person',full_name:'Old Name',phone_number:'+27000',profile_photo:'old-photo'};
 const Provider=load('contexts/AuthContext.tsx',{
  react:{...ui.react,createContext:()=>({Provider:'Provider'})},'react-native':{...native,AppState:{currentState:'active',addEventListener:()=>({remove(){}})}},
  '@react-native-async-storage/async-storage':{getItem:async key=>saved.get(key),setItem:async(key,value)=>saved.set(key,value),multiRemove:async keys=>keys.forEach(k=>saved.delete(k))},
  axios:{put:(url,body,options)=>new Promise((resolve,reject)=>requests.push({url,body,options,resolve,reject})),post:(url,body,options)=>new Promise((resolve,reject)=>requests.push({url,body,options,resolve,reject}))},
  '../services/authentication':{authentication:{},authenticationError:e=>e},
  '../services/session':{AUTH_STORAGE_KEYS:['user_data','last_activity'],restoreStoredSession:()=>({token:'signed-session',user:original,lastActivity:Date.now()}),sessionExpired:()=>false},
  '../services/sessionStorage':{sessionStorage:{getToken:async()=> 'signed-session',clearToken:async()=>{}}},
 }).AuthProvider;
 // Timer behavior is covered by session tests; avoid keeping this component harness alive.
 const oldInterval=global.setInterval,oldClear=global.clearInterval;global.setInterval=()=>0;global.clearInterval=()=>{};
 const render=()=>{try{return ui.render(()=>Provider({children:'child'})).props.value;}finally{}};
 render();await tick();const api=render();global.setInterval=oldInterval;global.clearInterval=oldClear;
 return {api,render,requests,saved};
}
test('name save uses bearer and name-only body; shared state and stored session preserve identity/photo',async()=>{
 const c=await setup();const work=c.api.updateProfile('New Surname');assert.deepEqual(c.requests[0].body,{full_name:'New Surname'});assert.equal(c.requests[0].options.headers.Authorization,'Bearer signed-session');
 c.requests[0].resolve({data:{full_name:'New Surname',role:'admin',id:'other'}});await work;
 assert.equal(c.render().user.full_name,'New Surname');const stored=JSON.parse(c.saved.get('user_data'));assert.equal(stored.id,'person');assert.equal(stored.phone_number,'+27000');assert.equal(stored.profile_photo,'old-photo');assert.equal(stored.role,undefined);
});
test('late name response after logout cannot restore identity or stored user',async()=>{
 const c=await setup();const work=c.api.updateProfile('New Surname');await c.api.logout();c.render();c.requests[0].resolve({data:{full_name:'New Surname'}});await work;assert.equal(c.render().user,null);assert.equal(c.saved.has('user_data'),false);
});
test('concurrent name and photo responses preserve both saved changes',async()=>{
 const c=await setup();const name=c.api.updateProfile('New Surname'),photo=c.api.updateProfilePhoto('new-photo');
 c.requests[0].resolve({data:{full_name:'New Surname'}});await name;c.requests[1].resolve({data:{}});await photo;
 assert.equal(c.render().user.full_name,'New Surname');assert.equal(c.render().user.profile_photo,'new-photo');assert.equal(JSON.parse(c.saved.get('user_data')).full_name,'New Surname');
});
