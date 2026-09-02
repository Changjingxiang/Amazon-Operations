const { chromium } = require('C:/Users/Admin/Documents/Codex/2026-07-23/new-chat-3/keyword-rank-desktop/node_modules/playwright-core');

function readState(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('keyword-rank-daily-tracker-v181');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('state', 'readonly').objectStore('state').get('tracker-store');
      get.onsuccess = () => { resolve(get.result); db.close(); };
      get.onerror = () => reject(get.error);
    };
  }));
}

function writeState(page, state) {
  return page.evaluate((next) => new Promise((resolve, reject) => {
    const request = indexedDB.open('keyword-rank-daily-tracker-v181');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const put = db.transaction('state', 'readwrite').objectStore('state').put(next, 'tracker-store');
      put.onsuccess = () => { resolve(); db.close(); };
      put.onerror = () => reject(put.error);
    };
  }), state);
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1365, height: 860 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.matrix-table');
  const state = await readState(page);
  const config = state.configs[0];
  const records = state.histories[config.historySheet];
  const source = records.find((item) => item.weeklyAbaRank != null) || records[0];
  const syntheticKeyword = source.keyword;
  for (const [date, value] of [['2025-08-28', 9000], ['2025-09-28', 8800], ['2025-10-28', 8600]]) {
    records.push({ ...source, snapshotDate: date, importTime: `${date}T12:00:00.000Z`, weeklyAbaRank: value, sourceFile: 'visual-synthetic.xlsx' });
  }
  await writeState(page, state);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'ABA月榜' }).click();
  await page.waitForSelector('.aba-keyword-cell');
  await page.locator('.aba-keyword-cell').filter({ hasText: syntheticKeyword }).first().hover();
  await page.waitForSelector('.aba-trend-popover');
  const chart = await page.locator('.aba-trend-popover').evaluate((node) => ({ polylines: node.querySelectorAll('polyline').length, dashed: [...node.querySelectorAll('polyline')].filter((item) => item.getAttribute('stroke-dasharray')).length, text: node.textContent }));
  await page.screenshot({ path: 'C:/Users/Admin/Documents/Codex/2026-08-28/w-2/work/aba-compare-qa.png' });
  console.log(JSON.stringify(chart, null, 2));
  await browser.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
