const HOST='com.keywordrank.ai';
const METHODS=new Set(['status','settings','test','cancel','pick-report','preview-report','commit-report','reports','preferences','prepare','start','history','backup','restore']);
let connection=null;
const cleanURL=value=>{const u=new URL(value);u.hash='';return u.href;};
function validPage(value){try{const u=new URL(value);return !u.username&&!u.password&&u.href.length<=4096&&((u.protocol==='file:'&&!u.hostname&&/\.html?$/i.test(u.pathname))||u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)));}catch{return false;}}
function close(reason='连接已断开'){
  const c=connection;if(!c)return;connection=null;
  for(const item of c.requests.values())clearTimeout(item.timer);
  try{c.page?.postMessage({kind:'state',connected:false,error:reason});c.page?.disconnect();}catch{}
  try{c.native?.disconnect();}catch{}
}
function sendNative(c,id,method,payload){
  if(c.requests.size>=8)throw new Error('请求过多，请稍后重试');
  const timer=setTimeout(()=>{if(connection===c)close('连接器长时间未响应，已断开；请重新连接后手动重试。');},180000);
  c.requests.set(id,{parts:[],bytes:0,timer});
  try{c.native.postMessage({id,method,payload});}catch{clearTimeout(timer);c.requests.delete(id);throw new Error('本机连接器不可用');}
}
chrome.runtime.onConnect.addListener(port=>{
  const c=connection;
  if(port.name!=='keyword-ai-page'||!c||c.page||port.sender?.id!==chrome.runtime.id||port.sender.frameId!==0||port.sender.tab?.id!==c.tabId||cleanURL(port.sender.url)!==c.url){port.disconnect();return;}
  c.page=port;
  c.native=chrome.runtime.connectNative(HOST);
  c.native.onMessage.addListener(message=>{
    if(connection!==c)return;
    const item=c.requests.get(message.id);
    if(!item||message.kind!=='chunk'||!Number.isInteger(message.total)||message.total<1||message.total>110||message.index!==item.parts.length||typeof message.data!=='string'||message.data.length>270000){close('连接器返回了无效消息');return;}
    if(item.total!=null&&item.total!==message.total){close('连接器返回了无效分片');return;} item.total=message.total;
    try{const text=atob(message.data);const bytes=Uint8Array.from(text,c=>c.charCodeAt(0));item.bytes+=bytes.length;if(item.bytes>20*1024*1024)throw 0;item.parts.push(bytes);}catch{close('连接器返回数据过大或无效');return;}
    if(item.parts.length!==message.total)return;
    clearTimeout(item.timer);c.requests.delete(message.id);
    try{
      const bytes=new Uint8Array(item.bytes);let offset=0;for(const part of item.parts){bytes.set(part,offset);offset+=part.length;}
      const response=JSON.parse(new TextDecoder().decode(bytes));if(response.id!==message.id||typeof response.ok!=='boolean')throw 0;
      if(message.id==='pair'){
        if(!response.ok){close(response.error||'未允许网页连接');return;}
        c.ready=true;c.page.postMessage({kind:'state',connected:true});
      } else c.page.postMessage({kind:'response',...response});
    }catch{close('无法读取连接器响应');}
  });
  c.native.onDisconnect.addListener(()=>{const error=chrome.runtime.lastError; if(connection===c)close(error?'无法连接本机程序。请先注册连接器，并关闭独立 AI 增强窗口或其他浏览器中的连接。':'本机连接器已退出');});
  port.onDisconnect.addListener(()=>{if(connection===c)close();});
  port.onMessage.addListener(message=>{
    if(connection!==c)return;
    if(message?.kind==='probe'){port.postMessage({kind:'state',connected:c.ready});return;}
    if(!c.ready||message?.kind!=='request'||typeof message.id!=='string'||!/^web_[a-zA-Z0-9_-]{1,70}$/.test(message.id)||!METHODS.has(message.method)||c.requests.has(message.id))return;
    try{if(JSON.stringify(message).length>30*1024*1024)throw new Error('数据太大，请按关键词缩小范围');sendNative(c,message.id,message.method,message.payload);}catch(e){port.postMessage({kind:'response',id:message.id,ok:false,error:e.message});}
  });
  sendNative(c,'pair','pair',{url:c.url});
});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html'))return;
  (async()=>{
    if(message?.action==='status')return{connected:!!connection?.ready,connecting:!!connection&&!connection.ready,tabId:connection?.tabId};
    if(message?.action==='disconnect'){close('已手动断开连接');return{connected:false};}
    if(message?.action!=='connect')throw new Error('操作无效');
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id||!validPage(tab.url))throw new Error('请先打开关键词软件的本地 HTML 或 HTTPS 网页');
    if(connection)throw new Error('已有页面连接，请先断开后再连接当前页面');
    connection={tabId:tab.id,url:cleanURL(tab.url),page:null,native:null,ready:false,requests:new Map()};
    try{await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});}catch{close();throw new Error('无法连接此页面。本地文件请在扩展详情开启“允许访问文件网址”，再重试。');}
    return{connecting:true};
  })().then(data=>respond({ok:true,data}),error=>respond({ok:false,error:error.message}));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId=>{if(connection?.tabId===tabId)close();});
chrome.tabs.onUpdated.addListener((tabId,change)=>{if(connection?.tabId===tabId&&(change.status==='loading'||change.url&&cleanURL(change.url)!==connection.url))close('页面已刷新或跳转，请重新连接扩展');});
