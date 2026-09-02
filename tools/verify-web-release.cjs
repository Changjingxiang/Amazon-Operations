#!/usr/bin/env node

/* Lightweight smoke check for a packaged web release.  It starts a temporary
 * localhost server and exercises the rendered app without changing source or
 * the checked-in v2.0 output directory. */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');
const { chromium } = require(path.join(__dirname, '..', 'apps', 'keyword-rank', 'node_modules', 'playwright-core'));

const root = path.resolve(__dirname, '..');
const defaultRelease = path.join(root, 'outputs', '关键词排名每日跟进网页版-v2.0');

function parseArgs(argv) {
  let directory = defaultRelease;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--dir' || argv[index] === '--output') {
      directory = path.resolve(argv[index + 1] || '');
      index += 1;
    } else if (argv[index] === '--help' || argv[index] === '-h') {
      console.log('用法: npm run verify:web -- --dir <已构建网页版目录>');
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${argv[index]}`);
    }
  }
  return directory;
}

function contentType(filePath) {
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function startServer(directory) {
  const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
    const filePath = path.resolve(directory, relative);
    const relativeToRoot = path.relative(directory, filePath);
    if (relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) {
      response.writeHead(403); response.end('Forbidden'); return;
    }
    fs.stat(filePath, (error, stats) => {
      if (error || !stats.isFile()) { response.writeHead(404); response.end('Not found'); return; }
      response.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store' });
      fs.createReadStream(filePath).pipe(response);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function findBrowser() {
  const candidates = [
    process.env.BROWSER_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) throw new Error('未找到 Edge/Chrome；可用 BROWSER_PATH 指定可执行文件。');
  return executablePath;
}

async function main() {
  const directory = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(path.join(directory, 'index.html'))) throw new Error(`找不到网页版入口: ${directory}`);
  const { server, port } = await startServer(directory);
  const browser = await chromium.launch({ executablePath: findBrowser(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const result = { directory, url: `http://127.0.0.1:${port}/`, consoleErrors, pageErrors };
  try {
    await page.goto(result.url, { waitUntil: 'networkidle' });
    await page.waitForSelector('.app-shell', { timeout: 60000 });
    await page.waitForSelector('.busy-overlay', { state: 'detached', timeout: 60000 });
    await page.waitForTimeout(250);

    result.models = await page.locator('.model-item').count();
    result.tabs = await page.locator('.tabs button').allTextContents();
    result.bridgeFunctions = await page.evaluate(() => ({
      hasBridge: Boolean(window.keywordTracker),
      hasSeed: Boolean(window.__KEYWORD_TRACKER_SEED__),
      methods: ['getData', 'setWatch', 'addModel', 'addCompetitor', 'changeModelAsin', 'importAbaMonthlyCsv']
        .filter((name) => typeof window.keywordTracker?.[name] === 'function'),
      seedConfigs: window.__KEYWORD_TRACKER_SEED__?.configs?.length || 0,
    }));

    const tabChecks = {};
    const perTabPresence = {};
    for (const label of ['看板', '自然矩阵', 'SP矩阵', 'ABA月榜', '历史记录']) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.waitForTimeout(80);
      tabChecks[label] = await page.locator('.tabs button.active').textContent();
      perTabPresence[label] = {
        dashboard: await page.locator('.dashboard-table').count(),
        matrix: await page.locator('.matrix-table').count(),
        aba: await page.locator('.aba-table').count(),
        history: await page.locator('.history-table, .history-panel').count(),
      };
    }
    result.tabChecks = tabChecks;
    result.viewPresence = perTabPresence;

    const settingsButton = page.getByRole('button', { name: '设置', exact: true });
    await settingsButton.click();
    await page.waitForSelector('.settings-modal', { timeout: 10000 });
    await page.waitForTimeout(250);
    result.settings = await page.evaluate(() => ({
      modal: Boolean(document.querySelector('.settings-modal')),
      asinEditors: document.querySelectorAll('[data-parent-asin-editor]').length,
      competitorSettings: document.querySelectorAll('[data-competitor-settings]').length,
      abaImport: document.querySelectorAll('[data-aba-monthly-import]').length,
      batchImport: document.querySelectorAll('[data-sif-batch-import]').length,
    }));
    await page.getByRole('button', { name: '关闭设置', exact: true }).click();
    await page.waitForSelector('.settings-modal', { state: 'detached', timeout: 10000 });

    await page.getByRole('button', { name: '自然矩阵', exact: true }).click();
    result.matrixHoverTargets = await page.locator('[data-competitor-matrix-hover], [data-competitor-keyword-button]').count();
    result.body = await page.evaluate(() => ({
      textLength: document.body.textContent?.length || 0,
      scrollWidth: document.body.scrollWidth,
      clientWidth: document.body.clientWidth,
    }));
    result.ok = result.models >= 6
      && result.tabs.length >= 5
      && Object.values(tabChecks).every(Boolean)
      && result.bridgeFunctions.hasBridge
      && result.bridgeFunctions.seedConfigs >= 6
      && result.settings.modal
      && result.settings.asinEditors >= 1
      && result.settings.competitorSettings >= 1
      && result.settings.abaImport >= 1
      && result.settings.batchImport >= 1
      && result.viewPresence['看板'].dashboard >= 1
      && result.viewPresence['自然矩阵'].matrix >= 1
      && result.viewPresence['SP矩阵'].matrix >= 1
      && result.viewPresence['ABA月榜'].aba >= 1
      && result.viewPresence['历史记录'].history >= 1
      && result.body.textLength > 1000
      && result.body.scrollWidth <= result.body.clientWidth
      && consoleErrors.length === 0
      && pageErrors.length === 0;
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(`[verify:web] ${error.stack || error.message}`); process.exitCode = 1; });
