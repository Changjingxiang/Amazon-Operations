const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {frames}=require('../../electron/ai/native-wire.cjs');
const {EXTENSION_ID}=require('../../electron/ai/native-host.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const event=()=>{const listeners=[];return{addListener:f=>listeners.push(f),emit:(...args)=>listeners.forEach(f=>f(...args))};};
function port(name,sender){return{name,sender,sent:[],onMessage:event(),onDisconnect:event(),postMessage(message){this.sent.push(message);},disconnect(){this.onDisconnect.emit();}};}
test('extension pairs only the explicitly chosen top-level page and refuses key methods',async()=>{
  const runtime={id:EXTENSION_ID,lastError:null,onMessage:event(),onConnect:event(),getURL:p=>`chrome-extension://${EXTENSION_ID}/${p}`};
  const native=port('native',{}),tabs={query:async()=>[{id:3,url:'file:///C:/keyword/index.html'}],onRemoved:event(),onUpdated:event()};
  runtime.connectNative=name=>{assert.equal(name,'com.keywordrank.ai');return native;};
  let page;
  const chrome={runtime,tabs,scripting:{executeScript:async()=>{page=port('keyword-ai-page',{id:EXTENSION_ID,frameId:0,tab:{id:3},url:'file:///C:/keyword/index.html'});runtime.onConnect.emit(page);}}};
  const context=vm.createContext({chrome,URL,TextDecoder,Uint8Array,atob,setTimeout,clearTimeout});
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../../../web/extensions/keyword-ai-connector/background.js'),'utf8'),context);
  const request=action=>new Promise(resolve=>runtime.onMessage.emit({action},{id:EXTENSION_ID,url:runtime.getURL('popup.html')},resolve));
  assert.equal((await request('connect')).ok,true);assert.equal(native.sent[0].method,'pair');
  const respond=value=>frames(value).forEach(f=>native.onMessage.emit(JSON.parse(f.subarray(4))));
  respond({id:'pair',ok:true,data:{connected:true}});assert.equal(page.sent.at(-1).connected,true);
  page.onMessage.emit({kind:'request',id:'web_bad',method:'config-save',payload:{key:'forbidden'}});assert.equal(native.sent.length,1);
  page.onMessage.emit({kind:'request',id:'web_ok',method:'history'});assert.equal(native.sent.at(-1).method,'history');
  const history={id:'web_ok',ok:true,data:'证据'.repeat(160000)};respond(history);assert.equal(page.sent.at(-1).data.length,history.data.length);
  const foreign=port('keyword-ai-page',{id:EXTENSION_ID,frameId:1,tab:{id:3},url:'file:///C:/keyword/index.html'});let refused=false;foreign.onDisconnect.addListener(()=>refused=true);runtime.onConnect.emit(foreign);assert(refused);
  assert.equal((await request('connect')).ok,false);
  tabs.onUpdated.emit(3,{status:'loading'});await tick();assert.equal((await request('status')).data.connected,false);
});
test('extension manifest pins the registered ID and has no HTTP/API host permissions',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../../web/extensions/keyword-ai-connector/manifest.json')));
  assert.equal(require('node:crypto').createPublicKey({key:Buffer.from(manifest.key,'base64'),format:'der',type:'spki'}).type,'public');
  const actual=require('node:crypto').createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32).replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));
  assert.equal(actual,EXTENSION_ID);assert.deepEqual(manifest.host_permissions,['file:///*']);assert(!manifest.permissions.includes('storage'));assert(!manifest.content_scripts);
});
