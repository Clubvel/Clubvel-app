const test=require('node:test'),assert=require('node:assert/strict');
const {load,engine,native,nodes,text,tick}=require('./ui-harness.cjs');
const Colors=load('constants/Colors.ts').Colors;
const luminance=hex=>hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4).reduce((n,c,i)=>n+c*[0.2126,0.7152,0.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
test('midnight headers, action surfaces and body text retain readable contrast',()=>{
 for(const [fg,bg] of [[Colors.white,Colors.primary],[Colors.white,Colors.corporateBlue],[Colors.textPrimary,Colors.background],[Colors.textPrimary,Colors.white]])assert.ok(contrast(fg,bg)>=4.5,`${fg} on ${bg}`);
 assert.equal(Colors.avatarRing,'#E5B83F');assert.equal(Colors.headerBackground,'#06285B');assert.equal(Colors.secondaryHighlight,'#397F78');
});

test('personal claims deduplicates pending focus reads while explicit refresh remains fresh',async()=>{
 const ui=engine(),requests=[],auth={id:'jimmy',token:'session'};
 const {usePersonalClaims}=load('hooks/usePersonalClaims.ts',{react:ui.react,'expo-router':{useFocusEffect:ui.useFocusEffect},axios:{get:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))}});
 const render=()=>ui.render(()=>usePersonalClaims(auth.id,auth.token));render();ui.focus();ui.focus();assert.equal(requests.length,1);
 const refresh=render().reload;const newer=refresh();assert.equal(requests.length,2);
 requests[0].resolve({data:{claims:[{claim_id:'old',group_id:'a',group_name:'A',status:'approved',amount:999}]}});await tick();assert.equal(render().records.length,0);
 ui.focus();assert.equal(requests.length,2,'old finally cannot clear the newer pending marker');
 requests[1].resolve({data:{claims:[]}});await newer;assert.equal(render().phase,'empty');
});
test('personal claims old-account callbacks cannot start requests or replace current records',async()=>{
 const ui=engine(),requests=[],auth={id:'jimmy',token:'session'};
 const {usePersonalClaims}=load('hooks/usePersonalClaims.ts',{react:ui.react,'expo-router':{useFocusEffect:ui.useFocusEffect},axios:{get:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))}});
 const render=()=>ui.render(()=>usePersonalClaims(auth.id,auth.token));const old=render().reload;auth.id='brown';auth.token='brown-token';assert.deepEqual(render().records,[]);await old();assert.equal(requests.length,2);
 requests[0].resolve({data:{claims:[{claim_id:'jimmy',group_id:'a',group_name:'A',status:'approved',amount:999}]}});await tick();assert.deepEqual(render().records,[]);
 requests[1].resolve({data:{claims:[]}});await tick();assert.equal(render().phase,'empty');assert.ok(requests[1].url.endsWith('/brown'));assert.equal(requests[1].options.headers.Authorization,'Bearer brown-token');
});
test('presentation greeting uses device-local time, one contextual phrase and safe names',()=>{
 const {clubGreeting}=load('services/clubGreeting.ts');
 assert.equal(clubGreeting(' Brown Member ',new Date(2026,9,15,6)),'Good morning, Brown!');
 assert.equal(clubGreeting('Jimmy',new Date(2026,9,15,13)),'Good afternoon, Jimmy!');
 assert.equal(clubGreeting(undefined,new Date(2026,9,15,20)),'Good evening!');
});
for(const [status,expected] of [['paid',Colors.statusPaid],['confirmed',Colors.statusPaid],['pending',Colors.statusDue],['proof_uploaded',Colors.statusDue],['proof_declined',Colors.statusLate],['rejected',Colors.statusLate],['failed',Colors.statusLate]])test(`${status} keeps its semantic colour with readable small text`,()=>{
 const ui=engine(),Pill=load('components/StatusPill.tsx',{react:ui.react,'react-native':native,'../constants/Colors':{Colors}}).StatusPill;
 const tree=Pill({status}),background=Object.assign({},...tree.props.style).backgroundColor,label=nodes(tree).find(n=>n.type==='Text'),foreground=Object.assign({},...label.props.style).color;
 assert.equal(background,expected);assert.ok(contrast(foreground,background)>=4.5);assert.ok(text(label));
});


test('secondary screens preserve functionality and layouts apart from approved header typography',()=>{
 const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
 const root=path.join(__dirname,'../..');
 const files=["frontend/app/(member)/about.tsx", "frontend/app/(member)/alerts.tsx", "frontend/app/(member)/club/[id].tsx", "frontend/app/(member)/home.tsx", "frontend/app/(member)/notifications.tsx", "frontend/app/(member)/profile.tsx", "frontend/app/(member)/proofs.tsx", "frontend/app/(member)/support.tsx", "frontend/app/(member)/trust-score.tsx", "frontend/app/(treasurer)/about.tsx", "frontend/app/(treasurer)/club-detail.tsx", "frontend/app/(treasurer)/claims.tsx", "frontend/app/(treasurer)/contributions.tsx", "frontend/app/(treasurer)/dashboard.tsx", "frontend/app/(treasurer)/members.tsx", "frontend/app/(treasurer)/notifications.tsx", "frontend/app/(treasurer)/profile.tsx", "frontend/app/(treasurer)/reports.tsx", "frontend/app/auth.tsx", "frontend/app/onboarding.tsx", "frontend/components/AdBanner.tsx", "frontend/components/AppHeader.tsx"];
 const neutral=s=>s.replace(/import ContactVisibilityPreference from '[^']+';\r?\n/g,'').replace(/^[ \t]*<ContactVisibilityPreference \/>\r?\n/gm,'').replace(/clubvel-midnight-icon\.png/g,'clubvel-launcher-icon.png').replace(/\r\n/g,'\n').replace(/\bColors\.[A-Za-z_]\w*/g,'Colors.visualToken').replace(/\b(headerTitle|title):\s*\{[^}]*\}/g,m=>m.replace(/fontWeight:\s*'(?:bold|[4567]00)'/g,"fontWeight: 'approved-header-weight'"));
 for(const file of files.filter(file=>!['frontend/app/(member)/club/[id].tsx','frontend/app/(treasurer)/dashboard.tsx','frontend/app/(member)/home.tsx','frontend/app/auth.tsx','frontend/app/(member)/proofs.tsx'].includes(file))){
  const baseline=cp.execFileSync('git',['show','c981f286d703f8ff0d986ba71032716e7efaf3fc:'+file],{cwd:root,encoding:'utf8'});
  assert.equal(neutral(fs.readFileSync(path.join(root,file),'utf8')),neutral(baseline),file);
 }
 assert.equal(Colors.primary,'#06285B');assert.equal(Colors.headerBackground,'#06285B');
 assert.equal(Colors.avatarRing,'#E5B83F');
 assert.equal(Colors.gold,'#F59E0B');assert.equal(Colors.lightGold,'#FFF4DB');
 assert.equal(Colors.statusPaid,'#16A34A');assert.equal(Colors.statusDue,'#F59E0B');assert.equal(Colors.statusLate,'#E31B23');
});
