const test = require('node:test');
const assert = require('node:assert/strict');
const { load, engine, tick, nodes, text, button, native, colors } = require('./ui-harness.cjs');

async function setup(screen = 'proofs', review = 'declined', approved = false, deferred = false) {
  const ui = engine(), requests = [], alerts = [], routes = [];
  const record = { contribution_id: 'contribution-a', group_id: 'group-a', group_name: 'Club A',
    month: 10, year: 2026, amount_due: 175, amount_paid: 25,
    status: approved ? 'confirmed' : 'proof_uploaded', proof_uploaded: true,
    proof_review_status: review, proof_decline_reason: review === 'declined' ? 'Wrong reference' : null,
    proof_eligible: !approved && review === 'declined',
    proof_version: 'proof-v1', proof_delete_eligible: review === 'pending' && !approved,
    payment_date: '2026-10-05T10:00:00' };
  const statusPill = load('components/StatusPill.tsx', {
    react: ui.react, 'react-native': native, '../constants/Colors': { Colors: colors }
  }).StatusPill;
  const state = { get: null, records: null };
  if (deferred) state.get = () => new Promise(resolve => { state.resolve = resolve; });
  const params = { id: 'group-a', group_id: 'group-a', month: '10', year: '2026', scope: 'club', from: 'admin' };
  const authState = { user: { id: 'member-user' }, token: 'member-session' };
  const auth = { useAuth: () => authState };
  const axios = {
    get: async (url, options) => {
      requests.push({ url, options });
      if (state.get) return state.get(url);
      if (state.lookup && url.includes('/api/member/contributions/')) return state.lookup();
      if (url.includes('/api/member/contributions/')) return { data: { contributions: JSON.parse(JSON.stringify(state.records || [record])) } };
      if (url.includes('/api/member/club/')) return { data: state.club || {
        group: { id: 'group-a', name: 'Club A' }, current_contribution: { ...record, id: record.contribution_id },
        payment_reference: { amount: 150, reference_code: 'REF' }, payment_history: []
      } };
      if (url.includes('/api/member/dashboard/')) return { data: { clubs: state.dashboardClubs || [{ id: 'group-a', name: 'Club A', monthly_contribution: 175 }] } };
      return { data: { proof_image: 'data:image/jpeg;base64,image' } };
    },
    post: async (url, data, options) => {
      if (state.post) return state.post(url,data,options);
      if (url.endsWith('/contributions/flexible')) { requests.push({url,data,options}); return { data: { contribution_id: 'created', group_id: 'group-a' } }; }
      requests.push({ url, data, options });
      if (url.endsWith('/proof/dismiss')) { record.proof_dismissed = true; return; }
      record.proof_dismissed = false;
      record.proof_review_status = 'pending'; record.proof_decline_reason = null;
      record.status = 'proof_uploaded'; record.proof_version = 'proof-v2'; record.proof_delete_eligible = true;
    },
    delete: async (url, options) => {
      requests.push({ url, options });
      if (state.delete) return state.delete(url,options);
      record.proof_uploaded = false; record.status = 'pending'; record.proof_review_status = null;
      record.proof_version = null; record.proof_delete_eligible = false;
    }
  };
  const dependencies = {
    react: ui.react,
    'react-native': { ...native, RefreshControl: 'RefreshControl', TextInput: 'TextInput',
      KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' },
      BackHandler: { addEventListener: (_,handler) => {state.back=handler;return {remove:()=>{if(state.back===handler)state.back=null;}};} },
      Alert: { alert: (...args) => alerts.push(args) } },
    'expo-router': { useFocusEffect: ui.useFocusEffect, useLocalSearchParams: () => params,
      useRouter: () => ({ replace: route => routes.push(route), back: () => routes.push('back'), push: route => routes.push(route) }) },
    '../../services/paymentSummaryRecords': load('services/paymentSummaryRecords.ts'),
    '../../../services/paymentSummaryRecords': load('services/paymentSummaryRecords.ts'),
    '../../constants/Colors': { Colors: colors }, '../../../constants/Colors': { Colors: colors },
    '../../components/ClubMemberDirectory': { __esModule: true, default: 'ClubMemberDirectory' },
    '../../components/ProfilePhotoViewer': { default: 'ProfilePhotoViewer' },
    '../../contexts/AuthContext': auth, '../../../contexts/AuthContext': auth,
    '../../../components/ClubMemberDirectory': { __esModule: true, default: 'ClubMemberDirectory' },
    '../../components/StatusPill': { StatusPill: statusPill }, '../../../components/StatusPill': { StatusPill: statusPill },
    '../../components/AdBanner': { AdBanner: 'AdBanner' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-document-picker': { getDocumentAsync: async () => state.picker ? state.picker() : ({ canceled: false,
      assets: [{ uri: 'cache/image.jpg', name: 'image.jpg', mimeType: 'image/jpeg', size: 100 }] }) },
    'expo-file-system/legacy': { EncodingType: { Base64: 'base64' }, readAsStringAsync: async () => state.read ? state.read() : 'image', documentDirectory: 'test-cache/', writeAsStringAsync: async (...args) => state.write ? state.write(...args) : undefined },
    'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async () => { state.shared = true; } }, axios
  };
  const Screen = load(screen === 'proofs' ? 'app/(member)/proofs.tsx' : 'app/(member)/club/[id].tsx', dependencies).default;
  const render = () => ui.render(Screen);
  const initial = render(); await tick();
  if(screen==='proofs')for(const details of nodes(render()).filter(n=>n.props?.accessibilityLabel?.startsWith('View contribution details ')&&!n.props.accessibilityState.expanded))details.props.onPress();
  return { render, requests, alerts, routes, record, ui, statusPill, initial, state, params, authState };
}


