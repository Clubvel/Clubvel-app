const test=require('node:test');const assert=require('node:assert/strict');
const {load,engine,native,nodes,tick}=require('./ui-harness.cjs');
test('startup restores authentication then routes all accounts through Member Home',()=>{
 const ui=engine(),auth={loading:true,user:null};const Index=load('app/index.tsx',{react:ui.react,'expo-router':{Redirect:'Redirect'},'../contexts/AuthContext':{useAuth:()=>auth}}).default;
 assert.equal(ui.render(Index),null);auth.loading=false;auth.user={id:'person'};assert.equal(ui.render(Index).props.href,'/(member)/home');auth.user=null;assert.equal(ui.render(Index).props.href,'/auth');
});
function setup(auth,pathname){
 const ui=engine(),state={pathname,hidden:0,options:null};
 const Splash=load('app/_layout.tsx',{react:ui.react,'react-native':native,'../assets/images/clubvel-midnight-symbol.png':1,'expo-router':{Stack:'Stack',usePathname:()=>state.pathname},'expo-splash-screen':{setOptions:o=>state.options=o,preventAutoHideAsync:async()=>{},hideAsync:async()=>{state.hidden++;}},'../contexts/AuthContext':{AuthProvider:'AuthProvider',useAuth:()=>auth}}).StartupSplash;
 return {state,render:()=>ui.render(Splash)};
}
for(const destination of ['/home','/auth'])test(`launch handoff waits for loaded full branding and committed ${destination}, with no cross-fade`,async()=>{
 const auth={loading:true},c=setup(auth,'/');let frame;const request=global.requestAnimationFrame,cancel=global.cancelAnimationFrame;
 global.requestAnimationFrame=cb=>{frame=cb;return 1;};global.cancelAnimationFrame=()=>{frame=null;};
 try{
  assert.deepEqual(c.state.options,{fade:false,duration:0});let brand=c.render();brand.props.onLayout();c.render();assert.equal(c.state.hidden,0);assert.equal(frame,undefined);
  const image=nodes(c.render()).find(n=>n.type==='Image');assert.equal(image.props.resizeMode,'contain');assert.equal(image.props.style.aspectRatio,1);image.props.onLoad();c.render();await tick();c.render();assert.equal(c.state.hidden,1);assert.equal(frame,undefined);
  auth.loading=false;c.state.pathname=destination;c.render();assert.equal(typeof frame,'function');frame();assert.equal(c.render(),null);assert.equal(c.state.hidden,1);
 }finally{global.requestAnimationFrame=request;global.cancelAnimationFrame=cancel;}
});
test('authentication changes cancel release and keep the loaded branding mask visible',async()=>{
 const auth={loading:false},c=setup(auth,'/home');let frame;const request=global.requestAnimationFrame,cancel=global.cancelAnimationFrame;global.requestAnimationFrame=cb=>{frame=cb;return 1;};global.cancelAnimationFrame=()=>{frame=null;};
 try{const tree=c.render();tree.props.onLayout();nodes(tree).find(n=>n.type==='Image').props.onLoad();c.render();await tick();c.render();assert.equal(typeof frame,'function');auth.loading=true;c.state.pathname='/';c.render();assert.equal(frame,null);assert.ok(c.render());assert.equal(c.state.hidden,1);}finally{global.requestAnimationFrame=request;global.cancelAnimationFrame=cancel;}
});
