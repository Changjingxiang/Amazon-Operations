(() => {
  if(window.top!==window)return;
  // Reconnecting replaces the previous listener in this isolated extension world.
  globalThis.keywordAIPageCleanup?.();
  const port=chrome.runtime.connect({name:'keyword-ai-page'});
  let connected=false;
  const post=message=>window.postMessage({source:'keyword-ai-extension',...message},'*');
  const listener=event=>{
    if(event.source!==window||event.data?.source!=='keyword-ai-web')return;
    if(event.data.kind==='probe'){post({kind:'state',connected});return;}
    if(event.data.kind==='request'&&connected)port.postMessage({kind:'request',id:event.data.id,method:event.data.method,payload:event.data.payload});
  };
  window.addEventListener('message',listener);
  port.onMessage.addListener(message=>{if(message.kind==='state')connected=!!message.connected;post(message);});
  port.onDisconnect.addListener(()=>{const error=chrome.runtime.lastError;connected=false;post({kind:'state',connected:false,error:error?'扩展连接已断开，请重新连接':'连接已断开'});window.removeEventListener('message',listener);});
  globalThis.keywordAIPageCleanup=()=>{window.removeEventListener('message',listener);port.disconnect();};
})();
