const https = require('node:https');
const dns = require('node:dns').promises;
const ipaddr = require('ipaddr.js');

function endpoint(value) {
  let url; try { url=new URL(value); } catch { throw new Error('请输入完整的 HTTPS API 地址'); }
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port&&url.port!=='443') throw new Error('API 仅允许无用户名、查询参数和片段的 HTTPS 地址（443 端口）');
  if(!url.hostname.includes('.')||/localhost|\.local$|\.internal$|\.test$|\.invalid$/i.test(url.hostname))throw new Error('API 必须使用公网域名');
  url.pathname=url.pathname.replace(/\/+$/,'');
  if(!url.pathname.endsWith('/chat/completions'))url.pathname+='/chat/completions';
  return url;
}
function publicAddress(address) {
  try { const ip=ipaddr.process(address); return ip.range()==='unicast' && (ip.kind()==='ipv4'||ip.match(ipaddr.parse('2000::'),3)); }catch{return false;}
}
async function resolvePublic(hostname, signal) {
  let timeout, abort;
  try {
    const records=await Promise.race([dns.lookup(hostname,{all:true,verbatim:true}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('DNS 查询超时')),10000);abort=()=>reject(new Error('已取消'));if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});})]);
    if(!records.length||records.some(r=>!publicAddress(r.address)))throw new Error('API 地址解析到非公网网络，已阻止请求');
    return records[0];
  }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
async function chat({url,key,body,signal}) {
  const dest=endpoint(url); const resolved=await resolvePublic(dest.hostname,signal);
  if(signal?.aborted)throw new Error('已取消');
  const encoded=Buffer.from(JSON.stringify(body));
  if(encoded.length>300000)throw new Error('请求体过大');
  return new Promise((resolve,reject)=>{
    let settled=false; let timer; const finish=(err,data)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);err?reject(err):resolve(data);};
    const request=https.request(dest,{method:'POST',agent:false,lookup:(_host,opts,cb)=>opts.all?cb(null,[resolved]):cb(null,resolved.address,resolved.family),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Content-Length':encoded.length}},response=>{
      // Never follow redirects, and never echo provider bodies containing credentials.
      if(response.statusCode!==200){response.resume();finish(new Error(response.statusCode===429?'平台限流，请稍后手动重试':response.statusCode===401||response.statusCode===403?'平台拒绝访问，请检查密钥、模型权限和余额':`平台返回 HTTP ${response.statusCode}，请求已停止`));return;}
      let bytes=0; const chunks=[];
      response.on('data',chunk=>{bytes+=chunk.length;if(bytes>1000000){response.destroy();finish(new Error('平台响应过大'));}else chunks.push(chunk);});
      response.on('error',()=>finish(new Error('平台响应中断')));
      response.on('end',()=>{try{const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(typeof data?.choices?.[0]?.message?.content!=='string')throw 0;finish(null,{content:data.choices[0].message.content,usage:{input:Number(data.usage?.prompt_tokens)||0,output:Number(data.usage?.completion_tokens)||0}});}catch{finish(new Error('平台响应不兼容 Chat Completions 格式'));}});
    });
    const abort=()=>{request.destroy();finish(new Error('已取消；已发送部分可能仍由平台计费'));};
    signal?.addEventListener('abort',abort,{once:true});
    request.on('error',()=>finish(new Error(signal?.aborted?'已取消':'网络或 TLS 连接失败，请检查地址和网络')));
    timer=setTimeout(()=>{request.destroy();finish(new Error('请求超过 120 秒，已停止；请手动重试'));},120000);
    request.end(encoded);
  });
}
module.exports={endpoint,publicAddress,resolvePublic,chat};
