const { chromium } = require('../../apps/keyword-rank/node_modules/playwright-core');
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const output = path.resolve('work/watch-qa-20260922'); fs.mkdirSync(output, { recursive: true });
const baseline = process.argv.includes('--baseline');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('keyword-tracker:usage-guide:v1', JSON.stringify({ seen: true })));
  const ready = async () => { await page.waitForSelector('.matrix-table', { timeout: 60000 }); await page.waitForSelector('.k-loading', { state: 'detached', timeout: 30000 }); };
  const settle = () => page.waitForFunction(() => window.__calls.length && window.__calls.every(c => c.done) && !document.querySelector('.star-button[aria-busy="true"]'), null, { timeout: 30000 });
  const row = keyword => page.locator(`.matrix-table tr[data-matrix-keyword=${JSON.stringify(keyword)}]`);
  const star = keyword => row(keyword).locator('.star-button');
  const stored = () => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('keyword-rank-daily-tracker-v181', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const state = await new Promise((resolve, reject) => { const r = db.transaction('state').objectStore('state').get('tracker-store'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const keys = await new Promise(resolve => { const r = db.transaction('state').objectStore('state').getAllKeys(); r.onsuccess = () => resolve(r.result); });
    const backupKey = keys.filter(k => typeof k === 'string' && k.startsWith('daily-backup:')).sort().at(-1);
    const backup = await new Promise(resolve => { const r = db.transaction('state').objectStore('state').get(backupKey); r.onsuccess = () => resolve(r.result); }); db.close();
    const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(b => b.toString(16).padStart(2, '0')).join('');
    return { watches: state.watches, backupWatches: backup?.store?.watches, histories: await digest(state.histories), annotations: await digest(state.annotations) };
  });
  try {
    await page.goto(pathToFileURL(path.resolve(process.argv[2], 'index.html')).href); await ready();
    const initial = await stored();
    await page.evaluate(() => {
      window.__calls = []; window.__overlay = false; window.__frames = []; window.__record = true;
      let last = performance.now(); function frame(now) { if (window.__record) { window.__frames.push(now - last); last = now; requestAnimationFrame(frame); } } requestAnimationFrame(frame);
      new MutationObserver(() => { if (document.querySelector('.busy-overlay')) window.__overlay = true; }).observe(document.body, { childList: true, subtree: true });
      const original = window.keywordTracker.setWatch; window.__originalWatch = original;
      window.keywordTracker.setWatch = async payload => {
        const entry = { keyword: payload.keyword, enabled: payload.enabled, start: performance.now() }; window.__calls.push(entry);
        try { if (window.__saveDelay) await new Promise(r => setTimeout(r, window.__saveDelay)); const result = await original(payload); entry.hasFullData = Boolean(result.data); return result; }
        finally { entry.ms = performance.now() - entry.start; entry.done = true; }
      };
    });
    const keyword = await page.locator('.matrix-table tr[data-matrix-keyword]').first().getAttribute('data-matrix-keyword');
    const beforeY = (await star(keyword).boundingBox()).y;
    await star(keyword).click(); await settle(); await page.waitForTimeout(180);
    const measured = await page.evaluate(() => { window.__record = false; return { calls: window.__calls, overlay: window.__overlay, maxFrameGapMs: Math.max(...window.__frames), longFrames: window.__frames.filter(v => v > 50).length }; });
    if (!baseline) {
      assert.equal(measured.overlay, false); assert.equal(measured.calls[0].hasFullData, false);
      assert.equal((await star(keyword).boundingBox()).y, beforeY, 'row stays in place');
      const after = await stored(); assert.equal(after.histories, initial.histories); assert.equal(after.annotations, initial.annotations); assert.deepEqual(after.watches, after.backupWatches);
      assert.equal(await star(keyword).getAttribute('aria-pressed'), 'false');
      await page.evaluate(() => { window.__calls = []; window.__saveDelay = 180; });
      // Rapid on/off/on; only the final intent should remain visible and durable.
      await star(keyword).click(); await star(keyword).click(); await star(keyword).click();
      await page.screenshot({ path: path.join(output, 'saving.png'), animations: 'disabled' });
      await settle(); assert.equal(await star(keyword).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.busy-overlay').count(), 0);
      const successful = await stored(); assert.deepEqual(successful.watches, successful.backupWatches);
      // Reject the actual worker startup, not only a fake UI response.
      await page.evaluate(() => { window.__calls = []; window.__saveDelay = 0; window.__Worker = window.Worker; window.Worker = class { constructor() { throw new Error('QA worker startup failure'); } }; });
      await star(keyword).click(); await settle();
      assert.equal(await star(keyword).getAttribute('aria-pressed'), 'true', 'failed save rolls back');
      assert.deepEqual((await stored()).watches, successful.watches, 'failed worker did not alter persisted watch state');
      await page.evaluate(() => { window.Worker = window.__Worker; window.__calls = []; });
      // Another star and an annotation use the same persistence queue.
      const second = await page.locator('.matrix-table tr[data-matrix-keyword]').nth(1).getAttribute('data-matrix-keyword');
      await star(second).click();
      await page.evaluate(async keyword => {
        const model = (await window.keywordTracker.getData()).models[0];
        await window.keywordTracker.setAnnotation({ parentAsin: model.parentAsin, modelName: model.modelName, keyword, date: model.latestDate, metric: 'natural', text: 'watch-queue-QA', lightweight: true });
      }, second);
      await settle();
      const final = await stored(); assert.equal(final.histories, initial.histories); assert.notEqual(final.annotations, initial.annotations); assert.deepEqual(final.watches, final.backupWatches);
      // Keep saving while switching products; each request owns its ASIN.
      const third = await page.locator('.matrix-table tr[data-matrix-keyword]').nth(2).getAttribute('data-matrix-keyword');
      const firstAsin = await page.evaluate(() => window.keywordTracker.getData().then(d => d.models[0].parentAsin));
      const firstName = await page.evaluate(() => window.keywordTracker.getData().then(d => d.models[0].modelName));
      const thirdEnabled = (await star(third).getAttribute('aria-pressed')) !== 'true';
      await page.evaluate(() => { window.__calls = []; window.__saveDelay = 220; });
      await star(third).click();
      await page.locator('.model-item .model-copy').nth(1).click();
      const secondAsin = await page.evaluate(() => window.keywordTracker.getData().then(d => d.models[1].parentAsin));
      const secondName = await page.evaluate(() => window.keywordTracker.getData().then(d => d.models[1].modelName));
      const otherKeyword = await page.locator('.matrix-table tr[data-matrix-keyword]').first().getAttribute('data-matrix-keyword');
      const otherEnabled = (await star(otherKeyword).getAttribute('aria-pressed')) !== 'true';
      await star(otherKeyword).click(); await settle();
      assert((await page.locator('.model-item.active .model-copy').textContent()).includes(secondAsin));
      const switched = await stored();
      assert.equal(switched.watches.find(w => (w.parentAsin === firstAsin || (!w.parentAsin && w.modelName === firstName)) && w.keyword === third).enabled, thirdEnabled);
      assert.equal(switched.watches.find(w => (w.parentAsin === secondAsin || (!w.parentAsin && w.modelName === secondName)) && w.keyword === otherKeyword).enabled, otherEnabled);
      assert.deepEqual(switched.watches, switched.backupWatches); measured.productSwitchDuringSave = true;
      await page.locator('.model-item .model-copy').first().click();
      await page.reload(); await ready(); assert.equal(await star(keyword).getAttribute('aria-pressed'), 'true');
      assert.equal(await star(second).getAttribute('aria-pressed'), 'false');
      await page.getByRole('button', { name: 'SP矩阵', exact: true }).click(); assert.equal(await star(keyword).getAttribute('aria-pressed'), 'true');
      await page.locator('.cascade-search input').fill('men');
      await page.waitForTimeout(300);
      await page.locator('.matrix-scroll').evaluate(e => { e.scrollTop = 130; e.scrollLeft = 380; });
      await page.waitForTimeout(200);
      const visibleStar = await page.evaluate(() => {
        const viewport = document.querySelector('.matrix-scroll').getBoundingClientRect();
        for (const button of document.querySelectorAll('.matrix-table .star-button')) {
          const b = button.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2;
          if (x > viewport.left && x < viewport.right && y > viewport.top && y < viewport.bottom && document.elementFromPoint(x, y)?.closest('.star-button') === button) {
            return { x, y, keyword: button.closest('tr').dataset.matrixKeyword, pressed: button.getAttribute('aria-pressed') };
          }
        }
      });
      assert(visibleStar, 'a visible star must pass hit testing');
      const position = await page.locator('.matrix-scroll').evaluate(e => ({ x: e.scrollLeft, y: e.scrollTop }));
      await page.mouse.click(visibleStar.x, visibleStar.y);
      await page.waitForFunction(() => !document.querySelector('.star-button[aria-busy="true"]') && !document.querySelector('.statusbar').textContent.includes('正在后台保存关注'));
      assert.notEqual(await star(visibleStar.keyword).getAttribute('aria-pressed'), visibleStar.pressed);
      assert.deepEqual(await page.locator('.matrix-scroll').evaluate(e => ({ x: e.scrollLeft, y: e.scrollTop })), position);
      assert.equal(await page.locator('.cascade-search input').inputValue(), 'men'); measured.scrollAndFilterRetained = true;
      measured.rapidToggleFinal = true; measured.workerFailureRollback = true; measured.interleavedAnnotation = true; measured.reloadAndSp = true;
      await page.screenshot({ path: path.join(output, 'finished.png'), animations: 'disabled' });
    }
    assert.deepEqual(errors, []); measured.pageErrors = errors;
    fs.writeFileSync(path.join(output, baseline ? 'baseline.json' : 'result.json'), JSON.stringify(measured, null, 2)); console.log(JSON.stringify(measured, null, 2));
  } catch (error) { console.error(errors); await page.screenshot({ path: path.join(output, 'failure.png'), animations: 'disabled' }); throw error; }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
