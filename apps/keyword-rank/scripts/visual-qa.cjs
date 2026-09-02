const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const qaDir = path.join(__dirname, '..', 'qa');
  fs.mkdirSync(qaDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.waitForSelector('.app-shell');
  await page.screenshot({ path: path.join(qaDir, 'implementation-natural.png'), fullPage: true });
  await page.getByRole('button', { name: /\u66f4换 LT24M1287/ }).click();
  await page.waitForSelector('.icon-picker-modal');
  await page.screenshot({ path: path.join(qaDir, 'implementation-icon-picker.png'), fullPage: true });
  const iconPickerMetrics = await page.evaluate(() => ({
    iconCount: document.querySelectorAll('.apparel-icon-grid button').length,
    brokenImages: [...document.querySelectorAll('.apparel-icon-grid img')].filter((image) => !image.complete || image.naturalWidth === 0).length,
    selectedCount: document.querySelectorAll('.apparel-icon-grid button.selected').length,
  }));
  await page.locator('.icon-picker-modal .drawer-header button').click();

  await page.getByRole('button', { name: '看板' }).click();
  await page.waitForSelector('.dashboard-table');
  await page.screenshot({ path: path.join(qaDir, 'implementation-dashboard.png'), fullPage: true });
  await page.getByRole('button', { name: /管理关注词/ }).click();
  await page.waitForSelector('.watch-drawer');
  await page.screenshot({ path: path.join(qaDir, 'implementation-watch-drawer.png'), fullPage: true });
  await page.locator('.watch-drawer .drawer-header button').click();

  await page.getByRole('button', { name: 'SP矩阵' }).click();
  await page.waitForSelector('.matrix-table');
  await page.screenshot({ path: path.join(qaDir, 'implementation-sp.png'), fullPage: true });

  await page.getByRole('button', { name: 'ABA月榜' }).click();
  await page.waitForSelector('.aba-table');
  await page.screenshot({ path: path.join(qaDir, 'implementation-aba.png'), fullPage: true });

  const desktopMetrics = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    bodyScrollHeight: document.body.scrollHeight,
    bodyClientHeight: document.body.clientHeight,
    visibleModelCount: document.querySelectorAll('.model-item').length,
    activeTab: document.querySelector('.tabs button.active')?.textContent?.trim(),
  }));

  await page.setViewportSize({ width: 900, height: 800 });
  await page.getByRole('button', { name: '自然矩阵' }).click();
  await page.screenshot({ path: path.join(qaDir, 'implementation-compact.png'), fullPage: true });
  const compactMetrics = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    bodyScrollHeight: document.body.scrollHeight,
    bodyClientHeight: document.body.clientHeight,
  }));

  await browser.close();
  const result = { consoleErrors, iconPickerMetrics, desktopMetrics, compactMetrics };
  fs.writeFileSync(path.join(qaDir, 'visual-qa.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (consoleErrors.length || iconPickerMetrics.iconCount !== 16 || iconPickerMetrics.brokenImages || iconPickerMetrics.selectedCount !== 1 || desktopMetrics.bodyScrollWidth > desktopMetrics.bodyClientWidth || compactMetrics.bodyScrollWidth > compactMetrics.bodyClientWidth) process.exitCode = 1;
})();