test('club-scoped Payments excludes other clubs and preserves origin and period on Back',async()=>{
 const c=await setup();c.state.records=[c.record,{...c.record,contribution_id:'other',group_id:'other-club',group_name:'SECRET OTHER'}];c.ui.blur();c.ui.focus();await tick();
 assert.doesNotMatch(text(c.render()),/SECRET OTHER|All clubs/);nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Back to Club Home').props.onPress();
 assert.equal(c.routes.at(-1).params.id,'group-a');assert.equal(c.routes.at(-1).params.from,'admin');assert.equal(c.routes.at(-1).params.month,'10');
});
test('missing explicit contribution never substitutes another upload target',async()=>{
 const c=await setup();c.params.contribution_id='missing';c.render();await tick();await button(c.render(),'Upload Proof of Payment').props.onPress();assert.ok(c.alerts.some(a=>a[0]==='Contribution unavailable'));assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,0);
});
test('invalid period displays unavailable state and never offers another period record',async()=>{
 const c=await setup();c.params.month='13';c.render();await tick();assert.match(text(c.render()),/Invalid contribution period/);assert.equal(nodes(c.render()).filter(n=>n.props?.accessibilityLabel==='Upload proof for contribution contribution-a').length,0);
});
test('club-scoped Contributions skips directory and carries exact record to Payments',async()=>{
 const c=await setup('club');c.state.club={group:{id:'group-a',name:'Club A'},current_contribution:c.record,contributions:[c.record],payment_reference:{amount:150},payment_history:[]};c.ui.blur();c.ui.focus();await tick();assert.equal(nodes(c.render()).filter(n=>n.type==='ClubMemberDirectory').length,0);
 nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Open club payments').props.onPress();assert.equal(c.routes.at(-1).params.contribution_id,'contribution-a');assert.equal(c.routes.at(-1).params.scope,'club');
});
async function flexibleFixture(records,lookupFailure=false){
 const c=await setup();c.state.club={group:{id:'group-a',name:'Club A',type:'travel',contribution_mode:'flexible_goal'},payment_reference:{},payment_history:[]};
 await nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Record current-period contribution').props.onPress();
 nodes(c.render()).find(n=>n.type==='TextInput').props.onChangeText('123');
 if(lookupFailure)c.state.lookup=()=>Promise.reject(new Error('offline'));else c.state.records=records;
 return c;
}
const created={contribution_id:'created',group_id:'group-a',group_name:'Club A',month:12,year:2025,amount_due:123,amount_paid:0,proof_eligible:true,historical_only:false};
test('flexible creation uses exact authenticated server record and its period rather than device clock',async()=>{
 const c=await flexibleFixture([created]);await button(c.render(),'Continue to Upload Proof').props.onPress();await tick();
 assert.equal(c.requests.find(r=>r.url.endsWith('/upload-proof')).data.contribution_id,'created');assert.match(text(c.render()),/December 2025/);assert.equal(c.requests.filter(r=>r.url.endsWith('/contributions/flexible')).length,1);
});
test('failed flexible verification blocks upload and duplicate creation for missing ambiguous invalid and wrong-club records',async()=>{
 for(const records of [[],[created,created],[{...created,month:13}],[{...created,month:'12'}],[{...created,user_id:'other-account'}],[{...created,year:0}],[{...created,group_id:'wrong'}]]){
 const c=await flexibleFixture(records);await button(c.render(),'Continue to Upload Proof').props.onPress();await tick();assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,0);assert.ok(c.alerts.some(a=>a[0]==='Contribution recorded'));
 await nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Record current-period contribution').props.onPress();assert.equal(c.requests.filter(r=>r.url.endsWith('/contributions/flexible')).length,1);
 }
});
test('lookup failure after successful creation does not create again or upload',async()=>{
 const c=await flexibleFixture([],true);await button(c.render(),'Continue to Upload Proof').props.onPress();assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,0);assert.ok(c.alerts.some(a=>a[0]==='Contribution recorded'));
});
test('picker cancellation creates no contribution and sends no proof',async()=>{
 const c=await flexibleFixture([created]);c.state.picker=async()=>({canceled:true,assets:[]});await button(c.render(),'Continue to Upload Proof').props.onPress();assert.equal(c.requests.filter(r=>r.url.endsWith('/contributions/flexible')||r.url.endsWith('/upload-proof')).length,0);
});
test('account switch during flexible lookup cannot upload or select created record',async()=>{
 const c=await flexibleFixture([created]);let resolve;c.state.lookup=()=>resolve ? Promise.resolve({data:{contributions:[]}}) : new Promise(r=>resolve=r);const pending=button(c.render(),'Continue to Upload Proof').props.onPress();await tick();c.authState.user={id:'other'};c.authState.token='other-session';c.render();resolve({data:{contributions:[created]}});await pending;assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,0);
});

