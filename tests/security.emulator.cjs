const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const dependencies=require('node:module').createRequire(require('node:path').resolve(__dirname,'../functions/package.json'));
const {initializeTestEnvironment,assertFails,assertSucceeds}=dependencies('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,Timestamp}=dependencies('firebase/firestore');
const {ref,uploadBytes,getBytes}=dependencies('firebase/storage');
const {getFirestore,Timestamp:AdminTimestamp}=dependencies('firebase-admin/firestore');
let env,handlers,admin,currentSub,priceOverride;
const {PLANS}=require('../functions/policy');
const checkoutSessions=new Map();
const RealStripe=dependencies('stripe');
const signedWebhook=new RealStripe('sk_test_fixture_only').webhooks;
const secret='fixture-webhook-secret';
const stripeMock={
  webhooks:signedWebhook,
  subscriptions:{retrieve:async()=>currentSub,list:async()=>({data:[]})},
  prices:{retrieve:async priceId=>priceOverride||({id:priceId,currency:'brl',unit_amount:PLANS[priceId.replace('price_','')].amount,recurring:{interval:'year',interval_count:1}})},
  customers:{create:async()=>({id:'cus_owner'})},
  checkout:{sessions:{
    create:async(params,opts)=>{if(!checkoutSessions.has(opts.idempotencyKey))checkoutSessions.set(opts.idempotencyKey,{id:opts.idempotencyKey,url:'https://checkout.stripe.com/fixture',status:'open',params});return checkoutSessions.get(opts.idempotencyKey);},
    retrieve:async id=>checkoutSessions.get(id)
  }}
};
require.cache[dependencies.resolve('stripe')].exports=()=>stripeMock;
async function webhook(type='customer.subscription.updated',created=100,signatureValid=true) {
  const body=JSON.stringify({id:'evt_fixture',type,created,data:{object:{id:currentSub.id}}});
  const header=signedWebhook.generateTestHeaderString({payload:body,secret:signatureValid?secret:'incorrect'});
  let status;
  const res={status(code){status=code;return this;},send(){return status;},sendStatus(code){status=code;return code;}};
  await handlers.stripeWebhook({method:'POST',rawBody:Buffer.from(body),headers:{'stripe-signature':header}},res);
  return status;
}
function subscription(patch={}) {return {id:'sub_owner',customer:'cus_owner',created:10,status:'active',metadata:{workspaceId:'owner'},items:{data:[{quantity:1,current_period_end:Math.floor(Date.now()/1000)+3600,price:{id:'price_pilotos',currency:'brl',unit_amount:100000,recurring:{interval:'year',interval_count:1}}}]},...patch};}

const request=(uid,data={})=>({auth:{uid,token:{email:`${uid}@example.com`,email_verified:true}},data});
before(async()=>{
  env=await initializeTestEnvironment({projectId:'demo-easymanual',firestore:{rules:fs.readFileSync('firestore.rules','utf8')},storage:{rules:fs.readFileSync('storage.rules','utf8')}});
  process.env.GCLOUD_PROJECT='demo-easymanual';
  process.env.FIREBASE_CONFIG=JSON.stringify({projectId:'demo-easymanual',storageBucket:'demo-easymanual.appspot.com'});
  process.env.STRIPE_SECRET_KEY='sk_test_fixture_only';process.env.STRIPE_WEBHOOK_SECRET=secret;
  process.env.STRIPE_PRICE_IDS=JSON.stringify(Object.fromEntries(Object.keys(PLANS).map(k=>[k,`price_${k}`])));
  process.env.APP_URL='https://example.com';
  handlers=require('../functions/index');admin=getFirestore();
});
after(async()=>env?.cleanup());
beforeEach(async()=>{await env.clearFirestore();await env.clearStorage();currentSub=subscription();priceOverride=null;checkoutSessions.clear();});
async function seed(planId='entusiastas',overrides={}) {
  const {PLANS}=require('../functions/policy'),p=PLANS[planId];
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,'users/owner'),{workspaceId:'owner'});
    await setDoc(doc(db,'workspaces/owner'),{ownerId:'owner',planId,status:'active',expiresAt:Date.now()+60000,seatLimit:p.seats,memberCount:1,fileCount:0,modules:p.modules,...overrides});
    await setDoc(doc(db,'workspaces/owner/members/owner'),{email:'owner@example.com',role:'owner'});
    await setDoc(doc(db,'workspaces/owner/flows/current'),{nodes:[]});
  });
}
test('browser cannot forge its plan, workspace membership, counts or flow',async()=>{
  await seed();const db=env.authenticatedContext('owner').firestore();
  await assertSucceeds(getDoc(doc(db,'workspaces/owner')));
  for(const path of ['users/owner','workspaces/owner','workspaces/owner/members/attacker','workspaces/owner/files/forged','workspaces/owner/flows/current'])await assertFails(setDoc(doc(db,path),{planId:'companhias',seatLimit:2000}));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'workspaces/owner')));
  await assertFails(getDoc(doc(env.authenticatedContext('stranger').firestore(),'workspaces/owner')));
});
test('flow data denied to cheaper, expired, canceled and over-capacity workspaces',async()=>{
  const db=env.authenticatedContext('owner').firestore();
  for(const [plan,patch] of [['estudantes',{}],['pilotos',{expiresAt:0}],['pilotos',{status:'canceled'}],['pilotos',{memberCount:2}]]){
    await seed(plan,patch);await assertFails(getDoc(doc(db,'workspaces/owner/flows/current')));
  }
  await seed('pilotos');await assertSucceeds(getDoc(doc(db,'workspaces/owner/flows/current')));
});
test('concurrent last-slot uploads atomically reserve just one file',async()=>{
  await seed();
  const results=await Promise.allSettled([1,2].map(()=>handlers.reserveFile.run(request('owner',{name:'manual.txt',size:4,contentType:'text/plain'}))));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await admin.doc('workspaces/owner').get()).data().fileCount,1);
  await assert.rejects(handlers.reserveFile.run(request('owner',{name:'more.txt',size:4,contentType:'text/plain'})),/Limite/);
});
test('Storage needs a server reservation; rejects wrong size, type, user and overwrite',async()=>{
  await seed();const owner=env.authenticatedContext('owner',{email_verified:true}).storage('gs://demo-easymanual.appspot.com');
  await assertFails(uploadBytes(ref(owner,'workspaces/owner/forged'),new Uint8Array(4),{contentType:'text/plain'}));
  const f=await handlers.reserveFile.run(request('owner',{name:'manual.txt',size:4,contentType:'text/plain'}));
  await assertFails(uploadBytes(ref(owner,f.path),new Uint8Array(3),{contentType:'text/plain'}));
  await assertFails(uploadBytes(ref(owner,f.path),new Uint8Array(4),{contentType:'application/pdf'}));
  const stranger=env.authenticatedContext('stranger',{email_verified:true}).storage('gs://demo-easymanual.appspot.com');
  await assertFails(uploadBytes(ref(stranger,f.path),new Uint8Array(4),{contentType:'text/plain'}));
  await assertSucceeds(uploadBytes(ref(owner,f.path),new Uint8Array(4),{contentType:'text/plain'}));
  await assertFails(uploadBytes(ref(owner,f.path),new Uint8Array(4),{contentType:'text/plain'}));
});
test('expired reservation cannot create an object',async()=>{
  await seed();const f=await handlers.reserveFile.run(request('owner',{name:'manual.txt',size:4,contentType:'text/plain'}));
  await admin.doc(`workspaces/owner/files/${f.fileId}`).update({expiresAt:AdminTimestamp.fromMillis(0)});
  await assertFails(uploadBytes(ref(env.authenticatedContext('owner',{email_verified:true}).storage('gs://demo-easymanual.appspot.com'),f.path),new Uint8Array(4),{contentType:'text/plain'}));
});
test('server rejects unauthorized module use and unverified uploads',async()=>{
  await seed();
  await assert.rejects(handlers.authorizeModule.run(request('owner',{module:'flow-map'})),/plano/);
  await assert.rejects(handlers.saveFlow.run(request('owner',{nodes:[]})),/plano/);
  await assert.rejects(handlers.authorizeModule.run(request('stranger',{module:'chat-de-busca'})));
  await assert.rejects(handlers.reserveFile.run({...request('owner',{name:'manual.txt',size:4,contentType:'text/plain'}),auth:{uid:'owner',token:{email_verified:false}}}),/Verifique/);
});
test('concurrent team joins cannot exceed seats, invite is email-bound and single-use',async()=>{
  await seed('escolas',{memberCount:29});
  await handlers.initializeWorkspace.run(request('alice'));await handlers.initializeWorkspace.run(request('bob'));
  const a=await handlers.createInvite.run(request('owner',{email:'alice@example.com'}));
  const b=await handlers.createInvite.run(request('owner',{email:'bob@example.com'}));
  await assert.rejects(handlers.joinWorkspace.run(request('bob',{code:a.code})),/Convite/);
  const results=await Promise.allSettled([handlers.joinWorkspace.run(request('alice',{code:a.code})),handlers.joinWorkspace.run(request('bob',{code:b.code}))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await admin.doc('workspaces/owner').get()).data().memberCount,30);
  const winner=results[0].status==='fulfilled'?'alice':'bob',code=winner==='alice'?a.code:b.code;
  await assert.rejects(handlers.joinWorkspace.run(request(winner,{code})),/Convite/);
  await assert.rejects(handlers.removeMember.run(request(winner,{uid:'owner'})),/titular/);
  await handlers.removeMember.run(request('owner',{uid:winner}));
  await assertFails(getDoc(doc(env.authenticatedContext(winner).firestore(),'workspaces/owner')));
});

