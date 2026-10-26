import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeCountryCode } from '../utils.mjs';

const settings = fs.readFileSync(new URL('../../../web-settings/web-settings-enhancements.js', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../../../browser-bridge/browser-bridge.js', import.meta.url), 'utf8');
const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
for (const countries of [['CA', 'US'], ['MX', 'AU']]) {
  const data = {
    ownModels: [{ parentAsin: 'B0CJQBTQ8V', countryCode: countries[0] }, { parentAsin: 'B0AAAAAAAA', countryCode: countries[1] }],
    competitors: [{ parentAsin: 'B0BBBBBBBB', ownerParentAsin: 'B0CJQBTQ8V', countryCode: countries[0] }, { parentAsin: 'B0CCCCCCCC', ownerParentAsin: 'B0AAAAAAAA', countryCode: countries[1] }],
  };

for (const currentOnly of [true, false]) {
  test(`${countries.join('/')} ${currentOnly ? 'current product' : 'all products'} action sends reports through staged extension import`, async () => {
    const jobs = [], imported = [];
    const listeners = new Set();
    const context = vm.createContext({
      window: { setTimeout, clearTimeout, setInterval, clearInterval }, console,
      document: { querySelector: () => ({ textContent: 'ASIN: B0CJQBTQ8V' }), querySelectorAll: () => [] },
      text: value => String(value || '').trim(),
      normalizeCountryCode,
      readData: async () => data, getImportTargets: async () => data, lastPersistenceStatus: {},
      pingWebExtension: async () => ({ ok: true, version: '1.1.9' }),
      installWebBridgeListener() {},
      webBatchListeners: listeners,
      emitSifProgress() {},
      extensionFileToBlob: file => file,
      sourceReport: async file => ({ parentAsin: file.asin }),
      importReports: async (mode, files) => { imported.push(files[0].asin); return { ok: true }; },
      result: async output => ({ ok: true, output }),
      requestWebExtension: async (type, payload) => {
        if (type === 'PING_WEB_BRIDGE') return { ok: true, version: '1.1.9' };
        if (type !== 'START_WEB_BATCH') return { ok: true };
        jobs.push(JSON.parse(JSON.stringify(payload)));
        queueMicrotask(() => {
          for (const item of payload.items) for (const listener of listeners) listener({ type: 'WEB_BATCH_REPORT', runId: payload.runId, asin: item.asin, file: { asin: item.asin } });
          for (const listener of listeners) listener({ type: 'WEB_BATCH_COMPLETED', runId: payload.runId, state: { tasks: payload.items.map(item => ({ ...item, status: 'done' })) } });
        });
        return { ok: true };
      },
      showBatchResult: async response => { assert.equal(response.ok, true); },
    });
    vm.runInContext(`let sifBatchImportInFlight = null; let batchImportRunning = false; let sidebarDataCache, matrixDataCache;\n`
      + between(settings, '  function ownModelsFromData(', '  function ownerModelForAsin(')
      + between(settings, '  function batchItemsFromData(', '  let batchImportRunning')
      + between(settings, '  async function runAllBatchImport(', '  function installBatchButton(')
      + between(bridge, '  async function runWebExtensionBatch(', '  function delay(')
      + between(bridge, '  async function startSifBatchImport(', '  function downloadBlob('), context);
    context.window.keywordTracker = { getData: async () => data, startSifBatchImport: context.startSifBatchImport };
    const trigger = { dataset: {}, setAttribute() {}, removeAttribute() {} };
    await context.runAllBatchImport({ trigger, setStatus() {}, currentOnly });
    assert.deepEqual(jobs.map(job => job.items.map(item => item.asin)), currentOnly
      ? [['B0CJQBTQ8V'], ['B0BBBBBBBB']]
      : [['B0CJQBTQ8V', 'B0AAAAAAAA'], ['B0BBBBBBBB', 'B0CCCCCCCC']]);
    assert.ok(jobs.every(job => job.concurrency === 1));
    assert.deepEqual(imported, jobs.flatMap(job => job.items.map(item => item.asin)));
    assert.equal(jobs[0].items[0].countryCode, countries[0]);
    if (!currentOnly) assert.equal(jobs[0].items[1].countryCode, countries[1]);
  });
}
}

for (const countryCode of ['CA', 'MX', 'AU']) {
  test(`${countryCode} cannot start through an old extension that silently falls back to Canada`, async () => {
    for (const version of ['1.1.7', '1.1.8', '', undefined]) {
      const requests = [];
      const context = vm.createContext({
        text: value => String(value ?? '').trim(), normalizeCountryCode,
        installWebBridgeListener() {},
        requestWebExtension: async type => { requests.push(type); return { ok: true, version }; },
      });
      vm.runInContext(between(bridge, '  async function runWebExtensionBatch(', '  function delay('), context);
      await assert.rejects(context.runWebExtensionBatch([{ asin: 'B0CJQBTQ8V', countryCode }]), /v1\.1\.9/);
      assert.deepEqual(requests, ['PING_WEB_BRIDGE']);
    }
  });
}
