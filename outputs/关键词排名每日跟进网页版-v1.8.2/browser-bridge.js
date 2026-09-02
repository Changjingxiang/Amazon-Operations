(function () {
  'use strict';

  window.__KEYWORD_ASSET_BASE__ = new URL('./assets/', document.baseURI).href;

  const DB_NAME = 'keyword-rank-daily-tracker-v181';
  const DB_VERSION = 1;
  const STORE_NAME = 'state';
  const STATE_KEY = 'tracker-store';
  const SCHEMA_VERSION = 3;
  const ORIGINAL_SEED = window.__KEYWORD_TRACKER_SEED__ || {
    schemaVersion: SCHEMA_VERSION,
    configs: [],
    watches: [],
    histories: {},
    importedFiles: {},
    abaMonthly: {},
    annotations: [],
  };
  const INITIAL_ICONS = {
    B0C1CGFWDX: 'bomber-jacket',
    B089B4RBX8: 'bomber-jacket',
  };
  const APPAREL_ICON_KEYS = new Set([
    'tank-top', 'jacket', 'sweater', 'tshirt', 'sleeveless-tshirt', 'hooded-jacket', 'shirt', 'polo',
    'sweatshirt', 'hoodie', 'puffer-coat', 'bomber-jacket', 'vest', 'trench-coat', 'long-sleeve-tshirt', 'generic-apparel',
  ]);
  const SIF_COUNTRIES = [
    { code: 'US', label: '美国站' },
    { code: 'DE', label: '德国站' },
    { code: 'UK', label: '英国站' },
    { code: 'JP', label: '日本站' },
    { code: 'CA', label: '加拿大站' },
    { code: 'FR', label: '法国站' },
    { code: 'ES', label: '西班牙站' },
    { code: 'IT', label: '意大利站' },
  ];
  const SIF_COUNTRY_CODES = new Set(SIF_COUNTRIES.map((item) => item.code));
  const SIF_ORIGIN = 'https://www.sif.com';
  const SIF_READY_WAIT_MS = 4500;
  const sifProgressListeners = new Set();
  let sifAssistantOverlay = null;
  let sifImportInFlight = null;
  let sifBatchImportInFlight = null;
  const WEB_BRIDGE_SOURCE = 'keyword-tracker-web';
  const EXTENSION_BRIDGE_SOURCE = 'sif-batch-extension';
  const webBridgeRequests = new Map();
  const webBatchListeners = new Set();
  let webBridgeListenerInstalled = false;

  let memoryStore = null;
  let indexedDbAvailable = true;

  function clone(value) {
    return typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function countryLabel(code) {
    return SIF_COUNTRIES.find((item) => item.code === code)?.label || '加拿大站';
  }

  function normalizeCountryCode(value) {
    const raw = text(value);
    const upper = raw.toUpperCase();
    if (SIF_COUNTRY_CODES.has(upper)) return upper;
    const matched = SIF_COUNTRIES.find((item) => raw.includes(item.label.replace('站', '')) || raw.includes(item.label));
    return matched?.code || 'CA';
  }

  function emitSifProgress(status, message, extra = {}) {
    const payload = { status, message: text(message) || text(status), ...extra };
    sifProgressListeners.forEach((listener) => {
      try { listener(payload); } catch (error) { console.warn('SIF 状态回调失败。', error); }
    });
  }

  function installWebBridgeListener() {
    if (webBridgeListenerInstalled) return;
    webBridgeListenerInstalled = true;
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.data?.source !== EXTENSION_BRIDGE_SOURCE) return;
      const data = event.data;
      if (data.type === 'WEB_BRIDGE_REPLY' && data.requestId) {
        const pending = webBridgeRequests.get(data.requestId);
        if (!pending) return;
        webBridgeRequests.delete(data.requestId);
        clearTimeout(pending.timer);
        pending.resolve(data);
        return;
      }
      if (data.type === 'WEB_BRIDGE_READY') {
        emitSifProgress('extension-ready', '浏览器自动导入扩展已连接。');
        return;
      }
      if (/^WEB_BATCH_/u.test(String(data.type || ''))) {
        webBatchListeners.forEach((listener) => {
          try { listener(data); } catch (error) { console.warn('SIF 批量导入状态处理失败。', error); }
        });
        const state = data.state;
        if (state) {
          const done = (state.tasks || []).filter((task) => ['done', 'failed', 'cancelled'].includes(task.status)).length;
          emitSifProgress(data.type === 'WEB_BATCH_COMPLETED' ? 'completed' : 'working',
            `SIF 自动导入进度：${done}/${(state.tasks || []).length}。`, { state });
        }
      }
    });
  }

  function requestWebExtension(type, payload, timeoutMs = 2500) {
    installWebBridgeListener();
    const requestId = `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        webBridgeRequests.delete(requestId);
        reject(new Error('未检测到 SIF 自动导入扩展。请先加载扩展并允许它访问本地网页。'));
      }, timeoutMs);
      webBridgeRequests.set(requestId, { resolve, reject, timer });
      window.postMessage({ source: WEB_BRIDGE_SOURCE, type, requestId, payload }, '*');
    });
  }

  async function pingWebExtension() {
    try {
      const response = await requestWebExtension('PING_WEB_BRIDGE', null, 1400);
      return response?.ok ? response : null;
    } catch (error) {
      return null;
    }
  }

  function extensionFileToBlob(fileInfo, fallbackAsin, countryCode) {
    if (!fileInfo || !fileInfo.data) throw new Error('扩展没有回传报表内容。');
    const raw = String(fileInfo.data);
    const binary = window.atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const filename = text(fileInfo.name) || `Sif反查流量词_${countryCode || 'CA'}_${fallbackAsin}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new File([bytes], filename, {
      type: text(fileInfo.mime) || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      lastModified: Date.now(),
    });
  }

  async function runWebExtensionBatch(items, options = {}) {
    installWebBridgeListener();
    const normalizedItems = (Array.isArray(items) ? items : []).map((item) => ({
      asin: text(item?.asin || item?.parentAsin).toUpperCase(),
      countryCode: normalizeCountryCode(item?.countryCode || item?.site || 'CA'),
      modelName: text(item?.modelName),
    })).filter((item) => item.asin);
    if (!normalizedItems.length) throw new Error('没有可自动导入的产品。');
    const ping = await requestWebExtension('PING_WEB_BRIDGE', null, 1800);
    if (!ping?.ok) throw new Error('未检测到 SIF 自动导入扩展。请先加载扩展并允许它访问本地网页。');

    const expected = new Map(normalizedItems.map((item) => [item.asin, item]));
    const terminal = new Set();
    const errors = [];
    let imported = 0;
    let completed = false;
    let settled = false;
    let importChain = Promise.resolve();
    let finishResolve;
    let finishReject;
    const finished = new Promise((resolve, reject) => { finishResolve = resolve; finishReject = reject; });
    const maybeFinish = () => {
      if (settled || !completed || terminal.size < expected.size) return;
      settled = true;
      importChain.then(() => finishResolve()).catch(finishReject);
    };
    const onEvent = (event) => {
      if (event.type === 'WEB_BATCH_COMPLETED') {
        completed = true;
        for (const task of event.state?.tasks || []) {
          const asin = text(task.asin).toUpperCase();
          if (!expected.has(asin) || terminal.has(asin)) continue;
          if (['done', 'failed', 'cancelled'].includes(task.status)) {
            terminal.add(asin);
            errors.push(`${asin}：${text(task.error) || '下载完成但没有回传报表内容。'}`);
          }
        }
        maybeFinish();
        return;
      }
      const asin = text(event.asin).toUpperCase();
      if (!expected.has(asin)) return;
      if (event.type === 'WEB_BATCH_REPORT') {
        if (terminal.has(asin)) return;
        terminal.add(asin);
        importChain = importChain.then(async () => {
          try {
            const item = expected.get(asin);
            const file = extensionFileToBlob(event.file, asin, item.countryCode);
            const report = await sourceReport(file);
            if (report.parentAsin !== asin) throw new Error(`报表属于 ${report.parentAsin}，不是 ${asin}。`);
            const response = await importReports('force', [file]);
            if (!response.ok) throw new Error(response.output || '导入失败。');
            imported += 1;
          } catch (error) {
            errors.push(`${asin}：${text(error?.message || error)}`);
          }
        }).finally(maybeFinish);
      } else if (event.type === 'WEB_BATCH_REPORT_ERROR' || event.type === 'WEB_BATCH_TASK_FAILED') {
        if (terminal.has(asin)) return;
        terminal.add(asin);
        errors.push(`${asin}：${text(event.error) || '下载或回传失败。'}`);
        maybeFinish();
      }
    };
    webBatchListeners.add(onEvent);
    try {
      const response = await requestWebExtension('START_WEB_BATCH', {
        items: normalizedItems,
        concurrency: Math.min(3, normalizedItems.length),
      }, 5000);
      if (!response?.ok) throw new Error(response?.error || '无法启动 SIF 批量导入。');
      const timeout = window.setTimeout(() => finishReject(new Error('SIF 批量导入等待超时，请查看扩展任务状态后重试。')), 15 * 60 * 1000);
      try {
        await finished;
      } finally {
        window.clearTimeout(timeout);
      }
    } finally {
      webBatchListeners.delete(onEvent);
    }
    const output = `SIF 批量报表已下载并导入：成功 ${imported} 个，失败 ${errors.length} 个。${errors.length ? `\n${errors.slice(0, 8).join('\n')}` : ''}`;
    const resultValue = await result(output);
    resultValue.ok = errors.length === 0 && imported === normalizedItems.length;
    if (options.single && !resultValue.ok) resultValue.output = output;
    return resultValue;
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function key(value) {
    return text(value).toLocaleLowerCase('en-US');
  }

  function shiftCalendarMonths(dateValue, offset) {
    const raw = text(dateValue);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    const year = Number(match[1]); const month = Number(match[2]) - 1; const day = Number(match[3]);
    const absoluteMonth = year * 12 + month + Number(offset || 0);
    const targetYear = Math.floor(absoluteMonth / 12); const targetMonth = ((absoluteMonth % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  }

  function normalizeHeader(value) {
    return text(value).replace(/^\uFEFF/, '').replace(/[\r\n\t ]+/g, ' ');
  }

  function nullableNumber(value) {
    if (value == null || text(value) === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Number(String(value).replace(/,/g, '').replace(/%$/, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function isoDate(value) {
    if (value == null || text(value) === '') return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    if (typeof value === 'number' && Number.isFinite(value) && window.XLSX) {
      const date = window.XLSX.SSF.parse_date_code(value);
      if (date) return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
    const raw = text(value);
    const match = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    return match ? `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}` : raw;
  }

  function normalizeAnnotations(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        modelName: text(item.modelName),
        metric: text(item.metric).toLocaleLowerCase('en-US') || 'sp',
        keyword: text(item.keyword),
        date: isoDate(item.date),
        text: text(item.text),
        updatedAt: text(item.updatedAt),
      }))
      .filter((item) => item.modelName && item.keyword && item.date && item.text);
  }

  function normalizeConfig(value) {
    const config = value && typeof value === 'object' ? value : {};
    const countryCode = normalizeCountryCode(config.countryCode || config.site);
    const parentAsin = text(config.parentAsin).toUpperCase();
    const legacyParentAsins = [...new Set(
      (Array.isArray(config.legacyParentAsins) ? config.legacyParentAsins : [])
        .map((item) => text(item).toUpperCase())
        .filter((item) => /^B0[A-Z0-9]{8}$/.test(item) && item !== parentAsin),
    )];
    return {
      ...config,
      parentAsin,
      legacyParentAsins,
      countryCode,
      site: text(config.site) || countryLabel(countryCode),
    };
  }

  function normalizeStore(value) {
    const store = value && typeof value === 'object' ? value : {};
    return {
      schemaVersion: Math.max(SCHEMA_VERSION, Number(store.schemaVersion) || 0),
      configs: Array.isArray(store.configs) ? store.configs.map(normalizeConfig) : [],
      watches: Array.isArray(store.watches) ? store.watches : [],
      histories: store.histories && typeof store.histories === 'object' ? store.histories : {},
      importedFiles: store.importedFiles && typeof store.importedFiles === 'object' ? store.importedFiles : {},
      // Monthly ABA imports are kept separately from daily SIF histories.  The
      // object is intentionally retained by reference when it is already a
      // store object so normal watch/annotation edits do not copy tens of
      // thousands of CSV rows on every save.
      abaMonthly: store.abaMonthly && typeof store.abaMonthly === 'object' ? store.abaMonthly : {},
      annotations: normalizeAnnotations(store.annotations),
      iconSelections: store.iconSelections && typeof store.iconSelections === 'object'
        ? store.iconSelections
        : { ...INITIAL_ICONS },
      sourceCount: Number.isFinite(Number(store.sourceCount)) ? Number(store.sourceCount) : 54,
      migratedFromWorkbookAt: store.migratedFromWorkbookAt || null,
      updatedAt: store.updatedAt || null,
    };
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('当前浏览器不支持 IndexedDB。'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('无法打开浏览器数据库。'));
    });
  }

  async function readIndexedStore() {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(STATE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  async function writeIndexedStore(store) {
    const db = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(store, STATE_KEY);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  async function ensureStore() {
    if (memoryStore) return memoryStore;
    let saved = null;
    try {
      saved = await readIndexedStore();
    } catch (error) {
      indexedDbAvailable = false;
      console.warn('浏览器数据库不可用，本次改动仅在当前页面保留。', error);
    }
    memoryStore = normalizeStore(saved || clone(ORIGINAL_SEED));
    if (!saved && indexedDbAvailable) {
      try { await writeIndexedStore(memoryStore); } catch (error) { indexedDbAvailable = false; }
    }
    return memoryStore;
  }

  async function writeStore(store) {
    memoryStore = normalizeStore({ ...store, updatedAt: new Date().toISOString() });
    if (indexedDbAvailable) {
      try { await writeIndexedStore(memoryStore); } catch (error) {
        indexedDbAvailable = false;
        console.warn('保存到浏览器数据库失败，本次改动仅在当前页面保留。', error);
      }
    }
    return memoryStore;
  }

  function direction(current, previous) {
    if (current == null || previous == null) return 'none';
    if (current < previous) return 'up';
    if (current > previous) return 'down';
    return 'same';
  }

  function shiftMonthKey(value, offset) {
    const match = text(value).match(/^(\d{4})-(\d{2})$/);
    if (!match) return '';
    const absolute = Number(match[1]) * 12 + Number(match[2]) - 1 + Number(offset || 0);
    const year = Math.floor(absolute / 12);
    const month = ((absolute % 12) + 12) % 12 + 1;
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  function monthEndDate(value) {
    const match = text(value).match(/^(\d{4})-(\d{2})$/);
    if (!match) return '';
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${match[1]}-${match[2]}-${String(day).padStart(2, '0')}`;
  }

  function abaImportKey(countryCode, month) {
    return `${normalizeCountryCode(countryCode || 'CA')}:${text(month)}`;
  }

  function abaEntryRows(entry) {
    if (!entry || typeof entry !== 'object') return null;
    if (entry.rows && typeof entry.rows === 'object' && !Array.isArray(entry.rows)) return entry.rows;
    // Accept the array form as a small compatibility aid for hand-edited JSON
    // backups created before the compact rows map was introduced.
    if (Array.isArray(entry.rows)) {
      const rows = {};
      entry.rows.forEach((item) => {
        const keyword = text(item?.keyword);
        const rank = nullableNumber(item?.rank ?? item?.abaRank ?? item?.searchFrequencyRank);
        if (keyword && rank != null && rank > 0) rows[key(keyword)] = rank;
      });
      return rows;
    }
    return null;
  }

  function getAbaMonthlyEntry(allAbaMonthly, countryCode, month) {
    if (!month || !allAbaMonthly || typeof allAbaMonthly !== 'object') return null;
    const code = normalizeCountryCode(countryCode || 'CA');
    const direct = allAbaMonthly[abaImportKey(code, month)]
      || allAbaMonthly[`${code}-${month}`]
      || allAbaMonthly[month];
    if (direct) return direct;
    // Older/manual backups may use an arbitrary key while retaining metadata.
    return Object.values(allAbaMonthly).find((entry) =>
      entry && text(entry.month || entry.monthKey) === month
      && normalizeCountryCode(entry.countryCode || entry.site || code) === code) || null;
  }

  function median(values) {
    const sorted = values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function listAbaMonthlyImports(abaMonthly) {
    if (!abaMonthly || typeof abaMonthly !== 'object') return [];
    return Object.entries(abaMonthly)
      .map(([entryKey, entry]) => {
        if (!entry || typeof entry !== 'object') return null;
        const month = text(entry.month || entry.monthKey || (entryKey.match(/(\d{4}-\d{2})$/) || [])[1]);
        if (!/^\d{4}-\d{2}$/.test(month)) return null;
        const countryCode = normalizeCountryCode(entry.countryCode || entry.site || entryKey.split(':')[0]);
        const rows = abaEntryRows(entry) || {};
        return {
          key: entryKey,
          month,
          year: Number(month.slice(0, 4)),
          countryCode,
          countryName: countryLabel(countryCode),
          fileName: text(entry.fileName || entry.sourceFile),
          importedAt: text(entry.importedAt),
          rowCount: Number(entry.rowCount) || Object.keys(rows).length,
          fingerprint: text(entry.fingerprint),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.month.localeCompare(a.month) || a.countryCode.localeCompare(b.countryCode));
  }

  function defaultIconKey(modelName) {
    const name = text(modelName).toLocaleLowerCase('zh-CN');
    if (/(带帽夹克|hooded jacket)/.test(name)) return 'hooded-jacket';
    if (/(飞行员|棒球夹克|bomber)/.test(name)) return 'bomber-jacket';
    if (/(无袖t恤|无袖 t|sleeveless)/.test(name)) return 'sleeveless-tshirt';
    if (/(长袖t恤|长袖 t|long.?sleeve)/.test(name)) return 'long-sleeve-tshirt';
    if (/(连帽卫衣|hoodie)/.test(name)) return 'hoodie';
    if (/(羽绒|棉服|puffer)/.test(name)) return 'puffer-coat';
    if (/(风衣|trench)/.test(name)) return 'trench-coat';
    if (/(夹克|jacket)/.test(name)) return 'jacket';
    if (/(马甲|vest)/.test(name)) return 'vest';
    if (/(背心|tank)/.test(name)) return 'tank-top';
    if (/(毛衣|sweater|knit)/.test(name)) return 'sweater';
    if (/(连帽|hood)/.test(name)) return 'hoodie';
    if (/(卫衣|sweatshirt)/.test(name)) return 'sweatshirt';
    if (/polo/.test(name)) return 'polo';
    if (/(衬衫|shirt)/.test(name) && !/(t.?shirt|t恤)/.test(name)) return 'shirt';
    if (/(t.?shirt|t恤)/.test(name)) return 'tshirt';
    return 'generic-apparel';
  }

  function buildModel(config, records, allWatches, allAnnotations, allAbaMonthly = {}) {
    const watches = allWatches
      .filter((item) => item.enabled && item.modelName === config.modelName)
      .sort((a, b) => a.order - b.order);
    const watchMap = new Map(watches.map((item, index) => [key(item.keyword), { ...item, pinOrder: index }]));
    const annotationMaps = {
      natural: new Map(
        (allAnnotations || [])
          .filter((item) => item.modelName === config.modelName && item.metric === 'natural')
          .map((item) => [`${key(item.keyword)}|${item.date}`, item.text]),
      ),
      sp: new Map(
        (allAnnotations || [])
          .filter((item) => item.modelName === config.modelName && item.metric === 'sp')
          .map((item) => [`${key(item.keyword)}|${item.date}`, item.text]),
      ),
    };
    const dates = [...new Set(records.map((item) => item.snapshotDate))].sort();
    const latestDate = dates.at(-1) || '';
    const selectedYear = latestDate ? Number(latestDate.slice(0, 4)) : new Date().getFullYear();
    const latestRecords = records.filter((item) => item.snapshotDate === latestDate);
    const pointMap = new Map(records.map((item) => [`${key(item.keyword)}|${item.snapshotDate}`, item]));
    const recordsByKeyword = new Map();
    for (const record of records) {
      const itemKey = key(record.keyword);
      const bucket = recordsByKeyword.get(itemKey);
      if (bucket) bucket.push(record); else recordsByKeyword.set(itemKey, [record]);
    }
    const latestByKeyword = new Map();
    for (const record of records) {
      const itemKey = key(record.keyword);
      const existing = latestByKeyword.get(itemKey);
      if (!existing || record.snapshotDate > existing.snapshotDate) latestByKeyword.set(itemKey, record);
    }
    const previousByKeyword = new Map();
    for (const record of records) {
      if (!latestDate || record.snapshotDate >= latestDate) continue;
      const itemKey = key(record.keyword);
      const existing = previousByKeyword.get(itemKey);
      if (!existing || record.snapshotDate > existing.snapshotDate) previousByKeyword.set(itemKey, record);
    }
    const currentMap = new Map();
    for (const record of latestRecords) {
      const itemKey = key(record.keyword);
      if (watchMap.has(itemKey) || (record.trafficRank != null && record.trafficRank <= 100)) currentMap.set(itemKey, { ...record });
    }
    for (const watch of watches) {
      const itemKey = key(watch.keyword);
      if (currentMap.has(itemKey)) continue;
      const base = latestByKeyword.get(itemKey);
      currentMap.set(itemKey, {
        snapshotDate: latestDate,
        modelName: config.modelName,
        parentAsin: config.parentAsin,
        keyword: base?.keyword || watch.keyword,
        translation: base?.translation || '',
        keywordType: base?.keywordType || '',
        trafficRank: null,
        trafficShare: null,
        naturalRank: null,
        naturalRankDate: '',
        naturalChildAsin: '',
        spRank: null,
        spRankDate: '',
        spCampaign: '',
        spChildAsin: '',
        weeklyAbaRank: null,
        weeklySearchVolume: null,
        conversionRate: null,
        status: '本日报表未出现',
        sourceFile: '',
      });
    }
    const trendDates = dates.slice(-30);
    const dashboardRows = [...currentMap.values()]
      .map((record) => {
        const itemKey = key(record.keyword);
        const previous = previousByKeyword.get(itemKey);
        const watch = watchMap.get(itemKey);
        return {
          ...record,
          watched: Boolean(watch),
          watchOrder: watch?.pinOrder ?? Number.MAX_SAFE_INTEGER,
          watchNote: watch?.note || '',
          naturalDirection: direction(record.naturalRank, previous?.naturalRank),
          spDirection: direction(record.spRank, previous?.spRank),
          naturalTrend: trendDates.map((date) => pointMap.get(`${itemKey}|${date}`)?.naturalRank ?? null),
          spTrend: trendDates.map((date) => pointMap.get(`${itemKey}|${date}`)?.spRank ?? null),
        };
      })
      .sort((a, b) => {
        const aWatch = watchMap.get(key(a.keyword));
        const bWatch = watchMap.get(key(b.keyword));
        if (aWatch && bWatch) return aWatch.pinOrder - bWatch.pinOrder;
        if (aWatch) return -1;
        if (bWatch) return 1;
        return (a.trafficRank ?? 999999) - (b.trafficRank ?? 999999);
      });
    const orderedKeys = [];
    const seen = new Set();
    const addKey = (itemKey) => {
      if (!itemKey || seen.has(itemKey)) return;
      seen.add(itemKey);
      orderedKeys.push(itemKey);
    };
    watches.forEach((item) => addKey(key(item.keyword)));
    [...latestRecords]
      .sort((a, b) => (a.trafficRank ?? 999999) - (b.trafficRank ?? 999999))
      .forEach((item) => addKey(key(item.keyword)));
    [...latestByKeyword.keys()].sort().forEach(addKey);
    const matrixRows = orderedKeys.map((itemKey) => {
      const base = latestByKeyword.get(itemKey);
      const watch = watchMap.get(itemKey);
      return {
        keyword: base?.keyword || watch?.keyword || itemKey,
        translation: base?.translation || '',
        watched: Boolean(watch),
        note: watch?.note || '',
        naturalValues: dates.map((date) => pointMap.get(`${itemKey}|${date}`)?.naturalRank ?? 0),
        spValues: dates.map((date) => pointMap.get(`${itemKey}|${date}`)?.spRank ?? 0),
        naturalAnnotations: dates.map((date) => annotationMaps.natural.get(`${itemKey}|${date}`) || ''),
        spAnnotations: dates.map((date) => annotationMaps.sp.get(`${itemKey}|${date}`) || ''),
      };
    });
    const abaRows = orderedKeys.map((itemKey) => {
      const base = latestByKeyword.get(itemKey);
      const watch = watchMap.get(itemKey);
      const keywordRecords = recordsByKeyword.get(itemKey) || [];
      const yearRecords = keywordRecords.filter((item) => item.snapshotDate.startsWith(`${selectedYear}-`));
      const maxSearch = yearRecords.reduce((max, item) => Math.max(max, item.weeklySearchVolume ?? 0), 0) || null;
      const maxConversion = yearRecords.reduce((max, item) => Math.max(max, item.conversionRate ?? 0), 0) || null;
      const latestByMonth = new Map();
      for (const item of yearRecords) {
        if (item.weeklyAbaRank == null) continue;
        const month = item.snapshotDate.slice(0, 7);
        const existing = latestByMonth.get(month);
        if (!existing || item.snapshotDate > existing.snapshotDate) latestByMonth.set(month, item);
      }
      const months = Array.from({ length: 12 }, (_unused, monthIndex) =>
        latestByMonth.get(`${selectedYear}-${String(monthIndex + 1).padStart(2, '0')}`)?.weeklyAbaRank ?? null,
      );
      const trendByDate = new Map();
      for (const item of yearRecords) {
        if (item.weeklyAbaRank == null) continue;
        const existing = trendByDate.get(item.snapshotDate);
        if (!existing || String(item.importTime || '') >= String(existing.importTime || '')) trendByDate.set(item.snapshotDate, item);
      }
      const abaTrend = [...trendByDate.values()]
        .sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate))
        .map((item) => ({ date: item.snapshotDate, value: item.weeklyAbaRank }));
      const previousYear = selectedYear - 1;
      let previousStart = latestDate ? shiftCalendarMonths(latestDate, -12) : '';
      const previousYearRecords = keywordRecords
        .filter((item) => item.weeklyAbaRank != null && item.snapshotDate.startsWith(`${previousYear}-`))
        .sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
      const exactOrNext = previousYearRecords.find((item) => item.snapshotDate >= previousStart);
      const previousAnchor = exactOrNext || previousYearRecords.filter((item) => item.snapshotDate < previousStart).at(-1);
      if (previousAnchor) previousStart = previousAnchor.snapshotDate;
      const previousEnd = previousStart ? shiftCalendarMonths(previousStart, 2) : '';
      const previousTrendByDate = new Map();
      if (previousStart && previousEnd) {
        for (const item of keywordRecords) {
          if (item.weeklyAbaRank == null || item.snapshotDate < previousStart || item.snapshotDate > previousEnd) continue;
          const existing = previousTrendByDate.get(item.snapshotDate);
          if (!existing || String(item.importTime || '') >= String(existing.importTime || '')) previousTrendByDate.set(item.snapshotDate, item);
        }
      }
      const abaPreviousTrendBase = [...previousTrendByDate.values()]
        .sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate))
        .map((item) => ({ date: item.snapshotDate, value: item.weeklyAbaRank }));
      // Compare the latest/current month’s weekly ABA ranks (median) with the
      // imported ABA month from last year.  A smaller rank is an improvement.
      const currentMonth = latestDate ? latestDate.slice(0, 7) : '';
      const previousYearMonth = currentMonth ? shiftMonthKey(currentMonth, -12) : '';
      const previousYearNextMonth = previousYearMonth ? shiftMonthKey(previousYearMonth, 1) : '';
      const currentMonthMedian = median(keywordRecords
        .filter((item) => currentMonth && item.snapshotDate.startsWith(`${currentMonth}-`))
        .map((item) => item.weeklyAbaRank));
      const previousYearEntry = getAbaMonthlyEntry(allAbaMonthly, config.countryCode || config.site, previousYearMonth);
      const previousYearNextEntry = getAbaMonthlyEntry(allAbaMonthly, config.countryCode || config.site, previousYearNextMonth);
      const previousYearRows = abaEntryRows(previousYearEntry) || {};
      const previousYearNextRows = abaEntryRows(previousYearNextEntry) || {};
      const previousYearRank = nullableNumber(previousYearRows[itemKey]);
      const previousYearNextRank = nullableNumber(previousYearNextRows[itemKey]);
      // Monthly ABA imports are also valid reference points for the chart. Use
      // month-end dates for the same month and the following two months, and
      // let existing weekly history win when it already has that exact date.
      const importedPreviousTrend = [...abaPreviousTrendBase];
      [previousYearMonth, previousYearNextMonth, shiftMonthKey(previousYearNextMonth, 1)].forEach((monthKey) => {
        if (!monthKey) return;
        const entry = getAbaMonthlyEntry(allAbaMonthly, config.countryCode || config.site, monthKey);
        const rank = nullableNumber(abaEntryRows(entry)?.[itemKey]);
        const date = monthEndDate(monthKey);
        if (rank == null || !date || importedPreviousTrend.some((point) => point.date === date)) return;
        importedPreviousTrend.push({ date, value: rank });
      });
      const abaPreviousTrend = importedPreviousTrend.sort((a, b) => a.date.localeCompare(b.date));
      return {
        keyword: base?.keyword || watch?.keyword || itemKey,
        translation: base?.translation || '',
        watched: Boolean(watch),
        maxSearch,
        maxConversion,
        months,
        abaTrend,
        abaPreviousTrend,
        previousYear: abaPreviousTrend.length ? previousYear : null,
        abaCurrentMonth: currentMonth,
        abaCurrentMedian: currentMonthMedian,
        abaPreviousYearMonth: previousYearMonth,
        abaPreviousYearRank: previousYearRank,
        abaPreviousYearNextRank: previousYearNextRank,
        abaYoYTrend: direction(currentMonthMedian, previousYearRank),
        abaPreviousYearMoMTrend: direction(previousYearNextRank, previousYearRank),
      };
    });
    const snapshotSummary = dates.map((date) => {
      const sameDay = records.filter((item) => item.snapshotDate === date);
      return {
        date,
        count: sameDay.length,
        sourceFiles: [...new Set(sameDay.map((item) => item.sourceFile).filter(Boolean))],
        watchedCount: sameDay.filter((item) => item.historyWatched).length,
      };
    }).reverse();
    return {
      ...config,
      dates,
      trendDates,
      latestDate,
      selectedYear,
      watches,
      metrics: {
        keywordCount: dashboardRows.length,
        watchedCount: watches.length,
        naturalUp: dashboardRows.filter((item) => item.naturalDirection === 'up').length,
        spUp: dashboardRows.filter((item) => item.spDirection === 'up').length,
        unrankedNatural: dashboardRows.filter((item) => item.naturalRank == null).length,
      },
      dashboardRows,
      matrixRows,
      abaRows,
      snapshotSummary,
      historyRecords: records,
    };
  }

  async function readData() {
    const store = await ensureStore();
    const models = store.configs.map((config) => ({
      ...buildModel(config, store.histories[config.historySheet] || [], store.watches, store.annotations, store.abaMonthly),
      iconKey: store.iconSelections[config.parentAsin] || defaultIconKey(config.modelName),
    }));
    return {
      toolRoot: '浏览器本地存储',
      workbookPath: 'data/关键词排名每日跟进表.xlsx',
      workbookModifiedAt: store.updatedAt || store.migratedFromWorkbookAt || new Date().toISOString(),
      workbookOpen: false,
      sourceCount: store.sourceCount,
      abaMonthlyImports: listAbaMonthlyImports(store.abaMonthly),
      models,
      loadedAt: new Date().toISOString(),
      storage: indexedDbAvailable ? 'browser-indexeddb' : 'browser-memory',
    };
  }

  async function result(output) {
    return { ok: true, output, data: await readData() };
  }

  async function setWatch(payload) {
    const store = await ensureStore();
    const config = store.configs.find((item) => item.modelName === payload.modelName || item.parentAsin === text(payload.parentAsin).toUpperCase());
    if (!config) throw new Error('找不到对应产品型号。');
    const keyword = text(payload.keyword);
    if (!keyword) throw new Error('关键词不能为空。');
    const match = store.watches.find((item) => item.modelName === config.modelName && key(item.keyword) === key(keyword));
    if (match) {
      match.enabled = Boolean(payload.enabled);
      if (payload.note != null) match.note = text(payload.note);
    } else if (payload.enabled) {
      store.watches.push({ modelName: config.modelName, keyword, note: text(payload.note), enabled: true, order: store.watches.length });
    }
    await writeStore(store);
    return result('关注词已保存到浏览器。');
  }

  async function replaceWatches(payload) {
    const store = await ensureStore();
    const config = store.configs.find((item) => item.modelName === payload.modelName);
    if (!config) throw new Error('找不到对应产品型号。');
    const others = store.watches.filter((item) => item.modelName !== config.modelName);
    const next = (Array.isArray(payload.items) ? payload.items : [])
      .map((item, index) => ({ modelName: config.modelName, keyword: text(item.keyword), note: text(item.note), enabled: true, order: index }))
      .filter((item) => item.keyword);
    store.watches = [...others, ...next];
    await writeStore(store);
    return result('关注词已统一保存到浏览器。');
  }

  async function setAnnotation(payload) {
    const store = await ensureStore();
    const config = store.configs.find((item) => item.modelName === payload.modelName || item.parentAsin === text(payload.parentAsin).toUpperCase());
    if (!config) throw new Error('找不到对应产品型号。');
    const metric = text(payload.metric).toLocaleLowerCase('en-US') || 'sp';
    if (!['natural', 'sp'].includes(metric)) throw new Error('只支持自然矩阵或 SP 矩阵单元格标注。');
    const keyword = text(payload.keyword);
    const date = isoDate(payload.date);
    const note = text(payload.text ?? payload.note);
    if (!keyword) throw new Error('关键词不能为空。');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('标注日期格式不正确。');
    const same = (item) => item.modelName === config.modelName && item.metric === metric && key(item.keyword) === key(keyword) && item.date === date;
    store.annotations = store.annotations.filter((item) => !same(item));
    if (note) store.annotations.push({ modelName: config.modelName, metric, keyword, date, text: note, updatedAt: new Date().toISOString() });
    await writeStore(store);
    return result(note ? '单元格标注已保存。' : '单元格标注已清除。');
  }

  function createModelConfig(payload, order, configs) {
    const asin = text(payload.parentAsin).toUpperCase();
    const countryCode = normalizeCountryCode(payload.countryCode || payload.site || 'CA');
    const suffix = asin.slice(-6);
    const used = new Set(configs.flatMap((item) => [item.dashboardSheet, item.historySheet, item.naturalMatrixSheet, item.spMatrixSheet, item.abaMonthlySheet]));
    const unique = (base) => {
      let candidate = base;
      let n = 2;
      while (used.has(candidate)) candidate = `${base}_${n++}`;
      used.add(candidate);
      return candidate;
    };
    return {
      modelName: text(payload.modelName),
      parentAsin: asin,
      countryCode,
      site: text(payload.site) || countryLabel(countryCode),
      order,
      dashboardSheet: unique(`${suffix}_看板`),
      historySheet: unique(`${suffix}_历史`),
      naturalMatrixSheet: unique(`${suffix}_自然矩阵`),
      spMatrixSheet: unique(`${suffix}_SP矩阵`),
      abaMonthlySheet: unique(`${suffix}_ABA月度`),
    };
  }

  async function addModel(payload) {
    const store = await ensureStore();
    const asin = text(payload.parentAsin).toUpperCase();
    if (!text(payload.modelName)) throw new Error('产品名称不能为空。');
    if (!/^B0[A-Z0-9]{8}$/.test(asin)) throw new Error('父体 ASIN 格式不正确。');
    if (store.configs.some((item) => item.parentAsin === asin || (item.legacyParentAsins || []).includes(asin))) {
      throw new Error('该父体 ASIN 已存在或是某个产品的历史别名。');
    }
    const config = createModelConfig(payload, store.configs.length, store.configs);
    store.configs.push(config);
    store.histories[config.historySheet] = [];
    await writeStore(store);
    return result('型号已保存到浏览器本地数据。');
  }

  async function setModelCountry(payload) {
    const store = await ensureStore();
    const asin = text(payload.parentAsin).toUpperCase();
    const modelName = text(payload.modelName);
    const config = store.configs.find((item) =>
      (asin && item.parentAsin === asin) || (modelName && item.modelName === modelName));
    if (!config) throw new Error('找不到对应产品型号。');
    const countryCode = normalizeCountryCode(payload.countryCode || payload.site || config.countryCode || config.site);
    config.countryCode = countryCode;
    config.site = countryLabel(countryCode);
    await writeStore(store);
    return result(`已将“${config.modelName}”的 SIF 国家设置为${countryLabel(countryCode)}（${countryCode}）。`);
  }

  async function changeModelAsin(payload) {
    const store = await ensureStore();
    const oldAsin = text(payload.oldParentAsin || payload.parentAsin).toUpperCase();
    const modelName = text(payload.modelName);
    const nextAsin = text(payload.newParentAsin || payload.nextParentAsin).toUpperCase();
    // Prefer the model name supplied by the settings card, then use the old
    // ASIN as a fallback.  If the card went stale, fail safely instead of
    // accidentally changing another product that happens to use that ASIN.
    let config = null;
    if (modelName) config = store.configs.find((item) => item.modelName === modelName) || null;
    else if (oldAsin) config = store.configs.find((item) =>
      item.parentAsin === oldAsin || (item.legacyParentAsins || []).includes(oldAsin)) || null;
    if (!config) throw new Error('找不到对应产品型号。');
    if (oldAsin && config.parentAsin !== oldAsin && !(config.legacyParentAsins || []).includes(oldAsin)) {
      throw new Error('产品配置已更新，请关闭设置后重新打开再修改。');
    }
    if (!/^B0[A-Z0-9]{8}$/.test(nextAsin)) throw new Error('新的父体 ASIN 格式不正确。');
    if (nextAsin === config.parentAsin) return result('父体 ASIN 未改变，历史数据保持不变。');
    const conflict = store.configs.find((item) => item !== config && (
      item.parentAsin === nextAsin || (item.legacyParentAsins || []).includes(nextAsin)
    ));
    if (conflict) throw new Error(`父体 ASIN ${nextAsin} 已被“${conflict.modelName}”使用。`);

    const previousAsin = config.parentAsin;
    config.legacyParentAsins = [...new Set([...(config.legacyParentAsins || []), previousAsin])]
      .filter((item) => item && item !== nextAsin);
    config.parentAsin = nextAsin;

    const history = store.histories[config.historySheet];
    if (Array.isArray(history)) {
      history.forEach((record) => {
        if (record && typeof record === 'object') record.parentAsin = nextAsin;
      });
    }
    if (store.iconSelections && typeof store.iconSelections === 'object'
      && Object.prototype.hasOwnProperty.call(store.iconSelections, previousAsin)) {
      if (!Object.prototype.hasOwnProperty.call(store.iconSelections, nextAsin)) {
        store.iconSelections[nextAsin] = store.iconSelections[previousAsin];
      }
      delete store.iconSelections[previousAsin];
    }
    const aliases = new Set([previousAsin, ...(config.legacyParentAsins || [])]);
    for (const info of Object.values(store.importedFiles || {})) {
      if (info && aliases.has(text(info.parentAsin).toUpperCase())) info.parentAsin = nextAsin;
    }
    await writeStore(store);
    return result(`已将“${config.modelName}”的父体 ASIN 从 ${previousAsin} 修改为 ${nextAsin}，历史数据已保留。`);
  }

  async function deleteModel(payload) {
    const store = await ensureStore();
    const asin = text(payload.parentAsin).toUpperCase();
    const modelName = text(payload.modelName);
    const index = store.configs.findIndex((item) => (asin && item.parentAsin === asin) || (modelName && item.modelName === modelName));
    if (index < 0) throw new Error('找不到要删除的产品型号。');
    const [removed] = store.configs.splice(index, 1);
    store.configs.forEach((item, itemIndex) => { item.order = itemIndex; });
    delete store.histories[removed.historySheet];
    store.watches = store.watches.filter((item) => item.modelName !== removed.modelName);
    store.annotations = store.annotations.filter((item) => item.modelName !== removed.modelName);
    const removedAsins = new Set([removed.parentAsin, ...(removed.legacyParentAsins || [])]);
    for (const [fileName, info] of Object.entries(store.importedFiles)) {
      if (info && removedAsins.has(text(info.parentAsin).toUpperCase())) delete store.importedFiles[fileName];
    }
    if (store.iconSelections && typeof store.iconSelections === 'object') {
      removedAsins.forEach((asin) => delete store.iconSelections[asin]);
    }
    await writeStore(store);
    return result(`已删除型号“${removed.modelName}”。`);
  }

  async function setModelIcon(payload) {
    const store = await ensureStore();
    const asin = text(payload.parentAsin).toUpperCase();
    const candidate = payload.iconKey;
    const custom = candidate && typeof candidate === 'object' && text(candidate.key) === 'custom' ? {
      key: 'custom', label: text(candidate.label).slice(0, 80) || '自定义图片', dataUrl: text(candidate.dataUrl),
    } : null;
    const iconKey = custom ? 'custom' : text(candidate);
    if (!/^B0[A-Z0-9]{8}$/.test(asin)) throw new Error('父体 ASIN 格式不正确。');
    if (!APPAREL_ICON_KEYS.has(iconKey) && !(custom && /^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(custom.dataUrl) && custom.dataUrl.length <= 5 * 1024 * 1024)) throw new Error('不支持的产品图标或图片格式。');
    store.iconSelections[asin] = custom || iconKey;
    await writeStore(store);
    return result('产品图标已保存到浏览器。');
  }

  function chooseFiles(accept, multiple) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.multiple = Boolean(multiple);
      input.style.display = 'none';
      document.body.appendChild(input);
      let settled = false;
      const finish = (files) => {
        if (settled) return;
        settled = true;
        input.remove();
        resolve(files);
      };
      input.addEventListener('change', () => finish([...input.files]));
      window.addEventListener('focus', () => setTimeout(() => finish([...input.files]), 350), { once: true });
      input.click();
    });
  }

  async function sourceReport(file) {
    if (!window.XLSX) throw new Error('Excel 解析组件未加载。');
    const bytes = await file.arrayBuffer();
    const workbook = window.XLSX.read(bytes, { cellDates: true, raw: true, dense: true, type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    if (!sheetName || rows.length < 3) throw new Error('源报表没有可用数据行。');
    const meta = text(rows[0]?.[0]);
    const asinMatch = meta.match(/ASIN\s*[（(]\s*(B[A-Z0-9]{9})\s*[）)]/i)
      || meta.match(/\b(B[A-Z0-9]{9})\b/i)
      || sheetName.match(/\b(B[A-Z0-9]{9})\b/i)
      || text(file.name).match(/\b(B[A-Z0-9]{9})\b/i);
    const dateSources = [meta, sheetName, text(file.name), ...(rows.slice(0, 3).flat())];
    const snapshotDate = dateSources.map((value) => {
      const normalized = isoDate(value);
      return /^20\d{2}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
    }).find(Boolean) || '';
    if (!asinMatch) throw new Error('无法从首行或 Sheet 名称识别父体 ASIN。');
    if (!snapshotDate) throw new Error('无法从首行、Sheet 名称或文件名识别导出日期。');
    const headers = new Map();
    for (let i = 0; i < (rows[1] || []).length; i++) {
      const header = normalizeHeader(rows[1][i]);
      if (header) headers.set(header, i);
    }
    const required = ['关键词', '该关键词给父体贡献的 全部流量占比', '自然排名', '自然排名时间', 'SP(常规)排名', 'SP(常规)排名时间', '周ABA排名', '周搜索量'];
    const missing = required.filter((name) => !headers.has(name));
    if (missing.length) throw new Error(`缺少必需字段：${missing.join('、')}`);
    const get = (row, name) => headers.has(name) ? row[headers.get(name)] : null;
    const records = [];
    for (const row of rows.slice(2)) {
      const keyword = text(get(row, '关键词'));
      if (!keyword) continue;
      records.push({
        snapshotDate,
        importTime: new Date().toISOString(),
        keyword,
        translation: text(get(row, '翻译')),
        keywordType: text(get(row, '关键词效果类型')),
        trafficShare: nullableNumber(get(row, '该关键词给父体贡献的 全部流量占比')),
        naturalRank: nullableNumber(get(row, '自然排名')),
        naturalRankDate: isoDate(get(row, '自然排名时间')),
        naturalChildAsin: text(get(row, '最新自然排名 对应的子体')),
        spRank: nullableNumber(get(row, 'SP(常规)排名')),
        spRankDate: isoDate(get(row, 'SP(常规)排名时间')),
        spCampaign: text(get(row, 'SP(常规)排名 对应的广告活动')),
        spChildAsin: text(get(row, '最新SP(常规)排名 对应的子体')),
        weeklyAbaRank: nullableNumber(get(row, '周ABA排名')),
        weeklySearchVolume: nullableNumber(get(row, '周搜索量')),
        conversionRate: nullableNumber(get(row, '关键词点击转化率')),
        trafficRank: null,
        historyWatched: false,
        status: '正常',
        sourceFile: file.name,
      });
    }
    records.sort((a, b) => (b.trafficShare ?? -Infinity) - (a.trafficShare ?? -Infinity) || a.keyword.localeCompare(b.keyword));
    records.forEach((record, index) => { record.trafficRank = index + 1; });
    return { sourceFile: file.name, parentAsin: asinMatch[1].toUpperCase(), snapshotDate, records };
  }

  function findAbaHeaderRow(rows) {
    for (let index = 0; index < rows.length; index += 1) {
      const labels = (rows[index] || []).map((value) => normalizeHeader(value).replace(/^\uFEFF/, ''));
      const hasRank = labels.some((label) => /^搜索频率排名(?:$|[（(])/.test(label) || label === '搜索频率排名');
      const hasKeyword = labels.some((label) => label === '搜索词' || label === '搜索词语');
      if (hasRank && hasKeyword) return { index, labels };
    }
    return null;
  }

  async function parseAbaMonthlyCsv(file, year, month, countryCode) {
    if (!window.XLSX) throw new Error('CSV 解析组件未加载。');
    if (!file || typeof file.arrayBuffer !== 'function') throw new Error('未选择月 ABA CSV 文件。');
    const bytes = await file.arrayBuffer();
    let workbook;
    try {
      workbook = window.XLSX.read(bytes, {
        type: 'array',
        raw: true,
        dense: true,
        cellDates: true,
        codepage: 65001,
      });
    } catch (error) {
      throw new Error(`CSV 文件无法解析：${text(error?.message || error)}`);
    }
    const sheetName = workbook.SheetNames?.[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : null;
    const rows = sheet ? window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) : [];
    const header = findAbaHeaderRow(rows);
    if (!header) throw new Error('CSV 中没有找到“搜索频率排名”和“搜索词”字段。');
    const rankIndex = header.labels.findIndex((label) => label === '搜索频率排名' || /^搜索频率排名[（(]/.test(label));
    const keywordIndex = header.labels.findIndex((label) => label === '搜索词' || label === '搜索词语');
    const dateIndex = header.labels.findIndex((label) => label === '报告日期' || /^报告日期/.test(label));
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const dateCandidates = [];
    if (dateIndex >= 0) {
      for (const row of rows.slice(header.index + 1, header.index + 5)) dateCandidates.push(isoDate(row?.[dateIndex]));
    }
    const fileDate = text(file.name).match(/(20\d{2})[-_](\d{1,2})[-_](\d{1,2})/);
    if (fileDate) dateCandidates.push(`${fileDate[1]}-${String(fileDate[2]).padStart(2, '0')}-${String(fileDate[3]).padStart(2, '0')}`);
    const detectedDate = dateCandidates.find((value) => /^20\d{2}-\d{2}-\d{2}$/.test(value)) || '';
    if (detectedDate && detectedDate.slice(0, 7) !== monthKey) {
      throw new Error(`所选月份为 ${monthKey}，但文件报告日期为 ${detectedDate.slice(0, 7)}。请重新选择对应月份。`);
    }
    const rowsByKeyword = {};
    for (const row of rows.slice(header.index + 1)) {
      const keyword = text(row?.[keywordIndex]);
      const rank = nullableNumber(row?.[rankIndex]);
      if (!keyword || rank == null || rank <= 0) continue;
      const normalized = key(keyword);
      const previous = rowsByKeyword[normalized];
      // Search-frequency ranks should be unique.  If a malformed export has
      // duplicates, retain the best (smallest) rank rather than discarding it.
      if (previous == null || rank < previous) rowsByKeyword[normalized] = rank;
    }
    const rowCount = Object.keys(rowsByKeyword).length;
    if (!rowCount) throw new Error('CSV 中没有可用的搜索词和搜索频率排名数据。');
    const code = normalizeCountryCode(countryCode || 'CA');
    return {
      month: monthKey,
      year: Number(year),
      countryCode: code,
      fileName: text(file.name),
      fingerprint: `${Number(file.size) || bytes.byteLength}:${Number(file.lastModified) || 0}`,
      importedAt: new Date().toISOString(),
      rowCount,
      rows: rowsByKeyword,
    };
  }

  async function importAbaMonthlyCsv(payload = {}) {
    const year = Number(payload.year);
    const month = Number(payload.month);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('ABA 年份应为 2000 至 2100 的整数。');
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('ABA 月份应为 1 至 12。');
    const countryCode = normalizeCountryCode(payload.countryCode || payload.site || 'CA');
    const file = payload.file && typeof payload.file.arrayBuffer === 'function'
      ? payload.file
      : (await chooseFiles('.csv,text/csv', false))[0];
    if (!file) return result('未选择月 ABA 文件，未修改数据。');
    const entry = await parseAbaMonthlyCsv(file, year, month, countryCode);
    const store = await ensureStore();
    if (!store.abaMonthly || typeof store.abaMonthly !== 'object') store.abaMonthly = {};
    const storageKey = abaImportKey(countryCode, entry.month);
    const replaced = Boolean(store.abaMonthly[storageKey]);
    store.abaMonthly[storageKey] = entry;
    await writeStore(store);
    const response = await result(
      `${countryLabel(countryCode)} ${entry.month} 月 ABA 已${replaced ? '覆盖' : '导入'}：${entry.rowCount.toLocaleString('zh-CN')} 个搜索词。`,
    );
    response.abaMonthly = entry;
    // Let the lightweight UI enhancement refresh comparison cells immediately
    // when the ABA page is already mounted; the core bridge remains usable
    // without that listener as well.
    window.dispatchEvent(new CustomEvent('keyword-tracker-aba-imported'));
    return response;
  }

  async function importReports(mode, providedFiles = null) {
    if (mode === 'refresh') return result('浏览器本地数据已刷新。');
    const supplied = providedFiles == null ? null : [...providedFiles].filter((file) => file && typeof file.arrayBuffer === 'function');
    const files = supplied || await chooseFiles('.xlsx,.xls', true);
    if (!files.length) return result('未选择报表，未修改数据。');
    const store = await ensureStore();
    const configsByAsin = new Map();
    store.configs.forEach((config) => {
      configsByAsin.set(config.parentAsin.toUpperCase(), config);
      (config.legacyParentAsins || []).forEach((asin) => {
        if (!configsByAsin.has(asin.toUpperCase())) configsByAsin.set(asin.toUpperCase(), config);
      });
    });
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];
    for (const file of [...files].sort((a, b) => a.lastModified - b.lastModified)) {
      const fingerprint = `${file.size}:${file.lastModified}`;
      if (mode !== 'force' && store.importedFiles[file.name]?.fingerprint === fingerprint) {
        skipped++;
        continue;
      }
      try {
        const report = await sourceReport(file);
        const config = configsByAsin.get(report.parentAsin);
        if (!config) {
          skipped++;
          errors.push(`${file.name}：未找到父体 ${report.parentAsin} 对应的型号。`);
          continue;
        }
        const previous = store.histories[config.historySheet] || [];
        store.histories[config.historySheet] = previous
          .filter((item) => !(item.parentAsin === config.parentAsin && item.snapshotDate === report.snapshotDate))
          .concat(report.records.map((item) => ({ ...item, modelName: config.modelName, parentAsin: config.parentAsin })));
        const wasKnown = Boolean(store.importedFiles[file.name]);
        store.importedFiles[file.name] = { fingerprint, parentAsin: report.parentAsin, snapshotDate: report.snapshotDate, importedAt: new Date().toISOString() };
        if (!wasKnown) store.sourceCount += 1;
        imported++;
      } catch (error) {
        store.importedFiles[file.name] = { fingerprint, unsupported: true, importedAt: new Date().toISOString() };
        if (/protected|password|加密|受保护/i.test(String(error.message))) skipped++;
        else {
          failed++;
          errors.push(`${file.name}：${error.message}`);
        }
      }
    }
    await writeStore(store);
    const suffix = errors.length ? `\n${errors.slice(0, 5).join('\n')}` : '';
    const response = await result(`本地导入完成：${imported} 个文件，跳过 ${skipped} 个，失败 ${failed} 个。${suffix}`);
    response.ok = failed === 0;
    return response;
  }

  function buildSifUrls(parentAsin, countryCode) {
    const asin = text(parentAsin).toUpperCase();
    const code = normalizeCountryCode(countryCode);
    const resultParams = new URLSearchParams({
      country: code,
      asin,
      isListingSearch: 'false',
      trafficType: '',
    });
    return {
      resultUrl: `${SIF_ORIGIN}/reverse?${resultParams.toString()}`,
    };
  }

  function openExternalLink(url, target = '_blank') {
    const link = document.createElement('a');
    link.href = url;
    link.target = target;
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => link.remove(), 1200);
  }

  function safeHtml(value) {
    return text(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
  }

  function closeSifAssistant() {
    if (sifAssistantOverlay?.isConnected) sifAssistantOverlay.remove();
    sifAssistantOverlay = null;
  }

  function showSifAssistant({
    countryName,
    parentAsin,
    resultUrl,
    reason,
    showChooseButton = false,
    onFilesSelected,
    onCancel,
  }) {
    closeSifAssistant();
    const overlay = document.createElement('div');
    overlay.id = 'sif-import-assistant';
    overlay.innerHTML = `
      <section class="sif-assistant-card" role="dialog" aria-modal="true" aria-labelledby="sif-assistant-title">
        <button type="button" class="sif-assistant-close" aria-label="关闭">×</button>
        <h2 id="sif-assistant-title">SIF 自动导入需要继续一步</h2>
        <p>${safeHtml(reason || `已打开 ${countryName}（${parentAsin}）的 SIF 反查页面。`)}</p>
        <div class="sif-assistant-actions">
          <a href="${safeHtml(resultUrl)}" target="_blank" rel="noopener noreferrer">打开 SIF 结果页</a>
          ${showChooseButton ? '<button type="button" data-action="choose">选择已下载报表</button>' : ''}
        </div>
        <small>网页版不能替 SIF 页面携带登录令牌。请在 SIF 结果页登录（如有需要）并点击“下载”，然后回到本页选择刚下载的 XLSX 文件，网页会立即导入。</small>
      </section>`;
    const style = document.createElement('style');
    style.textContent = `
      #sif-import-assistant{position:fixed;inset:0;z-index:100001;display:grid;place-items:center;padding:20px;background:rgba(23,59,100,.34);font-family:Inter,"Microsoft YaHei",sans-serif}
      .sif-assistant-card{position:relative;width:min(560px,calc(100vw - 40px));padding:28px 30px;border:2px solid #173b64;border-radius:18px;background:#fff;color:#25354d;box-shadow:0 24px 80px rgba(20,47,77,.28)}
      .sif-assistant-card h2{margin:0 36px 12px 0;font-size:21px}.sif-assistant-card p{margin:0 0 18px;line-height:1.65;color:#4d6078}.sif-assistant-card small{display:block;margin-top:16px;line-height:1.6;color:#78869a}
      .sif-assistant-close{position:absolute;top:10px;right:14px;border:0;background:transparent;color:#25354d;font-size:28px;cursor:pointer}.sif-assistant-actions{display:flex;gap:10px;flex-wrap:wrap}.sif-assistant-actions a,.sif-assistant-actions button{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border:2px solid #173b64;border-radius:11px;background:#fff;color:#173b64;font:700 14px Inter,"Microsoft YaHei",sans-serif;text-decoration:none;cursor:pointer}.sif-assistant-actions button:last-child{background:#27c7d9}
    `;
    overlay.appendChild(style);
    const dismiss = () => {
      if (overlay.isConnected) overlay.remove();
      if (sifAssistantOverlay === overlay) sifAssistantOverlay = null;
      if (typeof onCancel === 'function') onCancel();
    };
    overlay.querySelector('.sif-assistant-close').onclick = dismiss;
    overlay.onclick = (event) => { if (event.target === overlay) dismiss(); };
    const chooseButton = overlay.querySelector('[data-action="choose"]');
    if (chooseButton) {
      chooseButton.onclick = async () => {
        if (chooseButton.disabled) return;
        chooseButton.disabled = true;
        chooseButton.textContent = '等待选择文件…';
        try {
          const files = await chooseFiles('.xlsx,.xls', false);
          if (files.length) {
            if (typeof onFilesSelected === 'function') onFilesSelected(files);
            return;
          }
          chooseButton.disabled = false;
          chooseButton.textContent = '选择已下载报表';
        } catch (error) {
          chooseButton.disabled = false;
          chooseButton.textContent = '选择已下载报表';
          console.warn('选择 SIF 报表失败。', error);
        }
      };
    }
    document.body.appendChild(overlay);
    sifAssistantOverlay = overlay;
    return overlay;
  }

  function waitForSifReportSelection({ countryName, parentAsin, resultUrl, reason }) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (files) => {
        if (settled) return;
        settled = true;
        resolve(files || []);
      };
      showSifAssistant({
        countryName,
        parentAsin,
        resultUrl,
        reason,
        showChooseButton: true,
        onFilesSelected: finish,
        onCancel: () => finish([]),
      });
    });
  }

  async function runSifImport(payload = {}) {
    const asin = text(payload.parentAsin).toUpperCase();
    if (!/^B0[A-Z0-9]{8}$/.test(asin)) throw new Error('父体 ASIN 格式不正确。');
    const initialCountryCode = normalizeCountryCode(payload.countryCode || payload.site || 'CA');
    let urls = buildSifUrls(asin, initialCountryCode);
    let sifWindow = null;
    const popupName = `keyword-tracker-sif-${asin}-${Date.now()}`;
    try {
      // 先在点击手势仍然有效时打开 SIF，避免浏览器把弹窗当作无用户触发而拦截。
      sifWindow = window.open(urls.resultUrl, popupName);
    } catch (error) {
      console.warn('打开 SIF 页面失败。', error);
    }
    if (!sifWindow) openExternalLink(urls.resultUrl);
    emitSifProgress('opening', `正在打开 SIF ${countryLabel(initialCountryCode)}（${initialCountryCode}）…`, {
      countryCode: initialCountryCode, parentAsin: asin, resultUrl: urls.resultUrl,
    });

    const store = await ensureStore();
    const config = store.configs.find((item) => item.parentAsin === asin);
    if (!config) throw new Error(`找不到父体 ${asin} 对应的产品型号，请先在设置中登记该产品。`);
    const countryCode = normalizeCountryCode(payload.countryCode || config.countryCode || config.site || initialCountryCode);
    urls = buildSifUrls(asin, countryCode);
    if (countryCode !== initialCountryCode && sifWindow && !sifWindow.closed) {
      try { sifWindow.location.href = urls.resultUrl; } catch (error) { console.warn('更新 SIF 国家页面失败。', error); }
    }
    if (!config.countryCode || config.countryCode !== countryCode || config.site !== countryLabel(countryCode)) {
      config.countryCode = countryCode;
      config.site = countryLabel(countryCode);
      await writeStore(store);
    }

    emitSifProgress('working', `已打开 SIF ${countryLabel(countryCode)}结果页，请在页面完成登录和反查…`, {
      countryCode, parentAsin: asin, resultUrl: urls.resultUrl,
    });
    await delay(SIF_READY_WAIT_MS);
    emitSifProgress('selecting', '请在 SIF 结果页点击“下载”，再回到这里选择已下载的 XLSX…', {
      countryCode, parentAsin: asin, resultUrl: urls.resultUrl,
    });
    let selected = null;
    let report = null;
    let selectionReason = `已打开 ${countryLabel(countryCode)}（${countryCode}）的 SIF 反查页。请先在 SIF 页面登录（如有需要），完成反查后点击“下载”，再点击本窗口的“选择已下载报表”。`;
    while (!report || report.parentAsin !== asin) {
      const files = await waitForSifReportSelection({
        countryName: countryLabel(countryCode),
        parentAsin: asin,
        resultUrl: urls.resultUrl,
        reason: selectionReason,
      });
      if (!files.length) {
        throw new Error('未选择 SIF 报表文件，自动导入已取消。');
      }
      selected = files[0];
      try {
        report = await sourceReport(selected);
      } catch (error) {
        report = null;
        selectionReason = `无法读取所选文件：${text(error?.message || error)} 请重新选择当前产品的 SIF XLSX 文件。`;
        emitSifProgress('selecting', selectionReason, {
          countryCode, parentAsin: asin, resultUrl: urls.resultUrl,
        });
        continue;
      }
      if (report.parentAsin !== asin) {
        selectionReason = `所选文件属于 ${report.parentAsin}，不是当前产品 ${asin}。请重新选择对应的 SIF XLSX 文件。`;
        emitSifProgress('selecting', selectionReason, {
          countryCode, parentAsin: asin, resultUrl: urls.resultUrl,
        });
      }
    }
    const imported = await importReports('force', [selected]);
    if (!imported.ok) throw new Error(`SIF 文件已下载，但导入失败：${imported.output}`);
    closeSifAssistant();
    emitSifProgress('completed', `今日报表已下载并导入（${countryLabel(countryCode)}）。`, {
      countryCode, parentAsin: asin, sourceFile: selected.name, snapshotDate: report.snapshotDate,
    });
    return {
      ...imported,
      countryCode,
      parentAsin: asin,
      sourceFile: selected.name,
      output: `SIF ${countryLabel(countryCode)}报表已下载并导入。\n${imported.output}`,
    };
  }

  async function runManualSifImport(payload = {}) {
    if (sifImportInFlight) throw new Error('已有 SIF 自动导入任务正在运行，请等待当前任务完成。');
    sifImportInFlight = runSifImport(payload);
    try {
      return await sifImportInFlight;
    } catch (error) {
      const message = text(error?.message || error) || 'SIF 自动导入失败。';
      emitSifProgress('failed', message, { error: message });
      throw error;
    } finally {
      sifImportInFlight = null;
    }
  }

  async function startSifImport(payload = {}) {
    const item = {
      asin: text(payload.parentAsin).toUpperCase(),
      parentAsin: text(payload.parentAsin).toUpperCase(),
      countryCode: normalizeCountryCode(payload.countryCode || payload.site || 'CA'),
      modelName: text(payload.modelName),
    };
    if (await pingWebExtension()) {
      if (sifBatchImportInFlight) throw new Error('已有 SIF 批量自动导入任务正在运行，请等待当前任务完成。');
      sifBatchImportInFlight = runWebExtensionBatch([item], { single: true });
      try {
        const response = await sifBatchImportInFlight;
        if (!response?.ok) throw new Error(response?.output || 'SIF 自动导入失败。');
        return response;
      } catch (error) {
        const message = text(error?.message || error) || 'SIF 自动导入失败。';
        emitSifProgress('failed', message, { error: message });
        throw error;
      } finally {
        sifBatchImportInFlight = null;
      }
    }
    throw new Error('未检测到 SIF 自动导入扩展。请先加载桥接扩展，并在扩展详情中允许访问本地网页。');
  }

  async function startSifBatchImport(payload = {}) {
    if (sifBatchImportInFlight) throw new Error('已有 SIF 批量自动导入任务正在运行，请等待当前任务完成。');
    const data = await readData();
    const items = Array.isArray(payload.items) && payload.items.length
      ? payload.items
      : data.models.map((model) => ({
        asin: model.parentAsin,
        countryCode: model.countryCode || 'CA',
        modelName: model.modelName,
      }));
    if (!items.length) throw new Error('当前没有已登记产品。');
    if (!(await pingWebExtension())) {
      throw new Error('未检测到 SIF 自动导入扩展。请先加载扩展，并在扩展详情中打开“允许访问文件网址”。');
    }
    sifBatchImportInFlight = runWebExtensionBatch(items);
    try {
      const response = await sifBatchImportInFlight;
      if (!response?.ok) throw new Error(response?.output || 'SIF 批量自动导入失败。');
      return response;
    } catch (error) {
      const message = text(error?.message || error) || 'SIF 批量自动导入失败。';
      emitSifProgress('failed', message, { error: message });
      throw error;
    } finally {
      sifBatchImportInFlight = null;
    }
  }

  function downloadBlob(content, filename, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function exportBackup() {
    const store = await ensureStore();
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(`${JSON.stringify(store)}\n`, `关键词排名每日跟进数据_${date}.json`, 'application/json;charset=utf-8');
  }

  async function importBackup() {
    const files = await chooseFiles('.json,application/json', false);
    if (!files.length) return;
    const parsed = JSON.parse(await files[0].text());
    if (!Array.isArray(parsed.configs) || !parsed.histories || typeof parsed.histories !== 'object') throw new Error('所选文件不是有效的关键词排名数据备份。');
    memoryStore = normalizeStore(parsed);
    await writeStore(memoryStore);
    location.reload();
  }

  function dataManager() {
    const old = document.getElementById('browser-data-manager');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = 'browser-data-manager';
    overlay.innerHTML = `
      <div class="browser-manager-card" role="dialog" aria-modal="true" aria-labelledby="browser-manager-title">
        <button class="browser-manager-close" aria-label="关闭">×</button>
        <h2 id="browser-manager-title">网页版数据管理</h2>
        <p>数据保存在此浏览器的 IndexedDB 中。建议定期导出 JSON 备份。</p>
        <div class="browser-manager-actions">
          <button data-action="export">导出数据备份</button>
          <button data-action="import">导入数据备份</button>
          <a href="./data/关键词排名每日跟进表.xlsx" download>下载原始 Excel</a>
          <button class="danger" data-action="reset">恢复 v1.8.2 初始数据</button>
        </div>
        <small>${indexedDbAvailable ? '当前：浏览器持久化存储' : '当前：仅本次页面会话存储'}</small>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `
      #browser-data-manager{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:rgba(23,59,100,.38);font-family:Inter,"Microsoft YaHei",sans-serif}
      .browser-manager-card{position:relative;width:min(430px,calc(100vw - 36px));padding:28px;border:2px solid #25354d;border-radius:16px;background:#fff;color:#25354d;box-shadow:0 22px 70px rgba(20,47,77,.25)}
      .browser-manager-card h2{margin:0 0 10px;font-size:22px}.browser-manager-card p{margin:0 0 20px;color:#657389;line-height:1.65}
      .browser-manager-actions{display:grid;gap:10px}.browser-manager-actions button,.browser-manager-actions a{box-sizing:border-box;width:100%;padding:11px 14px;border:2px solid #173b64;border-radius:12px;background:#fff;color:#173b64;font:700 14px inherit;text-align:center;text-decoration:none;cursor:pointer}
      .browser-manager-actions button:first-child{background:#27c7d9;color:#173b64}.browser-manager-actions .danger{border-color:#ff6b6b;color:#b93535}
      .browser-manager-close{position:absolute;top:12px;right:14px;border:0;background:transparent;color:#25354d;font-size:28px;cursor:pointer}.browser-manager-card small{display:block;margin-top:16px;color:#78869a}
    `;
    overlay.appendChild(style);
    overlay.querySelector('.browser-manager-close').onclick = () => overlay.remove();
    overlay.onclick = (event) => { if (event.target === overlay) overlay.remove(); };
    overlay.querySelector('[data-action="export"]').onclick = () => exportBackup().catch((error) => alert(error.message));
    overlay.querySelector('[data-action="import"]').onclick = () => importBackup().catch((error) => alert(error.message));
    overlay.querySelector('[data-action="reset"]').onclick = async () => {
      if (!confirm('确定恢复为 v1.8.2 初始数据吗？当前浏览器中的改动会被覆盖。')) return;
      memoryStore = normalizeStore(clone(ORIGINAL_SEED));
      await writeStore(memoryStore);
      location.reload();
    };
    document.body.appendChild(overlay);
  }

  window.keywordTracker = {
    getData: readData,
    runImport: (mode = 'normal') => importReports(mode),
    importAbaMonthlyCsv,
    startSifImport,
    startSifBatchImport,
    setWatch,
    replaceWatches,
    setAnnotation,
    addModel,
    deleteModel,
    setModelCountry,
    changeModelAsin,
    setModelIcon,
    onSifProgress: (listener) => {
      if (typeof listener !== 'function') return () => {};
      sifProgressListeners.add(listener);
      return () => sifProgressListeners.delete(listener);
    },
    openWorkbook: () => {
      const link = document.createElement('a');
      link.href = new URL('./data/关键词排名每日跟进表.xlsx', document.baseURI).href;
      link.download = '关键词排名每日跟进表.xlsx';
      link.click();
    },
    openSourceFolder: async () => {
      const response = await importReports('normal');
      if (response.output && !response.output.startsWith('未选择')) location.reload();
      return response;
    },
    openToolFolder: () => dataManager(),
    minimizeWindow: () => alert('网页版由浏览器管理窗口，请使用浏览器的最小化按钮。'),
    toggleMaximizeWindow: async () => {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    },
    closeWindow: () => alert('网页版不会主动关闭标签页，请使用浏览器的关闭按钮。'),
  };
})();
