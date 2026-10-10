const test=require('node:test');const assert=require('node:assert/strict');
const {load,engine}=require('./ui-harness.cjs');
test('startup waits for stored session then redirects declaratively and releases splash, without role/network lookup',()=>{
 const ui=engine();let hidden=0,frame;const auth={loading:true,user:null};
 const oldRequest=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;
 global.requestAnimationFrame=callback=>{frame=callback;return 1;};global.cancelAnimationFrame=()=>{};
 try {
  const Index=load('app/index.tsx',{react:ui.react,'expo-router':{Redirect:'Redirect'},'expo-splash-screen':{hideAsync:async()=>{hidden++;}},'../contexts/AuthContext':{useAuth:()=>auth}}).default;
  assert.equal(ui.render(Index),null);assert.equal(hidden,0);
  auth.loading=false;auth.user={id:'person'};assert.equal(ui.render(Index).props.href,'/(member)/home');frame();assert.equal(hidden,1);
  auth.user=null;assert.equal(ui.render(Index).props.href,'/auth');
 } finally {global.requestAnimationFrame=oldRequest;global.cancelAnimationFrame=oldCancel;}
});
