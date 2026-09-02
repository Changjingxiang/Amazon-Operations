/*
 * Fast local data engine.
 *
 * Excel/WPS is used only once, when an old installation is migrated.  Normal
 * reads and small edits use this JSON store, so opening the app or changing a
 * watched keyword does not start a COM server and scan every worksheet.
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { buildModel, defaultIconKey, readIconSelections, readTrackerWorkbook } = require('./workbook.cjs');

const STORE_NAME = '关键词排名每日跟进数据.json';
const WORKBOOK_NAME = '关键词排名每日跟进表.xlsx';
const SOURCE_DIR_NAME = '每日源文件';
const SCHEMA_VERSION = 2;

function storePath(toolRoot) { return path.join(toolRoot, STORE_NAME); }
function text(value) { return value == null ? '' : String(value).trim(); }
function normalizeHeader(value) { return text(value).replace(/[\r\n\t ]+/g, ' '); }
function key(value) { return text(value).toLocaleLowerCase('en-US'); }

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
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }
  const raw = text(value);
  const match = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  return match ? `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}` : raw;
}

function sourceReport(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true, raw: true, dense: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  if (!sheetName || rows.length < 3) throw new Error('源报表没有可用数据行。');
  const meta = text(rows[0]?.[0]);
  const asinMatch = meta.match(/ASIN\((B[A-Z0-9]{9})\)/i) || sheetName.match(/(B[A-Z0-9]{9})/i);
  const dateMatch = meta.match(/导出时间\s*:\s*(\d{4}-\d{2}-\d{2})/);
  if (!asinMatch) throw new Error('无法从首行或 Sheet 名称识别父体 ASIN。');
  if (!dateMatch) throw new Error('无法从首行识别导出日期。');
  const headers = new Map();
  for (let i = 0; i < (rows[1] || []).length; i++) {
    const header = normalizeHeader(rows[1][i]);
    if (header) headers.set(header, i);
  }
  const required = [
    '关键词', '该关键词给父体贡献的 全部流量占比', '自然排名', '自然排名时间',
    'SP(常规)排名', 'SP(常规)排名时间', '周ABA排名', '周搜索量',
  ];
  const missing = required.filter((name) => !headers.has(name));
  if (missing.length) throw new Error(`缺少必需字段：${missing.join('、')}`);
  const get = (row, name) => headers.has(name) ? row[headers.get(name)] : null;
  const records = [];
  for (const row of rows.slice(2)) {
    const keyword = text(get(row, '关键词'));
    if (!keyword) continue;
    records.push({
      snapshotDate: dateMatch[1],
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
      sourceFile: path.basename(filePath),
    });
  }
  records.sort((a, b) => (b.trafficShare ?? -Infinity) - (a.trafficShare ?? -Infinity) || a.keyword.localeCompare(b.keyword));
  records.forEach((record, index) => { record.trafficRank = index + 1; });
  return {
    sourceFile: path.basename(filePath),
    parentAsin: asinMatch[1].toUpperCase(),
    snapshotDate: dateMatch[1],
    site: sheetName.includes('_') ? sheetName.split('_')[0] : '',
    records,
  };
}

function createModelConfig(payload, order, configs) {
  const asin = text(payload.parentAsin).toUpperCase();
  const suffix = asin.slice(-6);
  const used = new Set(configs.flatMap((item) => [item.dashboardSheet, item.historySheet, item.naturalMatrixSheet, item.spMatrixSheet, item.abaMonthlySheet]));
  const unique = (base) => {
    let candidate = base; let n = 2;
    while (used.has(candidate)) candidate = `${base}_${n++}`;
    used.add(candidate); return candidate;
  };
  return {
    modelName: text(payload.modelName), parentAsin: asin, site: text(payload.site) || '加拿大站点', order,
    dashboardSheet: unique(`${suffix}_看板`), historySheet: unique(`${suffix}_历史`),
    naturalMatrixSheet: unique(`${suffix}_自然矩阵`), spMatrixSheet: unique(`${suffix}_SP矩阵`),
    abaMonthlySheet: unique(`${suffix}_ABA月度`),
  };
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

function normalizeStore(value) {
  const store = value && typeof value === 'object' ? value : {};
  return {
    schemaVersion: Math.max(SCHEMA_VERSION, Number(store.schemaVersion) || 0),
    configs: Array.isArray(store.configs) ? store.configs : [],
    watches: Array.isArray(store.watches) ? store.watches : [],
    histories: store.histories && typeof store.histories === 'object' ? store.histories : {},
    importedFiles: store.importedFiles && typeof store.importedFiles === 'object' ? store.importedFiles : {},
    annotations: normalizeAnnotations(store.annotations),
    migratedFromWorkbookAt: store.migratedFromWorkbookAt || null,
    updatedAt: store.updatedAt || null,
  };
}

function writeStore(toolRoot, store) {
  const target = storePath(toolRoot);
  const temp = `${target}.tmp`;
  const payload = { ...normalizeStore(store), updatedAt: new Date().toISOString() };
  fs.writeFileSync(temp, `${JSON.stringify(payload)}\n`, 'utf8');
  fs.renameSync(temp, target);
  return payload;
}

function migrateWorkbook(toolRoot, exporterPath, cachePath) {
  const data = readTrackerWorkbook(toolRoot, exporterPath, cachePath);
  const configs = data.models.map(({ modelName, parentAsin, site, dashboardSheet, historySheet, naturalMatrixSheet, spMatrixSheet, abaMonthlySheet, order }) => ({
    modelName, parentAsin, site, dashboardSheet, historySheet, naturalMatrixSheet, spMatrixSheet, abaMonthlySheet, order,
  }));
  const histories = {};
  for (const model of data.models) histories[model.historySheet] = model.historyRecords || [];
  const watches = data.models.flatMap((model) => (model.watches || []).map((item, index) => ({
    modelName: model.modelName, keyword: item.keyword, note: item.note || '', enabled: true, order: item.order ?? index,
  })));
  return normalizeStore({ configs, watches, histories, importedFiles: {}, migratedFromWorkbookAt: new Date().toISOString() });
}

function ensureStore(toolRoot, exporterPath, cachePath) {
  const target = storePath(toolRoot);
  if (fs.existsSync(target)) {
    try { return normalizeStore(JSON.parse(fs.readFileSync(target, 'utf8'))); } catch { /* migrate below */ }
  }
  const migrated = migrateWorkbook(toolRoot, exporterPath, cachePath);
  return writeStore(toolRoot, migrated);
}

