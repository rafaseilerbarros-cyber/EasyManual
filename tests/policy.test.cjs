const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PLANS,entitlements,canUpload,validFile,validFlow}=require('../functions/policy');
const workspace=(planId,extra={})=>({planId,status:'active',expiresAt:Date.now()+60000,memberCount:1,fileCount:0,...extra});
test('advertised modules, annual BRL prices and enterprise seats',()=>{
  assert.deepEqual(Object.values(PLANS).map(p=>p.seats),[1,1,1,30,500,2000]);
  assert.deepEqual(Object.values(PLANS).map(p=>p.amount),[20000,50000,100000,2250000,25000000,60000000]);
  assert.deepEqual(entitlements(workspace('entusiastas')).modules,['upload-de-arquivos','chat-de-busca']);
  assert(!entitlements(workspace('estudantes')).modules.includes('flow-map'));
  assert(entitlements(workspace('pilotos')).modules.includes('flow-map'));
});
test('unsigned, unknown, expired, unpaid and canceled subscriptions have no access',()=>{
  for(const w of [{},workspace('admin'),workspace('pilotos',{expiresAt:0}),...['inactive','past_due','unpaid','canceled','trialing','incomplete'].map(status=>workspace('pilotos',{status}))])assert.deepEqual(entitlements(w).modules,[]);
});
test('one-file quota counts reserved uploads and existing files',()=>{
  assert(canUpload(workspace('entusiastas')));
  assert(!canUpload(workspace('entusiastas',{fileCount:1})));
  assert(!canUpload(workspace('entusiastas',{fileCount:10})));
  assert(canUpload(workspace('estudantes',{fileCount:1000})));
});
test('downgrade over seat limit locks modules until owner removes members',()=>{
  assert.equal(entitlements(workspace('escolas',{memberCount:30})).modules.length,4);
  assert.deepEqual(entitlements(workspace('escolas',{memberCount:31})).modules,[]);
  assert(!canUpload(workspace('pilotos',{memberCount:2})));
});
test('file validation prevents invalid sizes, MIME confusion and executable types',()=>{
  const f={name:'manual.pdf',size:100,contentType:'application/pdf'};
  assert(validFile(f));
  for(const patch of [{name:'x.html'},{size:0},{size:21*1048576},{size:1.5},{contentType:'text/plain'},{name:''}])assert(!validFile({...f,...patch}));
});
test('flows enforce step ordering, coordinate bounds and payload size',()=>{
  const node={id:1,x:2,y:98,title:'Check'};
  assert(validFlow([node]));assert(validFlow([]));
  for(const patch of [{id:4},{x:101},{y:NaN},{title:''},{title:'x'.repeat(501)}])assert(!validFlow([{...node,...patch}]));
  assert(!validFlow(Array(201).fill(node)));
});
