const test=require('node:test'),assert=require('node:assert/strict');
const {load,engine,native,nodes}=require('./ui-harness.cjs');
const Colors=load('constants/Colors.ts').Colors;
for(const size of [44,48,112])for(const tone of ['light','dark'])test(`photo frame ${size}px on ${tone} surface preserves photo dimensions and gives a contrasting ring`,()=>{
 const ui=engine(),Frame=load('components/ProfilePhotoFrame.tsx',{react:ui.react,'react-native':native,'../constants/Colors':{Colors}}).default;
 const photo={type:'Image',props:{style:{width:size,height:size,borderRadius:size/2,borderWidth:1,borderColor:Colors.white},source:{uri:'existing-photo'},resizeMode:'cover'}};
 const tree=Frame({size,tone,children:photo}),ring=size<=48?1:2;assert.equal(tree.props.style.width,size+ring*4);assert.equal(tree.props.style.borderRadius,tree.props.style.width/2);assert.equal(tree.props.style.borderWidth,ring);
 assert.equal(tree.props.style.borderColor,tone==='dark'?'#FFFFFF':'#0756C9');assert.equal(tree.props.style.backgroundColor,tone==='dark'?'#E8F2FF':'#FFFFFF');assert.ok(tree.props.style.shadowOpacity<=0.1);
 const image=nodes(tree).find(n=>n.type==='Image');assert.equal(image,photo);assert.equal(image.props.source.uri,'existing-photo');assert.equal(image.props.style.width,size);assert.equal(image.props.resizeMode,'cover');
});
test('premium palette keeps sage supporting surfaces separate from semantic statuses',()=>{
 assert.equal(Colors.sage,'#527866');assert.equal(Colors.softSage,'#E5EFE9');assert.equal(Colors.textPrimary,'#273443');assert.equal(Colors.midnightNavy,'#061641');assert.equal(Colors.statusPaid,'#16A34A');assert.equal(Colors.statusLate,'#E31B23');
});
