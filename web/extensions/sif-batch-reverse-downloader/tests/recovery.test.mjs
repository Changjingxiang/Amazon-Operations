import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import * as utils from '../utils.mjs';

const background = fs.readFileSync(new URL('../background.js', import.meta.url), 'utf8').replace(/^import[\s\S]*?from "\.\/utils\.mjs";/, '');
const bridge = fs.readFileSync(new URL('../../../browser-bridge/browser-bridge.js', import.meta.url), 'utf8');
const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const event = () => ({ listeners: new Set(), addListener(f) { this.listeners.add(f); }, removeListener(f) { this.listeners.delete(f); }, emit(...args) { for (const f of this.listeners) f(...args); } });
const own = { asin: 'B0CJQBTQ8V', countryCode: 'CA', kind: 'own' };
const other = { asin: 'B0AAAAAAAA', countryCode: 'AU', kind: 'own' };
const competitor = { asin: 'B0BBBBBBBB', countryCode: 'MX', kind: 'competitor' };
async function eventually(check) {
  for (let n = 0; n < 100; n++) { if (check()) return; await new Promise(setImmediate); }
  assert.ok(check(), 'condition did not settle');
}
function extension() {
  const messages = [], downloads = [], intervals = new Set();
  const chrome = {
    storage: { local: { get: async () => ({}), set: async () => {} } },
    runtime: { onMessage: event(), sendMessage: async () => {}, getManifest: () => ({ version: '1.1.9' }) },
    tabs: { onRemoved: event(), onUpdated: event(), remove: async id => chrome.tabs.onRemoved.emit(id), sendMessage: async (_id, message) => messages.push(structuredClone(message)) },
    downloads: { onCreated: event(), onDeterminingFilename: event(), onChanged: event() },
  };
  const context = vm.createContext({ ...utils, chrome, URL, console, crypto: webcrypto, setTimeout, clearTimeout,
    setInterval(f) { intervals.add(f); return f; }, clearInterval(f) { intervals.delete(f); } });
  vm.runInContext(background, context);
  context.processOne = async (_run, task) => { downloads.push(task.asin); return { file: { data: 'YQ==' } }; };
  const send = (type, payload, sessionId = 'page1', tabId = 10) => new Promise(resolve => chrome.runtime.onMessage.listeners.values().next().value(
    { type, payload, sessionId }, { tab: { id: tabId, url: 'file:///C:/tracker/index.html' } }, resolve));
  return { context, chrome, messages, downloads, intervals, send,
    start: (runId = 'run1', items = [own, other], session = 'page1') => send('START_WEB_BATCH', { protocolVersion: 2, runId, items, concurrency: 1 }, session),
    ack: (asin, ok = true) => send('WEB_BATCH_ACK', { runId: 'run1', asin, ok, error: 'save failed' }),
    stop: () => send('STOP_BATCH'),
  };
}

test('next ASIN waits for persisted report ACK; another tab cannot acknowledge or stop it', async () => {
  const ext = extension();
  try {
    assert.equal((await ext.start()).ok, true);
    await eventually(() => ext.messages.some(m => m.type === 'WEB_BATCH_REPORT'));
    assert.deepEqual(ext.downloads, [own.asin]);
    assert.equal((await ext.send('WEB_BATCH_ACK', { runId: 'run1', asin: own.asin, ok: true }, 'page1', 11)).ok, false);
    assert.equal((await ext.send('STOP_WEB_BATCH', { runId: 'run1' }, 'page1', 11)).ok, false);
    assert.deepEqual(ext.downloads, [own.asin]);
    await ext.ack(own.asin);
    await eventually(() => ext.messages.filter(m => m.type === 'WEB_BATCH_REPORT').length === 2);
    await ext.ack(other.asin);
    await eventually(() => ext.messages.some(m => m.type === 'WEB_BATCH_COMPLETED'));
    assert.equal(ext.messages.at(-1).state.status, 'completed');
    assert.equal((await ext.start('run2', [competitor])).ok, true, 'phase boundary must release old run');
  } finally { await ext.stop(); }
});

for (const reason of ['reload', 'close', 'lost heartbeat', 'new document', 'save failure', 'lost receiver']) {
  test(`${reason} stops pending web job and permits a clean retry`, async () => {
    const ext = extension();
    try {
      if (reason === 'lost receiver') ext.chrome.tabs.sendMessage = async (_id, msg) => {
        if (msg.type === 'WEB_BATCH_REPORT') throw new Error('Receiving end does not exist');
        ext.messages.push(structuredClone(msg));
      };
      await ext.start();
      await eventually(() => reason === 'lost receiver'
        ? ext.messages.some(m => m.type === 'WEB_BATCH_COMPLETED') : ext.messages.some(m => m.type === 'WEB_BATCH_REPORT'));
      if (reason === 'reload') ext.chrome.tabs.onUpdated.emit(10, { status: 'loading' });
      if (reason === 'close') ext.chrome.tabs.onRemoved.emit(10);
      if (reason === 'lost heartbeat') { vm.runInContext('activeRun.lastSeen = 0', ext.context); for (const f of [...ext.intervals]) f(); }
      if (reason === 'new document') assert.equal((await ext.send('PING_WEB_BRIDGE', null, 'page2')).ok, true);
      if (reason === 'save failure') await ext.ack(own.asin, false);
      await eventually(() => ext.messages.some(m => m.type === 'WEB_BATCH_COMPLETED'));
      assert.deepEqual(ext.downloads, [own.asin], 'no downloads continue after losing page/save');
      assert.equal(ext.messages.at(-1).state.status, 'stopped');
      ext.chrome.tabs.sendMessage = async (_id, msg) => ext.messages.push(structuredClone(msg));
      assert.equal((await ext.start('retry', [other], 'page2')).ok, true);
      assert.equal((await ext.ack(own.asin)).ok, false, 'old document cannot affect new run');
    } finally { await ext.stop(); }
  });
}