test('standalone account Payments retains All clubs selection',async()=>{
 const c=await setup();c.params.scope=undefined;c.params.group_id=undefined;c.render();await tick();assert.ok(nodes(c.render()).find(n=>n.props?.accessibilityLabel==='All contribution clubs'));
});
test('overlapping proof views in one period accept only the latest response',async()=>{
 const c=await setup();const deferred=[];c.state.get=()=>new Promise(resolve=>deferred.push(resolve));
 const first=button(c.render(),'View Proof').props.onPress();const second=button(c.render(),'View Proof').props.onPress();
 deferred[1]({data:{proof_image:'latest-image',proof_mime_type:'image/jpeg'}});await second;
 deferred[0]({data:{proof_image:'obsolete-image',proof_mime_type:'image/jpeg'}});await first;
 assert.ok(nodes(c.render()).some(n=>n.type==='Image'&&n.props.source?.uri==='latest-image'));assert.ok(!nodes(c.render()).some(n=>n.type==='Image'&&n.props.source?.uri==='obsolete-image'));
});
test('repeated flexible submission while picker is open cannot create twice',async()=>{
 const c=await flexibleFixture([created]);let resolve;c.state.picker=()=>new Promise(r=>resolve=r);
 const first=button(c.render(),'Continue to Upload Proof').props.onPress();await button(c.render(),'Continue to Upload Proof').props.onPress();resolve({canceled:true,assets:[]});await first;
 assert.equal(c.requests.filter(r=>r.url.endsWith('/contributions/flexible')).length,0);
});
test('wrong club in successful creation response blocks lookup and upload',async()=>{
 const c=await flexibleFixture([created]);c.state.post=async(url,data,options)=>{c.requests.push({url,data,options});return {data:{contribution_id:'created',group_id:'wrong'}};};
 await button(c.render(),'Continue to Upload Proof').props.onPress();assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,0);assert.ok(c.alerts.some(a=>a[0]==='Contribution recorded'));
});

test('older PDF file completion cannot close a newer image proof viewer or share stale proof',async()=>{
 const c=await setup();let finishWrite;const responses=[];c.state.get=()=>new Promise(r=>responses.push(r));c.state.write=()=>new Promise(r=>finishWrite=r);
 const old=button(c.render(),'View Proof').props.onPress();responses[0]({data:{proof_image:'data:application/pdf;base64,old',proof_mime_type:'application/pdf'}});await tick();
 const latest=button(c.render(),'View Proof').props.onPress();responses[1]({data:{proof_image:'latest-image',proof_mime_type:'image/jpeg'}});await latest;finishWrite();await old;
 assert.ok(nodes(c.render()).some(n=>n.type==='Modal'&&n.props.visible));assert.ok(nodes(c.render()).some(n=>n.type==='Image'&&n.props.source?.uri==='latest-image'));assert.equal(c.state.shared,undefined);
});

