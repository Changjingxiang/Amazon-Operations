const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { normalizeCountryCode, countryLabel } = require('./countries.cjs');

const WORKBOOK_NAME = '关键词排名每日跟进表.xlsx';
const ICON_CONFIG_NAME = '产品图标配置.json';

function defaultIconKey(modelName) {
  const name = text(modelName).toLocaleLowerCase('zh-CN');
  if (/(带帽夹克|hooded jacket)/.test(name)) return 'hooded-jacket';
  if (/(飞行员|棒球夹克|bomber)/.test(name)) return 'bomber-jacket';
  if (/(无袖t恤|无袖t恤|无袖 t|sleeveless)/.test(name)) return 'sleeveless-tshirt';
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
  if (/(polo)/.test(name)) return 'polo';
  if (/(衬衫|shirt)/.test(name) && !/(t.?shirt|t恤)/.test(name)) return 'shirt';
  if (/(t.?shirt|t恤)/.test(name)) return 'tshirt';
  return 'generic-apparel';
}

function readIconSelections(toolRoot) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(toolRoot, ICON_CONFIG_NAME), 'utf8'));
    return parsed?.products && typeof parsed.products === 'object' ? parsed.products : {};
  } catch {
    return {};
  }
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function direction(current, previous) {
  if (current == null || previous == null) return 'none';
  if (current < previous) return 'up';
  if (current > previous) return 'down';
  return 'same';
}

function watchKey(keyword) {
  return text(keyword).toLocaleLowerCase('en-US');
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
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
  return `${match[1]}-${match[2]}-${String(day).padStart(2, '0')}`;
}

function nullableNumber(value) {
  if (value == null || text(value) === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value).replace(/,/g, '').replace(/%$/, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function abaEntryRows(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.rows && typeof entry.rows === 'object' && !Array.isArray(entry.rows)) return entry.rows;
  if (Array.isArray(entry.rows)) {
    const rows = {};
    entry.rows.forEach((item) => {
      const keyword = text(item?.keyword);
      const rank = nullableNumber(item?.rank ?? item?.abaRank ?? item?.searchFrequencyRank);
      if (keyword && rank != null && rank > 0) rows[watchKey(keyword)] = rank;
    });
    return rows;
  }
  return null;
}

function getAbaMonthlyEntry(allAbaMonthly, countryCode, month) {
  if (!month || !allAbaMonthly || typeof allAbaMonthly !== 'object') return null;
  const code = normalizeCountryCode(countryCode || 'CA');
  const direct = allAbaMonthly[`${code}:${month}`]
    || allAbaMonthly[`${code}-${month}`]
    || allAbaMonthly[month];
  if (direct) return direct;
  return Object.values(allAbaMonthly).find((entry) => entry
    && text(entry.month || entry.monthKey) === month
    && normalizeCountryCode(entry.countryCode || entry.site || code) === code) || null;
}

function median(values) {
  const sorted = values.map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function buildAbaSeries(records, allAbaMonthly, countryCode, targetYear, itemKey, cutoffMonthNumber = 12) {
  const pointsByDate = new Map();
  const ownMonths = new Set();
  const prefix = `${targetYear}-`;
  for (const item of records) {
    if (!item.snapshotDate?.startsWith(prefix) || nullableNumber(item.weeklyAbaRank) == null) continue;
    const value = nullableNumber(item.weeklyAbaRank);
    if (value == null || value <= 0) continue;
    const month = item.snapshotDate.slice(0, 7);
    const existing = pointsByDate.get(item.snapshotDate);
    if (!existing || String(item.importTime || '') >= String(existing.importTime || '')) {
      pointsByDate.set(item.snapshotDate, { date: item.snapshotDate, value, source: 'record', importTime: item.importTime });
    }
    ownMonths.add(month);
  }
  const maxMonth = Math.max(1, Math.min(12, Number(cutoffMonthNumber) || 12));
  for (let monthIndex = 1; monthIndex <= maxMonth; monthIndex += 1) {
    const month = `${targetYear}-${String(monthIndex).padStart(2, '0')}`;
    if (ownMonths.has(month)) continue;
    const entry = getAbaMonthlyEntry(allAbaMonthly, countryCode, month);
    const rank = nullableNumber(abaEntryRows(entry)?.[itemKey]);
    const date = monthEndDate(month);
    if (rank == null || rank <= 0 || !date || pointsByDate.has(date)) continue;
    pointsByDate.set(date, { date, value: rank, source: 'csv' });
  }
  return [...pointsByDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ date, value, source }) => ({ date, value, source }));
}

