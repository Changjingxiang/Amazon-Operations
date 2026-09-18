// Test-only bootstrap: real Electron pipes/DPAPI/backend, synthetic credentials
// and mock API. This file is excluded from every production package.
const {app,dialog,safeStorage}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const profile=process.argv.find(x=>x.startsWith('--profile=')).slice(10);
app.setPath('appData',profile);
const target=process.argv.find(x=>x.startsWith('--target='))?.slice(9)||path.resolve(__dirname,'../../electron/ai/main.cjs');
const network=require(path.join(path.dirname(target),'network.cjs'));
network.chat=async request=>{
  fs.appendFileSync(path.join(profile,'calls.txt'),'call\n');
  if(request.body.messages.length===1)return{content:'OK',usage:{input:1,output:1}};
  const data=JSON.parse(request.body.messages[1].content);
  return {content:JSON.stringify({findings:[{title:'合成测试',fact:'测试证据',hypothesis:'需核对',action:'继续观察',evidenceIds:[data.evidence[0].id]}],limitations:['合成测试']}),usage:{input:1,output:1}};
};
dialog.showMessageBox=async options=>({response:process.argv.includes('--deny-pair')&&options.title==='允许网页版连接 AI？'||process.argv.includes('--deny-send')&&options.title==='AI 本机安全连接器'?0:1,checkboxChecked:true});
app.whenReady().then(()=>{
  const dir=path.join(profile,'KeywordRankAI');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'connection.json'),JSON.stringify({endpoint:'https://api.example.com/v1/chat/completions',model:'synthetic-model',persisted:true,encrypted:safeStorage.encryptString('synthetic_'+crypto.randomBytes(24).toString('hex')).toString('base64')}));
});
require(target);