function webContext({ busy = false, saveFails = false } = {}) {
  const jobs = [], acks = [], listeners = new Set();
  let resolveSave;
  const saving = new Promise(resolve => { resolveSave = resolve; });
  const data = { ownModels: [own], competitors: [competitor] };
  const context = vm.createContext({
    window: { setTimeout, clearTimeout, setInterval, clearInterval }, console,
    text: value => String(value || '').trim(), normalizeCountryCode: utils.normalizeCountryCode,
    getImportTargets: async () => data, pingWebExtension: async () => ({ ok: true }), lastPersistenceStatus: {},
    installWebBridgeListener() {}, webBatchListeners: listeners, emitSifProgress() {}, extensionFileToBlob: f => f,
    result() { throw new Error('Batch must not rebuild full matrices'); },
    async importReports(_mode, _files, options) {
      assert.equal(options.includeData, false); assert.equal(options.expectedAsin, own.asin);
      await saving;
      if (saveFails) throw new Error('disk transaction failed');
      return { ok: true };
    },
    async requestWebExtension(type, payload) {
      if (type === 'PING_WEB_BRIDGE') return { ok: true, version: '1.1.9' };
      if (type === 'WEB_BATCH_ACK') { acks.push(payload); return { ok: true }; }
      if (type !== 'START_WEB_BATCH') return { ok: true };
      jobs.push(payload);
      if (busy) return { ok: false, error: '已有任务正在运行。' };
      queueMicrotask(() => {
        for (const listener of listeners) {
          listener({ type: 'WEB_BATCH_REPORT', runId: 'old-run', asin: own.asin, file: {} });
          listener({ type: 'WEB_BATCH_REPORT', runId: payload.runId, asin: own.asin, file: {} });
          listener({ type: 'WEB_BATCH_COMPLETED', runId: payload.runId, state: { tasks: payload.items.map(item => ({ ...item, status: 'done' })) } });
        }
      });
      return { ok: true };
    },
  });
  vm.runInContext('let sifBatchImportInFlight = null;\n' + between(bridge, '  async function runWebExtensionBatch(', '  function delay(')
    + between(bridge, '  async function startSifBatchImport(', '  function downloadBlob('), context);
  return { context, jobs, acks, resolveSave };
}

test('busy own phase does not submit competitor phase or rebuild matrices', async () => {
  const web = webContext({ busy: true });
  const result = await web.context.startSifBatchImport({ items: [own, competitor] });
  assert.equal(result.ok, false);
  assert.equal(web.jobs.length, 1);
  assert.match(result.output, /竞品阶段尚未启动/);
});

for (const saveFails of [false, true]) test(`ACK waits for persistence (failure=${saveFails}); stale run ignored`, async () => {
  const web = webContext({ saveFails });
  const pending = web.context.startSifBatchImport({ items: [own] });
  await eventually(() => web.jobs.length === 1);
  assert.equal(web.acks.length, 0);
  web.resolveSave();
  const result = await pending;
  assert.equal(web.acks.length, 1);
  assert.equal(web.acks[0].ok, !saveFails);
  assert.equal(result.ok, !saveFails);
});

test('concurrent UI readers reuse matrices and revision changes invalidate the projection', async () => {
  let builds = 0;
  const store = { configs: [{ parentAsin: own.asin, historySheet: 'h' }], competitors: [], histories: { h: [] },
    iconSelections: {}, iconHistories: {}, storageRevision: 'first' };
  const context = vm.createContext({ ensureStore: async () => store, pendingSave: null, indexedDbAvailable: true,
    buildModel: config => { builds++; return { ...config }; }, defaultIconKey: () => 'sweater', listAbaMonthlyImports: () => [] });
  vm.runInContext(between(bridge, '  async function getImportTargets(', '  async function result('), context);
  const [react, sidebar, matrix] = await Promise.all([context.readData(), context.readData(), context.readData()]);
  assert.equal(builds, 1);
  assert.equal(react, sidebar); assert.equal(sidebar, matrix);
  await context.getImportTargets(); assert.equal(builds, 1, 'batch planning must not build history');
  store.storageRevision = 'second';
  assert.notEqual(await context.readData(), react); assert.equal(builds, 2);
});

test('report import parses once, waits for write, and returns no unused full-data projection', async () => {
  let parsed = 0, persisted = 0;
  const store = { configs: [{ parentAsin: own.asin, historySheet: 'h', modelName: 'own' }], competitors: [], histories: { h: [] }, importedFiles: {}, sourceCount: 0 };
  const context = vm.createContext({ ensureStore: async () => store, lastPersistenceStatus: {},
    sourceReport: async () => { parsed++; return { parentAsin: own.asin, snapshotDate: '2026-10-26', records: [{ keyword: 'sweater' }] }; },
    writeStore: async () => { await new Promise(setImmediate); persisted++; },
    result() { throw new Error('unexpected projection'); } });
  vm.runInContext(between(bridge, '  async function importReports(', '  function buildSifUrls('), context);
  const response = await context.importReports('force', [{ name: 'sample.xlsx', size: 100, lastModified: 1, arrayBuffer() {} }], { expectedAsin: own.asin, includeData: false });
  assert.equal(response.ok, true); assert.equal(parsed, 1); assert.equal(persisted, 1);
  assert.equal(store.histories.h.length, 1); assert.equal(store.sourceCount, 1);
  assert.equal(response.data, undefined);
});
