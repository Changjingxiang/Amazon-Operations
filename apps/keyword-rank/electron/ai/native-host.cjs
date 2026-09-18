const fs = require('node:fs');
const {createDecoder,frames} = require('./native-wire.cjs');
const EXTENSION_ID = 'mccjmeinpgfilpppakcdfhpnooojihhn';
const HOST_NAME = 'com.keywordrank.ai';
const METHODS = new Set(['status','settings','test','cancel','pick-report','preview-report','commit-report','reports','preferences','prepare','start','history','backup','restore']);

function validatePage(value) {
  const url = new URL(value);
  if (url.username || url.password || url.href.length > 4096) throw new Error('网页地址无效');
  const local = url.protocol==='file:' && !url.hostname && /\.html?$/i.test(url.pathname);
  const hosted = url.protocol==='https:' || (url.protocol==='http:' && ['127.0.0.1','localhost'].includes(url.hostname));
  if (!local && !hosted) throw new Error('只支持本地 HTML、HTTPS 网页或本机开发页面');
  url.hash=''; return url.href;
}

function serve({origin,input,send,call,confirmPair,onClose}) {
  let paired=false, pairing=false, closed=false, inFlight=new Set(), mutation=false;
  const respond = value => { if (!closed) send(value); };
  const close = () => { if(closed)return; closed=true; call('cancel').catch(()=>{}); onClose(); };
  if (origin!==`chrome-extension://${EXTENSION_ID}/`) { close(); return {close}; }
  const receive = async message => {
    const {id,method,payload} = message||{};
    if (typeof id!=='string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id) || inFlight.has(id)) return;
    if (inFlight.size>=8) {respond({id,ok:false,error:'请求过于频繁，请稍后重试'});return;}
    inFlight.add(id);
    let locked=false;
    try {
      if (method==='pair') {
        if (paired || pairing) throw new Error('此连接已配对或正在确认');
        pairing=true;
        try {
          const page=validatePage(payload?.url);
          if (!await confirmPair(page)) throw new Error('未授权此网页连接');
          if(closed)return; paired=true; respond({id,ok:true,data:{connected:true}});
        } finally {pairing=false;}
        return;
      }
      if(!paired || !METHODS.has(method)) throw new Error('拒绝未授权的接口调用');
      if (!['status','cancel','reports','history','preferences'].includes(method)) {
        if(mutation)throw new Error('另一个操作尚未完成，请稍后重试');
        mutation=true; locked=true;
      }
      const data=await call(method,payload); respond({id,ok:true,data});
    } catch(error) {respond({id,ok:false,error:String(error.message||'连接器操作失败').slice(0,500)});}
    finally {inFlight.delete(id); if(locked)mutation=false;}
  };
  input.on('data',createDecoder(message=>{receive(message);},close));
  input.on('end',close); input.on('error',close);
  return {close};
}

function startNativeHost(options) {
  const pipe=process.argv.find(arg=>arg.startsWith('--connector-pipe='))?.slice(17);
  if(!pipe||!/^KeywordRankAI-[a-f0-9]{32}$/.test(pipe)){options.onClose();return;}
  const stream=require('node:net').createConnection({path:`\\\\.\\pipe\\${pipe}`});
  return serve({...options,input:stream,send:message=>{try{for(const frame of frames(message))stream.write(frame);}catch{options.onClose();}}});
}
module.exports={EXTENSION_ID,HOST_NAME,METHODS,validatePage,serve,startNativeHost};
