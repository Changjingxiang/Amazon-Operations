const {app,BrowserWindow,ipcMain,dialog,safeStorage,session}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {pathToFileURL,fileURLToPath}=require('node:url');
const {Worker}=require('node:worker_threads');
const {read,write}=require('./storage.cjs');
const {endpoint,chat}=require('./network.cjs');

// A separate profile keeps browser/legacy desktop business data untouched.
app.setName('KeywordRankAI');
const dataDir=path.join(app.getPath('appData'),'KeywordRankAI');
app.setPath('userData',dataDir);
const uiRoot=path.join(__dirname,'../../ai-ui');
const indexUrl=pathToFileURL(path.join(uiRoot,'index.html')).href;
const settingsUrl=pathToFileURL(path.join(__dirname,'settings.html')).href;
let mainWindow,settingsWindow,core,currentTask=null,prepared=null,reportFile=null,reportPreview=null;
let config={endpoint:'',model:'',persisted:false},sessionKey='';
const files={config:path.join(dataDir,'connection.json'),reports:path.join(dataDir,'ads.json'),history:path.join(dataDir,'analysis-history.json'),preferences:path.join(dataDir,'ai-preferences.json')};
const id=()=>crypto.randomUUID();
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const reports=()=>read(files.reports,[]);
const history=()=>read(files.history,[]);
const publicStatus=()=>({endpoint:config.endpoint,model:config.model,configured:!!sessionKey,persisted:config.persisted,encryptionAvailable:safeStorage.isEncryptionAvailable(),busy:!!currentTask});
function secureWindow(window,url){
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(e,next)=>{if(next!==url)e.preventDefault();});
  window.webContents.on('will-attach-webview',e=>e.preventDefault());
}
function authorized(event,kind){const w=kind==='settings'?settingsWindow:mainWindow;const expected=kind==='settings'?settingsUrl:indexUrl;return !!w&&!w.isDestroyed()&&event.sender===w.webContents&&event.senderFrame===w.webContents.mainFrame&&event.senderFrame.url===expected;}
function handle(name,kind,fn){ipcMain.handle('ai:'+name,async(event,payload)=>{if(!authorized(event,kind))return{ok:false,error:'拒绝未授权调用'};try{return{ok:true,data:await fn(payload)};}catch(error){return{ok:false,error:String(error.message||'操作失败').slice(0,500)};}});}
function notBusy(){if(currentTask)throw new Error('当前已有请求，请完成或取消后再操作');}
function ensureConfig(){if(!sessionKey||!config.endpoint||!config.model)throw new Error('请先在安全设置中配置 API 地址、模型和密钥');}
function showSettings(){if(settingsWindow&&!settingsWindow.isDestroyed()){settingsWindow.focus();return;}settingsWindow=new BrowserWindow({width:700,height:760,minWidth:560,minHeight:620,parent:mainWindow,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'settings-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});secureWindow(settingsWindow,settingsUrl);settingsWindow.loadURL(settingsUrl);settingsWindow.on('closed',()=>{settingsWindow=null;});}
async function parseFile(file){return new Promise((resolve,reject)=>{const worker=new Worker(path.join(__dirname,'report-worker.cjs'),{workerData:{file},resourceLimits:{maxOldGenerationSizeMb:256,maxYoungGenerationSizeMb:32}});let done=false;const finish=(err,value)=>{if(done)return;done=true;clearTimeout(timer);worker.terminate();err?reject(err):resolve(value);};const timer=setTimeout(()=>finish(new Error('报表解析超时，请拆分或检查文件')),25000);worker.once('message',m=>m.ok?finish(null,m):finish(new Error(m.error)));worker.once('error',()=>finish(new Error('报表解析失败或超出内存限制')));worker.once('exit',()=>{if(!done)finish(new Error('报表解析进程提前退出'));});});}
async function task(body){notBusy();ensureConfig();const controller=new AbortController();currentTask=controller;try{return await chat({url:config.endpoint,key:sessionKey,body,signal:controller.signal});}finally{if(currentTask===controller)currentTask=null;}}
function installHandlers(){
  handle('status','main',()=>publicStatus());handle('settings','main',()=>showSettings());handle('config-status','settings',()=>publicStatus());
  handle('config-save','settings',payload=>{
    notBusy();if(payload?.confirmed!==true)throw new Error('请确认目的地和数据流向');
    const url=endpoint(String(payload.endpoint||'')).href,model=String(payload.model||'').trim();
    if(!/^[\w.\-/:]{1,160}$/.test(model))throw new Error('模型名称无效，请填写平台提供的模型 ID');
    const key=String(payload.key||'');if((url!==config.endpoint||!sessionKey)&&!key)throw new Error('首次设置或更改 API 地址时，必须重新输入密钥');
    if(key&&(!/^[\x21-\x7e]{8,512}$/.test(key)))throw new Error('密钥格式无效');
    if(payload.persist&&!safeStorage.isEncryptionAvailable())throw new Error('系统加密不可用，请选择仅本次会话');
    const next={endpoint:url,model,persisted:!!payload.persist};const nextKey=key||sessionKey;
    const disk={...next,...(next.persisted?{encrypted:safeStorage.encryptString(nextKey).toString('base64')}:{})};
    write(files.config,disk); // Never retain an older encrypted key in a generic .bak.
    if(fs.existsSync(files.config+'.bak'))fs.unlinkSync(files.config+'.bak');
    config=next;sessionKey=nextKey;prepared=null;return publicStatus();
  });
  handle('config-clear','settings',()=>{notBusy();write(files.config,{endpoint:config.endpoint,model:config.model,persisted:false});if(fs.existsSync(files.config+'.bak'))fs.unlinkSync(files.config+'.bak');sessionKey='';config.persisted=false;prepared=null;return publicStatus();});
  handle('test','main',async()=>{const r=await task({model:config.model,messages:[{role:'user',content:'Reply with OK. This is a connection test; no business data is included.'}],max_tokens:8,stream:false});return{message:'连接成功，平台返回了兼容响应。',usage:r.usage};});
  handle('cancel','main',()=>{currentTask?.abort();return{cancelled:true};});
  handle('pick-report','main',async()=>{
    const selected=await dialog.showOpenDialog(mainWindow,{title:'选择 SP 广告报表（原文件不会修改）',properties:['openFile'],filters:[{name:'广告报表',extensions:['csv','xlsx']}]});
    if(selected.canceled)return null;const file=selected.filePaths[0];const stat=fs.statSync(file);if(stat.size>20*1024*1024)throw new Error('文件超过 20 MB');
    const parsed=await parseFile(file);reportFile={...parsed,id:id(),filename:path.basename(file),digest:hash(fs.readFileSync(file)),asOf:stat.mtime.toISOString().slice(0,10)};reportPreview=null;
    return{id:reportFile.id,filename:reportFile.filename,headers:parsed.headers,mapping:core.suggestMapping(parsed.headers),sample:parsed.table.slice(0,3),count:parsed.table.length,asOf:reportFile.asOf};
  });
  handle('preview-report','main',payload=>{
    if(!reportFile||payload?.id!==reportFile.id)throw new Error('文件选择已失效，请重新选择');
    const result=core.normalizeReport(reportFile.table,payload.mapping,payload.metadata);
    const batch={...result,id:id(),filename:reportFile.filename,digest:hash(JSON.stringify([reportFile.digest,payload.mapping,result.meta])),importedAt:new Date().toISOString()};
    const existing=reports(),merged=core.mergeBatch(existing,batch);
    reportPreview={id:id(),batch,revision:hash(JSON.stringify(existing))};
    return{id:reportPreview.id,meta:batch.meta,count:batch.rows.length,rows:batch.rows.slice(0,20),warnings:batch.warnings,duplicate:merged.duplicate,replaced:merged.replaced};
  });
  handle('commit-report','main',token=>{
    if(!reportPreview||reportPreview.id!==token)throw new Error('预览已失效，请重新预览');
    const existing=reports();if(hash(JSON.stringify(existing))!==reportPreview.revision)throw new Error('数据已变化，请重新预览');
    const merged=core.mergeBatch(existing,reportPreview.batch);if(!merged.duplicate)write(files.reports,merged.batches);reportPreview=null;reportFile=null;prepared=null;return{duplicate:merged.duplicate,replaced:merged.replaced};
  });
  handle('reports','main',()=>{
    const batches=reports();const groups=new Map();for(const b of batches)for(const r of b.rows){const key=core.groupKey(b.meta,r);if(!groups.has(key))groups.set(key,{key,label:`${b.meta.account} · ${b.meta.marketplace} · ${b.meta.currency} · ${core.TYPES[b.meta.type]} · ${r.campaign} / ${r.group}`,type:b.meta.type});}
    return{batches:batches.map(b=>({id:b.id,filename:b.filename,meta:b.meta,count:b.rows.length,importedAt:b.importedAt})),groups:[...groups.values()]};
  });
  handle('preferences','main',()=>read(files.preferences,{}));
  handle('prepare','main',input=>{
    notBusy();ensureConfig();if(JSON.stringify(input).length>30*1024*1024)throw new Error('本地输入过大，请按关键词缩小范围');
    const snapshot=core.prepareAnalysis(input,reports(),config);
    if(sessionKey&&JSON.stringify(snapshot.request).includes(sessionKey))throw new Error('发送内容包含当前 API 密钥，已阻止请求，请检查所选备注和数据');
    if(input.productId){const prefs=read(files.preferences,{});prefs[String(input.productId).slice(0,80)]={targetAcos:input.targetAcos||''};write(files.preferences,prefs);}
    const localContext={productId:String(input.productId||'').slice(0,80),productName:String(input.productName||'').slice(0,200),marketplace:String(input.marketplace||'').slice(0,2),keyword:String(input.keyword||'').slice(0,500)};
    prepared={...snapshot,localContext,id:id(),created:Date.now(),endpoint:config.endpoint,model:config.model};
    return{id:prepared.id,endpoint:prepared.endpoint,model:prepared.model,request:prepared.request,payload:prepared.payload,sources:prepared.sources};
  });
  handle('start','main',async token=>{
    if(!prepared||prepared.id!==token||Date.now()-prepared.created>300000)throw new Error('发送预览已失效，请重新生成');
    const snapshot=prepared;prepared=null;
    const response=await task(snapshot.request);
    const result=core.validateResult(response.content,snapshot.payload.evidence.map(e=>e.id));
    // Provider output is untrusted: even accidental key echoes must not persist.
    if(sessionKey&&JSON.stringify(result).includes(sessionKey))throw new Error('响应包含敏感信息，已拒绝保存');
    const record={id:id(),createdAt:new Date().toISOString(),endpoint:new URL(snapshot.endpoint).origin,model:snapshot.model,localContext:snapshot.localContext,payload:snapshot.payload,sources:snapshot.sources,result,usage:response.usage};
    const next=[record,...history()].slice(0,50);write(files.history,next);return record;
  });
  handle('history','main',()=>history());
  handle('backup','main',async()=>{const target=await dialog.showSaveDialog(mainWindow,{title:'导出广告和 AI 分析数据（不含密钥）',defaultPath:'广告与AI分析备份.json',filters:[{name:'JSON',extensions:['json']}]});if(target.canceled)return null;const data={format:'keyword-ai-backup',version:1,reports:reports(),history:history(),preferences:read(files.preferences,{})};write(target.filePath,data);return{saved:true};});
  handle('restore','main',async()=>{
    notBusy();const selected=await dialog.showOpenDialog(mainWindow,{title:'恢复广告与 AI 分析备份',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});if(selected.canceled)return null;
    const file=selected.filePaths[0];if(fs.statSync(file).size>40*1024*1024)throw new Error('备份过大');const data=read(file,null);
    if(data?.format!=='keyword-ai-backup'||data.version!==1||!Array.isArray(data.reports)||!Array.isArray(data.history)||data.reports.length>1000||data.history.length>50)throw new Error('不支持的备份格式');
    const validated=data.reports.map(b=>{const mapping=Object.fromEntries(Object.keys(core.FIELDS).filter(k=>!['date','adProduct'].includes(k)).map(k=>[k,k]));const normalized=core.normalizeReport(b.rows,mapping,b.meta);return{...normalized,id:id(),filename:String(b.filename||'备份').slice(0,200),digest:hash(JSON.stringify(normalized)),importedAt:new Date().toISOString()};});
    for(const h of data.history){if(!Array.isArray(h?.payload?.evidence)||JSON.stringify(h).length>1000000)throw new Error('分析历史格式无效');h.result=core.validateResult(JSON.stringify(h.result),h.payload.evidence.map(e=>e.id));}
    const preferences=Object.create(null),savedPreferences=data.preferences??{};
    if(typeof savedPreferences!=='object'||Array.isArray(savedPreferences)||Object.keys(savedPreferences).length>10000)throw new Error('商品偏好格式无效');
    for(const [product,value] of Object.entries(savedPreferences)){
      if(!product||product.length>80||['__proto__','constructor','prototype'].includes(product)||!value||typeof value!=='object')throw new Error('商品偏好格式无效');
      const target=value.targetAcos;
      if(target!==''&&target!=null&&(typeof target!=='string'&&typeof target!=='number'||!Number.isFinite(Number(target))||Number(target)<=0||Number(target)>1000))throw new Error('目标 ACOS 格式无效');
      preferences[product]={targetAcos:target==null?'':target};
    }
    const answer=await dialog.showMessageBox(mainWindow,{type:'question',buttons:['取消','备份当前数据并恢复'],defaultId:0,cancelId:0,message:`恢复 ${validated.length} 个广告批次、${data.history.length} 份分析？`,detail:'仅替换增强版的广告和分析历史，排名数据与密钥不变。当前数据会另存恢复前备份。'});if(answer.response!==1)return null;
    write(path.join(dataDir,`before-restore-${Date.now()}.json`),{format:'keyword-ai-backup',version:1,reports:reports(),history:history(),preferences:read(files.preferences,{})});
    write(files.reports,validated);write(files.history,data.history);write(files.preferences,preferences);prepared=null;return{restored:true};
  });
}
if(!app.requestSingleInstanceLock())app.quit();
else app.whenReady().then(async()=>{
  core=await import(pathToFileURL(path.join(__dirname,'../../src/ai/core.mjs')).href);
  const disk=read(files.config,{});config={endpoint:disk.endpoint||'',model:disk.model||'',persisted:!!disk.persisted};
  if(disk.encrypted&&safeStorage.isEncryptionAvailable())try{sessionKey=safeStorage.decryptString(Buffer.from(disk.encrypted,'base64'));}catch{config.persisted=false;}
  const s=session.defaultSession;s.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));s.setPermissionCheckHandler(()=>false);
  s.webRequest.onBeforeRequest((details,callback)=>{
    let allowed=false;try{const url=new URL(details.url);if(url.protocol==='file:'){const file=fileURLToPath(url);const rel=path.relative(uiRoot,file);const settingRel=path.relative(__dirname,file);allowed=(!rel.startsWith('..')&&!path.isAbsolute(rel))||(!settingRel.startsWith('..')&&!path.isAbsolute(settingRel));}else allowed=['data:','blob:','devtools:'].includes(url.protocol);}catch{}
    callback({cancel:!allowed});
  });
  installHandlers();mainWindow=new BrowserWindow({width:1440,height:900,minWidth:1100,minHeight:680,title:'关键词排名每日跟进 · AI 增强版',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  secureWindow(mainWindow,indexUrl);await mainWindow.loadURL(indexUrl);mainWindow.on('closed',()=>{currentTask?.abort();mainWindow=null;});
}).catch(()=>{dialog.showErrorBox('启动失败','增强版初始化失败。请保留应用数据目录中的文件，检查程序是否完整。');app.quit();});
app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}});
app.on('window-all-closed',()=>app.quit());
