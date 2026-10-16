const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const dir=path.join(__dirname,'../assets/images');
function png(name){
 const b=fs.readFileSync(path.join(dir,name)),width=b.readUInt32BE(16),height=b.readUInt32BE(20),type=b[25],channels=type===6?4:3;assert.equal(b[24],8);assert.ok([2,6].includes(type));const blocks=[];
 for(let p=8;p<b.length;){const n=b.readUInt32BE(p),t=b.toString('ascii',p+4,p+8);if(t==='IDAT')blocks.push(b.subarray(p+8,p+8+n));p+=n+12;}
 const raw=zlib.inflateSync(Buffer.concat(blocks)),stride=width*channels,pixels=Buffer.alloc(height*stride);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];for(let x=0;x<stride;x++){const left=x>=channels?pixels[y*stride+x-channels]:0,up=y?pixels[(y-1)*stride+x]:0,corner=y&&x>=channels?pixels[(y-1)*stride+x-channels]:0;assert.ok(filter<=4);pixels[y*stride+x]=(raw[y*(stride+1)+1+x]+(filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):paeth(left,up,corner)))&255;}}
 return {width,height,channels,pixels};
}
test('white community artwork preserves every pixel of the original approved alpha mask and Android safe area',()=>{
 const a=png('clubvel-corporate-adaptive-icon.png'),b=png('clubvel-midnight-symbol.png');assert.deepEqual([b.width,b.height,b.channels],[1024,1024,4]);let minX=1024,minY=1024,maxX=0,maxY=0;
 for(let i=0;i<1024*1024;i++){assert.equal(b.pixels[i*4+3],a.pixels[i*4+3]);assert.equal(b.pixels[i*4],255);assert.equal(b.pixels[i*4+1],255);assert.equal(b.pixels[i*4+2],255);if(b.pixels[i*4+3]>0){minX=Math.min(minX,i%1024);maxX=Math.max(maxX,i%1024);minY=Math.min(minY,Math.floor(i/1024));maxY=Math.max(maxY,Math.floor(i/1024));}}
 assert.ok(minX>=170&&minY>=170&&maxX<=854&&maxY<=854,'artwork stays within the existing adaptive safe area');
});
test('opaque launcher icon is exactly the same white mask composited over Midnight Blue without lettering',()=>{
 const symbol=png('clubvel-midnight-symbol.png'),icon=png('clubvel-midnight-icon.png');assert.deepEqual([icon.width,icon.height,icon.channels],[1024,1024,3]);const navy=[6,40,91];
 for(let i=0;i<1024*1024;i++)for(let c=0;c<3;c++){const alpha=symbol.pixels[i*4+3]/255,expected=Math.round(255*alpha+navy[c]*(1-alpha));assert.ok(Math.abs(icon.pixels[i*3+c]-expected)<=1);}
});
