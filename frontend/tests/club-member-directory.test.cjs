const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {load,engine,tick,nodes,text,native,colors} = require('./ui-harness.cjs');
function setup() {
 const ui=engine(), requests=[], auth={user:{id:'jimmy'},token:'session-a'},props={groupId:'travel'};
 const Screen=load('components/ClubMemberDirectory.tsx', {react:ui.react,'react-native':native,'expo-router':{useFocusEffect:ui.useFocusEffect},axios:{get:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))},'../contexts/AuthContext':{useAuth:()=>auth},'../constants/Colors':{Colors:colors},'./ProfilePhotoViewer':{__esModule:true,default:'ProfilePhotoViewer'}}).default;
 const render=()=>ui.render(()=>Screen(props));render();
 const reply=async(index,groupId='travel',members=[{id:'jimmy-member',name:'Jimmy Person',profile_photo:'real-photo',role:'member'},{id:'brown-member',name:'Brown Person',profile_photo:null,role:'admin'}])=>{requests[index].resolve({data:{group_id:groupId,members}});await tick();return render();};
 const tap=label=>nodes(render()).find(n=>n.props?.accessibilityLabel===label).props.onPress();
 return {ui,requests,auth,props,render,reply,tap};
}
test('directory uses one authenticated request and reuses photos for profile and enlargement',async()=>{
 const c=setup();await c.reply(0);assert.equal(c.requests.length,1);assert.equal(c.requests[0].options.headers.Authorization,'Bearer session-a');
 const image=nodes(c.render()).find(n=>n.type==='Image');assert.equal(image.props.source.uri,'real-photo');assert.equal(image.props.resizeMode,'cover');
 c.tap('View photo of Jimmy Person');let viewer=nodes(c.render()).find(n=>n.type==='ProfilePhotoViewer');assert.equal(viewer.props.visible,true);assert.equal(viewer.props.photoUri,'real-photo');viewer.props.onClose();assert.equal(nodes(c.render()).find(n=>n.type==='ProfilePhotoViewer').props.visible,false);
 c.tap('Open profile of Jimmy Person');let modal=nodes(c.render()).find(n=>n.type==='Modal');assert.equal(modal.props.visible,true);assert.match(text(modal),/Jimmy PersonMember/);assert.doesNotMatch(text(modal),/telephone|payment|reference/i);
 modal.props.onRequestClose();assert.equal(nodes(c.render()).find(n=>n.type==='Modal').props.visible,false);c.tap('Open profile of Jimmy Person');c.tap('Close member profile');assert.equal(nodes(c.render()).find(n=>n.type==='Modal').props.visible,false);assert.equal(c.requests.length,1);
});
test('missing photographs render initials and selected-club role',async()=>{
 const c=setup();await c.reply(0);assert.match(text(c.render()),/BP/);assert.match(text(c.render()),/Admin/);assert.equal(nodes(c.render()).find(n=>n.props?.accessibilityLabel==='View photo of Brown Person').props.disabled,true);
 c.tap('Open profile of Brown Person');assert.match(text(nodes(c.render()).find(n=>n.type==='Modal')),/BPBrown PersonAdmin/);
});
test('account/session change immediately masks identities, profiles and expanded photos',async()=>{
 const c=setup();await c.reply(0);c.tap('Open profile of Jimmy Person');c.tap('View photo of Jimmy Person');c.auth.user={id:'brown'};c.auth.token='session-b';const tree=c.render();assert.doesNotMatch(text(tree),/Jimmy Person/);assert.equal(nodes(tree).find(n=>n.type==='Modal').props.visible,false);assert.equal(nodes(tree).find(n=>n.type==='ProfilePhotoViewer').props.visible,false);
 await c.reply(1,'travel',[{id:'b',name:'Brown Current',profile_photo:null,role:'admin'}]);assert.match(text(c.render()),/Brown Current/);
});
test('rapid travel-eight-travel switching rejects both stale directory responses',async()=>{
 const c=setup();c.props.groupId='eight';c.render();c.props.groupId='travel';c.render();await c.reply(2,'travel',[{id:'current',name:'Current Travel',profile_photo:null,role:'member'}]);await c.reply(1,'eight',[{id:'wrong',name:'Wrong Eight',profile_photo:'private',role:'admin'}]);await c.reply(0);assert.match(text(c.render()),/Current Travel/);assert.doesNotMatch(text(c.render()),/Wrong Eight|Jimmy Person/);
});
test('failed authorization clears cached directory, offers Retry and does not fetch per member',async()=>{
 const c=setup();await c.reply(0);c.ui.blur();c.ui.focus();c.requests[1].reject({response:{status:403}});await tick();assert.doesNotMatch(text(c.render()),/Jimmy Person/);assert.match(text(c.render()),/Unable to load/);c.tap('Retry member directory');await c.reply(2);assert.equal(c.requests.length,3);
});
test('club change closes both identity modals before the new request finishes',async()=>{
 const c=setup();await c.reply(0);c.tap('Open profile of Jimmy Person');c.tap('View photo of Jimmy Person');c.props.groupId='eight';const tree=c.render();assert.equal(nodes(tree).find(n=>n.type==='Modal').props.visible,false);assert.equal(nodes(tree).find(n=>n.type==='ProfilePhotoViewer').props.visible,false);assert.doesNotMatch(text(tree),/Jimmy Person/);
});
test('shared directory integrated in all three surfaces and admin management handlers retained',()=>{
 const root=path.join(__dirname,'..');for(const file of ['app/(member)/club/[id].tsx','app/(treasurer)/members.tsx','app/(treasurer)/club-detail.tsx'])assert.match(fs.readFileSync(path.join(root,file),'utf8'),/<ClubMemberDirectory groupId=/);
 const source=fs.readFileSync(path.join(root,'app/(treasurer)/club-detail.tsx'),'utf8');for(const label of ['Members Management','handleDeleteMember','handleInviteAdmin'])assert.ok(source.includes(label),label);
});

