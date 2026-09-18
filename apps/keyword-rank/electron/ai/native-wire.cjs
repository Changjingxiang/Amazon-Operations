// Chrome Native Messaging: length-prefixed UTF-8 JSON over inherited pipes.
// No socket, HTTP server, shell execution, or arbitrary method dispatch.
const MAX_INPUT = 32 * 1024 * 1024;
const MAX_OUTPUT = 20 * 1024 * 1024;

function createDecoder(onMessage, onError) {
  let buffer = Buffer.alloc(0), failed = false;
  return chunk => {
    if (failed) return;
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const size = buffer.readUInt32LE(0);
      if (!size || size > MAX_INPUT) { failed = true; onError(new Error('消息大小超出限制')); return; }
      if (buffer.length < size + 4) return;
      const body = buffer.subarray(4, size + 4); buffer = buffer.subarray(size + 4);
      try { onMessage(JSON.parse(body.toString('utf8'))); }
      catch { failed = true; onError(new Error('消息格式无效')); return; }
    }
  };
}
function frames(message) {
  const encoded = Buffer.from(JSON.stringify(message));
  if (encoded.length > MAX_OUTPUT) return frames({id:message.id,ok:false,error:'返回数据过大，请缩小范围或导出本地备份'});
  const output = [];
  // Chrome permits 1 MB per native-host frame, including UTF-8 expansion.
  for (let offset = 0, index = 0; offset < encoded.length; offset += 192 * 1024, index++) {
    const body = Buffer.from(JSON.stringify({kind:'chunk',id:message.id,index,total:Math.ceil(encoded.length/(192*1024)),data:encoded.subarray(offset,offset+192*1024).toString('base64')}));
    const header = Buffer.alloc(4); header.writeUInt32LE(body.length); output.push(Buffer.concat([header,body]));
  }
  return output;
}
module.exports={createDecoder,frames,MAX_INPUT,MAX_OUTPUT};
