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
  await client.send('Performance.enable');
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
    // Use the React DevTools commit hook when the production bundle exposes
    // it.  This is read-only instrumentation: it records commit roots and
    // component names without changing the application tree or its state.
    await page.addInitScript(() => {
      const commits = [];
      const hook = {
        supportsFiber: true,
        inject: () => 1,
        onCommitFiberRoot: (_rendererId, root) => {
          const summary = { matrixFibers: 0, functionFibers: 0, hostNodes: 0, tableCells: 0 };
          const stack = root?.current ? [root.current] : [];
          while (stack.length) {
            const fiber = stack.pop();
            const type = fiber?.elementType || fiber?.type;
            const props = fiber?.memoizedProps;
            if (props?.model?.matrixRows && (props.metric === 'natural' || props.metric === 'sp')) summary.matrixFibers += 1;
            if (typeof type === 'function') summary.functionFibers += 1;
            if (typeof type === 'string') {
              summary.hostNodes += 1;
              if (type === 'td') summary.tableCells += 1;
            }
            if (fiber?.sibling) stack.push(fiber.sibling);
            if (fiber?.child) stack.push(fiber.child);
          }
          commits.push({ time: performance.now(), ...summary });
        },
        onCommitFiberUnmount: () => {},
        onScheduleFiberRoot: () => {},
      };
      window.__matrixReactPerf = { commits };
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    });
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
      rowHeight: document.querySelector('.matrix-table tbody tr')?.getBoundingClientRect().height || 0,
      headerHeight: document.querySelector('.matrix-table thead')?.getBoundingClientRect().height || 0,
    }));
    result.dataModels = await page.evaluate(async () => {
      const data = await window.keywordTracker?.getData?.();
      return (data?.models || []).map((model) => ({
        modelName: model.modelName,
        kind: model.kind || 'own',
        rows: model.matrixRows?.length || 0,
        dates: model.dates?.length || 0,
      }));
    });
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
      const metricsBefore = await client.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
      const before = await page.evaluate(() => {
        window.__realPerf.longTasks = []; window.__realPerf.events = []; window.__realPerf.mutations = { total: 0, class: 0, style: 0, childList: 0 };
        window.__realPerf.frames = []; window.__realPerf.frameStart = performance.now();
        window.__realPerf.reactCommitStart = window.__matrixReactPerf?.commits?.length || 0;
        let last = performance.now();
        const tick = (now) => { if (now - window.__realPerf.frameStart <= 5500) { window.__realPerf.frames.push(now - last); last = now; window.__realPerf.frameHandle = requestAnimationFrame(tick); } };
        window.__realPerf.frameHandle = requestAnimationFrame(tick);
        return performance.now();
      });
      const wallStart = Date.now();
      await callback();
      const after = await page.evaluate(() => performance.now());
      const metricsAfter = await client.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
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
          reactCommits: (window.__matrixReactPerf?.commits || []).slice(window.__realPerf.reactCommitStart || 0),
          frames: { count: frames.length, p50: sorted[Math.floor(sorted.length * .5)] || 0, p95: sorted[Math.floor(sorted.length * .95)] || 0, max: Math.max(0, ...frames) },
        };
      }, { before, after });
      const metricMap = (payload) => new Map((payload?.metrics || []).map((entry) => [entry.name, entry.value]));
      const beforeMap = metricMap(metricsBefore);
      const afterMap = metricMap(metricsAfter);
      const cdp = {};
      for (const [name, labelName] of [
        ['TaskDuration', 'taskMs'],
        ['ScriptDuration', 'scriptMs'],
        ['LayoutDuration', 'layoutMs'],
        ['RecalcStyleDuration', 'recalcStyleMs'],
        ['ThreadTime', 'threadMs'],
      ]) {
        cdp[labelName] = Math.max(0, (afterMap.get(name) || 0) - (beforeMap.get(name) || 0)) * 1000;
      }
      cdp.layoutCount = Math.max(0, (afterMap.get('LayoutCount') || 0) - (beforeMap.get('LayoutCount') || 0));
      cdp.recalcStyleCount = Math.max(0, (afterMap.get('RecalcStyleCount') || 0) - (beforeMap.get('RecalcStyleCount') || 0));
      const trace = [];
      // CDP tracing is started for the action by the caller when a breakdown
      // is needed; the observer values above are stable and cheap enough for
      // the five-second manual-style sweep.
      result.actions.push({ label, wallMs, observed, cdp, trace });
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
    result.deepVirtualization = await page.evaluate(async () => {
      const scroll = document.querySelector('.matrix-scroll');
      const data = await window.keywordTracker?.getData?.();
      const model = data?.models?.[0];
      const last = model?.matrixRows?.at(-1)?.keyword || '';
      scroll.scrollLeft = 0;
      scroll.scrollTop = scroll.scrollHeight;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const row = [...document.querySelectorAll('.matrix-table tbody tr[data-matrix-keyword]')].find((node) => node.dataset.matrixKeyword === last);
      const rect = row?.getBoundingClientRect();
      const scrollRect = scroll?.getBoundingClientRect();
      return {
        lastKeyword: last,
        renderedLastRow: Boolean(row),
        lastRowInViewport: Boolean(rect && scrollRect && rect.bottom >= scrollRect.top && rect.top <= scrollRect.bottom),
        renderedRows: document.querySelectorAll('.matrix-table tbody tr[data-matrix-keyword]').length,
        scrollHeight: scroll?.scrollHeight || 0,
      };
    });
    // Pick a positive cell that is actually below the sticky three-row header.
    // A locator's first match can be geometrically hidden by that header after
    // the deep-scroll check, which would make a forced hover test a false
    // positive.  Verify the hit target before moving the pointer.
    const positiveCandidate = await page.evaluate(() => {
      const scroll = document.querySelector('.matrix-scroll');
      const header = document.querySelector('.matrix-table thead');
      const scrollRect = scroll?.getBoundingClientRect();
      const headerRect = header?.getBoundingClientRect();
      const minTop = Math.max(scrollRect?.top || 0, headerRect?.bottom || 0) + 4;
      const maxBottom = Math.min(scrollRect?.bottom || innerHeight, innerHeight - 4);
      const cells = [...document.querySelectorAll('td.matrix-rank-cell')];
      const candidates = cells.map((cell, index) => {
        const rect = cell.getBoundingClientRect();
        const rank = Number(cell.getAttribute('data-rank'));
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(x, y);
        return {
          index,
          keyword: cell.dataset.matrixKeyword || '',
          date: cell.dataset.matrixDate || '',
          rank,
          x,
          y,
          top: rect.top,
          bottom: rect.bottom,
          visible: Number.isFinite(rank) && rank > 0 && rect.width > 0 && rect.height > 0
            && rect.top >= minTop && rect.bottom <= maxBottom
            && hit?.closest?.('td.matrix-rank-cell') === cell,
        };
      });
      return candidates.find((item) => item.visible) || candidates.find((item) => item.rank > 0 && item.top >= minTop && item.bottom <= maxBottom) || null;
    });
    result.positiveCandidate = positiveCandidate;
    const positiveCell = positiveCandidate ? page.locator('td.matrix-rank-cell').nth(positiveCandidate.index) : null;
    const positiveBox = positiveCell ? await positiveCell.boundingBox() : null;
    result.positiveBox = positiveBox;
    if (positiveCell && positiveBox) {
      await positiveCell.hover();
      await page.waitForTimeout(120);
      result.hoverChecks = await page.evaluate(({ x, y, keyword, date }) => {
        const cell = document.querySelector('td.matrix-rank-cell:hover');
        const row = cell?.closest('tr');
        const overlay = document.querySelector('.matrix-column-hover-overlay');
        const bubble = document.getElementById('keyword-tracker-matrix-competitor-bubble');
        const point = { x, y };
        const hitCell = document.elementFromPoint(point.x, point.y)?.closest?.('td.matrix-rank-cell');
        return {
          cellOutline: cell ? getComputedStyle(cell).outlineWidth : '',
          cellOutlineColor: cell ? getComputedStyle(cell).outlineColor : '',
          rowTint: row ? getComputedStyle(row.querySelector('td')).backgroundImage : '',
          overlayVisible: Boolean(overlay && !overlay.hidden),
          bubbleVisible: Boolean(bubble && !bubble.hidden),
          oldHoverClasses: document.querySelectorAll('.matrix-hover-cell,.matrix-hover-row,.matrix-hover-column').length,
          hoveredCellMatches: Boolean(cell && cell.dataset.matrixKeyword === keyword && cell.dataset.matrixDate === date && hitCell === cell),
          scroll: { top: document.querySelector('.matrix-scroll')?.scrollTop || 0, left: document.querySelector('.matrix-scroll')?.scrollLeft || 0 },
          hoveredTag: document.elementFromPoint(point.x, point.y)?.tagName || '',
          hoveredCellKeyword: hitCell?.dataset?.matrixKeyword || '',
        };
      }, {
        x: Math.round(positiveBox.x + positiveBox.width / 2),
        y: Math.round(positiveBox.y + positiveBox.height / 2),
        keyword: positiveCandidate.keyword,
        date: positiveCandidate.date,
      });
      // Move to a second date in the same visible row.  The first Cell's
      // native :hover state must clear immediately while the comparison bubble
      // may remain alive during its 240ms grace period.
      const rowCells = positiveCell.locator('xpath=ancestor::tr').locator('td.matrix-rank-cell').filter({ hasText: /[1-9]/ });
      if (await rowCells.count() > 1) {
        const secondCell = rowCells.nth(1);
        const secondBox = await secondCell.boundingBox();
        if (secondBox) {
          const secondKeyword = await secondCell.getAttribute('data-matrix-keyword');
          const secondDate = await secondCell.getAttribute('data-matrix-date');
          await secondCell.hover();
          await page.waitForTimeout(30);
          result.transitionChecks = await page.evaluate(({ firstKeyword, firstDate, secondKeyword, secondDate }) => {
            const hovered = [...document.querySelectorAll('td.matrix-rank-cell:hover')];
            const overlay = document.querySelector('.matrix-column-hover-overlay');
            const bubble = document.getElementById('keyword-tracker-matrix-competitor-bubble');
            return {
              firstCleared: !hovered.some((cell) => cell.dataset.matrixKeyword === firstKeyword && cell.dataset.matrixDate === firstDate),
              secondHovered: hovered.some((cell) => cell.dataset.matrixKeyword === secondKeyword && cell.dataset.matrixDate === secondDate),
              hoveredCount: hovered.length,
              overlayVisible: Boolean(overlay && !overlay.hidden),
              bubbleVisibleDuringTransition: Boolean(bubble && !bubble.hidden),
            };
          }, { firstKeyword: positiveCandidate.keyword, firstDate: positiveCandidate.date, secondKeyword, secondDate });
        }
      }
      await page.mouse.move(10, 10);
      await page.waitForTimeout(40);
      result.leaveChecks = await page.evaluate(() => ({
        overlayHidden: document.querySelector('.matrix-column-hover-overlay')?.hidden === true,
        cellHoverCleared: !document.querySelector('td.matrix-rank-cell:hover'),
        bubbleVisibleDuringGrace: document.getElementById('keyword-tracker-matrix-competitor-bubble')?.hidden === false,
        oldHoverClasses: document.querySelectorAll('.matrix-hover-cell,.matrix-hover-row,.matrix-hover-column').length,
      }));
      await page.waitForTimeout(260);
      result.bubbleGraceCheck = await page.evaluate(() => ({ bubbleHiddenAfterGrace: document.getElementById('keyword-tracker-matrix-competitor-bubble')?.hidden !== false }));
    }
    result.ok = result.initial.rows > 0 && result.initial.dateColumns > 0 && result.after.overlayCount === 1 && result.after.oldHoverClassCount === 0 && result.deepVirtualization.renderedLastRow && result.deepVirtualization.lastRowInViewport && result.hoverChecks?.cellOutline === '2px' && result.hoverChecks?.overlayVisible && result.hoverChecks?.hoveredCellMatches && result.transitionChecks?.firstCleared && result.transitionChecks?.secondHovered && result.transitionChecks?.overlayVisible && result.transitionChecks?.bubbleVisibleDuringTransition && result.leaveChecks?.overlayHidden && result.leaveChecks?.cellHoverCleared && result.leaveChecks?.bubbleVisibleDuringGrace && result.bubbleGraceCheck?.bubbleHiddenAfterGrace && result.consoleErrors.length === 0 && result.pageErrors.length === 0;
    fs.writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    await browser.close(); await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
