const test=require('node:test');const assert=require('node:assert/strict');
const {load,engine}=require('./ui-harness.cjs');
test('startup restores authentication then redirects without role/network lookup or prematurely hiding splash',()=>{
 const ui=engine(),auth={loading:true,user:null};
 const Index=load('app/index.tsx',{react:ui.react,'expo-router':{Redirect:'Redirect'},'../contexts/AuthContext':{useAuth:()=>auth}}).default;
 assert.equal(ui.render(Index),null);auth.loading=false;auth.user={id:'person'};
 assert.equal(ui.render(Index).props.href,'/(member)/home');auth.user=null;assert.equal(ui.render(Index).props.href,'/auth');
});
for(const destination of ['/home','/auth'])test(`splash waits for committed ${destination} and releases once without waiting for dashboard data`,()=>{
 const ui=engine(),auth={loading:true};let pathname='/',hidden=0,frame,cancelled=0;
 const oldRequest=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;
 global.requestAnimationFrame=callback=>{frame=callback;return 1;};global.cancelAnimationFrame=()=>{cancelled++;frame=null;};
 try {
  const Splash=load('app/_layout.tsx',{react:ui.react,'expo-router':{Stack:'Stack',usePathname:()=>pathname},'expo-splash-screen':{preventAutoHideAsync:async()=>{},hideAsync:async()=>{hidden++;}},'../contexts/AuthContext':{AuthProvider:'AuthProvider',useAuth:()=>auth}}).StartupSplash;
  ui.render(Splash);assert.equal(frame,undefined);auth.loading=false;ui.render(Splash);assert.equal(frame,undefined);
  pathname=destination;ui.render(Splash);assert.equal(hidden,0);assert.equal(typeof frame,'function');frame();assert.equal(hidden,1);
  pathname='/profile';ui.render(Splash);assert.equal(hidden,1);assert.equal(cancelled,1);
 } finally {global.requestAnimationFrame=oldRequest;global.cancelAnimationFrame=oldCancel;}
});
test('a cancelled destination frame cannot release splash while authentication is unresolved',()=>{
 const ui=engine(),auth={loading:false};let pathname='/home',hidden=0,frame;
 const oldRequest=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;
 global.requestAnimationFrame=cb=>{frame=cb;return 1;};global.cancelAnimationFrame=()=>{frame=null;};
 try{
  const Splash=load('app/_layout.tsx',{react:ui.react,'expo-router':{Stack:'Stack',usePathname:()=>pathname},'expo-splash-screen':{preventAutoHideAsync:async()=>{},hideAsync:async()=>{hidden++;}},'../contexts/AuthContext':{AuthProvider:'AuthProvider',useAuth:()=>auth}}).StartupSplash;
  ui.render(Splash);auth.loading=true;pathname='/';ui.render(Splash);assert.equal(frame,null);assert.equal(hidden,0);
 }finally{global.requestAnimationFrame=oldRequest;global.cancelAnimationFrame=oldCancel;}
});
