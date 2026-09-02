const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('C:\\Users\\Admin\\Documents\\Codex\\2026-07-23\\new-chat-3\\keyword-rank-desktop\\node_modules\\playwright-core');

const outputDir = 'C:\\Users\\Admin\\Documents\\Codex\\2026-08-28\\w-2\\outputs\\关键词排名每日跟进网页版-v1.8.2';
const executablePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1536, height: 1024 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(`${request.url()} :: ${request.failure()?.errorText || 'failed'}`));

  const url = pathToFileURL(path.join(outputDir, 'index.html')).href;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('.app-shell', { timeout: 30000 });
  await page.waitForTimeout(500);

  const initial = await page.evaluate(() => ({
    title: document.title,
    models: document.querySelectorAll('.model-item').length,
    activeTab: document.querySelector('.tabs button.active')?.textContent?.trim() || '',
    assetScript: [...document.scripts].map((script) => script.src).filter(Boolean),
    indexedDb: Boolean(window.indexedDB),
  }));

  await page.getByRole('button', { name: '自然矩阵' }).click();
  await page.waitForSelector('.matrix-table');
  const natural = await page.evaluate(() => ({
    cells: document.querySelectorAll('.matrix-annotation-cell').length,
    annotationInputs: document.querySelectorAll('.cell-annotation-input').length,
  }));

  await page.getByRole('button', { name: 'ABA月榜' }).click();
  await page.waitForSelector('.aba-table');
  const aba = await page.evaluate(() => ({
    rows: document.querySelectorAll('.aba-table tbody tr').length,
    keywordCells: document.querySelectorAll('.aba-keyword-cell').length,
  }));

  await page.getByRole('button', { name: '设置' }).click();
  await page.waitForSelector('.settings-modal');
  const settings = await page.evaluate(() => ({
    addButton: document.querySelector('.settings-add-button')?.textContent?.trim() || '',
    deleteItems: document.querySelectorAll('.settings-delete-item').length,
    firstButtons: [...document.querySelectorAll('.danger-first')].map((button) => button.textContent.trim()),
    secondDisabled: [...document.querySelectorAll('.danger-second')].every((button) => button.disabled),
  }));
  await page.locator('.settings-modal .drawer-header button').click();

  await page.getByRole('button', { name: /更换/ }).first().click();
  await page.waitForSelector('.icon-picker-modal');
  const icons = await page.evaluate(() => ({
    customOption: document.querySelector('.custom-icon-option')?.textContent?.trim() || '',
    builtInCount: document.querySelectorAll('.apparel-icon-grid button').length,
    brokenImages: [...document.querySelectorAll('.apparel-icon-grid img')].filter((image) => !image.complete || image.naturalWidth === 0).length,
    clippedBoxes: [...document.querySelectorAll('.apparel-icon-grid img')].filter((image) => image.getBoundingClientRect().height > image.parentElement.getBoundingClientRect().height + 1).length,
  }));

  await browser.close();
  const result = { url, initial, natural, aba, settings, icons, consoleErrors, pageErrors, failedRequests };
  console.log(JSON.stringify(result, null, 2));
  if (consoleErrors.length || pageErrors.length || failedRequests.length || initial.models < 1 || natural.cells < 1 || aba.rows < 1 || settings.deleteItems < 1 || !settings.secondDisabled || icons.builtInCount !== 16 || icons.brokenImages || icons.clippedBoxes) process.exitCode = 1;
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