test('finalization stores real upload; removal releases quota and permits a new upload',async()=>{
  await seed();const f=await handlers.reserveFile.run(request('owner',{name:'manual.txt',size:4,contentType:'text/plain'}));
  const storage=env.authenticatedContext('owner',{email_verified:true}).storage('gs://demo-easymanual.appspot.com');
  await uploadBytes(ref(storage,f.path),new Uint8Array(4),{contentType:'text/plain'});
  await handlers.finalizeFile.run(request('owner',{fileId:f.fileId}));
  assert.equal((await admin.doc(`workspaces/owner/files/${f.fileId}`).get()).data().status,'ready');
  await assertSucceeds(getBytes(ref(storage,f.path)));
  await handlers.removeFile.run(request('owner',{fileId:f.fileId}));
  await handlers.removeFile.run(request('owner',{fileId:f.fileId}));
  assert.equal((await admin.doc('workspaces/owner').get()).data().fileCount,0);
  await assertSucceeds(handlers.reserveFile.run(request('owner',{name:'next.txt',size:4,contentType:'text/plain'})));
});
test('webhook checks signature, applies active subscription and revokes past-due/canceled access',async()=>{
  await seed('pilotos',{customerId:'cus_owner',status:'inactive'});
  assert.equal(await webhook('customer.subscription.updated',100,false),400);
  assert.equal((await admin.doc('workspaces/owner').get()).data().status,'inactive');
  assert.equal(await webhook(),200);
  await handlers.authorizeModule.run(request('owner',{module:'flow-map'}));
  currentSub.status='past_due';await webhook('customer.subscription.updated',101);
  await assert.rejects(handlers.authorizeModule.run(request('owner',{module:'flow-map'})),/plano/);
  currentSub.status='canceled';await webhook('customer.subscription.deleted',102);
  assert.equal((await admin.doc('workspaces/owner').get()).data().status,'canceled');
});
test('old events/subscriptions cannot revoke newer access and unknown prices cannot grant it',async()=>{
  await seed('pilotos',{customerId:'cus_owner'});
  await webhook('customer.subscription.updated',200);
  currentSub.status='canceled';await webhook('customer.subscription.deleted',100);
  assert.equal((await admin.doc('workspaces/owner').get()).data().status,'active');
  currentSub=subscription({id:'older-sub',created:1,status:'canceled'});await webhook('customer.subscription.deleted',300);
  assert.equal((await admin.doc('workspaces/owner').get()).data().status,'active');
  currentSub=subscription({id:'new-sub',created:20});currentSub.items.data[0].price.id='unmapped';
  await webhook('customer.subscription.updated',400);
  await assert.rejects(handlers.authorizeModule.run(request('owner',{module:'flow-map'})),/plano/);
});
test('checkout reuses one server-priced session, rejects another pending plan and cannot activate access',async()=>{
  await seed('pilotos',{status:'inactive'});
  const result=await handlers.createCheckout.run(request('owner',{planId:'pilotos',amount:1}));
  assert.match(result.url,/checkout.stripe/);
  await handlers.createCheckout.run(request('owner',{planId:'pilotos'}));
  assert.equal(checkoutSessions.size,1);
  assert.equal([...checkoutSessions.values()][0].params.line_items[0].price,'price_pilotos');
  assert.equal((await admin.doc('workspaces/owner').get()).data().status,'inactive');
  await assert.rejects(handlers.createCheckout.run(request('owner',{planId:'estudantes'})),/pagamento em aberto/);
});
test('checkout rejects misconfigured annual prices and non-owners',async()=>{
  await seed('pilotos',{status:'inactive'});
  priceOverride={id:'price_pilotos',currency:'brl',unit_amount:1,recurring:{interval:'year',interval_count:1}};
  await assert.rejects(handlers.createCheckout.run(request('owner',{planId:'pilotos'})),/Preço anual/);
  await admin.doc('users/member').set({workspaceId:'owner'});await admin.doc('workspaces/owner/members/member').set({email:'member@example.com',role:'member'});
  await assert.rejects(handlers.createCheckout.run(request('member',{planId:'pilotos'})),/titular/);
});
