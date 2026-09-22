const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('web/browser-bridge/browser-bridge.js','utf8');
const mutation=source.slice(source.indexOf('  function mutateAdReviews(change)'),source.indexOf('  window.keywordTracker = {'));
function harness(fail=false) {
 let saved=null, queue=Promise.resolve();
 const initial={storageRevision:'old',adReviews:{reports:[],decisions:[]},annotations:[{text:'preserve'}]};
 const context={pendingSave:null,cloudMode:false,memoryStore:initial,window:{keywordTracker:{}},text:String,newStorageRevision:()=> 'new',storageChannel:{postMessage(){}},writeDailyBackup:async()=>{},showBackupNotice(){},enqueuePersistence:task=>{const next=queue.then(task,task);queue=next.catch(()=>{});return next;}};
 context.ensureStore=async()=>context.memoryStore;
 context.writeIndexedState=async(next,expected)=>{if(fail)throw Error('disk failure');assert.equal(expected,context.memoryStore.storageRevision);saved=next;};
 vm.createContext(context);vm.runInContext(mutation,context);
 return {context,initial,get saved(){return saved;}};
}
test('durable failure leaves memory and adoption unchanged',async()=>{
 const h=harness(true);
 await assert.rejects(h.context.mutateAdReviews(()=>({reports:[],decisions:[{accepted:true}]})),/disk failure/);
 assert.equal(h.context.memoryStore,h.initial);assert.equal(h.saved,null);
});
test('queued decisions retain each other and annotations',async()=>{
 const h=harness();
 await Promise.all([1,2].map(id=>h.context.mutateAdReviews(s=>({...s.adReviews,decisions:[...s.adReviews.decisions,{id,accepted:true}]}))));
 assert.equal(h.saved.adReviews.decisions.length,2);assert.deepEqual(h.saved.annotations,h.initial.annotations);
});
test('unsaved main data prevents publishing review changes',async()=>{
 const h=harness();h.context.pendingSave={};
 await assert.rejects(h.context.mutateAdReviews(()=>({})),/未保存/);assert.equal(h.saved,null);
});
test('backup restore compares the live revision, not the exported revision',async()=>{
 const start=source.indexOf('  async function importBackup()');
 const code=source.slice(start,source.indexOf('  let dataManagerGeneration',start));
 const exported={configs:[],histories:{},storageRevision:'foreign-export',adReviews:{reports:[],decisions:[]}};
 let expected, recovery, reloaded=false;
 const live={configs:[],histories:{},storageRevision:'live-revision'};
 const c={chooseFiles:async()=>[{text:async()=>JSON.stringify(exported)}],window:{},reviewCore:()=>({validate:x=>x}),clone:structuredClone,ensureStore:async()=>live,normalizeStore:x=>x,newStorageRevision:()=> 'fresh',enqueuePersistence:task=>task(),pendingSave:null,cloudMode:false,text:String,persistMainAndBackup:async(next,revision,old)=>{expected=revision;recovery=old;},location:{reload(){reloaded=true;}}};
 vm.createContext(c);vm.runInContext(code,c);await c.importBackup();
 assert.equal(expected,'live-revision');assert.equal(recovery.storageRevision,'live-revision');assert.equal(c.memoryStore.storageRevision,'fresh');assert.equal(reloaded,true);
});
