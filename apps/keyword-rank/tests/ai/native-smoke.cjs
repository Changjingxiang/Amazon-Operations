const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createDecoder}=require('../../electron/ai/native-wire.cjs');
const {EXTENSION_ID}=require('../../electron/ai/native-host.cjs');
const net=require('node:net'),crypto=require('node:crypto');
const relayMode=process.argv.includes('--relay');
const target=process.argv.slice(2).find(x=>x!=='--relay');
const relayDir=path.resolve(__dirname,'../../../../work/ai-native-relay-fixture');
if(relayMode){
  fs.mkdirSync(relayDir,{recursive:true});fs.cpSync(path.dirname(require('electron')),relayDir,{recursive:true});
  fs.copyFileSync(require('electron'),path.join(relayDir,'KeywordRankAIConnector.exe'));
  fs.copyFileSync(path.resolve(__dirname,'../../build/KeywordRankAINative.exe'),path.join(relayDir,'KeywordRankAINative.exe'));
  fs.mkdirSync(path.join(relayDir,'resources/app'),{recursive:true});
  fs.writeFileSync(path.join(relayDir,'resources/app/package.json'),JSON.stringify({name:'native-relay-test',main:'bootstrap.cjs'}));
}
async function run(flags=[]){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'keyword-native-'));
  const pipe='KeywordRankAI-'+crypto.randomBytes(16).toString('hex'),server=net.createServer();
  if(!relayMode)await new Promise(resolve=>server.listen(`\\\\.\\pipe\\${pipe}`,resolve));
  const accepted=new Promise(resolve=>server.once('connection',resolve));
  const args=[path.join(__dirname,'native-electron-fixture.cjs'),`chrome-extension://${EXTENSION_ID}/`,`--profile=${profile}`,`--connector-pipe=${pipe}`,...flags];
  if(target)args.push(`--target=${path.resolve(target)}`);
  if(relayMode)fs.writeFileSync(path.join(relayDir,'resources/app/bootstrap.cjs'),`process.argv.push(${[`--profile=${profile}`,...flags,...(target?[`--target=${path.resolve(target)}`]:[])].map(x=>JSON.stringify(x)).join(',')});require(${JSON.stringify(path.join(__dirname,'native-electron-fixture.cjs'))});`);
  const child=spawn(relayMode?path.join(relayDir,'KeywordRankAINative.exe'):require('electron'),relayMode?[`chrome-extension://${EXTENSION_ID}/`]:args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const waiting=new Map(),chunks=new Map();let next=0,stderr='';
  child.stderr.on('data',b=>stderr=(stderr+b.toString()).slice(-2000));
  child.on('exit',(code,signal)=>{stderr+=` exit=${code} signal=${signal} profile=${profile}`;});
  const socket=relayMode?null:await Promise.race([accepted,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Native pipe connection timed out')),10000);timer.unref();})]);
  (relayMode?child.stdout:socket).on('data',createDecoder(frame=>{
    const parts=chunks.get(frame.id)||[];parts.push(Buffer.from(frame.data,'base64'));chunks.set(frame.id,parts);
    if(parts.length===frame.total){chunks.delete(frame.id);const response=JSON.parse(Buffer.concat(parts));waiting.get(frame.id)?.(response);waiting.delete(frame.id);}
  },error=>{throw error;}));
  const call=(method,payload)=>new Promise((resolve,reject)=>{
    const id=`smoke_${++next}`,timer=setTimeout(()=>{child.kill();reject(new Error(`Native ${method} timeout; stderr: ${stderr}`));},20000);
    waiting.set(id,response=>{clearTimeout(timer);resolve(response);});
    const body=Buffer.from(JSON.stringify({id,method,payload})),header=Buffer.alloc(4);header.writeUInt32LE(body.length);(relayMode?child.stdin:socket).write(Buffer.concat([header,body]));
  });
  try{
    assert.equal((await call('status')).ok,false);
    const pair=await call('pair',{url:'file:///C:/keyword/index.html'});
    if(flags.includes('--deny-pair')){assert.equal(pair.ok,false);assert(!fs.existsSync(path.join(profile,'calls.txt')));return;}
    assert.equal(pair.ok,true);assert.equal((await call('status')).data.transport,'native');
    assert.equal((await call('config-status')).ok,false);assert.equal((await call('config-save',{key:'forbidden'})).ok,false);
    const preview=await call('prepare',{mode:'product',productId:'sample',marketplace:'CA',start:'2026-09-01',end:'2026-09-07',records:[{keyword:'coat',snapshotDate:'2026-09-01',naturalRank:10}]});assert.equal(preview.ok,true);
    const result=await call('start',preview.data.id);
    if(flags.includes('--deny-send')){assert.equal(result.ok,false);assert(!fs.existsSync(path.join(profile,'calls.txt')));}
    else {assert.equal(result.ok,true);assert.equal((await call('history')).data.length,1);assert.equal((await call('test')).ok,true);}
    assert.equal((await call('status')).data.busy,false);
  }finally{(relayMode?child.stdin:socket).end();if(!relayMode)server.close();await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},5000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}
}
(async()=>{await run();await run(['--deny-pair']);await run(['--deny-send']);console.log(JSON.stringify({ok:true,scenarios:['native pipes','Windows encryption','pair permission','send permission','key API refusal','prepare/start/history','connection test','disconnect exit'],relay:relayMode,packaged:!!target}));})().catch(error=>{console.error(error.message);process.exitCode=1;});