function readData(toolRoot, exporterPath, cachePath) {
  const store = ensureStore(toolRoot, exporterPath, cachePath);
  const iconSelections = readIconSelections(toolRoot);
  const models = store.configs.map((config) => ({
    ...buildModel(config, store.histories[config.historySheet] || [], store.watches, store.annotations),
    iconKey: iconSelections[config.parentAsin] || defaultIconKey(config.modelName),
  }));
  const workbookPath = path.join(toolRoot, WORKBOOK_NAME);
  const sourceFolder = path.join(toolRoot, SOURCE_DIR_NAME);
  let workbookModifiedAt = '';
  try { workbookModifiedAt = fs.statSync(workbookPath).mtime.toISOString(); } catch {}
  return {
    toolRoot, workbookPath, workbookModifiedAt,
    workbookOpen: fs.existsSync(path.join(toolRoot, `~$${WORKBOOK_NAME}`)),
    sourceCount: fs.existsSync(sourceFolder) ? fs.readdirSync(sourceFolder).filter((name) => /\.(xlsx|xls)$/i.test(name)).length : 0,
    models, loadedAt: new Date().toISOString(), storage: 'local-json',
  };
}

function mutateWatch(toolRoot, exporterPath, cachePath, payload) {
  const store = ensureStore(toolRoot, exporterPath, cachePath);
  const config = store.configs.find((item) => item.modelName === payload.modelName || item.parentAsin === text(payload.parentAsin).toUpperCase());
  if (!config) throw new Error('找不到对应产品型号。');
  const keyword = text(payload.keyword); if (!keyword) throw new Error('关键词不能为空。');
  const match = store.watches.find((item) => item.modelName === config.modelName && key(item.keyword) === key(keyword));
  if (match) { match.enabled = Boolean(payload.enabled); if (payload.note != null) match.note = text(payload.note); }
  else if (payload.enabled) store.watches.push({ modelName: config.modelName, keyword, note: text(payload.note), enabled: true, order: store.watches.length });
  writeStore(toolRoot, store);
  return { ok: true, output: '关注词已保存。', data: readData(toolRoot, exporterPath, cachePath) };
}

function replaceWatches(toolRoot, exporterPath, cachePath, payload) {
  const store = ensureStore(toolRoot, exporterPath, cachePath);
  const config = store.configs.find((item) => item.modelName === payload.modelName);
  if (!config) throw new Error('找不到对应产品型号。');
  const others = store.watches.filter((item) => item.modelName !== config.modelName);
  const next = (Array.isArray(payload.items) ? payload.items : []).map((item, index) => ({
    modelName: config.modelName, keyword: text(item.keyword), note: text(item.note), enabled: true, order: index,
  })).filter((item) => item.keyword);
  store.watches = [...others, ...next];
  writeStore(toolRoot, store);
  return { ok: true, output: '关注词已统一保存。', data: readData(toolRoot, exporterPath, cachePath) };
}

