const { chromium } = require('../../apps/keyword-rank/node_modules/playwright-core');
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const release = path.resolve(process.argv[2]);
const output = path.resolve('work/onboarding-qa-20260922');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1536, height: 960 }, acceptDownloads: true });
  const page = await context.newPage(), errors = [], results = {};
  page.on('pageerror', error => errors.push(error.message));
  const click = name => page.getByRole('button', { name: name === '重新开始完整引导' ? /^重新开始完整引导/ : name, exact: true }).click();
  const ready = async () => { await page.waitForSelector('.app-shell', { timeout: 60000 }); await page.waitForSelector('.k-loading', { state: 'detached', timeout: 30000 }); };
  const shot = name => page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' });
  const bounds = async () => {
    const b = await page.locator('.guide-card').boundingBox(), viewport = page.viewportSize();
    assert(b.x >= 0 && b.y >= 0 && b.x + b.width <= viewport.width + 1 && b.y + b.height <= viewport.height + 1, 'guide remains in viewport');
  };
  try {
    await page.goto(pathToFileURL(path.join(release, 'index.html')).href);
    await ready();
    await page.getByRole('button', { name: '开始引导', exact: true }).waitFor();
    await shot('01-welcome');
    await click('暂时跳过');
    await page.reload(); await ready(); await page.waitForTimeout(700);
    assert.equal(await page.locator('[data-usage-guide]').count(), 0, 'skip persists after reload');
    results.skipPersists = true;
    await page.evaluate(() => {
      window.__guideWrites = [];
      for (const key of ['setWatch', 'setAnnotation', 'runImport', 'startSifImport', 'addModel', 'deleteModel', 'importBackup']) {
        if (typeof window.keywordTracker[key] !== 'function') continue;
        const original = window.keywordTracker[key];
        window.keywordTracker[key] = (...args) => { window.__guideWrites.push(key); return original(...args); };
      }
    });
    await click('使用指南'); await click('重新开始完整引导');
    for (let step = 0; step < 20; step++) {
      await page.locator('.guide-kicker').filter({ hasText: `第 ${step + 1} / 20 步` }).waitFor();
      await page.waitForTimeout(460); await bounds();
      if ([0, 3, 4, 5, 7].includes(step)) await shot(`tour-${step + 1}`);
      if (step < 19) await click('下一步 →'); else await click('完成');
    }
    await click('开始使用');
    assert.deepEqual(await page.evaluate(() => window.__guideWrites), [], 'teaching does not mutate business data');
    results.tourSteps = 20;
    await click('SP矩阵');
    await page.locator('.cascade-search input').fill('men');
    await page.locator('.matrix-scroll').evaluate(e => { e.scrollLeft = 450; e.scrollTop = 150; });
    const before = await page.evaluate(() => ({ tab: document.querySelector('.tabs .active').textContent, query: document.querySelector('.cascade-search input').value, date: document.querySelector('.date-control input').value, x: document.querySelector('.matrix-scroll').scrollLeft, y: document.querySelector('.matrix-scroll').scrollTop }));
    await click('使用指南'); await click('重新开始完整引导');
    for (let i = 0; i < 4; i++) await click('下一步 →');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ tab: document.querySelector('.tabs .active').textContent, query: document.querySelector('.cascade-search input').value, date: document.querySelector('.date-control input').value, x: document.querySelector('.matrix-scroll').scrollLeft, y: document.querySelector('.matrix-scroll').scrollTop }));
    assert.deepEqual(after, before, 'restores tab, filter, date and scroll'); results.contextRestored = after;
    await click('使用指南'); await shot('02-hub');
    const downloadPromise = page.waitForEvent('download'); await click('下载插件 ZIP');
    const download = await downloadPromise; assert.equal(await download.failure(), null);
    await download.saveAs(path.join(output, 'downloaded-extension.zip'));
    const metadata = await page.evaluate(() => window.__SIF_EXTENSION_PACKAGE__);
    assert.equal(download.suggestedFilename(), metadata.filename);
    assert.deepEqual(fs.readFileSync(path.join(output, 'downloaded-extension.zip')), fs.readFileSync(path.join(release, metadata.filename)));
    results.offlineDownload = metadata.filename;
    await click('查看安装教程 →');
    for (let i = 0; i < 2; i++) await click('下一步 →');
    await click('Chrome'); assert((await page.locator('.guide-card').textContent()).includes('加载已解压的扩展程序'));
    await click('Edge'); assert((await page.locator('.guide-card').textContent()).includes('加载解压缩的扩展'));
    await shot('03-install');
    for (let i = 0; i < 3; i++) await click('下一步 →');
    await click('检查插件连接'); await page.getByText('未检测到插件连接', { exact: true }).waitFor();
    await page.evaluate(() => window.addEventListener('message', event => {
      if (event.data?.type === 'PING_WEB_BRIDGE') window.postMessage({ source: 'sif-batch-extension', type: 'WEB_BRIDGE_REPLY', requestId: event.data.requestId, ok: true }, '*');
    }));
    await click('检查插件连接'); await page.getByText('✓ 插件已连接当前页面', { exact: true }).waitFor();
    results.connectionStates = ['missing-real-timeout', 'connected-simulated-handshake'];
    await click('完成教程'); await click('退出使用指南');
    await click('工具文件夹');
    const folderDownloadPromise = page.waitForEvent('download'); await click('下载 SIF 在线版扩展');
    const folderDownload = await folderDownloadPromise; assert.equal(await folderDownload.failure(), null);
    await click('不会安装？查看安装教程');
    await page.getByText('插件安装 · 第 1 / 6 步', { exact: true }).waitFor();
    results.folderDownloadAndTutorial = true;
    await page.setViewportSize({ width: 1100, height: 720 }); await bounds(); await shot('04-compact-install');
    await click('退出使用指南');
    await page.evaluate(() => { window.__productUrls = []; window.open = url => { window.__productUrls.push(url); return null; }; });
    await page.locator('.model-item .model-copy').first().dblclick();
    assert.match((await page.evaluate(() => window.__productUrls))[0], /^https:\/\/www\.amazon\.[^/]+\/dp\/B0/);
    results.doubleClickProduct = true;
    await click('自然矩阵');
    await page.locator('.matrix-rank-cell').first().click();
    await page.locator('.annotation-editor').waitFor();
    await click('使用指南');
    assert.equal(await page.locator('[data-usage-guide]').count(), 0);
    await page.locator('.guide-notice').waitFor();
    results.editingBlocksGuide = true;
    await page.keyboard.press('Escape');
    const emptyContext = await browser.newContext({ viewport: { width: 1100, height: 720 } });
    const empty = await emptyContext.newPage();
    empty.on('pageerror', error => errors.push(error.message));
    await empty.addInitScript(() => {
      let bridge;
      Object.defineProperty(window, 'keywordTracker', {
        configurable: true, get: () => bridge,
        set: value => {
          bridge = value;
          const getData = value.getData;
          value.getData = async (...args) => ({ ...await getData(...args), models: [] });
        },
      });
    });
    await empty.goto(pathToFileURL(path.join(release, 'index.html')).href);
    await empty.getByRole('button', { name: '开始引导', exact: true }).click();
    await empty.getByRole('heading', { name: '先添加你的第一个产品', exact: true }).waitFor();
    for (let i = 0; i < 3; i++) await empty.getByRole('button', { name: '下一步 →', exact: true }).click();
    await empty.getByText('当前产品暂无可演示的数据', { exact: true }).waitFor();
    await empty.getByRole('button', { name: '退出使用指南', exact: true }).click();
    await empty.getByRole('button', { name: '使用指南', exact: true }).click();
    await empty.getByRole('button', { name: /从老版本迁移数据/ }).click();
    await empty.locator('.browser-manager-card [data-action="export"]').waitFor();
    assert.equal(await empty.getByText('当前产品暂无可演示的数据', { exact: true }).count(), 0);
    await empty.getByRole('button', { name: '下一步 →', exact: true }).click();
    await empty.getByRole('button', { name: '结束教学，前往导入 →', exact: true }).click();
    await empty.locator('.browser-manager-card [data-action="import"]').waitFor();
    await empty.getByRole('button', { name: '关闭', exact: true }).click();
    await empty.screenshot({ path: path.join(output, 'empty-migration.png'), animations: 'disabled' });
    results.emptyWorkspaceMigration = true;
    await empty.locator('[data-guide-add-model]').click();
    await empty.getByRole('dialog', { name: '新增型号', exact: true }).waitFor();
    results.emptyWorkspace = true;
    await emptyContext.close();
    assert.deepEqual(errors, []); results.pageErrors = errors;
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    await shot('failure'); console.error('Browser errors:', errors); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
