const { chromium } = require('../apps/keyword-rank/node_modules/playwright-core');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1600,height:1000}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const record=(keyword,naturalRank,spRank)=>({keyword,naturalRank,spRank,snapshotDate:'2026-09-07',trafficRank:1,translation:'测试词'});
 const seed={schemaVersion:4,configs:[{modelName:'自家二号',parentAsin:'B022222222',historySheet:'second',countryCode:'CA'},{modelName:'自家测试',parentAsin:'B012345678',historySheet:'own',countryCode:'CA'}],competitors:[{competitorName:'竞品测试',parentAsin:'B087654321',ownerParentAsin:'B012345678',historySheet:'comp',countryCode:'CA'}],histories:{second:[record('knit sweater',22,7)],own:[record('knit sweater',12,3),record('unranked',0,0),record('natural only',5,0)],comp:[{...record('knit sweater',10,1),snapshotDate:'2026-09-06'},record('knit sweater',8,2)]},watches:[],annotations:[{modelName:'自家测试',parentAsin:'B012345678',keyword:'knit sweater',date:'2026-09-07',metric:'natural',text:'自然标注验证'},{modelName:'自家测试',parentAsin:'B012345678',keyword:'knit sweater',date:'2026-09-07',metric:'sp',text:'SP标注验证'}],abaMonthly:{'CA:2025-01':{month:'2025-01',countryCode:'CA',rows:{'knit sweater':12345}},'CA:2026-01':{month:'2026-01',countryCode:'CA',rows:{'knit sweater':54321}}}};
 await page.route('**/data/initial-data.js',route=>route.fulfill({contentType:'text/javascript',body:'window.__KEYWORD_TRACKER_SEED__='+JSON.stringify(seed)}));
 await page.goto('http://127.0.0.1:8768/outputs/'+encodeURIComponent('关键词排名每日跟进网页版-v2.1-shared-competitors-20260907-final')+'/');
 await page.locator('.busy-overlay').waitFor({state:'detached'});

 const getData=()=>page.evaluate(()=>window.keywordTracker.getData());
 let data=await getData(); assert.deepEqual(data.competitors[0].ownerParentAsins,['B012345678']);
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.locator('[data-competitor-owner]').selectOption('B022222222');
 await page.getByRole('button',{name:'关联到当前产品',exact:true}).click();
 await page.waitForEvent('load'); await page.locator('.busy-overlay').waitFor({state:'detached'});
 data=await getData();assert.equal(data.competitors.length,1);assert.equal(data.competitors[0].ownerParentAsins.length,2);assert(data.ownModels.every(m=>m.competitors.length===1));
 assert.equal(await page.locator('[data-competitor-asin="B087654321"]').count(),2);
 // Choose the same competitor under the second owner and check owner context.
 const list=page.locator('[data-competitor-sidebar-list]').nth(0);
 await page.locator('.model-item:visible .competitor-sidebar-toggle').nth(0).click();
 await list.locator('.competitor-sidebar-copy').click();
 const cell=page.locator('td.matrix-rank-cell[data-matrix-keyword="knit sweater"]').last();
 await cell.hover();await cell.dispatchEvent('mouseover');
 await page.waitForFunction(()=>document.querySelector('.matrix-competitor-bubble-grid')?.textContent.includes('自家二号'));
 assert((await page.locator('.matrix-competitor-bubble-grid').innerText()).includes('#22'));
 // Capture the planned import list without contacting SIF.
 await page.evaluate(()=>{window.keywordTracker.startSifBatchImport=async payload=>{window.qaBatch=payload.items;return {success:true,output:'测试导入队列已捕获',data:await window.keywordTracker.getData()};};});
 await page.getByRole('button',{name:'导入全部产品',exact:true}).click();
 await page.waitForFunction(()=>window.qaBatch?.length===3);
 const batch=await page.evaluate(()=>window.qaBatch);assert.deepEqual(batch.map(x=>x.kind),['own','own','competitor']);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('[data-competitor-owner]').selectOption('B012345678');
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.settings-modal')).opacity==='1'); await page.screenshot({path:'work/qa-shared-competitors.png',animations:'disabled'});
 await page.getByRole('button',{name:'解除当前关联',exact:true}).click();await page.waitForEvent('load');await page.locator('.busy-overlay').waitFor({state:'detached'});
 data=await getData();assert.deepEqual(data.competitors[0].ownerParentAsins,['B022222222']);assert.equal(data.competitors[0].historyRecords.length,2);
 // Removing the last owner keeps an unlinked library entry and all history.
 const response=await page.evaluate(()=>window.keywordTracker.deleteCompetitor({parentAsin:'B087654321',ownerParentAsin:'B022222222'}));
 assert.equal(response.data.competitors.length,1);assert.deepEqual(response.data.competitors[0].ownerParentAsins,[]);assert.equal(response.data.competitors[0].historyRecords.length,2);
 const relink=await page.evaluate(()=>window.keywordTracker.addCompetitor({parentAsin:'B087654321',ownerParentAsin:'B012345678'}));assert.equal(relink.data.competitors.length,1);assert.equal(relink.data.competitors[0].historyRecords.length,2);
 const deleted=await page.evaluate(()=>window.keywordTracker.deleteModel({parentAsin:'B012345678'})); assert.equal(deleted.data.competitors.length,1); assert.equal(deleted.data.competitors[0].historyRecords.length,2); assert.deepEqual(deleted.data.competitors[0].ownerParentAsins,[]);
 assert.deepEqual(errors,[]);console.log('PASS: legacy migration, shared link UI, owner bubble context, deduplicated staged import, unlink and relink preserve history');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
