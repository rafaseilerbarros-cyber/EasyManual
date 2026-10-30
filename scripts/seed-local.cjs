'use strict';
const path=require('node:path');
const fs=require('node:fs');
const dependencies=require('node:module').createRequire(path.resolve(__dirname,'../functions/package.json'));
const PROJECT='demo-easymanual';
function assertLocalEnvironment(env=process.env) {
  if(env.GCLOUD_PROJECT!==PROJECT || env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099' || env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')
    throw new Error('A conta de desenvolvimento só pode ser criada no projeto demo-easymanual com os emuladores locais nas portas 9099 e 8080.');
}
async function seedLocal() {
  assertLocalEnvironment();
  const credentials=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../.local/credentials.json'),'utf8'));
  const {initializeApp,deleteApp}=dependencies('firebase-admin/app');
  const {getAuth}=dependencies('firebase-admin/auth');
  const {getFirestore}=dependencies('firebase-admin/firestore');
  const {PLANS}=require('../functions/policy');
  const app=initializeApp({projectId:PROJECT},'local-seed');
  try {
    const auth=getAuth(app),db=getFirestore(app);
    const account={email:credentials.email,password:credentials.password,displayName:'Administrador local',emailVerified:true,disabled:false};
    let user;
    try {user=await auth.getUserByEmail(account.email);user=await auth.updateUser(user.uid,account);}
    catch(error){if(error.code!=='auth/user-not-found')throw error;user=await auth.createUser({uid:'local-admin',...account});}
    const workspace=db.doc(`workspaces/${user.uid}`),plan=PLANS.companhias;
    await db.runTransaction(async tx=>{
      const previous=await tx.get(workspace);
      tx.set(workspace,{ownerId:user.uid,planId:'companhias',status:'active',expiresAt:Date.now()+365*86400000,
        seatLimit:plan.seats,modules:plan.modules,fileCount:previous.data()?.fileCount||0,memberCount:previous.data()?.memberCount||1}, {merge:true});
      tx.set(db.doc(`users/${user.uid}`),{workspaceId:user.uid});
      tx.set(workspace.collection('members').doc(user.uid),{email:account.email,role:'owner'});
    });
    return credentials;
  } finally {await deleteApp(app);}
}
module.exports={assertLocalEnvironment,seedLocal};
