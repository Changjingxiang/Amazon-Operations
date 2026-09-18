const test=require('node:test'),assert=require('node:assert/strict'),{PassThrough}=require('node:stream');
const {createDecoder,frames,MAX_INPUT}=require('../../electron/ai/native-wire.cjs');
const {serve,EXTENSION_ID,validatePage}=require('../../electron/ai/native-host.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function encode(value){const b=Buffer.from(JSON.stringify(value)),h=Buffer.alloc(4);h.writeUInt32LE(b.length);return Buffer.concat([h,b]);}
test('native wire accepts split UTF-8 frames and caps untrusted input',()=>{
  const messages=[],errors=[],decode=createDecoder(x=>messages.push(x),e=>errors.push(e));
  const data=encode({text:'关键词🔑'});for(const b of data)decode(Buffer.from([b]));assert.deepEqual(messages,[{text:'关键词🔑'}]);
  const bad=Buffer.alloc(4);bad.writeUInt32LE(MAX_INPUT+1);decode(bad);assert.equal(errors.length,1);decode(data);assert.equal(messages.length,1);
});
test('native output chunks remain below Chrome 1MB and reconstruct non-ASCII history',()=>{
  const value={id:'history',data:'关键词'.repeat(150000)},parts=[];
  for(const frame of frames(value)){assert(frame.length<1024*1024);parts.push(JSON.parse(frame.subarray(4).toString()));}
  assert(parts.length>1);assert.deepEqual(JSON.parse(Buffer.concat(parts.map(p=>Buffer.from(p.data,'base64')))),value);
});
test('native host refuses foreign extensions, unpaired callers, key methods and bad URLs',async()=>{
  const input=new PassThrough(),sent=[],calls=[];let closed=0;
  serve({origin:`chrome-extension://${EXTENSION_ID}/`,input,send:m=>sent.push(m),call:async m=>{calls.push(m);return{};},confirmPair:async()=>true,onClose:()=>closed++});
  input.write(encode({id:'a',method:'status'}));await tick();assert.equal(sent.at(-1).ok,false);
  input.write(encode({id:'b',method:'pair',payload:{url:'https://example.com/keyword'}}));await tick();assert.equal(sent.at(-1).ok,true);
  input.write(encode({id:'c',method:'config-save',payload:{key:'forbidden'}}));await tick();assert.equal(sent.at(-1).ok,false);
  input.write(encode({id:'d',method:'status'}));await tick();assert.equal(sent.at(-1).ok,true);assert.deepEqual(calls,['status']);
  input.end();await tick();assert.equal(closed,1);assert.equal(calls.at(-1),'cancel');
  serve({origin:'chrome-extension://other/',input:new PassThrough(),send:()=>{},call:async()=>{},confirmPair:async()=>{throw Error('not called');},onClose:()=>closed++});assert.equal(closed,2);
  for(const url of ['javascript:alert(1)','http://example.com/','file://server/share/index.html','file:///C:/x.txt','https://user:pass@example.com/'])assert.throws(()=>validatePage(url));
});
test('cancel remains available while a native analysis is in progress',async()=>{
  const input=new PassThrough(),sent=[];let finish;
  serve({origin:`chrome-extension://${EXTENSION_ID}/`,input,send:m=>sent.push(m),confirmPair:async()=>true,onClose:()=>{},call:async method=>method==='start'?new Promise(resolve=>finish=resolve):method==='cancel'?(finish({cancelled:true}),{}):{}});
  input.write(encode({id:'p',method:'pair',payload:{url:'file:///C:/keyword/index.html'}}));await tick();
  input.write(encode({id:'run',method:'start',payload:'token'}));await tick();
  input.write(encode({id:'blocked',method:'settings'}));await tick();assert.equal(sent.at(-1).ok,false);
  input.write(encode({id:'cancel',method:'cancel'}));await tick();assert(sent.some(x=>x.id==='run'&&x.ok));assert(sent.some(x=>x.id==='cancel'&&x.ok));input.end();
});