function recoveryPosts(c, failUpload = true) {
 c.state.post=async(url,data,options)=>{c.requests.push({url,data,options});if(url.endsWith('/contributions/flexible'))return {data:{contribution_id:'created',group_id:'group-a'}};if(failUpload)throw new Error('offline upload');};
}
test('verified creation survives upload failure and retries proof only with the exact server record',async()=>{
 const c=await flexibleFixture([created]);recoveryPosts(c);
 await button(c.render(),'Continue to Upload Proof').props.onPress();await tick();
 assert.match(text(c.render()),/December 2025/);assert.ok(c.alerts.some(a=>a[0]==='Proof upload failed'&&/already exists.*Retry proof upload only/.test(a[1])));
 recoveryPosts(c,false);await button(c.render(),'Upload Proof of Payment').props.onPress();await tick();
 assert.equal(c.requests.filter(r=>r.url.endsWith('/contributions/flexible')).length,1);
 const uploads=c.requests.filter(r=>r.url.endsWith('/upload-proof'));assert.equal(uploads.length,2);assert.ok(uploads.every(r=>r.data.contribution_id==='created'));
});
test('creation failure has distinct messaging and does not leave controls blocked',async()=>{
 const c=await flexibleFixture([created]);c.state.post=async()=>{const error=new Error('creation failed');error.response={status:400};throw error;};await button(c.render(),'Continue to Upload Proof').props.onPress();
 assert.ok(c.alerts.some(a=>a[0]==='Contribution creation failed'));await nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Record current-period contribution').props.onPress();assert.ok(button(c.render(),'Continue to Upload Proof'));
});
for(const failure of ['verification','upload']) test(`account switch clears ${failure} recovery without selecting old record`,async()=>{
 const c=await flexibleFixture(failure==='verification'?[]:[created]);recoveryPosts(c);
 await button(c.render(),'Continue to Upload Proof').props.onPress();c.authState.user={id:'new-account'};c.authState.token='new-session';c.state.lookup=null;c.state.records=[{...c.record,user_id:'new-account'}];c.render();c.ui.blur();c.ui.focus();await tick();
 c.state.picker=async()=>({canceled:true,assets:[]});c.params.contribution_id='contribution-a';c.render();await tick();await button(c.render(),'Upload Proof of Payment').props.onPress();
 assert.equal(c.requests.filter(r=>r.url.endsWith('/contributions/flexible')).length,1);assert.doesNotMatch(text(c.render()),/December 2025/);
});
test('club switch invalidates failed upload recovery and preserves exact new-club selection',async()=>{
 const c=await flexibleFixture([created]);recoveryPosts(c);await button(c.render(),'Continue to Upload Proof').props.onPress();
 c.params.group_id='group-b';c.params.contribution_id='b';c.params.month='10';c.state.records=[{...c.record,contribution_id:'b',group_id:'group-b',group_name:'Club B'}];c.render();c.ui.blur();c.ui.focus();await tick();
 c.state.picker=async()=>({canceled:true,assets:[]});await button(c.render(),'Upload Proof of Payment').props.onPress();assert.doesNotMatch(text(c.render()),/December 2025/);
});
for(const phase of ['verification','upload']) test(`session change rejects delayed ${phase} error and finally`,async()=>{
 const c=await flexibleFixture([created]);let reject;recoveryPosts(c,false);
 if(phase==='verification')c.state.lookup=()=>reject ? Promise.resolve({data:{contributions:[c.record]}}) : new Promise((_,r)=>reject=r);else c.state.post=async(url,data,options)=>{c.requests.push({url,data,options});if(url.endsWith('/contributions/flexible'))return {data:{contribution_id:'created',group_id:'group-a'}};return new Promise((_,r)=>reject=r);};
 const pending=button(c.render(),'Continue to Upload Proof').props.onPress();await tick();const priorAlerts=c.alerts.length;
 c.authState.token='second-session';c.render();c.authState.token='third-session';c.render();reject(new Error('late'));await pending;assert.equal(c.alerts.length,priorAlerts);
 c.state.lookup=null;c.state.records=[c.record];c.params.contribution_id='contribution-a';c.render();c.ui.blur();c.ui.focus();await tick();c.state.picker=async()=>({canceled:true,assets:[]});await button(c.render(),'Upload Proof of Payment').props.onPress();
 assert.equal(c.requests.filter(r=>r.url.endsWith('/contributions/flexible')).length,1);
});

