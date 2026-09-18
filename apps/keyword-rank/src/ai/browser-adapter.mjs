// Data stays in the existing browser store. Only explicit AI operations cross
// the user-paired extension -> native messaging channel. Never handle a key.
export function installBrowserAI(target=window) {
  if(target.keywordAI||!target.__KEYWORD_TRACKER_SEED__)return;
  let connected=false,lastError='',sequence=0;
  const pending=new Map();
  const guidance='请在浏览器扩展“关键词 AI 安全连接”中点击“连接当前页面”，并核对本机确认窗口。';
  const notify=()=>target.dispatchEvent(new Event('keyword-ai-connection'));
  target.addEventListener('message',event=>{
    if(event.source!==target||event.data?.source!=='keyword-ai-extension')return;
    const message=event.data;
    if(message.kind==='state'){
      const changed=connected!==!!message.connected;connected=!!message.connected;lastError=message.error||'';
      if(!connected)for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error(lastError||'连接已断开，请重新连接'));}if(!connected)pending.clear();
      if(changed||lastError)notify();return;
    }
    if(message.kind!=='response')return;
    const p=pending.get(message.id);if(!p)return;clearTimeout(p.timer);pending.delete(message.id);
    message.ok?p.resolve(message.data):p.reject(new Error(message.error||'本机连接器操作失败'));
  });
  const call=(method,payload)=>new Promise((resolve,reject)=>{
    if(!connected){reject(new Error(lastError||guidance));return;}
    const id=`web_${Date.now()}_${++sequence}`;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('连接器等待超时；请查看本机确认窗口，或重新连接后手动重试。'));},185000);
    pending.set(id,{resolve,reject,timer});
    target.postMessage({source:'keyword-ai-web',kind:'request',id,method,payload},'*');
  });
  target.keywordAI=Object.freeze({
    kind:'web-connector',
    status:async()=>connected?call('status'):{connected:false,configured:false,transport:'native',error:lastError},
    checkConnection:()=>target.postMessage({source:'keyword-ai-web',kind:'probe'},'*'),
    settings:()=>call('settings'),test:()=>call('test'),cancel:()=>call('cancel'),
    pickReport:()=>call('pick-report'),previewReport:p=>call('preview-report',p),commitReport:id=>call('commit-report',id),
    reports:async()=>connected?call('reports'):{groups:[],batches:[]},preferences:async()=>connected?call('preferences'):{},history:async()=>connected?call('history'):[],
    prepare:p=>call('prepare',p),start:id=>call('start',id),backup:()=>call('backup'),restore:()=>call('restore'),
  });
  target.postMessage({source:'keyword-ai-web',kind:'probe'},'*');
}
