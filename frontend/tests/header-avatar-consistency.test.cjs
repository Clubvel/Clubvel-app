const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const {engine,nodes,text,colors,load,native}=require('./ui-harness.cjs');
const screens=['(member)/home','(member)/proofs','(member)/claims','(member)/alerts','(treasurer)/dashboard','(treasurer)/contributions','(treasurer)/claims','(treasurer)/members','(treasurer)/reports'];
const style=n=>Object.assign({},...([n.props.style].flat().filter(Boolean)));
// Render the actual header JSX and StyleSheet in isolation, without requests or business handlers.
function header(screen,photo,name="Alexandra Very Long Name"){
 const source=fs.readFileSync(path.join(__dirname,'../app',screen+'.tsx'),'utf8');
 const ast=ts.createSourceFile('screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let jsx,styles;
 function walk(n){
  if(ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(a=>a.getText(ast)==='style={styles.header}')&&n.getText(ast).includes('user?.profile_photo'))jsx=n.getText(ast);
  if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='styles')styles=n.initializer.getText(ast);
  ts.forEachChild(n,walk);
 }
 walk(ast);assert.ok(jsx,screen+' current-user header');
 const ui=engine(),routes=[],menus=[],expanded=[];
 const user={profile_photo:photo,full_name:name},router={push:r=>routes.push(r)};
 const code=ts.transpileModule(`const styles=${styles}; return (${jsx});`,{compilerOptions:{jsx:ts.JsxEmit.React}}).outputText;
 const tree=new Function('React','View','Text','Image','TouchableOpacity','Ionicons','StyleSheet','Colors','user','router','setShowProfileMenu','selectedClub','setPhotoExpanded',code)(ui.react,'View','Text','Image','TouchableOpacity','Ionicons',native.StyleSheet,colors,user,router,v=>menus.push(v),{name:'Test club'},v=>expanded.push(v));
 return {tree,routes,menus,expanded};
}
for(const screen of screens){
 test(screen+': enlarged current-user photo/fallback, wrapping header and unchanged profile action',()=>{
  for(const photo of ['data:image/jpeg;base64,current',null]){
   const size=112;
   const c=header(screen,photo),avatar=nodes(c.tree).find(n=>n.type===(photo?'Image':'View')&&style(n).width===size);
   assert.ok(avatar);assert.deepEqual([style(avatar).width,style(avatar).height,style(avatar).borderRadius],[size,size,size/2]);
   if(photo){assert.equal(avatar.props.source.uri,photo);assert.equal(avatar.props.resizeMode,'cover');assert.equal(style(avatar).borderWidth,2);assert.ok(['gold','accent'].includes(style(avatar).borderColor));}
   else {assert.ok(['gold','accent'].includes(style(avatar).backgroundColor));if(screen.endsWith('/reports'))assert.equal(text(avatar),'A');
    else assert.equal(nodes(avatar).find(n=>n.type==='Ionicons').props.size,32);}
   const button=nodes(c.tree).find(n=>n.type==='TouchableOpacity'&&nodes(n).includes(avatar));
   assert.equal(style(button).flexShrink,0);button.props.onPress();
   if(photo)assert.deepEqual(c.expanded,[true]);
   else if(screen.endsWith('/home')||screen.endsWith('/dashboard'))assert.deepEqual(c.menus,[true]);
   else assert.deepEqual(c.routes,[screen.startsWith('(member)')?'/(member)/profile':'/(treasurer)/profile']);
   assert.equal(style(c.tree).gap,screen.endsWith('/home')||screen.endsWith('/dashboard')?12:16);assert.equal(style(c.tree).alignItems,'center');
   const title=nodes(c.tree).find(n=>n.type==='Text');
   assert.equal(title.props.numberOfLines,undefined);assert.notEqual(title.props.allowFontScaling,false);
   const titleColumn=nodes(c.tree).find(n=>n.type==='View'&&n!==c.tree&&style(n).flex===1);
   assert.ok(style(title).flex===1||style(title).flexShrink===1||titleColumn);
   // 320px screen retains a title column, with no fixed header height to clip enlarged fonts.
   assert.ok(320-2*style(c.tree).paddingHorizontal-(size+8)-style(c.tree).gap>=100);
   assert.equal(style(c.tree).height,undefined);
  }
 });
}
test('shared AppHeader retains callbacks, back routing and optional profile visibility',()=>{
 const ui=engine(),routes=[];let presses=0;const auth={user:{profile_photo:"current"}};
 const Header=load('components/AppHeader.tsx',{react:ui.react,'./ProfilePhotoViewer':{default:'ProfilePhotoViewer'},'react-native':native,'@expo/vector-icons':{Ionicons:'Ionicons'},'../constants/Colors':{Colors:colors},'expo-router':{useRouter:()=>({push:r=>routes.push(r)})},'../contexts/AuthContext':{useAuth:()=>auth}}).AppHeader;
 const tree=Header({title:'Long title that can wrap',subtitle:'Subtitle',showBackButton:true,backRoute:'/previous',onProfilePress:()=>presses++});
 const image=nodes(tree).find(n=>n.type==='Image');assert.deepEqual([style(image).width,style(image).height],[112,112]);assert.equal(image.props.resizeMode,'cover');
 const actions=nodes(tree).filter(n=>n.type==='TouchableOpacity');actions[0].props.onPress();actions[1].props.onPress();assert.deepEqual(routes,['/previous']);assert.equal(presses,0);
 auth.user.profile_photo=null;const fallback=Header({title:'Fallback',onProfilePress:()=>presses++});
 nodes(fallback).find(n=>n.type==='TouchableOpacity').props.onPress();assert.equal(presses,1);
 assert.equal(nodes(Header({title:'No photo',showProfile:false})).some(n=>n.type==='Image'),false);
});
test('club details contain no current-user header avatar; contextual member sizes remain unchanged',()=>{
 for(const file of ['(treasurer)/club-detail.tsx','(member)/club/[id].tsx']){
  const source=fs.readFileSync(path.join(__dirname,'../app',file),'utf8');assert.equal(source.includes('user?.profile_photo'),false);
 }
 const members=fs.readFileSync(path.join(__dirname,'../app/(treasurer)/members.tsx'),'utf8');
 assert.match(members,/memberAvatar: \{\s*width: 48,\s*height: 48,/);
 const club=fs.readFileSync(path.join(__dirname,'../app/(treasurer)/club-detail.tsx'),'utf8');
 assert.match(club,/memberAvatar: \{\s*width: 44,\s*height: 44,/);
});

test('Reports retains Back and title beside the new identity on a narrow screen',()=>{
 const c=header('(treasurer)/reports',null);
 const back=nodes(c.tree).find(n=>n.type==='TouchableOpacity'&&nodes(n).some(x=>x.type==='Ionicons'&&x.props.name==='arrow-back'));
 back.props.onPress();assert.deepEqual(c.routes,['/(treasurer)/profile']);
 assert.ok(nodes(c.tree).some(n=>n.type==='Text'&&text(n)==='Reports'));
 assert.equal(style(c.tree).paddingTop,60);assert.equal(style(c.tree).paddingBottom,20);
 const titleColumn=nodes(c.tree).find(n=>n.type==='View'&&style(n).flex===1);
 assert.equal(style(titleColumn).minWidth,0);
 const titleWidth=320-2*style(c.tree).paddingHorizontal-(24+2*style(back).padding)-112-2*style(c.tree).gap;
 assert.ok(titleWidth>=70);
});
test('dedicated Member and Treasurer Profile identity uses 112px',()=>{
 for(const role of ['member','treasurer']){
  const source=fs.readFileSync(path.join(__dirname,`../app/(${role})/profile.tsx`),'utf8');
  for(const name of ['avatar','avatarImage'])assert.match(source,new RegExp(`${name}: \\{\\s*width: 112,\\s*height: 112,\\s*borderRadius: 56,`));
 }
});

test('Reports initials use the authenticated full name and remain safe without a name',()=>{
 for(const [name,initial] of [[' Barbara Member','B'],['','?'],['  ','?'],[null,'?']]){
  const c=header('(treasurer)/reports',null,name);
  const circle=nodes(c.tree).find(n=>n.type==='View'&&style(n).width===112);
  assert.equal(text(circle),initial);assert.equal(style(circle).borderColor,'gold');
 }
});
