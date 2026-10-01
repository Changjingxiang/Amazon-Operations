import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
const asin = 'B0CJQBTQ8V';

async function runPage({ notice = '当前查询的是父体ASIN，暂不支持提供产品概览信息', card = false, rows = true, loading = false, wrongTarget = false } = {}) {
  let now = 0;
  let listener;
  let downloads = 0;
  const progress = [];
  const visible = { getBoundingClientRect: () => ({ width: 100, height: 30 }) };
  const download = { ...visible, classList: { contains: () => false }, scrollIntoView() {}, click() { downloads++; } };
  const parent = { classList: { contains: () => true }, querySelector: () => ({ textContent: '父体' }) };
  const document = {
    body: { innerText: notice },
    querySelector: () => download,
    querySelectorAll(selector) {
      if (selector === 'button') return [{ textContent: '反查流量词' }];
      if (selector.includes('.single_variant_wrap')) return card ? [parent] : [];
      if (selector.includes('.el-loading-mask')) return loading ? [visible] : [];
      if (selector.includes('tbody tr')) return rows ? [{ innerText: 'bomber jacket men 28 5' }] : [];
      return [];
    },
  };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(source, {
    location: { hostname: 'www.sif.com', href: `https://www.sif.com/reverse?asin=${asin}` },
    document, URL, Date: Clock,
    window: { addEventListener() {} },
    chrome: { runtime: {
      onMessage: { addListener(fn) { listener = fn; } },
      sendMessage: async message => { progress.push(message.status); },
    } },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    setTimeout(fn, delay) { queueMicrotask(() => { now += delay; fn(); }); return 1; },
    clearTimeout() {},
  });
  const result = await new Promise(resolve => listener({ type: 'RUN_SIF_DOWNLOAD', asin: wrongTarget ? 'B0FF4HCVXT' : asin, captureReady: false }, {}, resolve));
  return { result, downloads, progress };
}

test('parent notice with missing overview cards downloads the populated lower table', async () => {
  const page = await runPage();
  assert.equal(page.result.ok, true);
  assert.equal(page.downloads, 1);
  assert.equal(page.progress.at(-1), 'downloading');
});

test('normal selected parent card still downloads without needing a parent notice', async () => {
  const page = await runPage({ card: true, notice: '' });
  assert.equal(page.result.ok, true);
  assert.equal(page.downloads, 1);
});

for (const [name, options] of [
  ['child query', { notice: '当前查询的是子体ASIN' }],
  ['empty keyword table', { rows: false }],
  ['table still loading', { loading: true }],
  ['wrong target ASIN', { wrongTarget: true }],
]) {
  test(`fallback does not download a ${name}`, async () => {
    const page = await runPage(options);
    assert.equal(page.result.ok, false);
    assert.equal(page.downloads, 0);
  });
}
