// Test-only browser fixture: actual release + synthetic postMessage transport.
// Native pipe and permission checks are exercised separately by native-smoke.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawnSync}=require('node:child_process');
const app=path.resolve(__dirname,'../..'),root=path.resolve(app,'../..');
const source=path.resolve(root,process.argv[2]||'outputs/ai-web-connector-candidate');
const out=path.join(root,'work/ai-web-connector-fixture');fs.mkdirSync(out,{recursive:true});fs.cpSync(source,out,{recursive:true});
const legacy=spawnSync(process.execPath,[path.join(__dirname,'browser-fixture.cjs'),'--prepare'],{cwd:app});if(legacy.status!==0)throw new Error(legacy.stderr.toString());
let mock=fs.readFileSync(path.join(root,'work/ai-browser-fixture/empty-seed.js'),'utf8').replace("import('./core.mjs')","import('../core.mjs')").replace('window.keywordAI={','const simulatedAI={');
mock+=`
let connected=false;
const post=m=>window.postMessage({source:'keyword-ai-extension',...m},'*');
const map={'pick-report':'pickReport','preview-report':'previewReport','commit-report':'commitReport'};
window.addEventListener('message',async e=>{if(e.source!==window||e.data?.source!=='keyword-ai-web')return;const m=e.data;if(m.kind==='probe'){post({kind:'state',connected});return;}if(!connected||m.kind!=='request')return;try{const data=await simulatedAI[map[m.method]||m.method](m.payload);post({kind:'response',id:m.id,ok:true,data:m.method==='status'?{...data,connected:true,transport:'native'}:data});}catch(error){post({kind:'response',id:m.id,ok:false,error:error.message});}});
window.addEventListener('DOMContentLoaded',()=>{const panel=document.createElement('div');panel.style.cssText='position:fixed;bottom:8px;left:8px;z-index:2147483647;background:#fff0cc;border:1px solid #d2a600;padding:6px;font:12px sans-serif';for(const [label,fn]of [['测试：连接扩展',()=>{connected=true;post({kind:'state',connected:true});}],['测试：断开扩展',()=>{connected=false;post({kind:'state',connected:false,error:'测试断开，可重新连接'});} ]]){const b=document.createElement('button');b.textContent=label;b.onclick=fn;panel.appendChild(b);}document.body.appendChild(panel);});`;
fs.writeFileSync(path.join(out,'data/initial-data.js'),mock);fs.copyFileSync(path.join(app,'src/ai/core.mjs'),path.join(out,'core.mjs'));
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');const file=path.resolve(out,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));const rel=path.relative(out,file);if(rel.startsWith('..')||path.isAbsolute(rel)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.mp4':'video/mp4'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
server.listen(48762,'127.0.0.1',()=>console.log('Synthetic web connector QA: http://127.0.0.1:48762/index.html'));
