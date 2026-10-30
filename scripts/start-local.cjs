'use strict';
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
async function requireFreePort(port) {
  await new Promise((resolve,reject)=>{
    const probe=net.createServer();
    probe.once('error',()=>reject(new Error(`A porta ${port} está em uso. Encerre o outro servidor/emulador e tente novamente.`)));
    probe.listen(port,'127.0.0.1',()=>probe.close(resolve));
  });
}
function createIfMissing(file,content) {
  try{fs.writeFileSync(file,content,{flag:'wx',mode:0o600});}
  catch(error){if(error.code!=='EEXIST')throw error;}
}
async function main() {
  process.chdir(root);
  const cli=path.join(root,'functions/node_modules/firebase-tools/lib/bin/firebase.js');
  if(!fs.existsSync(cli))throw new Error('Instale as dependências: npm ci && npm ci --prefix functions');
  for(const port of [5173,9099,8080,9199,5001,4400])await requireFreePort(port);
  fs.mkdirSync(path.join(root,'.local'),{recursive:true});
  fs.writeFileSync(path.join(root,'.local/credentials.json'),JSON.stringify({email:'admin@easymanual.local',password:'EasyManual'},null,2)+'\n',{mode:0o600});
  // Emulator-only placeholders; these are never used to call a payment provider.
  createIfMissing(path.join(root,'functions/.secret.local'),'STRIPE_SECRET_KEY=emulator-only\nSTRIPE_WEBHOOK_SECRET=emulator-only\nSTRIPE_PRICE_IDS={}\n');
  createIfMissing(path.join(root,'functions/.env.local'),'APP_URL=http://127.0.0.1:5173\n');
  const args=[cli,'emulators:exec','--project','demo-easymanual','--config','firebase.local.json',
    '--only','auth,firestore,storage,functions','--export-on-exit','.local/firebase'];
  if(fs.existsSync(path.join(root,'.local/firebase/firebase-export-metadata.json')))args.push('--import','.local/firebase');
  args.push(process.argv.includes('--check')?'node --test tests/local.emulator.cjs':'node scripts/serve-local.cjs');
  const child=spawn(process.execPath,args,{cwd:root,stdio:'inherit',env:{...process.env,GCLOUD_PROJECT:'demo-easymanual',FIREBASE_CLI_DISABLE_TELEMETRY:'1'}});
  process.on('SIGINT',()=>{if(!process.stdin.isTTY && process.platform!=='win32')child.kill('SIGINT');});
  process.once('SIGTERM',()=>child.kill('SIGTERM'));
  child.once('error',error=>{console.error(error.message);process.exitCode=1;});
  child.once('exit',code=>{process.exitCode=code??1;});
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
