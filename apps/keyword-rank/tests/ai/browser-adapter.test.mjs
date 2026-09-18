import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrowserAI} from '../../src/ai/browser-adapter.mjs';
class Page extends EventTarget{
  __KEYWORD_TRACKER_SEED__={};out=[];
  postMessage(data){this.out.push(data);}
  deliver(data,source=this){const event=new Event('message');Object.assign(event,{data:{source:'keyword-ai-extension',...data},source});this.dispatchEvent(event);}
}
test('web adapter contains no key surface and restores usable state after disconnect',async()=>{
  const page=new Page();installBrowserAI(page);assert.equal(page.keywordAI.kind,'web-connector');assert.equal(page.keywordAI.getKey,undefined);
  assert.equal((await page.keywordAI.status()).connected,false);await assert.rejects(page.keywordAI.prepare({}),/连接当前页面/);
  page.deliver({kind:'state',connected:true},{});assert.equal((await page.keywordAI.status()).connected,false);
  page.deliver({kind:'state',connected:true});const request=page.keywordAI.prepare({keyword:'coat'});let message=page.out.at(-1);assert.equal(message.method,'prepare');
  page.deliver({kind:'response',id:message.id,ok:true,data:{id:'opaque'}});assert.deepEqual(await request,{id:'opaque'});
  const pending=page.keywordAI.start('opaque');page.deliver({kind:'state',connected:false,error:'测试断连'});await assert.rejects(pending,/测试断连/);
  assert.equal((await page.keywordAI.status()).connected,false);assert.deepEqual(await page.keywordAI.history(),[]);
  page.deliver({kind:'state',connected:true});const retry=page.keywordAI.status();message=page.out.at(-1);page.deliver({kind:'response',id:message.id,ok:true,data:{connected:true}});assert.equal((await retry).connected,true);
});
