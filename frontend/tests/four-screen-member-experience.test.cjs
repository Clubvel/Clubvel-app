const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),ts=require('typescript');
const {load,engine,native,nodes,text,tick}=require('./ui-harness.cjs');
const Colors=load('constants/Colors.ts').Colors;
function myClub(){
 const ui=engine(),requests=[],routes=[],auth={user:{id:'brown'},token:'session-a',loading:false},params={id:'travel',from:'member',month:'10',year:'2026'};
 const axios={get:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))};
 const hook=load('hooks/useClubPreview.ts',{react:ui.react,'expo-router':{useFocusEffect:ui.useFocusEffect},axios});
 const Screen=load('app/club/[id]/info.tsx',{react:ui.react,'react-native':native,'@expo/vector-icons':{Ionicons:'Ionicons'},'expo-router':{Redirect:'Redirect',useLocalSearchParams:()=>params,useRouter:()=>({push:r=>routes.push(r),replace:r=>routes.push(r)})},'../../../contexts/AuthContext':{useAuth:()=>auth},'../../../hooks/useClubPreview':hook,'../../../constants/Colors':{Colors},'../../../services/paymentSummaryRecords':load('services/paymentSummaryRecords.ts')}).default;
 const render=()=>ui.render(Screen),tap=label=>nodes(render()).find(n=>n.props?.accessibilityLabel===label).props.onPress();
 const context=(id='travel',role='member')=>({club:{id,name:id==='travel'?'WeTravel':'Eighty8'},membership:{id:'membership-'+id,role,status:'active'},period:{month:10,year:2026},own_financial_summary:{collected:0,outstanding:null},availability:{collected:'AVAILABLE',outstanding:'UNAVAILABLE'}});
 const details=(id='travel')=>({group:{id,type:'travel',contribution_mode:'flexible_goal',monthly_contribution:0,payment_due_date:25,bank_name:'PRIVATE BANK',bank_account_number:'PRIVATE ACCOUNT'},private_member_phone:'PRIVATE PHONE'});
 const reply=async(start=0,id=params.id,role='member')=>{requests[start].resolve({data:context(id,role)});requests[start+1].resolve({data:details(id)});await tick();return render();};
 render();return {ui,requests,routes,auth,params,render,tap,reply,context,details};
}
test('My Club uses parallel authenticated personal/context reads and exposes no banking or other-account information',async()=>{
 const c=myClub();assert.equal(c.requests.length,2);for(const r of c.requests)assert.equal(r.options.headers.Authorization,'Bearer session-a');assert.match(c.requests[0].url,/groups\/travel\/context\?month=10&year=2026$/);assert.match(c.requests[1].url,/member\/club\/travel\/user\/brown/);
 await c.reply();assert.match(text(c.render()),/WeTravel/);assert.match(text(c.render()),/R0.00/);assert.match(text(c.render()),/Not available/);assert.doesNotMatch(text(c.render()),/PRIVATE|Current Balance|Monthly Target|R4,800|32 members|Leave Club|Club administration/);
 c.tap('Contribution Schedule');assert.match(text(c.render()),/Flexible contributions; no fixed monthly amount/);assert.doesNotMatch(text(c.render()),/R0.00 per month|Payment day/);
 c.tap('Members');assert.equal(c.routes.at(-1).pathname,'/club/[id]/members');assert.equal(c.routes.at(-1).params.id,'travel');
 c.tap('Club History');assert.equal(c.routes.at(-1).params.section,'history');assert.equal(c.routes.at(-1).params.month,'10');assert.equal(c.routes.at(-1).params.year,'2026');
 c.tap('Back to Club Home');assert.deepEqual(c.routes.at(-1),{pathname:'/club/[id]',params:{id:'travel',from:'member',month:'10',year:'2026'}});
});
test('My Club administration links use only the selected active club role',async()=>{
 for(const role of ['admin','treasurer']){const c=myClub();await c.reply(0,'travel',role);c.tap('Club administration');assert.equal(c.routes.at(-1).pathname,'/(treasurer)/dashboard');assert.equal(c.routes.at(-1).params.groupId,'travel');c.params.id='eight';c.render();assert.doesNotMatch(text(c.render()),/WeTravel|Club administration/);await c.reply(2,'eight','member');assert.doesNotMatch(text(c.render()),/Club administration/);}
});
test('My Club masks account/club changes and rejects stale A-B-A reads, errors and old controls',async()=>{
 const c=myClub();await c.reply();const stale=nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Club History');c.params.id='eight';c.render();assert.doesNotMatch(text(c.render()),/WeTravel|R0.00/);c.params.id='travel';c.render();c.requests[2].resolve({data:c.context('eight')});c.requests[3].resolve({data:c.details('eight')});await tick();assert.doesNotMatch(text(c.render()),/Eighty8/);await c.reply(4);stale.props.onPress();assert.deepEqual(c.routes,[]);
 c.auth.user={id:'jimmy'};c.auth.token='session-b';assert.doesNotMatch(text(c.render()),/WeTravel|R0.00/);c.requests[6].reject({response:{status:403}});c.requests[7].resolve({data:c.details()});await tick();assert.doesNotMatch(text(c.render()),/WeTravel|Members|Club administration/);assert.match(text(c.render()),/active membership/);
});
test('My Club inactive, malformed and wrong-club contexts never render club identities',async()=>{
 for(const data of [{club:{id:'travel',name:'PRIVATE'},membership:{id:'m',role:'admin',status:'inactive'}},{club:{id:'other',name:'PRIVATE'}},{...myClub().context(),period:{month:13,year:2026}}]){const c=myClub();c.requests[0].resolve({data});c.requests[1].resolve({data:c.details()});await tick();assert.doesNotMatch(text(c.render()),/PRIVATE|WeTravel|Club administration/);}
});
test('Sign In preserves phone/password authentication and routes success to My Clubs without adding providers',async()=>{
 const ui=engine(),authCalls=[],routes=[];
 const Screen=load('app/auth.tsx',{react:ui.react,'react-native':{...native,TextInput:'TextInput',KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:'android'}},'expo-router':{useRouter:()=>({replace:r=>routes.push(r)})},'../contexts/AuthContext':{useAuth:()=>({login:async(...a)=>authCalls.push(a)})},'../constants/Colors':{Colors},'@expo/vector-icons':{Ionicons:'Ionicons'},'../services/authentication':{AuthenticationError:class extends Error{},normalizePhone:p=>p,authentication:{},otpMessage:()=>''}}).default;
 const render=()=>ui.render(Screen);let tree=render();assert.match(text(tree),/Save, Plan, Grow Together/);assert.match(text(tree),/Sign in to continue/);assert.doesNotMatch(text(tree),/Welcome back/);assert.doesNotMatch(text(tree),/Google|Email address|Remember me/);assert.ok(nodes(tree).find(n=>n.props?.accessibilityLabel==='Clubvel community logo'));nodes(tree).find(n=>n.props?.accessibilityLabel==='Phone number').props.onChangeText('0821234567');nodes(render()).find(n=>n.props?.accessibilityLabel==='Password').props.onChangeText('offline-fixture-password');const signIn=nodes(render()).find(n=>n.type==='TouchableOpacity'&&text(n)==='Sign In');await signIn.props.onPress();assert.deepEqual(authCalls,[['0821234567','offline-fixture-password']]);assert.deepEqual(routes,['/(member)/home']);
});
test('authentication, financial and membership write handlers remain identical to the approved checkpoint',()=>{
 const root=path.join(__dirname,'../..');
 for(const [file,names] of [['frontend/app/auth.tsx',['handleLogin','handleRegister','handleVerifyOTP','handleSendResetOTP','handleVerifyResetOTP','handleResetPassword']],['frontend/app/(member)/home.tsx',['fetchDashboard','handleLogout','handleDeleteAccount','createGroup','acceptInvitation','declineInvitation','openClub','openAdministration']]]){
  const before=cp.execFileSync('git',['show','8fcbc3e1eaee01ad394525697cdeba831ae8d441:'+file],{cwd:root,encoding:'utf8'}),after=fs.readFileSync(path.join(root,file),'utf8');
  function handlers(source){const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),out={};function visit(n){if(ts.isVariableDeclaration(n)&&names.includes(n.name.getText(ast)))out[n.name.getText(ast)]=n.initializer.getText(ast).replace(/\r\n/g,'\n');ts.forEachChild(n,visit);}visit(ast);assert.equal(Object.keys(out).length,names.length);return out;}assert.deepEqual(handlers(after),handlers(before));
 }
 for(const file of ['backend/server.py','frontend/app/(treasurer)/dashboard.tsx','frontend/app/(member)/proofs.tsx','frontend/app/(member)/club/[id].tsx','frontend/services/paymentSummaryRecords.ts'])assert.equal(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n').replace(/headerTitle:\s*\{[^}]*\}/g,m=>m.replace(/fontWeight:\s*'(?:bold|400)'/,"fontWeight: 'approved-header-weight'")),cp.execFileSync('git',['show','8fcbc3e1eaee01ad394525697cdeba831ae8d441:'+file],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n').replace(/headerTitle:\s*\{[^}]*\}/g,m=>m.replace(/fontWeight:\s*'(?:bold|400)'/,"fontWeight: 'approved-header-weight'")),file);
});


test('My Club opened without a device-selected period returns using the authoritative server period',async()=>{
 const c=myClub();delete c.params.month;delete c.params.year;c.render();await c.reply(2);c.tap('Back to Club Home');assert.deepEqual(c.routes.at(-1),{pathname:'/club/[id]',params:{id:'travel',from:'member',month:'10',year:'2026'}});
});


test('My Club retains an explicit contribution ID through History and Back and invalidates old selected-record callbacks',async()=>{
 const c=myClub();await c.reply();c.params.contribution_id='exact-record';c.render();c.tap('Club History');assert.equal(c.routes.at(-1).params.contribution_id,'exact-record');const old=nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Club History');c.params.contribution_id='other-explicit-record';c.render();old.props.onPress();assert.equal(c.routes.length,1);c.tap('Club History');assert.equal(c.routes.at(-1).params.contribution_id,'other-explicit-record');c.tap('Back to Club Home');assert.equal(c.routes.at(-1).params.contribution_id,'other-explicit-record');
});
