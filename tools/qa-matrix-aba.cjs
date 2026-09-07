const { chromium } = require('../apps/keyword-rank/node_modules/playwright-core');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1600,height:1000}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const record=(keyword,naturalRank,spRank)=>({keyword,naturalRank,spRank,snapshotDate:'2026-09-07',trafficRank:1,translation:'测试词'});
 const seed={schemaVersion:4,configs:[{modelName:'自家测试',parentAsin:'B012345678',historySheet:'own',countryCode:'CA'}],competitors:[{competitorName:'竞品测试',parentAsin:'B087654321',ownerParentAsin:'B012345678',historySheet:'comp',countryCode:'CA'}],histories:{own:[record('knit sweater',12,3),record('unranked',0,0),record('natural only',5,0)],comp:[record('knit sweater',8,2)]},watches:[],annotations:[{modelName:'自家测试',parentAsin:'B012345678',keyword:'knit sweater',date:'2026-09-07',metric:'natural',text:'自然标注验证'},{modelName:'自家测试',parentAsin:'B012345678',keyword:'knit sweater',date:'2026-09-07',metric:'sp',text:'SP标注验证'}],abaMonthly:{'CA:2025-01':{month:'2025-01',countryCode:'CA',rows:{'knit sweater':12345}},'CA:2026-01':{month:'2026-01',countryCode:'CA',rows:{'knit sweater':54321}}}};
 await page.route('**/data/initial-data.js',route=>route.fulfill({contentType:'text/javascript',body:'window.__KEYWORD_TRACKER_SEED__='+JSON.stringify(seed)}));
 await page.goto('http://127.0.0.1:8768/outputs/'+encodeURIComponent('关键词排名每日跟进网页版-v2.1-matrix-aba-fix-20260907')+'/');
 await page.locator('.busy-overlay').waitFor({state:'detached'});
 for(const [tab,rank,note] of [['自然矩阵','#12','自然标注验证'],['SP矩阵','#3','SP标注验证']]){
 await page.getByRole('button',{name:tab,exact:true}).click();
 const cell=page.locator('td.matrix-rank-cell[data-matrix-keyword="knit sweater"]').first();await page.waitForFunction(()=>document.querySelector('[data-competitor-matrix-hover]')); await cell.hover(); await cell.dispatchEvent('mouseover');
 await page.waitForFunction(()=>document.querySelector('.matrix-competitor-bubble-annotation')?.textContent.includes('验证'));
 const text=await page.locator('.matrix-competitor-bubble-grid').innerText();assert(text.includes(rank));assert(text.includes(note));assert(text.includes(tab==='自然矩阵'?'#8':'#2'));console.log(tab,text);
 }
 await page.getByRole('button',{name:'ABA月榜',exact:true}).click();
 await page.getByLabel('ABA年份').selectOption('2025');
 await page.waitForFunction(()=>document.querySelector('.aba-table')?.textContent.includes('12,345'));
 assert(!(await page.locator('.aba-table').innerText()).includes('54,321'));
 await page.waitForFunction(()=>document.querySelector('.aba-table')?.dataset.abaComparisonColumns==='ready'); await page.locator('.matrix-competitor-bubble-grid').waitFor({state:'detached'}); await page.screenshot({path:'work/qa-aba-20250907.png'});
 await page.getByLabel('ABA年份').selectOption('2026');await page.waitForFunction(()=>document.querySelector('.aba-table')?.textContent.includes('54,321'));
 await page.getByRole('button',{name:'对比矩阵',exact:true}).click();
 assert.equal(await page.locator('.comparison-section').count(),1);assert.equal(await page.locator('.comparison-table tbody tr').count(),3);
 await page.screenshot({path:'work/qa-comparison-20260907.png'});
 await page.locator('.comparison-panel').getByRole('button',{name:'筛选',exact:true}).click(); await page.locator('label').filter({hasText:/^仅自然上榜$/}).click(); assert.equal(await page.locator('[data-comparison-section="only-natural"]').count(),1); assert.equal(await page.locator('.comparison-table tbody tr').count(),1); await page.locator('label').filter({hasText:/^仅自然上榜$/}).click(); assert.equal(await page.locator('[data-comparison-section="all"]').count(),1); assert.equal(await page.locator('.comparison-table tbody tr').count(),3); assert.deepEqual(errors,[]);console.log('PASS: tooltips, annotations, ABA 2025/2026, combined rows including unranked; no page errors');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