test('refresh after failed verification identifies the exact existing contribution and permits proof-only recovery',async()=>{
 const c=await flexibleFixture([],true);await button(c.render(),'Continue to Upload Proof').props.onPress();c.state.lookup=null;c.state.records=[created];c.ui.blur();c.ui.focus();await tick();assert.match(text(c.render()),/December 2025/);
 await button(c.render(),'Upload Proof of Payment').props.onPress();assert.equal(c.requests.filter(r=>r.url.endsWith('/contributions/flexible')).length,1);assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,1);
});

test('old finally cannot release a newer session proof-picker operation',async()=>{
 const c=await flexibleFixture([created]);let rejectOld;c.state.lookup=()=>rejectOld ? Promise.resolve({data:{contributions:[c.record]}}) : new Promise((_,r)=>rejectOld=r);
 const old=button(c.render(),'Continue to Upload Proof').props.onPress();await tick();c.authState.token='new-session';c.params.contribution_id='contribution-a';c.render();await tick();
 let closePicker;let picks=0;c.state.picker=()=>{picks++;return new Promise(r=>closePicker=r);};
 const newer=button(c.render(),'Upload Proof of Payment').props.onPress();await tick();rejectOld(new Error('late'));await old;
 await button(c.render(),'Upload Proof of Payment').props.onPress();assert.equal(picks,1);closePicker({canceled:true,assets:[]});await newer;
});
test('successful stale upload response cannot restore a prior session verified contribution',async()=>{
 const c=await flexibleFixture([created]);let finish;c.state.post=async(url,data,options)=>{c.requests.push({url,data,options});if(url.endsWith('/contributions/flexible'))return {data:{contribution_id:'created',group_id:'group-a'}};return new Promise(r=>finish=r);};
 const pending=button(c.render(),'Continue to Upload Proof').props.onPress();await tick();c.authState.token='new-session';c.state.records=[c.record];c.render();await tick();const alerts=c.alerts.length;finish({data:{}});await pending;assert.equal(c.alerts.length,alerts);assert.doesNotMatch(text(c.render()),/December 2025/);
});

