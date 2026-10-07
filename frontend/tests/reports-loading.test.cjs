const test=require('node:test');
const assert=require('node:assert/strict');
const {load,engine,tick,nodes,text,button,native,colors}=require('./ui-harness.cjs');
function setup(pdf){
 const ui=engine(),requests=[],alerts=[];
 const auth={user:{id:'admin',full_name:'Admin'},token:'signed'};
 const Screen=load('app/(treasurer)/reports.tsx',{
  react:ui.react,'react-native':{...native,RefreshControl:'RefreshControl',Alert:{alert:(...a)=>alerts.push(a)}},
  'expo-router':{useFocusEffect:ui.useFocusEffect,useLocalSearchParams:()=>({}),useRouter:()=>({push(){}})},
  '../../contexts/AuthContext':{useAuth:()=>auth},'../../constants/Colors':{Colors:colors},
  '@expo/vector-icons':{Ionicons:'Icon'},'../../components/AdBanner':{AdBanner:'AdBanner'},
  '../../components/MonthlyReport':{default:'MonthlyReport'},
  '../../services/pdfReportService':{generatePDFReport:pdf || (async()=>({success:true,uri:'cache.pdf'})),sharePDFReport:async()=>{},printPDFReport:async()=>({success:true})},
  axios:{isAxiosError:e=>!!e.isAxiosError,get:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))},
 }).default;
 const render=()=>ui.render(Screen);const initial=render();
 return {ui,requests,auth,render,initial,alerts};
}
test('Reports waits for authenticated dashboard, ends loading and shows existing controls',async()=>{
 const c=setup();assert.ok(nodes(c.initial).some(n=>n.type==='ActivityIndicator'));
 assert.equal(c.requests[0].options.timeout,20000);assert.equal(c.requests[0].options.headers.Authorization,'Bearer signed');
 c.requests[0].resolve({data:{clubs:[{id:'club',collected:20,expected:40}]}});await tick();
 assert.match(text(c.render()),/Other available exports/);assert.doesNotMatch(text(c.render()),/Current-month contribution export|No managed/);
 button(c.render(),'Other available exports').props.onPress();
 assert.match(text(c.render()),/Current-month contribution export/);assert.match(text(c.render()),/do not use the club or month selected above/);
 assert.doesNotMatch(text(c.render()),/Member Statement|legacy/i);
});
test('Reports empty state is only shown after a successful empty response',async()=>{
 const c=setup();c.requests[0].resolve({data:{clubs:[]}});await tick();
 assert.match(text(c.render()),/No managed clubs or report data yet/);assert.doesNotMatch(text(c.render()),/Current-month contribution export/);
});
test('Reports failure releases spinner, shows Retry and recovers',async()=>{
 const c=setup();c.requests[0].reject({isAxiosError:true,code:'ECONNABORTED'});await tick();
 assert.match(text(c.render()),/Unable to load reports/);assert.ok(button(c.render(),'Retry'));
 assert.equal(nodes(c.render()).some(n=>n.type==='ActivityIndicator'),false);
 button(c.render(),'Retry').props.onPress();c.requests[1].resolve({data:{clubs:[]}});await tick();
 assert.match(text(c.render()),/No managed clubs/);
});
test('Reports token restoration refetches, and account change rejects an older response',async()=>{
 const c=setup();c.auth.token=null;c.render();await tick();assert.match(text(c.render()),/sign in again/);
 c.auth.token='new';c.render();assert.equal(c.requests.length,2);
 c.requests[1].resolve({data:{clubs:[]}});await tick();c.requests[0].resolve({data:{clubs:[{id:'private'}]}});await tick();
 assert.match(text(c.render()),/No managed clubs/);
});
test('Report generation sends correct period/auth and bounded requests, with Retry on failure',async()=>{
 const c=setup();c.requests[0].resolve({data:{clubs:[{id:'club'}]}});await tick();
 button(c.render(),'Other available exports').props.onPress();
 const download=nodes(c.render()).find(n=>n.type==='TouchableOpacity'&&nodes(n).some(i=>i.props?.name==='download'));
 const work=download.props.onPress();assert.equal(c.requests[1].url.endsWith('/api/treasurer/reports/club'),true);
 assert.equal(c.requests[1].options.headers.Authorization,'Bearer signed');assert.equal(c.requests[1].options.timeout,20000);
 assert.equal(c.requests[1].options.params.month,new Date().getMonth()+1);
 c.requests[1].reject(new Error('Offline'));await work;
 assert.equal(c.alerts.at(-1)[0],'Unable to generate report');assert.ok(c.alerts.at(-1)[2].some(a=>a.text==='Retry'));
});


test('Android PDF generation timeout releases controls and offers Retry',async()=>{
 const original=global.setTimeout,originalClear=global.clearTimeout;let expire;
 try {
  global.setTimeout=(fn,ms)=>{assert.equal(ms,45000);expire=fn;return 1;};global.clearTimeout=()=>{};
  const c=setup(()=>new Promise(()=>{}));c.requests[0].resolve({data:{clubs:[{id:'club'}]}});await tick();
  button(c.render(),'Other available exports').props.onPress();
 const download=nodes(c.render()).find(n=>n.type==='TouchableOpacity'&&nodes(n).some(i=>i.props?.name==='download'));
  const work=download.props.onPress();c.requests[1].resolve({data:{rows:[],summary:{},group_id:'club',group_name:'Club'}});await tick();
  expire();await work;
  assert.match(c.alerts.at(-1)[1],/PDF generation timed out/);
  assert.ok(c.alerts.at(-1)[2].some(a=>a.text==='Retry'));
  assert.equal(nodes(c.render()).find(n=>n.type==='TouchableOpacity'&&nodes(n).some(i=>i.props?.name==='download')).props.disabled,false);
 } finally {global.setTimeout=original;global.clearTimeout=originalClear;}
});
