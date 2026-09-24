const { chromium } = require('../../apps/keyword-rank/node_modules/playwright-core');
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const release = path.resolve(process.argv[2]);
const output = path.resolve('work/competitor-image-qa'); fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1536,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.goto(pathToFileURL(path.join(release,'index.html')).href);
  await page.locator('.model-item').first().waitFor({timeout:60000});
  const skip=page.getByRole('button',{name:'暂时跳过',exact:true});await skip.waitFor({timeout:6000}).catch(()=>{});if(await skip.isVisible().catch(()=>false))await skip.click();
  const toggle=page.locator('.model-item:not([data-competitor-top-level]) .competitor-sidebar-toggle').first();await toggle.click();
  const competitor=page.locator('.competitor-sidebar-item .competitor-image-button').first();await competitor.waitFor();
  await competitor.hover();const preview=page.locator('.product-image-preview.is-visible');await preview.waitFor();await page.waitForTimeout(280);
  const opacity=await preview.evaluate(e=>getComputedStyle(e).opacity);assert(Number(opacity)>0.9,`preview opacity ${opacity}`);
  const sidebar=await page.locator('.sidebar').boundingBox(),box=await preview.boundingBox();assert(box.x>=sidebar.x+sidebar.width);
  await page.screenshot({path:path.join(output,'competitor-hover.png')});
  await preview.locator('button').hover();await page.waitForTimeout(180);assert(await preview.isVisible());
  await preview.locator('button').dblclick();await page.locator('.product-gallery').waitFor();
  await page.waitForTimeout(450);
  assert((await page.locator('.product-gallery-header p').textContent()).includes('BGOWATU'));
  await page.screenshot({path:path.join(output,'competitor-gallery.png')});
  await page.keyboard.press('Escape');await page.locator('.product-gallery').waitFor({state:'detached'});
  await competitor.hover();await page.locator('.product-image-preview.is-visible').waitFor();await page.mouse.move(1100,900);await page.waitForTimeout(600);assert.equal(await page.locator('.product-image-preview').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS competitor image preview');
 }catch(e){await page.screenshot({path:path.join(output,'failure.png')});throw e;}finally{await browser.close();}
})();
