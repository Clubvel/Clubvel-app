const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {load}=require('./ui-harness.cjs');
const Colors=load('constants/Colors.ts').Colors;
const {contributionStatusCounts:counts}=load('services/contributionStatusCounts.ts');
function styles(file){const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let initializer;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='styles')initializer=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);return new Function('StyleSheet','Colors',`return ${initializer}`)({create:s=>s},Colors);}
const luminance=hex=>hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[0.2126,0.7152,0.0722][i],0);
test('accessible coral controls retain compact white labels and exact Coral Red accents without changing semantic status colours',()=>{
 const contrast=1.05/(luminance(Colors.coralAction)+0.05);assert.equal(Colors.coralRed,'#FF403D');assert.ok(contrast>=4.5);
 for(const [file,control,label] of [['app/(member)/home.tsx','clubListHeader','clubListTitle'],['app/(member)/proofs.tsx','clubRibbon','clubRibbonTitle'],['app/(member)/proofs.tsx','uploadButton','uploadButtonText'],['app/(member)/claims.tsx','submitButton','submitButtonText'],['app/(member)/claims.tsx','confirmButton','confirmButtonText']]){
  const sheet=styles(file);assert.equal(sheet[control].backgroundColor,Colors.coralAction);assert.equal(sheet[control].borderColor,Colors.coralRed);assert.equal(sheet[label].color,Colors.white);assert.ok(sheet[label].fontSize>=16&&sheet[label].fontSize<=18,file+': compact accessible label');assert.equal(sheet.header.backgroundColor,Colors.primary);
 }
 assert.match(fs.readFileSync(path.join(__dirname,'../app/(member)/home.tsx'),'utf8'),/name=\{clubsExpanded \? 'chevron-up' : 'chevron-down'\} size=\{20\} color=\{Colors.white\}/);
 assert.equal(Colors.primary,'#06285B');assert.equal(Colors.avatarRing,'#FFD600');assert.equal(Colors.iceBlue,'#DCEEFF');assert.equal(Colors.statusPaid,'#16A34A');assert.equal(Colors.statusDue,'#F59E0B');assert.equal(Colors.statusLate,'#E31B23');
});
test('contribution counts use authoritative financial states, including records with no uploaded proof',()=>{
 const records=['confirmed','awaiting_payment','awaiting_confirmation','proof_declined','excused','invalid_amount'].map((payment_state,i)=>({contribution_id:String(i),payment_state,proof_uploaded:false,status:'confirmed',amount_due:999}));
 assert.deepEqual(counts(records),{paid:1,awaiting:2,declined:1,other:2});assert.deepEqual(counts([]),{paid:0,awaiting:0,declined:0,other:0});
});
test('unknown states are explicit other counts; duplicate or absent identifiers never inflate totals',()=>{
 assert.deepEqual(counts([{contribution_id:'a'},{contribution_id:'b',payment_state:'future_status'}]),{paid:0,awaiting:0,declined:0,other:2});
 assert.equal(counts([{contribution_id:'a',payment_state:'confirmed'},{contribution_id:'a',payment_state:'confirmed'}]),null);assert.equal(counts([{contribution_id:''}]),null);
});
