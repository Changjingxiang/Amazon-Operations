const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require('../../apps/keyword-rank/node_modules/playwright-core');
const xlsx = require('../../apps/keyword-rank/node_modules/xlsx');
const release = path.resolve(process.argv[2]), backupPath = process.argv[3];
const seed = JSON.parse(fs.readFileSync(path.join(release, 'data/Amazon关键词每日跟进-v3.0-示例数据.json'), 'utf8'));
const original = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
const jsSeed = JSON.parse(fs.readFileSync(path.join(release,'data/initial-data.js'),'utf8').replace(/^window\.__KEYWORD_TRACKER_SEED__\s*=\s*/, '').replace(/;\s*$/, ''));
assert.deepEqual(jsSeed, seed);
assert.equal(seed.configs.length, 1); assert.equal(seed.configs[0].parentAsin, 'B0C1YF9FWH');
assert.deepEqual(seed.competitors.map(c => c.parentAsin), ['B0D7HQDP6Y','B0BVKGGWLY','B0BZJ6FSQM']);
for (const c of seed.competitors) { assert.deepEqual(c.ownerParentAsins,['B0C1YF9FWH']); assert.equal(c.ownerParentAsin,'B0C1YF9FWH'); assert.equal(c.ownerModelName,'L23M911薄夹克'); }
for(const [name, records] of Object.entries(seed.histories)) assert.deepEqual(records, original.histories[name]);
assert.equal(Object.values(seed.histories).reduce((n,r)=>n+r.length,0),43453);
assert.deepEqual(seed.annotations,original.annotations.filter(a=>a.modelName==='L23M911薄夹克'));
assert.deepEqual(seed.watches,original.watches.filter(w=>w.modelName==='L23M911薄夹克'));
for(const [id,month] of Object.entries(seed.abaMonthly)) { assert.equal(month.rowCount,Object.keys(month.rows).length); for(const [keyword,rank]of Object.entries(month.rows)) assert.deepEqual(rank,original.abaMonthly[id].rows[keyword]); }
for(const [asin,icon]of Object.entries(seed.iconSelections)) assert.deepEqual(icon,original.iconSelections[asin]);
const workbook = xlsx.readFile(path.join(release,'data/Amazon关键词每日跟进-v3.0-示例参考.xlsx'));
assert.deepEqual(workbook.SheetNames,['最新排名','关注词','标注']);
const latest = xlsx.utils.sheet_to_json(workbook.Sheets['最新排名'],{range:4});
assert.equal(latest.length,1880); assert.deepEqual([...new Set(latest.map(r=>r['父体 ASIN']))], ['B0C1YF9FWH','B0D7HQDP6Y','B0BVKGGWLY','B0BZJ6FSQM']);
assert.equal(latest[0]['自然排名'],34); assert.equal(xlsx.utils.sheet_to_json(workbook.Sheets['标注'],{range:4}).length,34);
assert(!fs.existsSync(path.join(release,'data/关键词排名每日跟进表.xlsx')));
const manifest = JSON.parse(fs.readFileSync(path.join(release,'BUILD-MANIFEST.json'),'utf8')); assert.equal(manifest.version,'3.0.0');
for(const entry of manifest.files) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(release,entry.path))).digest('hex').toUpperCase(),entry.sha256);
const output = path.resolve('work/v3-example-qa'); fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}); const page=await browser.newPage({viewport:{width:1536,height:960},acceptDownloads:true}); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.goto(pathToFileURL(path.join(release,'index.html')).href); await page.getByRole('button',{name:'开始引导',exact:true}).waitFor({timeout:60000});
  assert.equal(await page.title(),'Amazon关键词每日跟进-v3.0'); assert.equal(await page.locator('.window-titlebar strong').textContent(),'Amazon关键词每日跟进-v3.0');
  await page.screenshot({path:path.join(output,'welcome.png')}); await page.getByRole('button',{name:'暂时跳过',exact:true}).click();
  await page.waitForTimeout(300); assert.equal(await page.locator('.model-item:visible').count(),1);
  const data=await page.evaluate(()=>window.keywordTracker.getData()); assert.equal(data.ownModels.length,1); assert.equal(data.competitors.length,3); assert.equal(data.models[0].latestDate,'2026-09-22');
  assert.equal(data.models[0].watches.length,seed.watches.filter(w=>w.enabled).length);
  await page.locator('[data-competitor-sidebar-toggle]').first().click(); await page.waitForTimeout(200);
  assert.equal(await page.locator('[data-competitor-sidebar-item]:visible').count(),3);
  await page.screenshot({path:path.join(output,'L23M911-and-competitors.png')});
  await page.locator('[data-competitor-sidebar-item]').first().click(); await page.waitForTimeout(250); assert((await page.locator('.topbar').textContent()).includes('B0D7HQDP6Y'));
  await page.locator('.model-item .model-copy').first().click(); await page.waitForTimeout(250); assert((await page.locator('.topbar').textContent()).includes('B0C1YF9FWH'));
  await page.getByRole('button',{name:'工具文件夹',exact:true}).click();
  const pending=page.waitForEvent('download'); await page.getByRole('link',{name:'下载示例参考 Excel',exact:true}).click(); const download=await pending; assert.equal(await download.failure(),null); assert.equal(download.suggestedFilename(),'Amazon关键词每日跟进-v3.0-示例参考.xlsx');
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.reload(); await page.waitForSelector('.matrix-table',{timeout:60000}); await page.waitForSelector('.k-loading',{state:'detached'}); assert.equal(await page.locator('[data-usage-guide]').count(),0);
  assert.deepEqual(errors,[]);
  const result={ownProducts:1,competitors:3,historyRows:43453,annotations:34,latestDate:data.models[0].latestDate,firstRunGuide:true,sidebarAndCompetitorSwitch:true,excelDownload:true,seedAndBackupComparison:true,pageErrors:errors};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2));
 } catch(error) { await page.screenshot({path:path.join(output,'failure.png')}); console.error(errors); throw error; } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
