const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),ts=require('typescript');
const {load,engine,native,nodes,text,tick}=require('./ui-harness.cjs');
const Colors=load('constants/Colors.ts').Colors;
function presentation(){const ui=engine();return load('components/ClubDashboard.tsx',{react:ui.react,'react-native':native,'@expo/vector-icons':{Ionicons:'Ionicons'},'../constants/Colors':{Colors},'../services/clubGreeting':load('services/clubGreeting.ts'),'../services/paymentSummaryRecords':load('services/paymentSummaryRecords.ts')});}
const style=n=>Object.assign({},...[n.props.style].flat().filter(Boolean));
test('reference welcome header keeps centred regular white typography, real photograph geometry and bright yellow frame',()=>{
 const {ClubWelcomeHeader}=presentation();let opened=0,failed=0;const t=ClubWelcomeHeader({clubName:'WeTravel',displayName:'Brown',photoUri:'data:image/png;base64,existing',topInset:24,greeting:'Good evening, Brown!',onPhotoPress:()=>opened++,onPhotoError:()=>failed++});
 assert.equal(style(t).backgroundColor,'#06285B');const title=nodes(t).find(n=>n.props?.accessibilityRole==='header');assert.equal(style(title).fontWeight,'400');assert.equal(style(title).textAlign,'center');assert.equal(style(title).color,'#FFFFFF');
 const image=nodes(t).find(n=>n.type==='Image');assert.deepEqual([style(image).width,style(image).height,style(image).borderRadius],[112,112,56]);assert.equal(image.props.resizeMode,'cover');assert.equal(image.props.source.uri,'data:image/png;base64,existing');image.props.onError();assert.equal(failed,1);
 const frame=nodes(t).find(n=>style(n).width===116);assert.equal(style(frame).borderWidth,2);assert.equal(style(frame).borderColor,'#FFD700');nodes(t).find(n=>n.props?.accessibilityLabel==='View your profile photo').props.onPress();assert.equal(opened,1);assert.match(text(t),/Good evening, Brown!/);
});
test('four compact tiles retain usable touch targets and callbacks on 320 through 412px screens',()=>{
 const {ClubNavigationTiles}=presentation();let calls=0;const t=ClubNavigationTiles({items:['My Club','Contributions','Claims','History'].map(label=>({label,icon:'people',onPress:()=>calls++}))});
 const tiles=nodes(t).filter(n=>n.props?.accessibilityRole==='button');assert.equal(tiles.length,4);for(const n of tiles){assert.ok(style(n).minHeight>=48);assert.equal(style(n).minWidth,0);assert.equal(style(n).flex,1);n.props.onPress();}assert.equal(calls,4);
 for(const width of [320,360,393,412])assert.ok((width-32-24)/4>=60);
});
test('overview uses verified totals, honours genuine zero and never labels collections as a current bank balance',()=>{
 const {ClubOverviewCard}=presentation();const t=ClubOverviewCard({memberCount:0,collected:0,expected:null,period:'10/2026'});assert.match(text(t),/0Members/);assert.match(text(t),/R0.00Confirmed collected/);assert.match(text(t),/Not availableRecorded obligations/);assert.doesNotMatch(text(t),/Current Balance|Monthly Target|R4,800|R12,000/);
});
test('activity cards have honest loading, error and empty states and do not create sample activity',()=>{
 const {DashboardActivityCard}=presentation();const p={title:'Recent Activity',rows:[],onViewAll(){},emptyText:'No contribution activity recorded.'};assert.match(text(DashboardActivityCard(p)),/No contribution activity/);assert.doesNotMatch(text(DashboardActivityCard(p)),/Thandi|10:24|Payment uploaded/);let retries=0;const t=DashboardActivityCard({...p,error:true,onRetry:()=>retries++});nodes(t).find(n=>n.props?.accessibilityLabel==='Retry recent activity').props.onPress();assert.equal(retries,1);assert.ok(nodes(DashboardActivityCard({...p,loading:true})).some(n=>n.props?.accessibilityLabel==='Loading recent activity'));
});
const activity=load('services/dashboardActivity.ts');
test('personal activity retains exact IDs, multiple contributions and obligation periods while excluding other clubs',()=>{
 const records=activity.personalActivity({contributions:[{contribution_id:'a1',group_id:'a',month:10,year:2026,payment_state:'confirmed'},{contribution_id:'a2',group_id:'a',month:10,year:2026,payment_state:'awaiting_confirmation'},{contribution_id:'b1',group_id:'b',month:10,year:2026,payment_state:'confirmed'}]});let target;const rows=activity.activityRows(records,'a','WeTravel','jimmy',r=>target=r);assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.id),['a1','a2']);assert.match(rows[0].detail,/October 2026/);assert.equal(rows[0].date,undefined);rows[1].onPress();assert.equal(target.contribution_id,'a2');assert.equal(target.group_id,'a');
});
for(const records of [[{contribution_id:'a',group_id:'g',month:13,year:2026}],[{contribution_id:'a',group_id:'g',month:1,year:2026},{contribution_id:'a',group_id:'g',month:2,year:2026}]])test('malformed or ambiguous personal activity cannot silently choose a record '+JSON.stringify(records),()=>assert.throws(()=>activity.personalActivity({contributions:records})));
test('explicit other-account ownership is rejected',()=>assert.throws(()=>activity.activityRows([{contribution_id:'a',group_id:'g',month:10,year:2026,user_id:'brown'}],'g','WeTravel','jimmy',()=>{})));
function readSetup(){const ui=engine(),requests=[],auth={id:'jimmy',token:'one'},group={id:'a'},selector=data=>data.rows;const hook=load('hooks/useClubPreview.ts',{react:ui.react,'expo-router':{useFocusEffect:ui.useFocusEffect},axios:{get:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))}}).useClubPreview;const render=()=>ui.render(()=>hook(auth.id,auth.token,group.id,'/read/'+group.id,selector));render();return {ui,requests,auth,group,render};}
test('preview reads use bearer authentication, coalesce pending focus and hide old club/account results immediately',async()=>{
 const c=readSetup();assert.equal(c.requests[0].options.headers.Authorization,'Bearer one');c.ui.focus();assert.equal(c.requests.length,1);c.requests[0].resolve({data:{rows:['a']}});await tick();assert.deepEqual(c.render().rows,['a']);c.group.id='b';assert.deepEqual(c.render().rows,[]);c.requests[1].resolve({data:{rows:['b']}});await tick();assert.deepEqual(c.render().rows,['b']);c.auth.id='brown';c.auth.token='two';assert.deepEqual(c.render().rows,[]);
});
test('rapid A-B-A and delayed errors cannot clear a newer pending read or restore stale records',async()=>{
 const c=readSetup();c.group.id='b';c.render();c.group.id='a';c.render();assert.equal(c.requests.length,3);c.requests[0].reject(new Error('old'));c.requests[1].resolve({data:{rows:['wrong club']}});await tick();assert.deepEqual(c.render().rows,[]);c.ui.focus();assert.equal(c.requests.length,3);c.requests[2].resolve({data:{rows:['new a']}});await tick();assert.deepEqual(c.render().rows,['new a']);
});
test('old refresh callbacks after logout and late replies after blur cannot initiate or reveal data',async()=>{
 const c=readSetup(),old=c.render().reload;c.auth.token=null;c.render();old();assert.equal(c.requests.length,1);c.requests[0].resolve({data:{rows:['private']}});await tick();assert.deepEqual(c.render().rows,[]);const d=readSetup();d.ui.blur();d.requests[0].resolve({data:{rows:['obsolete']}});await tick();assert.deepEqual(d.render().rows,[]);
});
test('read errors retain a working retry without any write operation',async()=>{
 const c=readSetup();c.requests[0].reject(new Error('offline'));await tick();assert.equal(c.render().error,true);c.render().reload();assert.equal(c.requests.length,2);c.requests[1].resolve({data:{rows:[]}});await tick();assert.equal(c.render().error,false);assert.equal(c.render().loading,false);
});
test('dashboard implementation preserves existing financial write and account management handlers exactly',()=>{
 const root=path.join(__dirname,'../..');for(const [file,names] of [['frontend/app/(treasurer)/dashboard.tsx',['fetchDashboard','fetchSelectedFinancials','handleRemindMember','handleLogout','handleDeleteAccount','handleCreateClub']],['frontend/app/(member)/club/[id].tsx',['handleDeleteProof']]]){
  const before=cp.execFileSync('git',['show','e010ac56d98dadf1d6c3db63a069266d67060dca:'+file],{cwd:root,encoding:'utf8'});const after=fs.readFileSync(path.join(root,file),'utf8');
  function handlers(s){const ast=ts.createSourceFile(file,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),out={};function visit(n){if(ts.isVariableDeclaration(n)&&names.includes(n.name.getText(ast)))out[n.name.getText(ast)]=n.initializer.getText(ast).replace(/\r\n/g,'\n');ts.forEachChild(n,visit);}visit(ast);assert.equal(Object.keys(out).length,names.length);return out;}
  assert.deepEqual(handlers(after),handlers(before));
 }
});


