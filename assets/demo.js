/* Temporary browser-only demonstration. Set DEMO_ENABLED=false to restore Firebase. */
(()=>{
  const DEMO_ENABLED=true;
  if(!DEMO_ENABLED)return;
  window.EasyManualDemo=true;
  const key='easymanual-static-demo-v1';
  let saved={name:'Admin',email:'admin@easymanual.local',files:[],nodes:null};
  try{const value=JSON.parse(localStorage.getItem(key));if(value&&typeof value==='object')saved={...saved,...value};}catch{}
  if(!Array.isArray(saved.files))saved.files=[];
  // Restore the five original UI examples once, preserving browser uploads.
  // These are references, not recovered PDF binaries or indexed documents.
  if(saved.uploadExamplesVersion!==1){
    const examples=[
      ['fcom-3','Airbus A320 FCOM Vol 3 - Emergency & Abnormal Procedures.pdf',4.2],
      ['qrh','Airbus A320 QRH - Quick Reference Handbook (Rev 22).pdf',3.4],
      ['fcom-1','Airbus A320 FCOM Vol 1 - Aircraft Systems Description.pdf',8.8],
      ['fctm','Airbus A320 FCTM - Flight Crew Training Manual.pdf',5.2],
      ['mel','Airbus A320 MEL - Minimum Equipment List (Rev 48).pdf',6.5]
    ];
    for(const [id,name,mb] of examples)if(!saved.files.some(file=>file.name===name))saved.files.push({id:'example-'+id,name,size:Math.round(mb*1048576),sample:true});
    saved.uploadExamplesVersion=1;
    try{localStorage.setItem(key,JSON.stringify(saved));}catch{}
  }
  const $=id=>document.getElementById(id);
  function notify(message){$('account-message-text').textContent=message;const d=$('account-message');if(!d.open)d.showModal();}
  function persist(){try{localStorage.setItem(key,JSON.stringify(saved));return true;}catch{notify('O navegador não permitiu salvar os dados. Você pode continuar usando esta demonstração, mas as alterações desta sessão podem não ser mantidas.');return false;}}
  function renderFiles(){
    $('sources-list').replaceChildren();
    saved.files.forEach(file=>{
      const row=document.createElement('div');row.className='p-4 rounded-xl bg-[#0D0B34] border border-[#1E1B56] flex items-center justify-between gap-4';
      const title=document.createElement('span');title.textContent=`${file.name} · ${(file.size/1048576).toFixed(1)} MB · ${file.sample?'Exemplo de manual (demonstração)':'Referência de arquivo (demo)'}`;
      const remove=document.createElement('button');remove.type='button';remove.textContent='Remover';remove.onclick=()=>{saved.files=saved.files.filter(f=>f.id!==file.id);persist();renderFiles();};
      row.append(title,remove);$('sources-list').append(row);
    });
    $('sidebar-doc-count').textContent=`${saved.files.length} arquivos de demonstração`;
  }
  function activate(){
    appState.user={isLoggedIn:true,name:typeof saved.name==='string'?saved.name:'Admin',email:typeof saved.email==='string'?saved.email:'admin@easymanual.local',plan:'Admin · Demonstração'};
    updateAuthUI();
    $('workspace-plan-status').textContent='Admin · Todos os módulos (demo)';
    $('account-plan-description').textContent='Demonstração aberta neste navegador. Nenhuma conta ou assinatura real é utilizada.';
    for(const id of ['manage-subscription','invite-team','verification-controls'])$(id).hidden=true;
    $('acc-password').disabled=true;$('acc-password').placeholder='Demonstração sem senha';
    document.querySelectorAll('[data-auth-status]').forEach(el=>{el.textContent='Modo de demonstração: você já está conectado como admin.';});
    const member=document.createElement('p');member.textContent='Admin — Titular da demonstração';$('team-members').replaceChildren(member);
    renderFiles();
    if(Array.isArray(saved.nodes)&&saved.nodes.every(n=>n&&typeof n.title==='string'&&Number.isFinite(n.x)&&Number.isFinite(n.y))) {appState.flowNodes=saved.nodes;renderFlowMap();}
    else applyPresetFlow('cockpit-prep');
    navigateTo('pagina-inicial');
  }
  const demoOnly=()=>notify('Esta é uma demonstração já conectada como admin. Cadastro, convites e pagamentos reais estão desativados.');
  window.EasyAccount={
    notify,canAccess:()=>true,authorize:async()=>true,run:async task=>{try{return await task();}catch{notify('Não foi possível concluir a ação na demonstração.');}},
    login:e=>{e.preventDefault();navigateTo('app-workspace');},google:()=>navigateTo('app-workspace'),
    register:e=>{e.preventDefault();demoOnly();},reset:demoOnly,verify:demoOnly,reload:demoOnly,
    logout:()=>{navigateTo('pagina-inicial');notify('A demonstração permanece conectada como admin. Nenhuma sessão real está em uso.');},
    update:e=>{e.preventDefault();saved.name=$('acc-name').value.trim()||'Admin';saved.email=$('acc-email').value.trim();persist();appState.user.name=saved.name;appState.user.email=saved.email;updateAuthUI();notify('Perfil da demonstração atualizado neste navegador.');},
    checkout:e=>{e.preventDefault();closeAcquireModal();demoOnly();},portal:demoOnly,invite:e=>{e.preventDefault();demoOnly();},join:e=>{e.preventDefault();demoOnly();},
    saveFlow:()=>{saved.nodes=appState.flowNodes.map(n=>({...n}));if(persist())notify('Flow da demonstração salvo neste navegador.');},
    upload:async files=>{
      for(const file of files){
        if(!/\.(pdf|txt)$/i.test(file.name)||file.size<=0||file.size>20*1048576){notify('Selecione PDF ou TXT com até 20 MB.');continue;}
        saved.files.push({id:crypto.randomUUID(),name:file.name,size:file.size});
      }
      persist();renderFiles();$('manual-file-input').value='';
      notify('Referências adicionadas à demonstração. O conteúdo dos arquivos não é enviado nem indexado.');
    }
  };
  window.dispatchEvent(new Event('easymanual:auth-loaded'));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',activate,{once:true});else activate();
})();