function setAnnotation(toolRoot, exporterPath, cachePath, payload) {
  const store = ensureStore(toolRoot, exporterPath, cachePath);
  const config = store.configs.find((item) => item.modelName === payload.modelName || item.parentAsin === text(payload.parentAsin).toUpperCase());
  if (!config) throw new Error('找不到对应产品型号。');
  const metric = text(payload.metric).toLocaleLowerCase('en-US') || 'sp';
  if (metric !== 'sp') throw new Error('目前只有 SP 矩阵支持单元格标注。');
  const keyword = text(payload.keyword);
  const date = isoDate(payload.date);
  const note = text(payload.text ?? payload.note);
  if (!keyword) throw new Error('关键词不能为空。');
  if (!date) throw new Error('标注日期不能为空。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('标注日期格式不正确。');
  const same = (item) => item.modelName === config.modelName && item.metric === metric && key(item.keyword) === key(keyword) && item.date === date;
  store.annotations = store.annotations.filter((item) => !same(item));
  if (note) store.annotations.push({ modelName: config.modelName, metric, keyword, date, text: note, updatedAt: new Date().toISOString() });
  writeStore(toolRoot, store);
  return { ok: true, output: note ? '单元格标注已保存。' : '单元格标注已清除。', data: readData(toolRoot, exporterPath, cachePath) };
}

function addModel(toolRoot, exporterPath, cachePath, payload) {
  const store = ensureStore(toolRoot, exporterPath, cachePath);
  const asin = text(payload.parentAsin).toUpperCase();
  if (!/^B0[A-Z0-9]{8}$/.test(asin)) throw new Error('父体 ASIN 格式不正确。');
  if (store.configs.some((item) => item.parentAsin === asin)) throw new Error('该父体 ASIN 已存在。');
  const config = createModelConfig(payload, store.configs.length, store.configs);
  store.configs.push(config); store.histories[config.historySheet] = [];
  writeStore(toolRoot, store);
  return { ok: true, output: '型号已保存到本地数据。', data: readData(toolRoot, exporterPath, cachePath) };
}

function importReports(toolRoot, exporterPath, cachePath, mode = 'normal') {
  const store = ensureStore(toolRoot, exporterPath, cachePath);
  if (mode === 'refresh') return { ok: true, output: '本地数据已刷新。', data: readData(toolRoot, exporterPath, cachePath) };
  const sourceFolder = path.join(toolRoot, SOURCE_DIR_NAME);
  const files = fs.existsSync(sourceFolder)
    ? fs.readdirSync(sourceFolder).filter((name) => /\.(xlsx|xls)$/i.test(name)).map((name) => {
      const fullPath = path.join(sourceFolder, name); const stat = fs.statSync(fullPath); return { name, fullPath, stat };
    }).sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs)
    : [];
  const configsByAsin = new Map(store.configs.map((item) => [item.parentAsin.toUpperCase(), item]));
  let imported = 0; let skipped = 0; let failed = 0; const errors = [];
  for (const file of files) {
    const fingerprint = `${file.stat.size}:${file.stat.mtimeMs}`;
    if (mode !== 'force' && store.importedFiles[file.name]?.fingerprint === fingerprint) { skipped++; continue; }
    try {
      const report = sourceReport(file.fullPath); const config = configsByAsin.get(report.parentAsin);
      if (!config) { skipped++; continue; }
      const previous = store.histories[config.historySheet] || [];
      store.histories[config.historySheet] = previous.filter((item) => !(item.parentAsin === config.parentAsin && item.snapshotDate === report.snapshotDate)).concat(
        report.records.map((item) => ({ ...item, modelName: config.modelName, parentAsin: config.parentAsin })),
      );
      store.importedFiles[file.name] = { fingerprint, parentAsin: report.parentAsin, snapshotDate: report.snapshotDate, importedAt: new Date().toISOString() };
      imported++;
    } catch (error) {
      // Older `asinKeywords_*.xlsx` exports are WPS-protected binary files.
      // Remember the fingerprint so they are not reparsed on every click;
      // the current Sif xlsx exports are handled natively above.
      store.importedFiles[file.name] = { fingerprint, unsupported: true, importedAt: new Date().toISOString() };
      skipped++;
    }
  }
  writeStore(toolRoot, store);
  const suffix = errors.length ? `\n${errors.join('\n')}` : '';
  return { ok: failed === 0, output: `本地导入完成：${imported} 个文件，跳过 ${skipped} 个，失败 ${failed} 个。${suffix}`, data: readData(toolRoot, exporterPath, cachePath) };
}

module.exports = { STORE_NAME, storePath, ensureStore, readData, mutateWatch, replaceWatches, setAnnotation, addModel, importReports };