test('pending confirmations use the existing authenticated review period and retain only eligible proofs',()=>{
 const ui=engine();let selectedUrl,reviewed=0;const fixture={contributions:[
  {id:'pending',member_name:'Fixture member',proof_uploaded:true,contribution_status:'proof_uploaded',proof_review_status:'pending'},
  {id:'confirmed',member_name:'Confirmed fixture',proof_uploaded:true,contribution_status:'confirmed',proof_review_status:'approved'},
  {id:'declined',member_name:'Declined fixture',proof_uploaded:true,contribution_status:'proof_uploaded',proof_review_status:'declined'},
  {id:null,member_name:'No obligation',proof_uploaded:false}
 ]};
 const Component=load('components/PendingConfirmations.tsx',{react:ui.react,'react-native':native,'../contexts/AuthContext':{useAuth:()=>({user:{id:'reviewer'},token:'session'})},'../hooks/useClubPreview':{useClubPreview:(id,token,club,url,select)=>{assert.deepEqual([id,token,club],['reviewer','session','a']);selectedUrl=url;return {rows:select(fixture),loading:false,error:false,reload(){}};}},'./ClubDashboard':presentation()}).default;
 const tree=ui.render(()=>Component({groupId:'a',month:10,year:2026,onReview:()=>reviewed++}));assert.match(selectedUrl,/contributions\/a\/month\/10\/year\/2026\?treasurer_id=reviewer/);assert.match(text(tree),/Fixture member/);assert.doesNotMatch(text(tree),/Confirmed fixture|Declined fixture|No obligation/);nodes(tree).find(n=>n.props?.accessibilityLabel?.startsWith('Fixture member,')).props.onPress();assert.equal(reviewed,1);
});
