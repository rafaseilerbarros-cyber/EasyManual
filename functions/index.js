'use strict';
const {onCall,onRequest,HttpsError}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {defineSecret,defineString}=require('firebase-functions/params');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore,Timestamp,FieldValue}=require('firebase-admin/firestore');
const {getStorage}=require('firebase-admin/storage');
const {randomBytes,createHash}=require('node:crypto');
const {PLANS,entitlements,canUpload,validFile,validFlow}=require('./policy');
initializeApp();
const db=getFirestore();
const stripeKey=defineSecret('STRIPE_SECRET_KEY');
const webhookKey=defineSecret('STRIPE_WEBHOOK_SECRET');
const priceIds=defineSecret('STRIPE_PRICE_IDS');
const appUrl=defineString('APP_URL');
const stripe=()=>require('stripe')(stripeKey.value());
const prices=()=>JSON.parse(priceIds.value());
const fail=(code,message)=>{throw new HttpsError(code,message);};
function uidOf(req) {if(!req.auth)fail('unauthenticated','Entre na sua conta.');return req.auth.uid;}
function requireLiveBilling() {if(process.env.FUNCTIONS_EMULATOR==='true' && process.env.GCLOUD_PROJECT==='demo-easymanual')fail('failed-precondition','Pagamentos estão desativados no ambiente local. A conta de teste já tem acesso completo.');}
function verified(req) {uidOf(req);if(!req.auth.token.email_verified)fail('permission-denied','Verifique seu e-mail antes de continuar.');}
function id(value) {if(typeof value!=='string'||! /^[\w-]{1,128}$/.test(value))fail('invalid-argument','Identificador inválido.');return value;}
async function workspace(req,tx) {
  const uid=uidOf(req), get=ref=>tx?tx.get(ref):ref.get();
  const u=await get(db.doc(`users/${uid}`));
  if(!u.exists)fail('failed-precondition','Inicialize sua conta.');
  const ref=db.doc(`workspaces/${id(u.data().workspaceId)}`), snapshot=await get(ref);
  const m=await get(ref.collection('members').doc(uid));
  if(!snapshot.exists||!m.exists)fail('permission-denied','Sem acesso ao workspace.');
  return {ref,w:snapshot.data(),uid};
}
function owner(ctx) {if(ctx.w.ownerId!==ctx.uid)fail('permission-denied','Somente o titular pode gerenciar o workspace.');}
function allow(w,module) {if(!entitlements(w).modules.includes(module))fail('permission-denied','Seu plano não permite este módulo. Confira a assinatura e o limite de usuários.');}
exports.initializeWorkspace=onCall(async req=>{
  const uid=uidOf(req), user=db.doc(`users/${uid}`), ref=db.doc(`workspaces/${uid}`);
  await db.runTransaction(async tx=>{
    const [u,w]=await Promise.all([tx.get(user),tx.get(ref)]);
    if(!u.exists) {
      if(!w.exists) {
        tx.create(ref,{ownerId:uid,planId:null,status:'inactive',expiresAt:0,memberCount:1,fileCount:0});
        tx.create(ref.collection('members').doc(uid),{email:req.auth.token.email||'',role:'owner'});
      }
      tx.create(user,{workspaceId:uid});
    }
  });
  return {ok:true};
});
exports.authorizeModule=onCall(async req=>{const {w}=await workspace(req);allow(w,req.data?.module);return {ok:true};});
const billingOptions={secrets:[stripeKey,priceIds]};
exports.createCheckout=onCall(billingOptions,async req=>{
  requireLiveBilling();verified(req);
  const {ref,w,uid}=await workspace(req);owner({w,uid});
  const planId=req.data?.planId, plan=PLANS[planId];
  if(!plan||!prices()[planId])fail('invalid-argument','Plano indisponível.');
  if(w.memberCount>plan.seats)fail('failed-precondition','Remova usuários antes de reduzir o plano.');
  const s=stripe();
  // Existing subscriptions are changed in the portal, never bought a second time.
  if(w.subscriptionId) {
    const sub=await s.subscriptions.retrieve(w.subscriptionId);
    if(!['canceled','incomplete_expired'].includes(sub.status))fail('failed-precondition','Use Gerenciar assinatura para alterar seu plano.');
  }
  if(w.customerId) {
    const existing=await s.subscriptions.list({customer:w.customerId,status:'all',limit:100});
    if(existing.data.some(sub=>!['canceled','incomplete_expired'].includes(sub.status)))
      fail('failed-precondition','Já existe uma assinatura. Use Gerenciar assinatura ou aguarde a confirmação do pagamento.');
  }
  const price=await s.prices.retrieve(prices()[planId]);
  if(price.currency!=='brl'||price.unit_amount!==plan.amount||price.recurring?.interval!=='year'||price.recurring.interval_count!==1)
    fail('failed-precondition','Preço anual não configurado corretamente.');
  // A stable customer and Checkout session prevent duplicate purchases on retries.
  const customer=w.customerId || (await s.customers.create({email:req.auth.token.email,metadata:{workspaceId:ref.id}}, {idempotencyKey:`customer-${ref.id}`})).id;
  await ref.update({customerId:customer});
  const billing=db.doc(`billing/${ref.id}`);
  const checkout=await db.runTransaction(async tx=>{
    const snap=await tx.get(billing), previous=snap.data();
    if(previous && previous.expiresAt>Date.now()) {
      if(previous.planId!==planId)fail('failed-precondition','Há um pagamento em aberto para outro plano. Conclua-o ou aguarde 35 minutos.');
      return previous;
    }
    const created=Math.floor(Date.now()/1000);
    const next={key:randomBytes(16).toString('hex'),planId,created,expiresAt:(created+2100)*1000};
    tx.set(billing,next);return next;
  });
  if(checkout.sessionId) {
    const previous=await s.checkout.sessions.retrieve(checkout.sessionId);
    if(previous.status==='open')return {url:previous.url};
    fail('failed-precondition','Aguarde a confirmação do pagamento ou a expiração do checkout antes de tentar novamente.');
  }
  const key=checkout.key;
  const session=await s.checkout.sessions.create({mode:'subscription',customer,line_items:[{price:price.id,quantity:1}],
    expires_at:checkout.created+1800,client_reference_id:ref.id,subscription_data:{metadata:{workspaceId:ref.id}},
    success_url:`${appUrl.value()}/?billing=success`,cancel_url:`${appUrl.value()}/?billing=cancel`}, {idempotencyKey:key});
  await billing.update({sessionId:session.id});
  return {url:session.url};
});
exports.billingPortal=onCall({secrets:[stripeKey]},async req=>{
  requireLiveBilling();verified(req);const ctx=await workspace(req);owner(ctx);
  if(!ctx.w.customerId)fail('failed-precondition','Nenhuma assinatura encontrada.');
  return {url:(await stripe().billingPortal.sessions.create({customer:ctx.w.customerId,return_url:appUrl.value()})).url};
});
exports.stripeWebhook=onRequest({secrets:[stripeKey,webhookKey,priceIds]},async(req,res)=>{
  if(process.env.FUNCTIONS_EMULATOR==='true' && process.env.GCLOUD_PROJECT==='demo-easymanual')return res.sendStatus(503);
  if(req.method!=='POST')return res.sendStatus(405);
  let event;
  try{event=stripe().webhooks.constructEvent(req.rawBody,req.headers['stripe-signature'],webhookKey.value());}
  catch{return res.status(400).send('Invalid signature');}
  if(!['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type))return res.sendStatus(200);
  try {
    const sub=await stripe().subscriptions.retrieve(event.data.object.id);
    const workspaceId=sub.metadata.workspaceId;
    if(!workspaceId)return res.sendStatus(200);
    id(workspaceId);
    const item=sub.items.data[0], price=item?.price;
    const planId=Object.keys(PLANS).find(k=>prices()[k]===price?.id);
    const plan=PLANS[planId];
    const valid=plan && price.currency==='brl' && price.unit_amount===plan.amount && price.recurring?.interval==='year' && price.recurring.interval_count===1 && sub.items.data.length===1 && item.quantity===1;
    const expiresAt=(item?.current_period_end||sub.current_period_end||0)*1000;
    await db.runTransaction(async tx=>{
      const ref=db.doc(`workspaces/${workspaceId}`), snap=await tx.get(ref);
      if(!snap.exists)return;
      const w=snap.data();
      if(w.customerId!==sub.customer)return;
      // An old canceled subscription must never revoke a newer paid subscription.
      if(w.subscriptionCreated && w.subscriptionCreated>sub.created)return;
      if(w.subscriptionId===sub.id && (w.billingEventCreated||0)>event.created)return;
      tx.update(ref,{subscriptionId:sub.id,subscriptionCreated:sub.created,billingEventCreated:event.created,
        planId:valid?planId:null,status:valid&&sub.status==='active'?'active':sub.status==='active'?'invalid':sub.status,
        expiresAt,seatLimit:valid?plan.seats:0,modules:valid?plan.modules:[]});
    });
    return res.sendStatus(200);
  }catch(error){console.error('Subscription synchronization failed',error.type||error.code||'unknown');return res.sendStatus(500);}
});
exports.reserveFile=onCall(async req=>{
  verified(req);if(!validFile(req.data))fail('invalid-argument','Envie PDF ou TXT com até 20 MB.');
  const fileId=randomBytes(16).toString('hex');
  return db.runTransaction(async tx=>{
    const {ref,w,uid}=await workspace(req,tx);
    if(!canUpload(w))fail('resource-exhausted','Limite de arquivos atingido ou plano inativo.');
    tx.create(ref.collection('files').doc(fileId),{name:req.data.name,size:req.data.size,contentType:req.data.contentType,
      uploaderId:uid,status:'pending',expiresAt:Timestamp.fromMillis(Date.now()+3600000)});
    tx.update(ref,{fileCount:w.fileCount+1});
    return {fileId,path:`workspaces/${ref.id}/${fileId}`};
  });
});
exports.finalizeFile=onCall(async req=>{
  const {ref,w}=await workspace(req);allow(w,'upload-de-arquivos');
  const p=entitlements(w);
  if(p.files!==null && w.fileCount>p.files)fail('resource-exhausted','Remova arquivos excedentes antes de concluir o upload.');
  const fileId=id(req.data?.fileId), f=ref.collection('files').doc(fileId);
  const [metadata]=await getStorage().bucket().file(`workspaces/${ref.id}/${fileId}`).getMetadata();
  await db.runTransaction(async tx=>{
    const snap=await tx.get(f);if(!snap.exists)fail('not-found','Arquivo não encontrado.');
    const d=snap.data();
    if(d.status==='ready')return;
    if(d.status!=='pending'||Number(metadata.size)!==d.size||metadata.contentType!==d.contentType)fail('failed-precondition','Upload incompleto.');
    tx.update(f,{status:'ready',expiresAt:FieldValue.delete()});
  });return {ok:true};
});
async function deleteFile(ref,fileId,onlyExpired=false) {
  const f=ref.collection('files').doc(fileId);
  const shouldDelete=await db.runTransaction(async tx=>{
    const snap=await tx.get(f);
    if(!snap.exists)return false;
    const d=snap.data();
    if(onlyExpired && (!d.expiresAt || d.expiresAt.toMillis()>Date.now() || !['pending','deleting'].includes(d.status)))return false;
    tx.update(f,{status:'deleting',expiresAt:Timestamp.now()});return true;
  });
  if(!shouldDelete)return;
  await getStorage().bucket().file(`workspaces/${ref.id}/${fileId}`).delete({ignoreNotFound:true});
  await db.runTransaction(async tx=>{
    const [snap,w]=await Promise.all([tx.get(f),tx.get(ref)]);
    if(snap.exists){tx.delete(f);tx.update(ref,{fileCount:Math.max(0,w.data().fileCount-1)});}
  });
}
exports.removeFile=onCall(async req=>{const {ref}=await workspace(req);await deleteFile(ref,id(req.data?.fileId));return {ok:true};});
exports.cleanupUploads=onSchedule('every 60 minutes',async()=>{
  const stale=await db.collectionGroup('files').where('expiresAt','<',Timestamp.now()).limit(100).get();
  for(const file of stale.docs)await deleteFile(file.ref.parent.parent,file.id,true);
});
exports.saveFlow=onCall(async req=>{
  const {ref,w}=await workspace(req);allow(w,'flow-map');
  if(!validFlow(req.data?.nodes))fail('invalid-argument','Flow inválido (máximo 200 passos).');
  const nodes=req.data.nodes.map(({id,x,y,title})=>({id,x,y,title,desc:''}));
  await ref.collection('flows').doc('current').set({nodes});return {ok:true};
});
exports.createInvite=onCall(async req=>{
  verified(req);const ctx=await workspace(req);owner(ctx);
  const p=entitlements(ctx.w);
  if(!p.modules.length||ctx.w.memberCount>=p.seats)fail('resource-exhausted','Limite de usuários atingido.');
  const email=String(req.data?.email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fail('invalid-argument','Informe o e-mail do convidado.');
  const code=randomBytes(24).toString('hex'), hash=createHash('sha256').update(code).digest('hex');
  await db.doc(`invites/${hash}`).create({workspaceId:ctx.ref.id,email,expiresAt:Date.now()+86400000});
  return {code};
});
exports.joinWorkspace=onCall(async req=>{
  verified(req);const uid=uidOf(req), code=req.data?.code;
  if(typeof code!=='string'||! /^[a-f0-9]{48}$/.test(code))fail('invalid-argument','Código inválido.');
  const invite=db.doc(`invites/${createHash('sha256').update(code).digest('hex')}`);
  await db.runTransaction(async tx=>{
    const inv=await tx.get(invite);
    if(!inv.exists||inv.data().expiresAt<Date.now()||inv.data().email!==req.auth.token.email?.toLowerCase())fail('permission-denied','Convite inválido ou expirado para este e-mail.');
    const ref=db.doc(`workspaces/${id(inv.data().workspaceId)}`), old=await workspace(req,tx), target=await tx.get(ref), member=await tx.get(ref.collection('members').doc(uid));
    if(member.exists){tx.delete(invite);return;}
    if(old.ref.id!==uid||old.w.subscriptionId||old.w.fileCount||old.w.memberCount>1)fail('failed-precondition','Use uma conta sem assinatura e sem arquivos para entrar na equipe.');
    const w=target.data(), p=entitlements(w);
    if(!p.modules.length||w.memberCount>=p.seats)fail('resource-exhausted','Workspace sem vagas disponíveis.');
    tx.create(ref.collection('members').doc(uid),{email:req.auth.token.email,role:'member'});
    tx.update(ref,{memberCount:w.memberCount+1});tx.update(db.doc(`users/${uid}`),{workspaceId:ref.id});
    tx.delete(old.ref.collection('members').doc(uid));tx.delete(old.ref);tx.delete(invite);
  });return {ok:true};
});
exports.removeMember=onCall(async req=>{
  const target=id(req.data?.uid);
  await db.runTransaction(async tx=>{
    const ctx=await workspace(req,tx);owner(ctx);
    if(target===ctx.uid)fail('invalid-argument','O titular não pode ser removido.');
    const member=ctx.ref.collection('members').doc(target), m=await tx.get(member);
    if(!m.exists)return;
    tx.delete(member);tx.delete(db.doc(`users/${target}`));tx.update(ctx.ref,{memberCount:ctx.w.memberCount-1});
  });return {ok:true};
});
