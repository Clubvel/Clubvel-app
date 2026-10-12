const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.join(__dirname, '../..');
const config = JSON.parse(fs.readFileSync(path.join(root,'frontend/app.json'),'utf8')).expo;
test('approved navy assets preserve identifiers, SDK targets and version',()=>{
 assert.equal(config.android.package,'com.clubvel.clubvel');assert.equal(config.ios.bundleIdentifier,'com.clubvel.clubvel');
 assert.equal(config.android.versionCode,13);assert.equal(config.version,'1.0.0');
 assert.equal(config.icon,'./assets/images/clubvel-navy-icon.png');
 assert.equal(config.android.adaptiveIcon.foregroundImage,'./assets/images/clubvel-navy-adaptive-icon.png');
 assert.equal(config.android.adaptiveIcon.backgroundColor,'#FFFFFF');
 const splash=config.plugins.find(p=>Array.isArray(p)&&p[0]==='expo-splash-screen')[1];
 assert.equal(splash.image,'./assets/images/clubvel-navy-splash.png');assert.equal(splash.backgroundColor,'#FFFFFF');assert.equal(splash.resizeMode,'contain');
 const sdk=config.plugins.find(p=>Array.isArray(p)&&p[0]==='expo-build-properties')[1].android;
 assert.deepEqual(sdk,{compileSdkVersion:36,targetSdkVersion:36,minSdkVersion:24});
 for(const asset of [config.icon,config.android.adaptiveIcon.foregroundImage,splash.image]){
  const bytes=fs.readFileSync(path.join(root,'frontend',asset));assert.equal(bytes.subarray(1,4).toString(),'PNG');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);assert.ok(width>=1024&&height>=1024);
  if(asset!==splash.image)assert.equal(width,height);
 }
});
test('all original Clubvel artwork remains byte-for-byte unchanged',()=>{
 for(const name of ['clubvel-launcher-icon.png','clubvel-splash.png','clubvel-final-icon.png','clubvel-final-splash.png']){
  const file='frontend/assets/images/'+name;
  const expected=cp.execFileSync('git',['show','eca3c952b8978d632c45cb79b5009540cbeef8a7:'+file],{cwd:root,maxBuffer:10*1024*1024});
  assert.deepEqual(fs.readFileSync(path.join(root,file)),expected);
 }
});
test('active icon and splash files are the exact approved six-person artwork',()=>{
 const expected={
  'clubvel-navy-icon.png':'f1d91ab5da16f0e10b583ab468cd3a71f211367b4ea433dff7622e557be52a82',
  'clubvel-navy-ios-icon.png':'f1d91ab5da16f0e10b583ab468cd3a71f211367b4ea433dff7622e557be52a82',
  'clubvel-navy-adaptive-icon.png':'739a75ef8dc775dab6ab7f920cef579c70a66495cd3df229c548af8b8c5ae671',
  'clubvel-navy-splash.png':'8bab894566d33f00bd48670cad6a4ed890963df8978034b85465e2a47f75c80b',
 };
 assert.equal(config.ios.icon,'./assets/images/clubvel-navy-ios-icon.png');
 for(const [name,hash] of Object.entries(expected)){
  const file=fs.readFileSync(path.join(root,'frontend/assets/images',name));
  assert.equal(crypto.createHash('sha256').update(file).digest('hex'),hash,name);
 }
});
test('all other Expo settings and plugins remain unchanged',()=>{
 const previous=JSON.parse(cp.execFileSync('git',['show','eca3c952b8978d632c45cb79b5009540cbeef8a7:frontend/app.json'],{cwd:root,encoding:'utf8'})).expo;
 previous.icon='./assets/images/clubvel-navy-icon.png';previous.ios.icon='./assets/images/clubvel-navy-ios-icon.png';
 previous.android.adaptiveIcon.foregroundImage='./assets/images/clubvel-navy-adaptive-icon.png';
 previous.plugins.find(p=>Array.isArray(p)&&p[0]==='expo-splash-screen')[1].image='./assets/images/clubvel-navy-splash.png';
 assert.deepEqual(config,previous);
});