async function standaloneFlexible(records=[created]) {
 const c=await setup();c.params.scope=undefined;c.params.group_id=undefined;c.params.id=undefined;c.params.month=undefined;c.params.year=undefined;c.state.records=[];
 c.state.dashboardClubs=[{id:'group-a',name:'Club A',contribution_mode:'flexible_goal',group_type:'travel'}];c.render();c.ui.blur();c.ui.focus();await tick();
 await button(c.render(),'Upload Proof of Payment').props.onPress();await tick();await button(c.render(),'Club A').props.onPress();await tick();
 assert.ok(nodes(c.render()).some(n=>n.type==='Modal'&&n.props.visible&&text(n).includes('Amount Paid')));
 nodes(c.render()).find(n=>n.type==='TextInput').props.onChangeText('123');c.state.records=records;return c;
}
test('standalone flexible picker establishes club ownership before creation and completes upload',async()=>{
 const c=await standaloneFlexible();await button(c.render(),'Continue to Upload Proof').props.onPress();await tick();
 assert.ok(c.alerts.some(a=>a[0]==='Success!'));assert.match(text(c.render()),/December 2025/);assert.equal(c.requests.filter(r=>r.url.endsWith('/contributions/flexible')).length,1);
 assert.equal(c.requests.find(r=>r.url.endsWith('/upload-proof')).data.contribution_id,'created');
});
test('standalone failed verification refreshes exact created record and uploads without repeat creation',async()=>{
 const c=await standaloneFlexible([]);await button(c.render(),'Continue to Upload Proof').props.onPress();assert.ok(c.alerts.some(a=>a[0]==='Contribution recorded'));c.state.records=[created];c.ui.blur();c.ui.focus();await tick();
 assert.match(text(c.render()),/December 2025/);await button(c.render(),'Upload Proof of Payment').props.onPress();assert.equal(c.requests.filter(r=>r.url.endsWith('/contributions/flexible')).length,1);
 assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,1);
});
test('standalone verified upload failure retains exact record and supports upload-only retry',async()=>{
 const c=await standaloneFlexible();recoveryPosts(c);await button(c.render(),'Continue to Upload Proof').props.onPress();await tick();assert.ok(c.alerts.some(a=>a[0]==='Proof upload failed'));assert.match(text(c.render()),/December 2025/);
 recoveryPosts(c,false);await button(c.render(),'Upload Proof of Payment').props.onPress();assert.equal(c.requests.filter(r=>r.url.endsWith('/contributions/flexible')).length,1);assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,2);
});
test('standalone picker cancellation never creates or uploads and permits another attempt',async()=>{
 const c=await standaloneFlexible();c.state.picker=async()=>({canceled:true,assets:[]});await button(c.render(),'Continue to Upload Proof').props.onPress();await button(c.render(),'Continue to Upload Proof').props.onPress();assert.equal(c.requests.filter(r=>r.url.endsWith('/contributions/flexible')||r.url.endsWith('/upload-proof')).length,0);
});
test('uncertain creation failure warns to refresh and never blindly repeats creation',async()=>{
 const c=await flexibleFixture([created]);let creations=0;c.state.post=async()=>{creations++;throw new Error('lost response');};await button(c.render(),'Continue to Upload Proof').props.onPress();assert.ok(c.alerts.some(a=>a[0]==='Contribution creation failed'&&/Do not blindly/.test(a[1])));
 await nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Record current-period contribution').props.onPress();await button(c.render(),'Continue to Upload Proof').props.onPress();assert.equal(creations,1);
});
test('multiple eligible obligations require explicit choice rather than first-record fallback',async()=>{
 const c=await setup();c.state.records=[c.record,{...c.record,contribution_id:'second'}];c.ui.blur();c.ui.focus();await tick();await button(c.render(),'Upload Proof of Payment').props.onPress();assert.ok(c.alerts.some(a=>a[0]==='Select contribution'));assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,0);
 nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Select contribution second').props.onPress();await button(c.render(),'Upload Proof of Payment').props.onPress();assert.equal(c.requests.find(r=>r.url.endsWith('/upload-proof')).data.contribution_id,'second');
});
test('standalone club switching clears a previous explicit contribution ID',async()=>{
 const c=await setup();c.params.scope=undefined;c.params.group_id=undefined;c.params.contribution_id='contribution-a';c.state.records=[c.record,{...c.record,contribution_id:'b',group_id:'group-b',group_name:'Club B'}];c.render();c.ui.blur();c.ui.focus();await tick();
 nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Select contribution club Club B').props.onPress();await button(c.render(),'Upload Proof of Payment').props.onPress();assert.equal(c.requests.find(r=>r.url.endsWith('/upload-proof')).data.contribution_id,'b');
});
for(const change of ['month','record','club','blur']) test(`pending flexible creation cannot continue after ${change} change`,async()=>{
 const c=await flexibleFixture([created]);let finish;c.state.post=async(url,data,options)=>{c.requests.push({url,data,options});return new Promise(r=>finish=r);};const pending=button(c.render(),'Continue to Upload Proof').props.onPress();await tick();
 if(change==='month')nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Next payment month').props.onPress();
 if(change==='record')nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Select contribution contribution-a').props.onPress();
 if(change==='club')c.params.group_id='group-b';
 if(change==='blur')c.ui.blur();else c.render();const alerts=c.alerts.length;finish({data:{contribution_id:'created',group_id:'group-a'}});await pending;
 assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,0);assert.equal(c.alerts.length,alerts);
});
test('verified upload failure survives leaving and returning without recreating contribution',async()=>{
 const c=await flexibleFixture([created]);recoveryPosts(c);await button(c.render(),'Continue to Upload Proof').props.onPress();c.ui.blur();c.ui.focus();await tick();assert.match(text(c.render()),/December 2025/);recoveryPosts(c,false);await button(c.render(),'Upload Proof of Payment').props.onPress();assert.equal(c.requests.filter(r=>r.url.endsWith('/contributions/flexible')).length,1);
});
test('Contributions duplicate taps during picker cannot upload twice',async()=>{
 const c=await setup('club');let finish;let picks=0;c.state.picker=()=>{picks++;return new Promise(r=>finish=r);};const first=button(c.render(),'Replace Proof').props.onPress();await button(c.render(),'Replace Proof').props.onPress();assert.equal(picks,1);finish({canceled:true,assets:[]});await first;assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,0);
});
test('Contributions navigation away cancels picker continuation even after return',async()=>{
 const c=await setup('club');let finish;c.state.picker=()=>new Promise(r=>finish=r);const pending=button(c.render(),'Replace Proof').props.onPress();c.ui.blur();c.ui.focus();await tick();finish({canceled:false,assets:[{uri:'cache/proof',name:'proof.jpg',size:100}]});await pending;assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,0);
});
test('file reading failure releases upload controls without changing contribution',async()=>{
 const c=await setup();c.state.read=async()=>{throw new Error('file unavailable');};await button(c.render(),'Upload Proof of Payment').props.onPress();assert.ok(c.alerts.some(a=>a[0]==='Upload Failed'));c.state.read=null;await button(c.render(),'Upload Proof of Payment').props.onPress();assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,1);
});

