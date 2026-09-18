import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as utils from '../utils.mjs';
const event=()=>({listeners:[],addListener(f){this.listeners.push(f);},emit(...args){for(const f of this.listeners)f(...args);}});
test('actual download listeners leave Lingxing and unrelated downloads untouched, including during Sif jobs',async()=>{
  const chrome={storage:{local:{get:async()=>({})}},runtime:{onMessage:event()},downloads:{onCreated:event(),onDeterminingFilename:event()}};
  const context=vm.createContext({...utils,chrome,setTimeout,clearTimeout,URL});
  const source=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import[\s\S]*?from "\.\/utils\.mjs";/,'');
  vm.runInContext(source,context);
  vm.runInContext("expectedDownloads.set('1254213275',{resolve:()=>{throw new Error('Unrelated download captured')},createdAt:1})",context);
  for(const item of [{id:1,referrer:'https://erp.lingxing.com/',url:'https://cdn.example/1254213275.xlsx'},{id:2,url:'https://www.sif.com.evil.example/B0FF4HCVXT.xlsx'},{id:3,filename:'Sif_CA_B0FF4HCVXT.xlsx'}]){
    chrome.downloads.onCreated.emit(item);let result='not called';chrome.downloads.onDeterminingFilename.emit(item,x=>{result=x;});assert.equal(result,undefined);
  }
  let result;chrome.downloads.onDeterminingFilename.emit({id:4,referrer:'https://www.sif.com/reverse?asin=B0FF4HCVXT',filename:'report.csv'},x=>{result=x;});
  assert.match(result.filename,/^Sif反查流量词_CA_B0FF4HCVXT_.*\.csv$/);
});