test('existing Admin financial, invitation, removal and role-management functions are unchanged',()=>{
 const ts=require('typescript'), cp=require('node:child_process');
 function functions(source){const file=ts.createSourceFile('screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),result={};function visit(node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text.startsWith('handle')&&node.initializer)result[node.name.text]=node.initializer.getText(file);ts.forEachChild(node,visit);}visit(file);return result;}
 for(const file of ['frontend/app/(treasurer)/members.tsx','frontend/app/(treasurer)/club-detail.tsx']){
  const root=path.join(__dirname,'../..');const old=functions(cp.execFileSync('git',['show','d632d6b62f52911a5bb7218ef826ef385464bf97:'+file],{cwd:root,encoding:'utf8'}));const current=functions(fs.readFileSync(path.join(root,file),'utf8'));
  assert.ok(Object.keys(old).length);for(const [name,body]of Object.entries(old))assert.equal(current[name],body,name);
 }
});
test('profile backdrop dismisses and overlapping focus requests are not duplicated',async()=>{
 const c=setup();c.ui.focus();assert.equal(c.requests.length,1);await c.reply(0);c.tap('Open profile of Brown Person');c.tap('Close member profile backdrop');assert.equal(nodes(c.render()).find(n=>n.type==='Modal').props.visible,false);
});

test('privileged Admin metadata stays out of the simple member profile',async()=>{
 const c=setup();c.props.renderDetails=()=>({type:'Text',props:{children:'PRIVATE_REFERENCE R999'}});await c.reply(0);assert.match(text(c.render()),/PRIVATE_REFERENCE/);c.tap('Open profile of Jimmy Person');const modal=nodes(c.render()).find(n=>n.type==='Modal');assert.doesNotMatch(text(modal),/PRIVATE_REFERENCE|R999/);assert.match(text(modal),/Jimmy Person/);
});

test('older A request cannot clear the newer A request pending marker', async () => {
 const c=setup();c.props.groupId='eight';c.render();c.props.groupId='travel';c.render();
 await c.reply(0);c.ui.focus();assert.equal(c.requests.length,3);
 await c.reply(1,'eight');c.ui.focus();assert.equal(c.requests.length,3);
 await c.reply(2,'travel',[{id:'latest',name:'Latest Travel',profile_photo:null,role:'member'}]);
 assert.match(text(c.render()),/Latest Travel/);assert.doesNotMatch(text(c.render()),/Jimmy Person/);
});
