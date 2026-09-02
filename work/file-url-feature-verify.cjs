const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('C:\\Users\\Admin\\Documents\\Codex\\2026-07-23\\new-chat-3\\keyword-rank-desktop\\node_modules\\playwright-core');

const outputDir = 'C:\\Users\\Admin\\Documents\\Codex\\2026-08-28\\w-2\\outputs\\关键词排名每日跟进网页版-v1.8.2';
const executablePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function openStore(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('keyword-rank-daily-tracker-v181', 1);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    request.onsuccess = () => {
      const db = request.result;
      const getRequest = db.transaction('state', 'readonly').objectStore('state').get('tracker-store');
      getRequest.onerror = () => reject(getRequest.error || new Error('IndexedDB read failed'));
      getRequest.onsuccess = () => { const value = getRequest.result; db.close(); resolve(value); };
    };
  }));
}

async function putStore(page, value) {
  return page.evaluate((nextValue) => new Promise((resolve, reject) => {
    const request = indexedDB.open('keyword-rank-daily-tracker-v181', 1);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    request.onsuccess = () => {
      const db = request.result;
      const putRequest = db.transaction('state', 'readwrite').objectStore('state').put(nextValue, 'tracker-store');
      putRequest.onerror = () => reject(putRequest.error || new Error('IndexedDB write failed'));
      putRequest.onsuccess = () => { db.close(); resolve(); };
    };
  }), value);
}

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1536, height: 1024 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const url = pathToFileURL(path.join(outputDir, 'index.html')).href;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('.app-shell', { timeout: 30000 });

  // Natural matrix annotation: click the first real date cell, save a note, and verify the rank remains visible.
  await page.getByRole('button', { name: '自然矩阵' }).click();
  const firstCell = page.locator('.matrix-annotation-cell').first();
  const naturalRankBefore = await firstCell.getAttribute('data-rank');
  await firstCell.click();
  await page.waitForSelector('.cell-annotation-input');
  await page.locator('.cell-annotation-input').fill('file-url 自然标注');
  await page.locator('.cell-annotation-input').press('Enter');
  await page.waitForFunction(() => !document.querySelector('.cell-annotation-input'));
  const naturalAnnotation = await page.locator('.matrix-annotation-cell').first().evaluate((cell) => ({
    rank: cell.getAttribute('data-rank'),
    annotated: cell.classList.contains('matrix-annotated-cell'),
    blackBackground: getComputedStyle(cell).backgroundColor,
    title: cell.getAttribute('title'),
  }));

  // Seed one product with 2025-07-23 through 2025-09-23 ABA observations, then reload.
  const store = await openStore(page);
  const config = store.configs[0];
  const history = store.histories[config.historySheet] || [];
  const base = history.find((row) => row.weeklyAbaRank != null) || history[0];
  const previousRows = [
    ['2025-08-28', 3300],
    ['2025-09-28', 3100],
    ['2025-10-28', 2900],
  ].map(([snapshotDate, weeklyAbaRank], index) => ({
    ...base,
    snapshotDate,
    importTime: `2025-0${7 + index}-23T10:00:00.000Z`,
    weeklyAbaRank,
    weeklySearchVolume: 4000 + index * 100,
    conversionRate: 0.04 + index * 0.01,
    sourceFile: 'file-url-aba-previous-year.xlsx',
  }));
  const existingKeys = new Set(history.map((row) => `${row.keyword}|${row.snapshotDate}`));
  store.histories[config.historySheet] = history.concat(previousRows.filter((row) => !existingKeys.has(`${row.keyword}|${row.snapshotDate}`)));
  store.updatedAt = new Date().toISOString();
  await putStore(page, store);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.app-shell', { timeout: 30000 });
  await page.getByRole('button', { name: 'ABA月榜' }).click();
  await page.waitForSelector('.aba-table');
  await page.locator('.aba-keyword-cell').filter({ hasText: base.keyword }).first().hover();
  await page.waitForSelector('.aba-trend-popover', { timeout: 10000 });
  const abaPrevious = await page.locator('.aba-trend-popover').evaluate((popup) => ({
    title: popup.textContent || '',
    polylines: popup.querySelectorAll('polyline').length,
    dashedPolylines: [...popup.querySelectorAll('polyline')].filter((line) => line.getAttribute('stroke-dasharray')).length,
    ariaLabel: popup.querySelector('svg')?.getAttribute('aria-label') || '',
  }));

  // Settings: first confirmation is on the left, second on the right and initially disabled.
  await page.getByRole('button', { name: '设置' }).click();
  await page.waitForSelector('.settings-modal');
  const deleteItem = page.locator('.settings-delete-item').nth(1);
  const firstDelete = deleteItem.getByRole('button', { name: /第一次确定删除/ });
  const secondDelete = deleteItem.getByRole('button', { name: /第二次确定删除/ });
  const beforeDelete = { firstIndex: await firstDelete.evaluate((button) => [...button.parentElement.children].indexOf(button)), secondDisabled: await secondDelete.isDisabled() };
  await firstDelete.click();
  const afterFirst = { secondDisabled: await secondDelete.isDisabled(), pending: await deleteItem.evaluate((item) => item.classList.contains('is-pending')) };
  await secondDelete.click();
  await page.waitForFunction(() => document.querySelectorAll('.settings-delete-item').length === 5);
  const afterSecond = { remainingProducts: await page.locator('.settings-delete-item').count(), modelButtons: await page.locator('.model-item').count() };
  await page.locator('.settings-modal .drawer-header button').click();

  // Custom image upload: use the packaged favicon as a small, deterministic PNG fixture.
  await page.getByRole('button', { name: /更换/ }).first().click();
  await page.waitForSelector('.icon-picker-modal');
  await page.locator('.custom-icon-file-input').setInputFiles(path.join(outputDir, 'favicon.png'));
  await page.waitForFunction(() => !document.querySelector('.icon-picker-modal'));
  const customIcon = await page.locator('.model-item').first().locator('.model-icon img').getAttribute('src');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.app-shell', { timeout: 30000 });
  const customIconAfterReload = await page.locator('.model-item').first().locator('.model-icon img').getAttribute('src');

  await browser.close();
  const result = {
    url,
    natural: { rankBefore: naturalRankBefore, ...naturalAnnotation },
    abaPrevious,
    delete: { beforeDelete, afterFirst, afterSecond },
    customIcon: {
      isDataUrl: String(customIcon || '').startsWith('data:image/'),
      length: String(customIcon || '').length,
      persistsAfterReload: customIconAfterReload === customIcon,
    },
    consoleErrors,
    pageErrors,
  };
  console.log(JSON.stringify(result, null, 2));
  const naturalOk = naturalAnnotation.annotated && naturalAnnotation.rank === naturalRankBefore && naturalAnnotation.title.includes('file-url 自然标注');
  const abaOk = abaPrevious.polylines === 2 && abaPrevious.dashedPolylines === 1 && abaPrevious.title.includes('去年参考');
  const deleteOk = beforeDelete.firstIndex === 0 && beforeDelete.secondDisabled && !afterFirst.secondDisabled && afterFirst.pending && afterSecond.remainingProducts === 5;
  const iconOk = result.customIcon.isDataUrl && result.customIcon.persistsAfterReload;
  if (!naturalOk || !abaOk || !deleteOk || !iconOk || consoleErrors.length || pageErrors.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
