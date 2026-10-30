const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assertLocalEnvironment}=require('../scripts/seed-local.cjs');
const {localResource}=require('../scripts/serve-local.cjs');
const valid={GCLOUD_PROJECT:'demo-easymanual',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'};
test('local account seeding refuses production projects, remote emulators and missing emulator configuration',()=>{
  assert.doesNotThrow(()=>assertLocalEnvironment(valid));
  for(const patch of [{GCLOUD_PROJECT:'production'},{FIREBASE_AUTH_EMULATOR_HOST:'remote:9099'},{FIRESTORE_EMULATOR_HOST:'remote:8080'},{FIREBASE_AUTH_EMULATOR_HOST:''},{FIRESTORE_EMULATOR_HOST:''}])assert.throws(()=>assertLocalEnvironment({...valid,...patch}),/só pode ser criada/);
  assert.throws(()=>assertLocalEnvironment({}),/só pode ser criada/);
});
test('local server allowlist protects account password, backend files and emulator exports',()=>{
  assert.equal(localResource('/'),'index.html');assert.equal(localResource('/assets/account.js'),'assets/account.js');assert.equal(localResource('/images/logo.png'),'images/logo.png');
  for(const url of ['/.local/credentials.json','/functions/.secret.local','/functions/index.js','/scripts/seed-local.cjs','/assets/%2e%2e%2f.local/credentials.json','/assets/../.local/credentials.json','/assets/.secret'])assert.equal(localResource(url),null,url);
});
