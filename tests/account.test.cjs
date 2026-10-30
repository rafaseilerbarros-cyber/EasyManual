const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('../functions/node_modules/jsdom');
const html=fs.readFileSync('index.html','utf8');
const source=fs.readFileSync('assets/account.js','utf8').replace(/const sdk=name=>import\([^\n]+\);/,'const sdk=name=>Promise.resolve(window.__sdk[name]);');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function setup({configured=true,loggedIn=false,plan='entusiastas',emulatorConfig=false,hostname='example.com'}={}) {
  const dom=new JSDOM(html,{url:`https://${hostname}`,runScripts:'outside-only'}),w=dom.window,calls=[];
  w.lucide={createIcons(){}};w.ResizeObserver=class{observe(){}};w.IntersectionObserver=class{observe(){}};w.scrollTo=()=>{};w.matchMedia=()=>({matches:true,addEventListener(){}});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.fetch=async()=>({ok:configured,json:async()=>({apiKey:'public-config',projectId:'demo-easymanual',localEmulators:emulatorConfig})});
  let callback;
  const user=loggedIn?{uid:'owner',email:'owner@example.com',displayName:'Owner',emailVerified:true}:null;
  const {PLANS}=require('../functions/policy'),p=PLANS[plan];
  const workspace={ownerId:'owner',planId:plan,status:'active',expiresAt:Date.now()+60000,seatLimit:p.seats,memberCount:1,fileCount:0,modules:p.modules};
  const spy=name=>async(...args)=>{calls.push({name,args});};
  const auth={currentUser:user};
  const A={getAuth:()=>auth,useDeviceLanguage(){},browserLocalPersistence:'local',setPersistence:spy('persistence'),
    connectAuthEmulator:spy('authEmulator'),onAuthStateChanged:(a,cb)=>{callback=cb;queueMicrotask(()=>cb(user));},signInWithEmailAndPassword:spy('passwordLogin'),
    GoogleAuthProvider:class{},signInWithPopup:spy('googleLogin'),createUserWithEmailAndPassword:spy('register'),sendPasswordResetEmail:spy('reset'),
    signOut:async()=>{calls.push({name:'logout'});await callback(null);}};
  const D={connectFirestoreEmulator:spy('firestoreEmulator'),getFirestore:()=>({}),doc:(...args)=>args.filter(a=>typeof a==='string').join('/'),collection:(...args)=>args.filter(a=>typeof a==='string').join('/'),
    onSnapshot:(ref,cb)=>{queueMicrotask(()=>{
      if(ref==='users/owner')cb({exists:()=>true,data:()=>({workspaceId:'owner'})});
      else if(ref==='workspaces/owner')cb({data:()=>workspace});else cb({docs:[]});
    });return ()=>{};},getDoc:async()=>({exists:()=>false})};
  w.__sdk={app:{initializeApp:()=>({})},auth:A,firestore:D,functions:{connectFunctionsEmulator:spy('functionsEmulator'),getFunctions:()=>({}),httpsCallable:(f,name)=>async data=>{calls.push({name,args:[data]});return {data:{ok:true,url:'https://example.com/#checkout'}};}},storage:{connectStorageEmulator:spy('storageEmulator'),getStorage:()=>({})}};
  const main=[...w.document.scripts].find(s=>s.textContent.includes('const appState =')).textContent;
  const context=dom.getInternalVMContext();new (require('node:vm').Script)(main).runInContext(context);new (require('node:vm').Script)(source).runInContext(context);await flush();await flush();await flush();
  return {dom,w,calls,user,workspace,close:()=>dom.window.close()};
}
function event(w) {return {preventDefault(){},submitter:w.document.createElement('button')};}
test('logged-out workspace and account routes require login',async()=>{
  const t=await setup();try{
    t.w.navigateTo('app-workspace');assert(!t.w.document.getElementById('screen-login').classList.contains('hidden'));
    assert(!t.w.EasyAccount.canAccess('flow-map',false));
  }finally{t.close();}
});
test('password login sends both credentials to Firebase and clears password',async()=>{
  const t=await setup();try{
    t.w.document.getElementById('login-email').value='pilot@example.com';t.w.document.getElementById('login-password').value='secret-password';
    await t.w.EasyAccount.login(event(t.w));
    assert.deepEqual(t.calls.find(c=>c.name==='passwordLogin').args.slice(1),['pilot@example.com','secret-password']);
    assert.equal(t.w.document.getElementById('login-password').value,'');
  }finally{t.close();}
});
test('Google button invokes Firebase Google provider',async()=>{
  const t=await setup();try{await t.w.EasyAccount.google();assert(t.calls.some(c=>c.name==='googleLogin'));}finally{t.close();}
});
test('registration rejects password mismatch before creating any account',async()=>{
  const t=await setup();try{
    t.w.document.getElementById('reg-password').value='abcdef';t.w.document.getElementById('reg-confirm-password').value='different';
    await t.w.EasyAccount.register(event(t.w));assert(!t.calls.some(c=>c.name==='register'));
    assert.match(t.w.document.getElementById('account-message-text').textContent,/não coincidem/);
  }finally{t.close();}
});
test('Entusiastas locks training/flow; purchasing never changes local entitlements',async()=>{
  const t=await setup({loggedIn:true});try{
    assert(t.w.EasyAccount.canAccess('chat-de-busca',false));assert(!t.w.EasyAccount.canAccess('treinamento',false));
    t.w.acquirePlan({stopPropagation(){}},'Pilotos Operacionais','R$ 1.000,00/ano');
    await t.w.confirmPlanAcquisition(event(t.w));
    assert.equal(t.calls.find(c=>c.name==='createCheckout').args[0].planId,'pilotos');
    assert(!t.w.EasyAccount.canAccess('flow-map',false));
    assert.equal(t.w.document.getElementById('user-active-plan-title').textContent,'Entusiastas');
  }finally{t.close();}
});
test('logout clears documents, passwords, flow data and team invite codes',async()=>{
  const t=await setup({loggedIn:true,plan:'pilotos'});try{
    t.w.document.getElementById('acc-password').value='private';t.w.document.getElementById('invite-result').value='private-code';
    await t.w.EasyAccount.logout();assert(!t.w.EasyAccount.canAccess('flow-map',false));
    for(const id of ['acc-password','invite-result'])assert.equal(t.w.document.getElementById(id).value,'');
    assert.equal(t.w.document.getElementById('sources-list').children.length,0);
  }finally{t.close();}
});
test('missing Firebase config fails closed with actionable message',async()=>{
  const t=await setup({configured:false});try{
    await t.w.EasyAccount.google();assert(!t.calls.some(c=>c.name==='googleLogin'));
    assert.match(t.w.document.getElementById('account-message-text').textContent,/Configure/);
  }finally{t.close();}
});

test('local config connects all SDKs to emulators only on a loopback host',async()=>{
  const local=await setup({emulatorConfig:true,hostname:'127.0.0.1'});
  try {for(const name of ['authEmulator','firestoreEmulator','functionsEmulator','storageEmulator'])assert(local.calls.some(c=>c.name===name));}
  finally{local.close();}
  const publicSite=await setup({emulatorConfig:true});
  try {assert(!publicSite.calls.some(c=>c.name.endsWith('Emulator')));assert.match(publicSite.w.document.getElementById('auth-service-status').textContent,/indisponível/);}
  finally{publicSite.close();}
});
