const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const {JSDOM}=require('../functions/node_modules/jsdom');
async function setup(storage=false){
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://example.com',runScripts:'outside-only'}),w=dom.window;
 const headerStyle=w.document.createElement('style');headerStyle.textContent=fs.readFileSync('assets/header.css','utf8');w.document.head.append(headerStyle);
 w.lucide={createIcons(){}};w.scrollTo=()=>{};w.ResizeObserver=class{observe(){}};w.IntersectionObserver=class{observe(){}};w.matchMedia=()=>({matches:true,addEventListener(){}});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 if(storage)Object.defineProperty(w,'localStorage',{get(){throw Error('blocked');}});
 const context=dom.getInternalVMContext();const main=[...w.document.scripts].find(s=>s.textContent.includes('const appState =')).textContent;
 new vm.Script(main).runInContext(context);new vm.Script(fs.readFileSync('assets/demo.js','utf8')).runInContext(context);
 await new Promise(r=>setImmediate(r));return {dom,w};
}
test('opening the static demo shows the home Hero with admin connected',async()=>{
 const t=await setup();try{
 assert.equal(t.w.EasyManualDemo,true);assert.equal(t.w.document.getElementById('user-display-name').textContent,'Admin');
 assert(!t.w.document.getElementById('screen-pagina-inicial').classList.contains('hidden'));
 assert(t.w.document.getElementById('screen-app-workspace').classList.contains('hidden'));
 assert.equal(t.w.getComputedStyle(t.w.document.getElementById('site-header')).zIndex,'50');
 t.w.navigateTo('app-workspace');assert(!t.w.document.getElementById('screen-app-workspace').classList.contains('hidden'));
 assert.equal(t.w.getComputedStyle(t.w.document.getElementById('site-header')).zIndex,'50');
 assert.equal(t.w.document.getElementById('demo-banner'),null);assert(t.w.EasyAccount.canAccess('flow-map'));
 t.w.EasyAccount.saveFlow();assert(Array.isArray(JSON.parse(t.w.localStorage.getItem('easymanual-static-demo-v1')).nodes));
 }finally{t.dom.window.close();}
});
test('demo works when browser persistence is unavailable and never simulates payment success',async()=>{
 const t=await setup(true);try{
 assert.equal(t.w.document.getElementById('user-display-name').textContent,'Admin');
 t.w.EasyAccount.checkout({preventDefault(){}});
 assert.match(t.w.document.getElementById('account-message-text').textContent,/desativados/);
 }finally{t.dom.window.close();}
});

test('desktop header exposes all navigation buttons instead of retaining the hidden utility',async()=>{
 const t=await setup();try{
 const header=t.w.document.getElementById('site-header'),nav=header.querySelector(':scope > nav');
 assert(!nav.classList.contains('hidden'));assert.equal(t.w.getComputedStyle(nav).display,'flex');
 assert.deepEqual([...nav.querySelectorAll('button')].map(b=>b.textContent.trim()),['Início','Sobre Nós','Planos','Workspace']);
 assert.equal(t.w.document.getElementById('auth-buttons-logged-in').classList.contains('hidden'),false);
 t.w.eval(t.w.document.getElementById('nav-btn-app-workspace').getAttribute('onclick'));assert(!t.w.document.getElementById('screen-app-workspace').classList.contains('hidden'));
 }finally{t.dom.window.close();}
});