test('Android Back preserves the current period, contribution and account origin in club Payments',async()=>{
 const c=await setup();nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Select contribution contribution-a').props.onPress();c.render();assert.equal(c.state.back(),true);assert.deepEqual(c.routes.at(-1).params,{id:'group-a',month:'10',year:'2026',contribution_id:'contribution-a',from:'admin'});
 nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Previous payment month').props.onPress();c.render();c.state.back();assert.equal(c.routes.at(-1).params.month,'9');assert.equal(c.routes.at(-1).params.contribution_id,'');
});
test('standalone Payments leaves native Back navigation intact',async()=>{
 const c=await setup();c.params.scope=undefined;c.render();assert.equal(c.state.back,null);
});
test('Android Back from Contributions preserves selected club and record',async()=>{
 const c=await setup('club');c.state.club={group:{id:'group-a',name:'Club A'},contributions:[c.record],current_contribution:{...c.record,id:c.record.contribution_id},payment_reference:{amount:150},payment_history:[]};c.ui.blur();c.ui.focus();await tick();button(c.render(),'Contribution 1').props.onPress();c.render();c.state.back();assert.equal(c.routes.at(-1).params.contribution_id,'contribution-a');assert.equal(c.routes.at(-1).params.from,'admin');
});
test('closing the proof viewer cancels a delayed PDF share operation',async()=>{
 const c=await setup();let finish;c.state.get=async()=>({data:{proof_image:'data:application/pdf;base64,proof',proof_mime_type:'application/pdf'}});c.state.write=()=>new Promise(r=>finish=r);
 const pending=button(c.render(),'View Proof').props.onPress();await tick();nodes(c.render()).find(n=>n.type==='Modal'&&n.props.visible&&text(n).includes('Proof of Payment')).props.onRequestClose();finish();await pending;assert.equal(c.state.shared,undefined);
});
test('flexible modal dismissal cancels the pending picker without creating a contribution',async()=>{
 const c=await flexibleFixture([created]);let finish;c.state.picker=()=>new Promise(r=>finish=r);const pending=button(c.render(),'Continue to Upload Proof').props.onPress();nodes(c.render()).find(n=>n.type==='Modal'&&n.props.visible&&text(n).includes('Amount Paid')).props.onRequestClose();finish({canceled:false,assets:[{uri:'cache/proof',size:100}]});await pending;assert.equal(c.requests.filter(r=>r.url.endsWith('/contributions/flexible')).length,0);
});
test('empty and historical periods never substitute an uploadable obligation',async()=>{
 for(const records of [[],[{...created,historical_only:true,proof_eligible:false}]]){const c=await setup();c.state.records=records;c.ui.blur();c.ui.focus();await tick();await button(c.render(),'Upload Proof of Payment').props.onPress();assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,0);}
});

test('route period and explicit ID changes mask previous records before effects settle',async()=>{
 const c=await setup();c.params.month='9';c.params.contribution_id='missing';const first=c.render();assert.doesNotMatch(text(first),/Expected:|Wrong reference/);await button(first,'Upload Proof of Payment').props.onPress();assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,0);
});
test('Contributions route-period change immediately masks the prior period snapshot',async()=>{
 const c=await setup('club');c.params.month='9';assert.doesNotMatch(text(c.render()),/Selected Contribution|Amount Due/);
});

