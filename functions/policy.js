'use strict';
const MODULES = ['upload-de-arquivos', 'chat-de-busca', 'treinamento', 'flow-map'];
const PLANS = Object.freeze({
  entusiastas: {name:'Entusiastas', amount:20000, seats:1, files:1, modules:MODULES.slice(0,2)},
  estudantes: {name:'Estudantes', amount:50000, seats:1, files:null, modules:MODULES.slice(0,3)},
  pilotos: {name:'Pilotos Operacionais', amount:100000, seats:1, files:null, modules:MODULES},
  escolas: {name:'Escolas / CIACs', amount:2250000, seats:30, files:null, modules:MODULES},
  taxi: {name:'Táxi Aéreo', amount:25000000, seats:500, files:null, modules:MODULES},
  companhias: {name:'Companhias Aéreas', amount:60000000, seats:2000, files:null, modules:MODULES}
});
function entitlements(w, now=Date.now()) {
  const plan=PLANS[w?.planId];
  const active=!!plan && w.status==='active' && Number(w.expiresAt)>now;
  return {planId:active?w.planId:null, name:active?plan.name:'Sem plano ativo',
    seats:active?plan.seats:0, files:active?plan.files:0,
    modules:active && w.memberCount<=plan.seats ? plan.modules : []};
}
function canUpload(w) {const p=entitlements(w);return p.modules.includes('upload-de-arquivos') && (p.files===null || w.fileCount<p.files);}
function validFile(data) {
  return typeof data?.name==='string' && data.name.length>0 && data.name.length<=200 &&
    /\.(pdf|txt)$/i.test(data.name) && Number.isSafeInteger(data.size) && data.size>0 && data.size<=20*1024*1024 &&
    ['application/pdf','text/plain'].includes(data.contentType) &&
    data.contentType===(/\.pdf$/i.test(data.name)?'application/pdf':'text/plain');
}
function validFlow(nodes) {return Array.isArray(nodes) && nodes.length<=200 && nodes.every((n,i)=>n.id===i+1 && Number.isFinite(n.x) && Number.isFinite(n.y) && n.x>=0 && n.x<=100 && n.y>=0 && n.y<=100 && typeof n.title==='string' && n.title.length>0 && n.title.length<=500);}
module.exports={PLANS,entitlements,canUpload,validFile,validFlow};