function latestAbaRecordByMonth(records, year, month) {
  if (!month) return null;
  const candidates = records
    .filter((item) => item.snapshotDate?.startsWith(`${year}-${month}-`) && nullableNumber(item.weeklyAbaRank) != null)
    .sort((a, b) => String(a.snapshotDate).localeCompare(String(b.snapshotDate)) || String(a.importTime || '').localeCompare(String(b.importTime || '')));
  return candidates.at(-1) || null;
}

function buildModel(config, records, allWatches, allAnnotations = [], allAbaMonthly = {}) {
  const countryCode = normalizeCountryCode(config?.countryCode || config?.site || 'CA');
  const watches = allWatches
    .filter((item) => item.enabled && item.modelName === config.modelName)
    .sort((a, b) => a.order - b.order);
  const watchMap = new Map(watches.map((item, index) => [watchKey(item.keyword), { ...item, pinOrder: index }]));
  const annotationMaps = {
    natural: new Map(
      (allAnnotations || [])
        .filter((item) => item.modelName === config.modelName && item.metric === 'natural')
        .map((item) => [`${watchKey(item.keyword)}|${item.date}`, item.text]),
    ),
    sp: new Map(
      (allAnnotations || [])
        .filter((item) => item.modelName === config.modelName && item.metric === 'sp')
        .map((item) => [`${watchKey(item.keyword)}|${item.date}`, item.text]),
    ),
  };
  const dates = [...new Set(records.map((item) => item.snapshotDate))].sort();
  const latestDate = dates.at(-1) || '';
  const selectedYear = latestDate ? Number(latestDate.slice(0, 4)) : new Date().getFullYear();
  const latestRecords = records.filter((item) => item.snapshotDate === latestDate);
  const pointMap = new Map(records.map((item) => [`${watchKey(item.keyword)}|${item.snapshotDate}`, item]));
  const recordsByKeyword = new Map();
  for (const record of records) {
    const itemKey = watchKey(record.keyword);
    const bucket = recordsByKeyword.get(itemKey);
    if (bucket) bucket.push(record);
    else recordsByKeyword.set(itemKey, [record]);
  }
  const latestByKeyword = new Map();
  for (const record of records) {
    const key = watchKey(record.keyword);
    const existing = latestByKeyword.get(key);
    if (!existing || record.snapshotDate > existing.snapshotDate) latestByKeyword.set(key, record);
  }

  const previousByKeyword = new Map();
  for (const record of records) {
    if (!latestDate || record.snapshotDate >= latestDate) continue;
    const key = watchKey(record.keyword);
    const existing = previousByKeyword.get(key);
    if (!existing || record.snapshotDate > existing.snapshotDate) previousByKeyword.set(key, record);
  }

  const currentMap = new Map();
  for (const record of latestRecords) {
    const key = watchKey(record.keyword);
    if (watchMap.has(key) || (record.trafficRank != null && record.trafficRank <= 100)) currentMap.set(key, { ...record });
  }
  for (const watch of watches) {
    const key = watchKey(watch.keyword);
    if (currentMap.has(key)) continue;
    const base = latestByKeyword.get(key);
    currentMap.set(key, {
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
      const key = watchKey(record.keyword);
      const previous = previousByKeyword.get(key);
      const watch = watchMap.get(key);
      return {
        ...record,
        watched: Boolean(watch),
        watchOrder: watch?.pinOrder ?? Number.MAX_SAFE_INTEGER,
        watchNote: watch?.note || '',
        naturalDirection: direction(record.naturalRank, previous?.naturalRank),
        spDirection: direction(record.spRank, previous?.spRank),
        naturalTrend: trendDates.map((date) => pointMap.get(`${key}|${date}`)?.naturalRank ?? null),
        spTrend: trendDates.map((date) => pointMap.get(`${key}|${date}`)?.spRank ?? null),
      };
    })
    .sort((a, b) => {
      const aWatch = watchMap.get(watchKey(a.keyword));
      const bWatch = watchMap.get(watchKey(b.keyword));
      if (aWatch && bWatch) return aWatch.pinOrder - bWatch.pinOrder;
      if (aWatch) return -1;
      if (bWatch) return 1;
      return (a.trafficRank ?? 999999) - (b.trafficRank ?? 999999);
    });

  const orderedKeys = [];
  const seen = new Set();
  const addKey = (key) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    orderedKeys.push(key);
  };
  watches.forEach((item) => addKey(watchKey(item.keyword)));
  [...latestRecords]
    .sort((a, b) => (a.trafficRank ?? 999999) - (b.trafficRank ?? 999999))
    .forEach((item) => addKey(watchKey(item.keyword)));
  [...latestByKeyword.keys()].sort().forEach(addKey);

  const matrixRows = orderedKeys.map((key) => {
    const base = latestByKeyword.get(key);
    const watch = watchMap.get(key);
    return {
      keyword: base?.keyword || watch?.keyword || key,
      translation: base?.translation || '',
      watched: Boolean(watch),
      note: watch?.note || '',
      naturalValues: dates.map((date) => pointMap.get(`${key}|${date}`)?.naturalRank ?? 0),
      spValues: dates.map((date) => pointMap.get(`${key}|${date}`)?.spRank ?? 0),
      naturalAnnotations: dates.map((date) => annotationMaps.natural.get(`${key}|${date}`) || ''),
      spAnnotations: dates.map((date) => annotationMaps.sp.get(`${key}|${date}`) || ''),
    };
  });

  const abaRows = orderedKeys.map((key) => {
    const base = latestByKeyword.get(key);
    const watch = watchMap.get(key);
    const keywordRecords = recordsByKeyword.get(key) || [];
    const yearRecords = keywordRecords.filter((item) => item.snapshotDate.startsWith(`${selectedYear}-`));
    const maxSearch = yearRecords.reduce((max, item) => Math.max(max, item.weeklySearchVolume ?? 0), 0) || null;
    const maxConversion = yearRecords.reduce((max, item) => Math.max(max, item.conversionRate ?? 0), 0) || null;
    const latestByMonth = new Map();
    for (const item of yearRecords) {
      if (nullableNumber(item.weeklyAbaRank) == null || nullableNumber(item.weeklyAbaRank) <= 0) continue;
      const month = item.snapshotDate.slice(0, 7);
      const existing = latestByMonth.get(month);
      if (!existing || item.snapshotDate > existing.snapshotDate) latestByMonth.set(month, item);
    }
    // Imported months are explicit user input, so include them even when the
    // latest daily snapshot is from an earlier month (for example, a current
    // month's ABA CSV imported before today's SIF report).
    const currentMonthNumber = 12;
    const abaTrend = buildAbaSeries(records, allAbaMonthly, countryCode, selectedYear, key, currentMonthNumber);
    const months = Array.from({ length: 12 }, (_unused, monthIndex) => {
      const month = `${selectedYear}-${String(monthIndex + 1).padStart(2, '0')}`;
      const own = latestByMonth.get(month);
      if (own) return nullableNumber(own.weeklyAbaRank);
      const imported = nullableNumber(abaEntryRows(getAbaMonthlyEntry(allAbaMonthly, countryCode, month))?.[key]);
      return imported != null && imported > 0 ? imported : null;
    });

    const previousYear = selectedYear - 1;
    const previousYearRecords = keywordRecords
      .filter((item) => item.snapshotDate.startsWith(`${previousYear}-`) && nullableNumber(item.weeklyAbaRank) != null && nullableNumber(item.weeklyAbaRank) > 0);
    const abaPreviousTrend = buildAbaSeries(records, allAbaMonthly, countryCode, previousYear, key, currentMonthNumber);
    const currentMonth = latestDate ? latestDate.slice(0, 7) : '';
    const previousYearMonth = currentMonth ? shiftMonthKey(currentMonth, -12) : '';
    const previousYearNextMonth = previousYearMonth ? shiftMonthKey(previousYearMonth, 1) : '';
    const previousMonthOwn = latestAbaRecordByMonth(previousYearRecords, previousYear, previousYearMonth.slice(5, 7));
    const previousNextOwn = latestAbaRecordByMonth(previousYearRecords, previousYear, previousYearNextMonth.slice(5, 7));
    const previousYearRank = nullableNumber(previousMonthOwn?.weeklyAbaRank)
      ?? nullableNumber(abaEntryRows(getAbaMonthlyEntry(allAbaMonthly, countryCode, previousYearMonth))?.[key]);
    const previousYearNextRank = nullableNumber(previousNextOwn?.weeklyAbaRank)
      ?? nullableNumber(abaEntryRows(getAbaMonthlyEntry(allAbaMonthly, countryCode, previousYearNextMonth))?.[key]);
    const currentOwnRanks = yearRecords
      .filter((item) => currentMonth && item.snapshotDate.startsWith(`${currentMonth}-`))
      .map((item) => nullableNumber(item.weeklyAbaRank))
      .filter((value) => value != null && value > 0);
    const currentCsvRank = nullableNumber(abaEntryRows(getAbaMonthlyEntry(allAbaMonthly, countryCode, currentMonth))?.[key]);
    const abaCurrentMedian = median(currentOwnRanks.length ? currentOwnRanks : (currentCsvRank == null ? [] : [currentCsvRank]));
    return {
      keyword: base?.keyword || watch?.keyword || key,
      translation: base?.translation || '',
      watched: Boolean(watch),
      maxSearch,
      maxConversion,
      months,
      abaTrend,
      abaPreviousTrend,
      previousYear: abaPreviousTrend.length ? previousYear : null,
      abaCurrentMonth: currentMonth,
      abaCurrentMedian,
      abaPreviousYearMonth: previousYearMonth,
      abaPreviousYearRank: previousYearRank,
      abaPreviousYearNextRank: previousYearNextRank,
      abaYoYTrend: direction(abaCurrentMedian, previousYearRank),
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
    site: countryLabel(countryCode),
    countryCode,
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

function readRawWithWps(toolRoot, exporterPath, cachePath) {
  const outputPath = cachePath || path.join(os.tmpdir(), 'keyword-rank-tracker-data.json');
  const scriptPath = exporterPath || path.join(__dirname, '..', 'bridge', 'export_tracker_data.ps1');
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ToolRoot', toolRoot, '-OutputPath', outputPath],
    { cwd: toolRoot, windowsHide: true, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error((`${result.stdout || ''}\n${result.stderr || ''}`).trim() || 'WPS 只读导出失败。');
  }
  return JSON.parse(fs.readFileSync(outputPath, 'utf8'));
}

function readTrackerWorkbook(toolRoot, exporterPath, cachePath) {
  const workbookPath = path.join(toolRoot, WORKBOOK_NAME);
  const raw = readRawWithWps(toolRoot, exporterPath, cachePath);
  const configs = raw.configs || [];
  const watches = raw.watches || [];
  const histories = raw.histories || {};
  const iconSelections = readIconSelections(toolRoot);
  const models = configs.map((config) => ({
    ...buildModel(config, histories[config.historySheet] || [], watches),
    iconKey: iconSelections[config.parentAsin] || defaultIconKey(config.modelName),
  }));
  const sourceFolder = path.join(toolRoot, '每日源文件');
  const sourceCount = fs.existsSync(sourceFolder)
    ? fs.readdirSync(sourceFolder).filter((name) => /\.(xlsx|xls)$/i.test(name)).length
    : 0;
  const stat = fs.statSync(workbookPath);
  return {
    toolRoot,
    workbookPath,
    workbookModifiedAt: stat.mtime.toISOString(),
    workbookOpen: fs.existsSync(path.join(toolRoot, `~$${WORKBOOK_NAME}`)),
    sourceCount,
    models,
    loadedAt: new Date().toISOString(),
  };
}

module.exports = { readTrackerWorkbook, buildModel, defaultIconKey, readIconSelections };