test('callbacks from a prior account cannot start proof viewing, uploads or club discovery',async()=>{
 const c=await setup();const old=c.render();const upload=button(old,'Upload Proof of Payment').props.onPress;const view=button(old,'View Proof').props.onPress;
 c.authState.user={id:'different'};c.authState.token='different-session';c.render();await tick();const count=c.requests.length;await upload();await view();assert.equal(c.requests.length,count);assert.equal(nodes(c.render()).filter(n=>n.type==='Modal'&&n.props.visible&&text(n).includes('Proof of Payment')).length,0);
});
test('a prior-session flexible submit callback cannot cancel or start a newer operation',async()=>{
 const c=await flexibleFixture([created]);const old=button(c.render(),'Continue to Upload Proof').props.onPress;c.authState.token='new-session';c.render();await tick();const count=c.requests.length;await old();assert.equal(c.requests.length,count);assert.equal(c.requests.filter(r=>r.url.endsWith('/contributions/flexible')).length,0);
});
test('duplicate exact identifiers never choose the first proof-upload record',async()=>{
 const c=await setup();const oldUpload=nodes(c.render()).find(n=>n.props?.accessibilityLabel==='Upload proof for contribution contribution-a').props.onPress;c.state.records=[c.record,{...c.record,payment_reference:'conflicting'}];c.ui.blur();c.ui.focus();await tick();const errorTree=c.render();assert.equal(nodes(errorTree).some(n=>n.props?.accessibilityLabel==='Upload proof for contribution contribution-a'),false);assert.match(text(errorTree),/Unable to load proofs/);await oldUpload();await button(errorTree,'Upload Proof of Payment').props.onPress();assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,0);
});

test('Contributions route-period transition does not fetch an intermediate old period',async()=>{
 const c=await setup('club');const before=c.requests.length;c.params.month='9';c.render();assert.equal(c.requests.length,before);c.render();await tick();assert.equal(c.requests.length,before+1);assert.equal(c.requests.at(-1).options.params.month,9);
});

test('explicit ineligible or historical records show a reason without substituting another obligation',async()=>{
 for(const historical of [false,true]){const c=await setup();c.params.contribution_id='contribution-a';c.state.records=[{...c.record,proof_eligible:false,historical_only:historical},{...c.record,contribution_id:'eligible-other'}];c.render();c.ui.blur();c.ui.focus();await tick();await button(c.render(),'Upload Proof of Payment').props.onPress();assert.ok(c.alerts.some(a=>a[0]==='Proof upload unavailable'));assert.equal(c.requests.filter(r=>r.url.endsWith('/upload-proof')).length,0);}
});
test('unverified recovery explains safe refresh instead of silently disabling proof continuation',async()=>{
 const c=await flexibleFixture([],true);await button(c.render(),'Continue to Upload Proof').props.onPress();await button(c.render(),'Upload Proof of Payment').props.onPress();assert.ok(c.alerts.some(a=>a[0]==='Refresh Contributions'));assert.equal(c.requests.filter(r=>r.url.endsWith('/contributions/flexible')).length,1);
});

test('successful proof replacement rejects an older overlapping proof-view response',async()=>{
 const c=await setup();let finish;c.state.get=url=>url.includes('/proof?')?new Promise(r=>finish=r):Promise.resolve({data:{contributions:[c.record]}});
 const viewing=button(c.render(),'View Proof').props.onPress();await button(c.render(),'Upload Proof of Payment').props.onPress();finish({data:{proof_image:'obsolete-proof',proof_mime_type:'image/jpeg'}});await viewing;
 assert.equal(nodes(c.render()).filter(n=>n.type==='Image'&&n.props.source?.uri==='obsolete-proof').length,0);assert.equal(c.requests.find(r=>r.url.endsWith('/upload-proof')).data.contribution_id,'contribution-a');
});

for(const screen of ['proofs','club']) test(`${screen}: stale proof deletion cleanup cannot release a newer operation after A-B-A session changes`,async()=>{
 const c=await setup(screen,'pending');const completions=[];c.state.delete=()=>new Promise(r=>completions.push(r));
 button(c.render(),'Delete Pending Proof').props.onPress();const old=c.alerts.at(-1)[2].find(a=>a.text==='Delete').onPress();await tick();
 c.authState.token='second';c.render();await tick();c.authState.token='member-session';c.render();await tick();
 button(c.render(),'Delete Pending Proof').props.onPress();const current=c.alerts.at(-1)[2].find(a=>a.text==='Delete').onPress();await tick();assert.equal(completions.length,2);
 completions[0]();await old;assert.equal(button(c.render(),screen==='club'?'Deleting...':'Delete Pending Proof').props.disabled,true);completions[1]();await current;assert.equal(button(c.render(),'Delete Pending Proof').props.disabled,false);
});
