const test=require('node:test'),assert=require('node:assert/strict');
const https=require('node:https'),dns=require('node:dns').promises,{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {endpoint,publicAddress,chat}=require('../../electron/ai/network.cjs');
test('endpoint rejects credentials, HTTP, query keys, fragments and nonstandard ports',()=>{for(const url of ['http://example.com/v1','https://a:b@example.com/v1','https://example.com/v1?key=hidden','https://example.com/v1#key','https://example.com:8443/v1','https://localhost/v1'])assert.throws(()=>endpoint(url));assert.equal(endpoint('https://api.example.com/v1').href,'https://api.example.com/v1/chat/completions');});
test('private, local, metadata, reserved and mapped addresses rejected',()=>{for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','192.0.2.1','::1','fe80::1','fc00::1','::ffff:127.0.0.1','2001:db8::1'])assert.equal(publicAddress(ip),false,ip);assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);});
test('transport pins public DNS, never follows redirects, never echoes error bodies',async()=>{
  const oldDns=dns.lookup,oldRequest=https.request;let calls=0,code=302,captured;
  dns.lookup=async()=>[{address:'8.8.8.8',family:4}];
  https.request=(url,options,callback)=>{calls++;captured=options;const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{const res=new PassThrough();res.statusCode=code;res.headers={location:'https://other.example.com/'};callback(res);res.end('sensitive provider body');});return req;};
  try{await assert.rejects(chat({url:'https://api.example.com/v1',key:'synthetic-connection-value',body:{},signal:new AbortController().signal}),/HTTP 302/);assert.equal(calls,1);captured.lookup('api.example.com',{},(_error,address)=>assert.equal(address,'8.8.8.8'));code=401;await assert.rejects(chat({url:'https://api.example.com/v1',key:'synthetic-connection-value',body:{}}),error=>!error.message.includes('sensitive')&&/拒绝访问/.test(error.message));dns.lookup=async()=>[{address:'127.0.0.1',family:4}];await assert.rejects(chat({url:'https://api.example.com/v1',key:'synthetic-connection-value',body:{}}),/非公网/);assert.equal(calls,2);}finally{dns.lookup=oldDns;https.request=oldRequest;}
});
test('cancellation aborts an active request without a retry',async()=>{
  const oldDns=dns.lookup,oldRequest=https.request;let destroyed=false;dns.lookup=async()=>[{address:'8.8.8.8',family:4}];
  const controller=new AbortController();https.request=()=>{const req=new EventEmitter();req.destroy=()=>{destroyed=true;};req.end=()=>queueMicrotask(()=>controller.abort());return req;};
  try{await assert.rejects(chat({url:'https://api.example.com/v1',key:'synthetic-connection-value',body:{},signal:controller.signal}),/取消/);assert.ok(destroyed);}finally{dns.lookup=oldDns;https.request=oldRequest;}
});
