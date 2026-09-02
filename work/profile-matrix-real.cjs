const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');
const { chromium } = require('../apps/keyword-rank/node_modules/playwright-core');

const releaseDir = path.resolve(process.argv[2]);
const outputFile = path.resolve(process.argv[3] || path.join(require('os').tmpdir(), 'keyword-rank-real-profile.json'));
const noBubble = process.argv.includes('--no-bubble');
const noMatrixHover = process.argv.includes('--no-matrix-hover');

function serve(root) {
  const server = http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, relative);
    const safe = path.relative(root, file);
    if (safe.startsWith(`..${path.sep}`) || path.isAbsolute(safe)) { response.writeHead(403); response.end(); return; }
    fs.stat(file, (error, stats) => {
      if (error || !stats.isFile()) { response.writeHead(404); response.end(); return; }
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.xlsx': 'application/octet-stream' }[path.extname(file).toLowerCase()] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(response);
    });
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })); });
}

async function main() {
  if (!releaseDir || !fs.existsSync(path.join(releaseDir, 'index.html'))) throw new Error(`release directory not found: ${releaseDir}`);
  const { server, port } = await serve(releaseDir);
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const client = await page.context().newCDPSession(page);
  const result = { releaseDir, noBubble, noMatrixHover, consoleErrors: [], pageErrors: [], actions: [] };
  page.on('console', (message) => { if (message.type() === 'error') result.consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  try {
    if (noBubble || noMatrixHover) await page.addInitScript(({ noBubble, noMatrixHover }) => {
      const originalAddEventListener = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function patchedAddEventListener(type, listener, options) {
        if (noBubble && this.matches?.('td.matrix-annotation-cell') && ['mouseenter', 'mousemove', 'mouseleave', 'focus', 'blur'].includes(type)) return;
        if (noMatrixHover && this.matches?.('table.matrix-table') && ['pointerover', 'pointerout'].includes(type)) return;
        return originalAddEventListener.call(this, type, listener, options);
      };
    }, { noBubble, noMatrixHover });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.matrix-table tbody tr', { timeout: 120000 });
    await page.waitForSelector('.busy-overlay', { state: 'detached', timeout: 120000 });
    await page.waitForTimeout(500);
    result.initial = await page.evaluate(() => ({
      rows: document.querySelectorAll('.matrix-table tbody tr').length,
      dateColumns: new Set([...document.querySelectorAll('.matrix-table thead th[data-matrix-date]')].map((node) => node.dataset.matrixDate)).size,
      rankCells: document.querySelectorAll('.matrix-table td.matrix-rank-cell').length,
      allTds: document.querySelectorAll('.matrix-table td').length,
      matrixNodes: document.querySelectorAll('.matrix-table *').length + document.querySelectorAll('.matrix-table').length,
      bodyNodes: document.querySelectorAll('body *').length,
      scrollWidth: document.querySelector('.matrix-scroll')?.scrollWidth || 0,
      scrollHeight: document.querySelector('.matrix-scroll')?.scrollHeight || 0,
    }));
    await page.evaluate(() => {
      window.__realPerf = { longTasks: [], events: [], frames: [], mutations: { total: 0, class: 0, style: 0, childList: 0 } };
      try {
        const observer = new PerformanceObserver((list) => window.__realPerf.longTasks.push(...list.getEntries().map((entry) => ({ start: entry.startTime, duration: entry.duration }))));
        observer.observe({ type: 'longtask', buffered: true });
        window.__realPerf.longTaskObserver = observer;
      } catch {}
      try {
        const observer = new PerformanceObserver((list) => window.__realPerf.events.push(...list.getEntries().map((entry) => ({ name: entry.name, start: entry.startTime, duration: entry.duration }))));
        observer.observe({ type: 'event', buffered: true, durationThreshold: 8 });
        window.__realPerf.eventObserver = observer;
      } catch {}
      window.__realPerf.mutationObserver = new MutationObserver((records) => records.forEach((record) => {
        window.__realPerf.mutations.total += 1;
        if (record.type === 'childList') window.__realPerf.mutations.childList += 1;
        if (record.type === 'attributes' && record.attributeName === 'class') window.__realPerf.mutations.class += 1;
        if (record.type === 'attributes' && record.attributeName === 'style') window.__realPerf.mutations.style += 1;
      }));
      window.__realPerf.mutationObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-expanded'] });
    });

    async function action(label, callback) {
      const before = await page.evaluate(() => {
        window.__realPerf.longTasks = []; window.__realPerf.events = []; window.__realPerf.mutations = { total: 0, class: 0, style: 0, childList: 0 };
        window.__realPerf.frames = []; window.__realPerf.frameStart = performance.now();
        let last = performance.now();
        const tick = (now) => { if (now - window.__realPerf.frameStart <= 5500) { window.__realPerf.frames.push(now - last); last = now; window.__realPerf.frameHandle = requestAnimationFrame(tick); } };
        window.__realPerf.frameHandle = requestAnimationFrame(tick);
        return performance.now();
      });
      const wallStart = Date.now();
      await callback();
      const after = await page.evaluate(() => performance.now());
      const wallMs = Date.now() - wallStart;
      const observed = await page.evaluate(({ before, after }) => {
        cancelAnimationFrame(window.__realPerf.frameHandle);
        const inWindow = (entry) => entry.start >= before - 2 && entry.start <= after + 20;
        const longTasks = window.__realPerf.longTasks.filter(inWindow);
        const events = window.__realPerf.events.filter(inWindow);
        const frames = window.__realPerf.frames.filter((value) => value > 0);
        const sorted = [...frames].sort((a, b) => a - b);
        return {
          longTaskCount: longTasks.length,
          longTaskTotal: longTasks.reduce((sum, item) => sum + item.duration, 0),
          maxLongTask: Math.max(0, ...longTasks.map((item) => item.duration)),
          eventTotal: events.reduce((sum, item) => sum + item.duration, 0),
          slowEvents: events.filter((item) => item.duration >= 16).sort((a, b) => b.duration - a.duration).slice(0, 10),
          mutations: window.__realPerf.mutations,
          frames: { count: frames.length, p50: sorted[Math.floor(sorted.length * .5)] || 0, p95: sorted[Math.floor(sorted.length * .95)] || 0, max: Math.max(0, ...frames) },
        };
      }, { before, after });
      const trace = [];
      // CDP tracing is started for the action by the caller when a breakdown
      // is needed; the observer values above are stable and cheap enough for
      // the five-second manual-style sweep.
      result.actions.push({ label, wallMs, observed, trace });
    }

    const scroll = page.locator('.matrix-scroll');
    const cells = await page.locator('td.matrix-rank-cell').evaluateAll((nodes) => nodes.map((node) => { const rect = node.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; }).filter((point) => point.x > 484 && point.x < innerWidth && point.y > 120 && point.y < innerHeight));
    await action('A 5s pointer sweep over visible cells', async () => {
      const points = cells.slice(0, 24);
      const end = Date.now() + 5000;
      let index = 0;
      while (Date.now() < end) { const point = points[index % points.length]; await page.mouse.move(point.x, point.y, { steps: 1 }); await page.waitForTimeout(22); index += 1; }
      await page.waitForTimeout(100);
    });
    await action('C 5s horizontal scroll', async () => {
      const end = Date.now() + 5000;
      while (Date.now() < end) { await scroll.evaluate((element) => { element.scrollLeft = (element.scrollLeft + 90) % Math.max(1, element.scrollWidth - element.clientWidth + 1); }); await page.waitForTimeout(22); }
      await page.waitForTimeout(100);
    });
    await action('D 5s vertical scroll', async () => {
      const end = Date.now() + 5000;
      while (Date.now() < end) { await scroll.evaluate((element) => { const max = Math.max(1, element.scrollHeight - element.clientHeight); element.scrollTop = (element.scrollTop + 130) % max; }); await page.waitForTimeout(22); }
      await page.waitForTimeout(100);
    });
    result.after = await page.evaluate(() => ({ rows: document.querySelectorAll('.matrix-table tbody tr').length, overlayCount: document.querySelectorAll('.matrix-column-hover-overlay').length, oldHoverClassCount: document.querySelectorAll('.matrix-hover-cell,.matrix-hover-row,.matrix-hover-column').length }));
    result.ok = result.initial.rows > 0 && result.initial.dateColumns > 0 && result.after.overlayCount === 1 && result.after.oldHoverClassCount === 0 && result.consoleErrors.length === 0 && result.pageErrors.length === 0;
    fs.writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    await browser.close(); await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
