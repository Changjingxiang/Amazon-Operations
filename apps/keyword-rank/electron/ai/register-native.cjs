const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {EXTENSION_ID,HOST_NAME}=require('./native-host.cjs');
const REGISTRY=['Software\\Google\\Chrome\\NativeMessagingHosts','Software\\Microsoft\\Edge\\NativeMessagingHosts'];
function register(executable,dataDirectory,remove=false) {
  const manifest=path.join(dataDirectory,'native-host.json');
  const reg=path.join(process.env.SystemRoot||'C:\\Windows','System32','reg.exe');
  if(remove) {
    for(const base of REGISTRY) {try{execFileSync(reg,['delete',`HKCU\\${base}\\${HOST_NAME}`,'/f'],{windowsHide:true,stdio:'ignore'});}catch{}}
    if(fs.existsSync(manifest))fs.unlinkSync(manifest);
  } else {
    const relay=path.join(path.dirname(executable),'KeywordRankAINative.exe');
    if(!fs.existsSync(relay))throw new Error('缺少连接器消息转发程序');
    fs.mkdirSync(dataDirectory,{recursive:true});
    fs.writeFileSync(manifest,JSON.stringify({name:HOST_NAME,description:'关键词排名网页版 AI 安全连接器',path:relay,type:'stdio',allowed_origins:[`chrome-extension://${EXTENSION_ID}/`]},null,2));
    for(const base of REGISTRY)execFileSync(reg,['add',`HKCU\\${base}\\${HOST_NAME}`,'/ve','/t','REG_SZ','/d',manifest,'/f'],{windowsHide:true,stdio:'ignore'});
  }
}
module.exports={register};
