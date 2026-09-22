const { chromium } = require('../../apps/keyword-rank/node_modules/playwright-core');
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const release = path.resolve(process.argv[2]);
const output = path.resolve('work/contextual-guide-qa-20260922'); fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 }, acceptDownloads: true });
  const errors = [], result = { steps: [] }; page.on('pageerror', e => errors.push(e.message));
  const click = name => page.getByRole('button', { name, exact: true }).click();
  const shot = name => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
  const ready = async () => { await page.waitForSelector('.matrix-table', { timeout: 60000 }); await page.waitForSelector('.k-loading', { state: 'detached', timeout: 60000 }); };
  const digest = () => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('keyword-rank-daily-tracker-v181', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const store = await new Promise(resolve => { const r = db.transaction('state').objectStore('state').get('tracker-store'); r.onsuccess = () => resolve(r.result); }); db.close();
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([store.configs, store.competitors, store.histories, store.watches, store.annotations, store.abaMonthlyImports])));
    return Array.from(new Uint8Array(bytes)).join(',');
  });
  const bounds = async () => {
    const b = await page.locator('.guide-card').boundingBox(), viewport = page.viewportSize();
    assert(b.x >= 0 && b.y >= 0 && b.x + b.width <= viewport.width + 1 && b.y + b.height <= viewport.height + 1, 'guide card stays in viewport');
  };
  const destinations = ['自然矩阵', '自然矩阵', '看板', '看板', '看板', '自然矩阵', '自然矩阵', '自然矩阵', '自然矩阵', 'SP矩阵', '对比矩阵', '对比矩阵', 'ABA月榜', 'ABA月榜', '自然矩阵', '历史记录', '历史记录'];
  const targets = { 3: '.watch-drawer .watch-keywords-input', 4: '.keyword-trend-thumbnail-portal', 7: '.aba-trend-popover', 8: '.matrix-competitor-bubble', 9: '.annotation-editor', 10: '.annotation-editor', 12: '.keyword-trend-panel', 13: '.aba-trend-popover', 14: '[data-aba-monthly-import]', 15: '[data-competitor-settings]', 16: '.history-panel', 17: '.browser-manager-card', 18: '.browser-manager-card [data-action="export"]', 19: '.browser-manager-card [data-action="import"]' };
  try {
    await page.goto(pathToFileURL(path.join(release, 'index.html')).href); await ready();
    await click('暂时跳过'); await page.reload(); await ready(); await page.waitForTimeout(600);
    assert.equal(await page.locator('[data-usage-guide]').count(), 0);
    assert.equal(await page.getByRole('button', { name: '每周广告关注词分析', exact: true }).count(), 0);
    assert.equal(await page.locator('.ad-review-hint').count(), 0);
    const initial = await digest();
    await click('使用指南'); await page.getByRole('button', { name: /^重新开始完整引导/ }).click();
    for (let i = 0; i < 20; i++) {
      await page.getByText(`快速上手 · 第 ${i + 1} / 20 步`, { exact: true }).waitFor();
      await page.waitForTimeout(850);
      await bounds();
      const expected = i >= 18 ? '历史记录' : i < 9 ? destinations[i] : destinations[i - 1];
      assert.equal(await page.locator('.tabs .active').textContent(), expected, `step ${i + 1} destination`);
      if (targets[i]) await page.locator(targets[i]).first().waitFor({ state: 'visible', timeout: 6000 });
      if (i === 4) {
        const box = await page.locator('.keyword-trend-thumbnail-portal').boundingBox();
        assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1536 && box.y + box.height <= 960, 'dashboard hover preview stays fully visible');
      }
      const spotlightCount = await page.locator('.guide-shade mask rect[fill="black"]').count();
      assert(spotlightCount > 0, `step ${i + 1} has a live spotlight`);
      if (i === 3) { assert.equal(await page.locator('.watch-keywords-input').inputValue(), 'new product keyword'); assert(await page.locator('.watch-save-row button').isDisabled()); }
      if ([9, 10].includes(i)) assert(await page.locator('#matrix-annotation-draft').getAttribute('readonly') !== null);
      if ([2, 3, 4, 7, 8, 9, 10, 12, 13, 14, 15, 17, 18, 19].includes(i)) await shot(`step-${i + 1}`);
      result.steps.push({ step: i + 1, title: await page.locator('#guide-title').textContent(), destination: expected, spotlightCount });
      await click(i === 19 ? '完成' : '下一步 →');
    }
    await click('开始使用'); await page.waitForTimeout(350);
    assert.equal(await digest(), initial, 'all tutorial scenes leave business data unchanged');
    assert.equal(await page.locator('.annotation-editor, .watch-drawer, .browser-manager-card, .settings-modal').count(), 0);
    result.teachingReadOnly = true;
    // Topic buttons directly navigate to the relevant scene, including at smaller sizes.
    await page.setViewportSize({ width: 1100, height: 720 });
    for (const [name, selector] of [['添加无流量关键词', '.watch-drawer'], ['悬停与标注', '.aba-trend-popover'], ['ABA 月榜与导入', '.aba-trend-popover']]) {
      await click('使用指南'); await page.getByRole('button', { name: new RegExp(name) }).click();
      await page.locator(selector).first().waitFor(); await page.waitForTimeout(650); await bounds(); await shot(`compact-${name}`); await click('退出使用指南');
    }
    await click('使用指南'); await page.getByRole('button', { name: /从老版本迁移数据/ }).click();
    await page.getByRole('heading', { name: '迁移第 1 步：在老版本导出备份' }).waitFor();
    await page.waitForTimeout(650); await bounds(); await shot('migration-export-compact');
    assert((await page.locator('.guide-card').textContent()).includes('同名按钮'));
    await click('下一步 →'); await page.getByRole('heading', { name: '迁移第 2 步：在新版本导入备份' }).waitFor();
    await page.waitForTimeout(650); await bounds(); await shot('migration-import-compact');
    assert((await page.locator('.guide-card').textContent()).includes('不会追加合并'));
    await click('结束教学，前往导入 →');
    await page.waitForSelector('[data-usage-guide]', { state: 'detached' });
    await page.locator('.browser-manager-card [data-action="import"]').waitFor();
    const usable = await page.locator('.browser-manager-card [data-action="import"]').evaluate(e => { const r=e.getBoundingClientRect(); return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e; });
    assert(usable, 'migration ends with a reachable real import button');
    assert.equal(await digest(), initial, 'migration handoff never imports or mutates data');
    await click('关闭'); result.migrationTeachingAndHandoff = true;
    await page.setViewportSize({ width: 1536, height: 960 });
    // Opening management from the expanded dashboard must produce a reachable topmost dialog.
    await click('看板'); await click('放大表格'); await click('管理关注词');
    const front = await page.locator('.watch-keywords-input').evaluate(e => { const r = e.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === e; });
    assert(front, 'watch drawer is above the expanded dashboard');
    await page.locator('.watch-keywords-input').fill('qa no traffic keyword');
    await shot('expanded-watch-dialog');
    await click('保存并同步'); await page.waitForSelector('.watch-drawer', { state: 'detached' }); await page.waitForSelector('.busy-overlay', { state: 'detached' });
    const added = page.locator('.dashboard-table tr').filter({ has: page.locator('.keyword-cell[data-keyword="qa no traffic keyword"]') });
    await added.waitFor(); assert((await added.textContent()).includes('本日报表未出现'));
    await shot('no-traffic-keyword'); result.expandedDialogAndNewKeyword = true;
    await click('工具文件夹'); assert.equal(await page.getByText('恢复上周的数据', { exact: true }).count(), 0);
    const downloadPromise = page.waitForEvent('download'); await click('下载 SIF 在线版扩展'); const download = await downloadPromise; assert.equal(await download.failure(), null);
    await click('不会安装？查看安装教程'); await page.getByText('插件安装 · 第 1 / 6 步', { exact: true }).waitFor(); result.downloadAndInstall = true;
    await click('退出使用指南');
    // Restore the user's page/filter/scroll after an unrelated topic.
    if (await page.getByRole('button', { name: '恢复看板', exact: true }).count()) await click('恢复看板');
    await click('SP矩阵'); await page.locator('.cascade-search input').fill('men'); await page.waitForTimeout(300);
    await page.locator('.matrix-scroll').evaluate(e => { e.scrollTop = 130; e.scrollLeft = 380; }); await page.waitForTimeout(150);
    const before = await page.locator('.matrix-scroll').evaluate(e => ({ x: e.scrollLeft, y: e.scrollTop }));
    await click('使用指南'); await page.getByRole('button', { name: /添加无流量关键词/ }).click(); await page.locator('.watch-drawer').waitFor(); await click('退出使用指南'); await page.waitForTimeout(400);
    assert.equal(await page.locator('.tabs .active').textContent(), 'SP矩阵'); assert.equal(await page.locator('.cascade-search input').inputValue(), 'men'); assert.deepEqual(await page.locator('.matrix-scroll').evaluate(e => ({ x: e.scrollLeft, y: e.scrollTop })), before);
    result.contextRestored = true;
    assert.deepEqual(errors, []); result.pageErrors = errors;
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
  } catch (error) { await shot('failure'); console.error(errors); throw error; }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
