'use strict';
const http=require('node:http');
const path=require('node:path');
const fs=require('node:fs/promises');
const {seedLocal}=require('./seed-local.cjs');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const config={apiKey:'demo-easymanual-local',projectId:'demo-easymanual',authDomain:'localhost',
  storageBucket:'demo-easymanual.appspot.com',appId:'demo-easymanual-local',localEmulators:true};
// Explicit allowlist: local credentials, exports and backend files are never served.
function localResource(url) {
  const requestPath=decodeURIComponent(new URL(url,'http://127.0.0.1:5173').pathname);
  if(requestPath==='/'||requestPath==='/index.html')return 'index.html';
  if(!/^\/(assets|images)\/[a-zA-Z0-9_./-]+$/.test(requestPath)||requestPath.split('/').some(part=>part.startsWith('.')))return null;
  const relative=requestPath.slice(1),resolved=path.resolve(root,relative);
  return resolved.startsWith(root+path.sep)?relative:null;
}
async function startLocalServer({quiet=false}={}) {
  const credentials=await seedLocal();
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    try {
      if(new URL(req.url,'http://127.0.0.1:5173').pathname==='/__/firebase/init.json') {
        res.setHeader('Content-Type','application/json');res.end(req.method==='HEAD'?'':JSON.stringify(config));return;
      }
      const resource=localResource(req.url);
      if(!resource){res.writeHead(404).end();return;}
      let content=await fs.readFile(path.join(root,resource));
      if(resource==='index.html')content=content.toString().replace(/(<body[^>]*>)/,'$1<aside style="padding:8px;text-align:center;background:#f59e0b;color:#040122;font:14px sans-serif" role="status">Ambiente local · Todos os módulos liberados para a conta de teste · Pagamentos desativados</aside>');
      res.setHeader('Content-Type',types[path.extname(resource)]||'application/octet-stream');res.end(req.method==='HEAD'?'':content);
    } catch {res.writeHead(404).end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(5173,'127.0.0.1',resolve);});
  if(!quiet) {
    console.log('\nEasyManual local pronto: http://127.0.0.1:5173');
    console.log(`E-mail: ${credentials.email}\nSenha: ${credentials.password}`);
    console.log('Conta titular, todos os módulos, até 2.000 usuários e arquivos sem cota comercial.');
    console.log('Pressione Ctrl+C para encerrar e salvar os dados dos emuladores.\n');
  }
  server.on('error',error=>{console.error(error.message);process.exitCode=1;});
  if(!quiet)for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
  return server;
}
module.exports={localResource,startLocalServer};
if(require.main===module)startLocalServer().catch(error=>{console.error(error.message);process.exitCode=1;});
