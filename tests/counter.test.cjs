const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const {JSDOM}=require('../functions/node_modules/jsdom');
for(const reduced of [false,true])test(`search precision uses the shared counter and ends at 100% (reduced motion: ${reduced})`,()=>{
 const html=fs.readFileSync('index.html','utf8'),dom=new JSDOM(html,{runScripts:'outside-only'}),w=dom.window;
 try{
 const observers=[],frames=new Map();let id=0;
 w.matchMedia=()=>({matches:reduced,addEventListener(){}});w.performance.now=()=>0;
 w.requestAnimationFrame=cb=>{frames.set(++id,cb);return id;};w.cancelAnimationFrame=key=>frames.delete(key);
 w.IntersectionObserver=class{constructor(callback){this.callback=callback;observers.push(this);}observe(){}unobserve(){}disconnect(){}};
 const source=html.slice(html.indexOf('    function initScrollAnimations()'),html.indexOf('    // Init App'));
 new vm.Script(source).runInContext(dom.getInternalVMContext());w.initScrollAnimations();
 const counter=w.document.querySelector('.performance-section [data-count]');assert.equal(counter.dataset.count,'100');assert.equal(counter.dataset.decimals,'0');
 if(!reduced){
 assert.equal(counter.textContent,'0%');observers[0].callback([{isIntersecting:true,target:counter.closest('.reveal-scale')}]);
 let callback=[...frames.values()][0];frames.clear();callback(700);assert(Number.parseInt(counter.textContent)>0&&Number.parseInt(counter.textContent)<100);
 callback=[...frames.values()][0];frames.clear();callback(1400);
 }
 assert.equal(counter.textContent,'100%');
 assert(!fs.readFileSync('assets/landing.css','utf8').includes("content: '100%'"));
 }finally{dom.window.close();}
});
