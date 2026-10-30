// Firebase Hosting supplies public app configuration; no private keys belong here.
const sdkVersion='12.0.0';
const sdk=name=>import(`https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-${name}.js`);
let auth, db, storage, functions, A, F, D, S, user, workspace, workspaceId;
let authReady=false, unsubscribeUser=()=>{}, workspaceSubscriptions=[], epoch=0, expiresTimer;
let loadedFlow=false, members=[];
const $=id=>document.getElementById(id);
const errors={
  'auth/invalid-credential':'E-mail ou senha incorretos.',
  'auth/invalid-email':'Informe um e-mail válido.',
  'auth/email-already-in-use':'Este e-mail já possui uma conta. Entre ou recupere a senha.',
  'auth/weak-password':'Use uma senha com pelo menos 6 caracteres.',
  'auth/popup-blocked':'Permita pop-ups para entrar com o Google.',
  'auth/popup-closed-by-user':'O login com Google foi cancelado.',
  'auth/account-exists-with-different-credential':'Este e-mail usa outro método de login. Entre com o método original.',
  'auth/requires-recent-login':'Entre novamente para alterar e-mail ou senha.',
  'auth/too-many-requests':'Muitas tentativas. Aguarde um pouco e tente novamente.',
  'auth/network-request-failed':'Não foi possível conectar. Confira sua conexão.',
  'auth/operation-not-allowed':'Este método de login ainda não foi ativado no Firebase.',
  'auth/unauthorized-domain':'Este domínio ainda não foi autorizado no Firebase.',
  'functions/internal':'O serviço não pôde concluir a operação. Tente novamente.',
  'functions/unavailable':'Serviço indisponível. Tente novamente em instantes.'
};
function notify(message) {
  $('account-message-text').textContent=message;
  const dialog=$('account-message');
  if(!dialog.open)dialog.showModal();
}
function errorMessage(error) {return errors[error.code] || (error.code?.startsWith('functions/')?error.message:'Não foi possível concluir a operação. Confira a configuração do serviço e tente novamente.');}
async function run(task,button) {
  if(button?.dataset.busy)return;
  if(button){button.dataset.busy='true';button.disabled=true;}
  try {if(!await ready)return notify('Login indisponível. Configure os serviços Firebase conforme o guia do projeto.');if(!authReady)throw new Error('auth-not-ready');return await task();}
  catch(error){notify(errorMessage(error));}
  finally{if(button){delete button.dataset.busy;button.disabled=false;}}
}
async function call(name,data={}) {return (await F.httpsCallable(functions,name)(data)).data;}
function permissions() {
  const active=!!user && workspace?.status==='active' && workspace.expiresAt>Date.now();
  return {active,modules:active&&workspace.memberCount<=workspace.seatLimit?workspace.modules||[]:[]};
}
function canAccess(module,explain=true) {
  let message;
  if(!authReady)message='Aguarde a verificação da sessão.';
  else if(!user)message='Entre na sua conta para acessar o workspace.';
  else if(!workspace)message='Aguarde o carregamento do workspace.';
  else if(!permissions().modules.includes(module))message='Seu plano não permite este módulo. Confira sua assinatura e o limite de usuários em Minha conta.';
  if(message){if(explain)notify(message);return false;}
  return true;
}
function resetWorkspace() {
  workspaceSubscriptions.forEach(stop=>stop());workspaceSubscriptions=[];
  clearTimeout(expiresTimer);members=[];workspace=null;workspaceId=null;loadedFlow=false;
  if($('flow-dialog').open)$('flow-dialog').close();
  appState.flowNodes=[];renderFlowMap();
  closeAcquireModal();appState.selectedPlanForPurchase=null;
  for(const field of ['acc-name','acc-email','acc-password','login-password','reg-password','reg-confirm-password','invite-email','invite-result','join-code'])$(field).value='';
  $('sources-list').replaceChildren();$('team-members').replaceChildren();
  $('treinamento-messages').replaceChildren();$('pane-results-container').replaceChildren();
  $('treinamento-input').value='';$('pane-search-input').value='';
  renderAccess();
}
function renderAccess() {
  const p=permissions();
  appState.user={isLoggedIn:!!user,name:user?.displayName||user?.email?.split('@')[0]||'',email:user?.email||'',plan:p.active?planNames[workspace.planId]||'Plano ativo':'Sem plano ativo'};
  updateAuthUI();
  $('workspace-plan-status').textContent=appState.user.plan+(workspace?` · ${workspace.memberCount}/${p.active?workspace.seatLimit:0} usuários`:'');
  $('account-plan-description').textContent=p.active?(workspace.memberCount>workspace.seatLimit?'Limite de usuários excedido. Remova membros para liberar os módulos.':'Acesso conforme os módulos contratados.'):'Escolha um plano para liberar seu workspace.';
  const isOwner=user && workspace?.ownerId===user.uid;
  $('manage-subscription').hidden=!isOwner||!workspace.customerId;
  $('invite-team').hidden=!isOwner||!p.active||workspace.seatLimit<=1;
  renderMembers();
  $('verification-controls').hidden=!user||user.emailVerified;
  for(const module of ['upload-de-arquivos','chat-de-busca','treinamento','flow-map']) {
    const btn=$('tab-btn-'+module), allowed=p.modules.includes(module);
    btn.setAttribute('aria-disabled',String(!allowed));
    btn.title=allowed?'Abrir módulo':'Indisponível no plano atual';btn.style.opacity=allowed?'1':'.5';
  }
  $('sidebar-doc-count').textContent=`${workspace?.fileCount||0} / ${p.active?(workspace.planId==='entusiastas'?'1':'ilimitados'):'0'} arquivos`;
  if(appState.currentScreen==='app-workspace' && !p.modules.includes(appState.activeWorkspaceTab)) {
    const fallback=p.modules[0];
    if(fallback)switchWorkspaceTab(fallback);else navigateTo(user?'alteracao-de-conta':'login');
  }
  if(!p.modules.includes('flow-map')) {appState.flowNodes=[];renderFlowMap();loadedFlow=false;}
  clearTimeout(expiresTimer);
  if(p.active)expiresTimer=setTimeout(renderAccess,Math.min(workspace.expiresAt-Date.now()+50,2147483647));
}
const planNames={entusiastas:'Entusiastas',estudantes:'Estudantes',pilotos:'Pilotos Operacionais',escolas:'Escolas / CIACs',taxi:'Táxi Aéreo',companhias:'Companhias Aéreas'};
function listenWorkspace(id,sessionEpoch) {
  resetWorkspace();workspaceId=id;
  const ref=D.doc(db,'workspaces',id);
  const onError=error=>{resetWorkspace();notify(errorMessage(error));};
  workspaceSubscriptions.push(D.onSnapshot(ref,snap=>{
    if(sessionEpoch!==epoch||workspaceId!==id)return;
    workspace=snap.data();renderAccess();
    if(canAccess('flow-map',false)&&!loadedFlow) {
      loadedFlow=true;
      D.getDoc(D.doc(db,'workspaces',id,'flows','current')).then(flow=>{
        if(sessionEpoch!==epoch||workspaceId!==id||!canAccess('flow-map',false))return;
        if(flow.exists()){appState.flowNodes=flow.data().nodes;renderFlowMap();}else applyPresetFlow('cockpit-prep');
      }).catch(error=>{loadedFlow=false;notify(errorMessage(error));});
    }
  },onError));
  workspaceSubscriptions.push(D.onSnapshot(D.collection(ref,'files'),snap=>{
    if(sessionEpoch!==epoch||workspaceId!==id)return;
    $('sources-list').replaceChildren();
    for(const record of snap.docs) {
      const f=record.data(),row=document.createElement('div');row.className='p-4 rounded-xl bg-[#0D0B34] border border-[#1E1B56] flex items-center justify-between gap-4';
      const label=document.createElement('span');label.textContent=`${f.name} · ${(f.size/1048576).toFixed(1)} MB · ${f.status==='ready'?'Armazenado':f.status==='deleting'?'Removendo':'Upload pendente'}`;
      const remove=document.createElement('button');remove.textContent='Remover';remove.type='button';remove.className='text-amber-400 text-xs';remove.onclick=()=>run(()=>call('removeFile',{fileId:record.id}),remove);
      row.append(label,remove);$('sources-list').append(row);
    }
  },onError));
  workspaceSubscriptions.push(D.onSnapshot(D.collection(ref,'members'),snap=>{
    if(sessionEpoch!==epoch||workspaceId!==id)return;
    $('team-members').replaceChildren();
    members=snap.docs.map(record=>({id:record.id,...record.data()}));renderMembers();
  },onError));
}
function renderMembers() {
  $('team-members').replaceChildren();
  for(const m of members) {
    const row=document.createElement('div');row.className='flex justify-between gap-3 py-2';
    const label=document.createElement('span');label.textContent=`${m.email} (${m.role==='owner'?'Titular':'Membro'})`;row.append(label);
    if(workspace?.ownerId===user?.uid && m.id!==user.uid) {
      const remove=document.createElement('button');remove.type='button';remove.textContent='Remover';remove.onclick=()=>run(()=>call('removeMember',{uid:m.id}),remove);row.append(remove);
    }
    $('team-members').append(row);
  }
}
const ready=(async()=>{
  try {
    const response=await fetch('/__/firebase/init.json');
    if(!response.ok)throw new Error('missing-config');
    const config=await response.json();
    if(!config.apiKey||!config.projectId)throw new Error('missing-config');
    const [app,...modules]=await Promise.all([sdk('app'),sdk('auth'),sdk('firestore'),sdk('functions'),sdk('storage')]);
    [A,D,F,S]=modules;
    const firebase=app.initializeApp(config);auth=A.getAuth(firebase);db=D.getFirestore(firebase);storage=S.getStorage(firebase);functions=F.getFunctions(firebase,'us-central1');
    A.useDeviceLanguage(auth);
    await A.setPersistence(auth,A.browserLocalPersistence);
    A.onAuthStateChanged(auth,async next=>{
      const sessionEpoch=++epoch;unsubscribeUser();resetWorkspace();user=next;authReady=true;renderAccess();
      if(!next)return;
      try {
        await call('initializeWorkspace');
        if(sessionEpoch!==epoch)return;
        unsubscribeUser=D.onSnapshot(D.doc(db,'users',next.uid),snap=>{
          if(sessionEpoch!==epoch)return;
          if(snap.exists()) {if(workspaceId!==snap.data().workspaceId)listenWorkspace(snap.data().workspaceId,sessionEpoch);}
          else {resetWorkspace();notify('Seu acesso à equipe foi encerrado. Entre novamente para criar um workspace pessoal.');}
        },error=>notify(errorMessage(error)));
        if(['login','cadastro'].includes(appState.currentScreen))navigateTo('alteracao-de-conta');
      }catch(error){notify(errorMessage(error));}
    });
    if(new URLSearchParams(location.search).has('billing')) {
      notify(new URLSearchParams(location.search).get('billing')==='success'?'Pagamento recebido. O acesso será liberado quando a assinatura for confirmada pelo provedor.':'Pagamento cancelado. Seu plano permanece como antes.');
      history.replaceState(null,'',location.pathname);
    }
    return true;
  }catch {
    authReady=true;
    $('auth-service-status').textContent='Login indisponível: configure e publique os serviços Firebase conforme o guia do projeto.';
    return false;
  }
})();
window.EasyAccount={
  notify,canAccess,run,
  login:e=>{e.preventDefault();return run(async()=>{await A.signInWithEmailAndPassword(auth,$('login-email').value.trim(),$('login-password').value);$('login-password').value='';},e.submitter);},
  google:button=>run(()=>A.signInWithPopup(auth,new A.GoogleAuthProvider()),button),
  register:e=>{e.preventDefault();return run(async()=>{
    const password=$('reg-password').value;
    if(password!==$('reg-confirm-password').value)return notify('As senhas não coincidem.');
    if(!$('reg-terms').checked)return notify('Aceite os termos para criar sua conta.');
    const result=await A.createUserWithEmailAndPassword(auth,$('reg-email').value.trim(),password);
    await A.updateProfile(result.user,{displayName:$('reg-name').value.trim()});renderAccess();
    $('reg-password').value='';$('reg-confirm-password').value='';
    await A.sendEmailVerification(result.user);notify('Conta criada. Verifique seu e-mail para assinar e enviar arquivos.');
  },e.submitter);},
  reset:button=>run(async()=>{const email=$('login-email').value.trim();if(!email)return notify('Preencha seu e-mail para recuperar a senha.');await A.sendPasswordResetEmail(auth,email);notify('Se existir uma conta para este e-mail, você receberá as instruções de recuperação.');},button),
  verify:button=>run(async()=>{await A.sendEmailVerification(user);notify('Enviamos um novo e-mail de verificação.');},button),
  reload:button=>run(async()=>{await A.reload(user);await user.getIdToken(true);renderAccess();},button),
  update:e=>{e.preventDefault();return run(async()=>{
    await A.updateProfile(user,{displayName:$('acc-name').value.trim()});
    if($('acc-password').value){await A.updatePassword(user,$('acc-password').value);$('acc-password').value='';}
    if($('acc-email').value.trim()!==user.email){await A.verifyBeforeUpdateEmail(user,$('acc-email').value.trim());notify('Confirme o novo e-mail pelo link enviado.');}
    else notify('Dados da conta atualizados.');renderAccess();
  },e.submitter);},
  logout:()=>run(async()=>{await A.signOut(auth);navigateTo('pagina-inicial');}),
  checkout:e=>{e.preventDefault();return run(async()=>{const planId=Object.keys(planNames).find(k=>planNames[k]===appState.selectedPlanForPurchase?.name);const result=await call('createCheckout',{planId});location.assign(result.url);},e.submitter);},
  portal:button=>run(async()=>location.assign((await call('billingPortal')).url),button),
  authorize:module=>run(async()=>{if(!canAccess(module))return false;const startEpoch=epoch;await call('authorizeModule',{module});return startEpoch===epoch&&canAccess(module,false);}),
  upload:files=>run(async()=>{
    if(!canAccess('upload-de-arquivos'))return;
    const uploadEpoch=epoch, wid=workspaceId;
    for(const file of files) {
      if(uploadEpoch!==epoch||workspaceId!==wid)break;
      const contentType=/\.pdf$/i.test(file.name)?'application/pdf':/\.txt$/i.test(file.name)?'text/plain':null;
      if(!contentType||file.size<=0||file.size>20*1048576){notify('Envie arquivos PDF ou TXT com até 20 MB.');break;}
      let reservation;
      try {
        reservation=await call('reserveFile',{name:file.name,size:file.size,contentType});
        await S.uploadBytes(S.ref(storage,reservation.path),file,{contentType});
        if(uploadEpoch!==epoch||workspaceId!==wid)break;
        await call('finalizeFile',{fileId:reservation.fileId});
      }catch(error){
        if(reservation&&uploadEpoch===epoch&&workspaceId===wid)await call('removeFile',{fileId:reservation.fileId}).catch(()=>{});
        throw error;
      }
    }
    $('manual-file-input').value='';
  }),
  saveFlow:button=>run(async()=>{await call('saveFlow',{nodes:appState.flowNodes});notify('Flow salvo no workspace.');},button),
  invite:e=>{e.preventDefault();return run(async()=>{const result=await call('createInvite',{email:$('invite-email').value});$('invite-result').value=result.code;notify('Convite criado por 24 horas. Copie o código e compartilhe com o titular do e-mail informado.');},e.submitter);},
  join:e=>{e.preventDefault();return run(async()=>{await call('joinWorkspace',{code:$('join-code').value.trim()});$('join-code').value='';notify('Você entrou no workspace da equipe.');},e.submitter);}
};
