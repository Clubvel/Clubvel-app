const test=require('node:test');const assert=require('node:assert/strict');
const {load,engine,tick,native}=require('./ui-harness.cjs');
async function setup(){
 const ui=engine(),requests=[],writes=[],clears=[],saved=new Map([['user_data','stored'],['last_activity','0']]);let holdWrite=false,holdClear=false;
 const nextUser={id:'next-person',full_name:'Next Account',phone_number:'+27001'};
 const original={id:'person',full_name:'Old Name',phone_number:'+27000',profile_photo:'old-photo'};
 const Provider=load('contexts/AuthContext.tsx',{
  react:{...ui.react,createContext:()=>({Provider:'Provider'})},'react-native':{...native,AppState:{currentState:'active',addEventListener:()=>({remove(){}})}},
  '@react-native-async-storage/async-storage':{getItem:async key=>saved.get(key),setItem:async(key,value)=>{if(key==='user_data'&&holdWrite){holdWrite=false;await new Promise(resolve=>writes.push({resolve}));}saved.set(key,value);},multiSet:async entries=>entries.forEach(([key,value])=>saved.set(key,value)),multiRemove:async keys=>keys.forEach(k=>saved.delete(k))},
  axios:{put:(url,body,options)=>new Promise((resolve,reject)=>requests.push({url,body,options,resolve,reject})),post:(url,body,options)=>new Promise((resolve,reject)=>requests.push({url,body,options,resolve,reject}))},
  '../services/authentication':{authentication:{login:async()=>({access_token:'next-session',user:nextUser})},authenticationError:e=>e},
  '../services/session':{AUTH_STORAGE_KEYS:['user_data','last_activity'],restoreStoredSession:()=>({token:'signed-session',user:original,lastActivity:Date.now()}),sessionExpired:()=>false},
  '../services/sessionStorage':{sessionStorage:{getToken:async()=> 'signed-session',clearToken:async()=>{if(holdClear)await new Promise(resolve=>clears.push({resolve}));},setToken:async()=>{}}},
 }).AuthProvider;
 // Timer behavior is covered by session tests; avoid keeping this component harness alive.
 const render=()=>{
  const oldInterval=global.setInterval,oldClear=global.clearInterval;
  global.setInterval=()=>0;global.clearInterval=()=>{};
  try{return ui.render(()=>Provider({children:'child'})).props.value;}
  finally{global.setInterval=oldInterval;global.clearInterval=oldClear;}
 };
 render();await tick();const api=render();
 return {api,render,requests,saved,writes,clears,holdStorage(){holdWrite=true;},holdLogout(){holdClear=true;}};
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

for(const method of ['updateProfile','updateProfilePhoto']) {
 test(`${method} response cannot restore identity while logout storage cleanup is still pending`,async()=>{
  const c=await setup();const work=c.api[method]('New Value');c.holdLogout();const logout=c.api.logout();await tick();
  assert.equal(c.render().user,null);c.requests[0].resolve({data:{full_name:'New Value'}});await work;
  assert.equal(c.render().user,null);c.clears[0].resolve();await logout;assert.equal(c.saved.has('user_data'),false);
 });
 test(`${method} storage write finishing after logout is cleared and cannot resurrect the session`,async()=>{
  const c=await setup();c.holdStorage();const work=c.api[method]('New Value');c.requests[0].resolve({data:{full_name:'New Value'}});await tick();assert.equal(c.writes.length,1);
  const logout=c.api.logout();assert.equal(c.render().user,null);c.writes[0].resolve();await Promise.all([work,logout]);
  assert.equal(c.saved.has('user_data'),false);assert.equal(c.render().user,null);
 });
 test(`${method} delayed storage write cannot overwrite a newly authenticated account`,async()=>{
  const c=await setup();c.holdStorage();const work=c.api[method]('Old Account Value');c.requests[0].resolve({data:{full_name:'Old Account Value'}});await tick();
  const login=c.api.login('+27001','test-password');await tick();c.writes[0].resolve();await Promise.all([work,login]);
  assert.equal(c.render().user.id,'next-person');assert.equal(c.render().user.full_name,'Next Account');
  assert.equal(JSON.parse(c.saved.get('user_data')).id,'next-person');assert.equal(c.render().token,'next-session');
 });
 test(`${method} network response after account switching cannot update the new account`,async()=>{
  const c=await setup();const work=c.api[method]('Old Account Value');await c.api.login('+27001','test-password');c.render();
  c.requests[0].resolve({data:{full_name:'Old Account Value'}});await work;
  assert.equal(c.render().user.full_name,'Next Account');assert.equal(JSON.parse(c.saved.get('user_data')).id,'next-person');
 });
}
