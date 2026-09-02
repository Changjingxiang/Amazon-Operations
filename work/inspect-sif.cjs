const { chromium } = require('C:\\Users\\Admin\\Documents\\Codex\\2026-07-23\\new-chat-3\\keyword-rank-desktop\\node_modules\\playwright-core');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto('https://www.sif.com/reverse?country=CA', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  const snapshot = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyText: (document.body?.innerText || '').slice(0, 4000),
    inputs: [...document.querySelectorAll('input')].map((input) => ({ placeholder: input.placeholder, value: input.value, readonly: input.readOnly, cls: input.className, aria: input.getAttribute('aria-label') })),
    buttons: [...document.querySelectorAll('button')].map((button) => ({ text: button.innerText.trim(), cls: button.className })).filter((item) => item.text || item.cls).slice(0, 200),
    parentCards: document.querySelectorAll('.single_variant_wrap.pasin_item').length,
    downloadButtons: document.querySelectorAll('#title_top_color_pad .downloadPolorBtn').length,
  }));
  console.log(JSON.stringify({ snapshot, errors }, null, 2));
  await browser.close();
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
