const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {startLocalServer}=require('../scripts/serve-local.cjs');
let server,token;
async function call(name,data={}) {
  // Restricted containers may prohibit the Unix socket used by the Functions
  // emulator. This opt-in path still validates the real Auth emulator ID token
  // and runs the same callable handler against the real Firestore emulator.
  if(process.env.EASYMANUAL_TEST_DIRECT_CALLABLES==='1') {
    process.env.FUNCTIONS_EMULATOR='true';
    const handlers=require('../functions/index');
    const dependencies=require('node:module').createRequire(require('node:path').resolve(__dirname,'../functions/package.json'));
    const decoded=await dependencies('firebase-admin/auth').getAuth().verifyIdToken(token);
    try{return {status:200,body:{result:await handlers[name].run({auth:{uid:decoded.uid,token:decoded},data})}};}
    catch(error){return {status:error.httpErrorCode?.status||500,body:{error:{message:error.message}}};}
  }
  const response=await fetch(`http://127.0.0.1:5001/demo-easymanual/us-central1/${name}`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({data}),signal:AbortSignal.timeout(20000)});
  return {status:response.status,body:await response.json()};
}
before(async()=>{
  server=await startLocalServer({quiet:true});
  const credentials=JSON.parse(fs.readFileSync('.local/credentials.json'));
  const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-easymanual-local',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...credentials,returnSecureToken:true})});
  const result=await response.json();assert.equal(response.status,200,JSON.stringify(result.error));token=result.idToken;assert(token);
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
test('generated local account signs in and has access to all four workspace modules',async()=>{
  for(const module of ['upload-de-arquivos','chat-de-busca','treinamento','flow-map']) {
    const result=await call('authorizeModule',{module});assert.equal(result.status,200,JSON.stringify(result));assert(result.body.result.ok);
  }
});
test('local billing cannot call payment services',async()=>{
  for(const method of ['createCheckout','billingPortal']) {
    const result=await call(method,{planId:'pilotos'});assert.equal(result.status,400);assert.match(result.body.error.message,/desativados/);
  }
});
test('local configuration is served but credentials and backend sources are not',async()=>{
  const config=await (await fetch('http://127.0.0.1:5173/__/firebase/init.json')).json();assert.equal(config.projectId,'demo-easymanual');assert.equal(config.localEmulators,true);
  const home=await fetch('http://127.0.0.1:5173');assert.equal(home.status,200);assert.match(await home.text(),/Ambiente local/);
  for(const p of ['/.local/credentials.json','/functions/.secret.local','/functions/index.js','/scripts/seed-local.cjs','/assets/%2e%2e%2f.local/credentials.json'])assert.equal((await fetch('http://127.0.0.1:5173'+p)).status,404,p);
});
