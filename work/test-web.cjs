const { chromium } = require('C:/Users/Admin/Documents/Codex/2026-07-23/new-chat-3/keyword-rank-desktop/node_modules/playwright-core');

const url = 'http://127.0.0.1:5174/';
const executablePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath, args: ['--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1365, height: 860 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console:${message.text()}`); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.matrix-table');
  const initial = await page.evaluate(() => window.keywordTracker.getData());
  const naturalCell = page.locator('.matrix-table td.matrix-annotation-cell').first();
  await naturalCell.click();
  await page.locator('.cell-annotation-input').fill('自然测试标注');
  await page.locator('.cell-annotation-input').press('Enter');
  await page.waitForTimeout(250);
  const naturalResult = await page.evaluate(async () => {
    const data = await window.keywordTracker.getData();
    const row = data.models[0].matrixRows.find((item) => item.naturalAnnotations?.some(Boolean));
    return { found: Boolean(row), naturalText: row?.naturalAnnotations?.find(Boolean) || '' };
  });

  await page.getByRole('button', { name: '设置' }).click();
  await page.waitForSelector('.settings-delete-item');
  const deleteButtons = await page.locator('.settings-delete-item').first().locator('.danger-button').evaluateAll((items) => items.map((item) => ({ text: item.textContent.trim(), disabled: item.disabled, left: item.getBoundingClientRect().left })));
  await page.getByRole('button', { name: '关闭设置' }).click();

  await page.getByRole('button', { name: '选择产品图标' }).count().catch(() => {});
  await page.locator('.model-icon').first().click();
  await page.waitForSelector('.custom-icon-option');
  const customPath = 'C:/Users/Admin/Documents/Codex/2026-07-23/new-chat-3/keyword-rank-desktop/src/assets/apparel-icons/tank-top.png';
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('.custom-icon-option').click();
  const chooser = await chooserPromise;
  await chooser.setFiles(customPath);
  await page.waitForTimeout(300);
  const customResult = await page.evaluate(async () => {
    const data = await window.keywordTracker.getData();
    const icon = data.models[0].iconKey;
    return { key: icon?.key || '', dataUrl: typeof icon?.dataUrl === 'string' ? icon.dataUrl.slice(0, 30) : '' };
  });

  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '关闭设置' }).click();
  const tempName = '测试删除产品';
  await page.getByRole('button', { name: '新增型号' }).click();
  await page.getByLabel('产品名称').fill(tempName);
  await page.getByLabel('父体 ASIN').fill('B0ZZZZZZZZ');
  await page.getByRole('button', { name: '保存并生成' }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: '设置' }).click();
  const tempItem = page.locator('.settings-delete-item').filter({ hasText: tempName });
  await tempItem.locator('.danger-first').click();
  const firstState = await tempItem.locator('.danger-second').isDisabled();
  await tempItem.locator('.danger-second').click();
  await page.waitForTimeout(300);
  const afterDelete = await page.evaluate(async () => (await window.keywordTracker.getData()).models.some((item) => item.modelName === '测试删除产品'));

  console.log(JSON.stringify({
    initialModels: initial.models.length,
    naturalResult,
    deleteButtons,
    customResult,
    firstState,
    tempStillPresent: afterDelete,
    errors,
  }, null, 2));
  await browser.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
