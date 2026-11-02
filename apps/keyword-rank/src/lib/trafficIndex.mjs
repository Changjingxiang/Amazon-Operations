// A relative search-visibility index, not visits, clicks, or SIF traffic scores.
// Kept independent of the existing ranking / ABA / import calculations.
export const TRAFFIC_EXPONENT = 0.8;
export const TRAFFIC_VERSION = 'volume-rank-08-v1';
export const TRAFFIC_METRICS = [
  { key: 'total', label: '综合指数' },
  { key: 'natural', label: '自然指数' },
  { key: 'sp', label: 'SP 广告指数' },
];
const DAY = 86400000;
const seriesCache = new WeakMap();
const detailCache = new WeakMap();
const keyOf = value => String(value || '').trim().toLocaleLowerCase('en-US');
const dateTime = date => /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? Date.parse(`${date}T00:00:00Z`) : NaN;
export const previousDay = date => Number.isFinite(dateTime(date)) ? new Date(dateTime(date) - DAY).toISOString().slice(0, 10) : '';
export function nonnegativeNumber(value) {
  if (value == null || String(value).trim() === '') return null;
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function scoreRecord(record) {
  const volume = nonnegativeNumber(record.weeklySearchVolume);
  const point = { keyword: record.keyword, translation: record.translation || '', volume };
  for (const metric of ['natural', 'sp']) {
    const rank = nonnegativeNumber(record[`${metric}Rank`]);
    const rankDate = String(record[`${metric}RankDate`] || '').slice(0, 10);
    const age = (dateTime(record.snapshotDate) - dateTime(rankDate)) / DAY;
    // Daily reports normally contain yesterday's observations. Older ranks
    // describe a last-seen position; they are not observations for this day.
    const state = rank == null ? 'missing' : rank === 0 ? 'unranked'
      : !Number.isFinite(age) ? 'undated' : age < 0 || age > 1 ? 'stale' : 'ranked';
    point[`${metric}Rank`] = rank;
    point[`${metric}RankDate`] = rankDate;
    point[`${metric}State`] = state;
    point[metric] = volume == null ? null : state === 'unranked' ? 0
      : state === 'ranked' ? volume / Math.pow(rank, TRAFFIC_EXPONENT) : null;
  }
  point.total = point.natural == null && point.sp == null ? null : (point.natural || 0) + (point.sp || 0);
  return point;
}

function dailyRecords(records, dates) {
  const groups = new Map();
  for (const record of records || []) {
    const date = String(record?.snapshotDate || '');
    if (!Number.isFinite(dateTime(date)) || (dates && !dates.has(date))) continue;
    const keyword = keyOf(record.keyword);
    if (!keyword) continue;
    let rows = groups.get(date);
    if (!rows) { rows = new Map(); groups.set(date, rows); }
    const prior = rows.get(keyword);
    if (!prior || String(record.importTime || '') >= String(prior.importTime || '')) rows.set(keyword, record);
  }
  return groups;
}

function summarize(date, rows) {
  let natural = 0, sp = 0, naturalCount = 0, spCount = 0, volumeCount = 0, staleCount = 0;
  for (const row of rows.values()) {
    const point = scoreRecord(row);
    if (point.volume != null) volumeCount++;
    if (point.natural != null) { natural += point.natural; naturalCount++; }
    if (point.sp != null) { sp += point.sp; spCount++; }
    if ([point.naturalState, point.spState].some(state => state === 'stale' || state === 'undated')) staleCount++;
  }
  return { date, natural: naturalCount ? natural : null, sp: spCount ? sp : null,
    total: naturalCount || spCount ? natural + sp : null, naturalCount, spCount, volumeCount, staleCount, count: rows.size };
}

export function buildTrafficSeries(records) {
  if (!Array.isArray(records)) return [];
  if (seriesCache.has(records)) return seriesCache.get(records);
  const series = [...dailyRecords(records)].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => summarize(date, rows));
  // Retain compact daily totals only, not another copy of the entire history.
  seriesCache.set(records, series);
  return series;
}

export function percentChange(current, previous) {
  return current != null && previous > 0 ? (current - previous) / previous * 100 : null;
}

function fingerprint(rows) {
  let hash = 2166136261;
  for (const [keyword, row] of [...rows].sort(([a], [b]) => a.localeCompare(b))) {
    const value = JSON.stringify([keyword, row.weeklySearchVolume, row.naturalRank, row.naturalRankDate, row.spRank, row.spRankDate]);
    for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildTrafficDetail(records, date) {
  if (!Array.isArray(records) || !date) return null;
  let cache = detailCache.get(records);
  if (!cache) { cache = new Map(); detailCache.set(records, cache); }
  if (cache.has(date)) return cache.get(date);
  const priorDate = previousDay(date);
  const groups = dailyRecords(records, new Set([date, priorDate]));
  const current = groups.get(date) || new Map(), prior = groups.get(priorDate) || new Map();
  const comparison = Object.fromEntries(TRAFFIC_METRICS.map(({ key }) => [key, { current: 0, previous: 0, count: 0, change: null }]));
  const candidates = [];
  for (const keyword of new Set([...current.keys(), ...prior.keys()])) {
    const now = current.has(keyword) ? scoreRecord(current.get(keyword)) : null;
    const before = prior.has(keyword) ? scoreRecord(prior.get(keyword)) : null;
    let comparableTotalNow = 0, comparableTotalBefore = 0, paired = false;
    for (const metric of ['natural', 'sp']) {
      if (now?.[metric] == null || before?.[metric] == null) continue;
      comparison[metric].current += now[metric];
      comparison[metric].previous += before[metric];
      comparison[metric].count++;
      comparableTotalNow += now[metric]; comparableTotalBefore += before[metric]; paired = true;
    }
    if (paired) {
      comparison.total.current += comparableTotalNow;
      comparison.total.previous += comparableTotalBefore;
      comparison.total.count++;
    }
    const weight = Math.max(now?.total || 0, before?.total || 0);
    if (weight > 0) candidates.push({ keyword: now?.keyword || before.keyword, now, before, weight,
      change: paired ? percentChange(comparableTotalNow, comparableTotalBefore) : null });
  }
  for (const metric of TRAFFIC_METRICS) {
    const item = comparison[metric.key];
    item.change = item.count ? percentChange(item.current, item.previous) : null;
  }
  candidates.sort((a, b) => b.weight - a.weight || a.keyword.localeCompare(b.keyword));
  const detail = { ...summarize(date, current), previousDate: prior.size ? priorDate : null,
    comparison, topKeywords: candidates.slice(0, 5), signature: `${TRAFFIC_VERSION}:${date}:${fingerprint(current)}:${fingerprint(prior)}` };
  if (cache.size >= 8) cache.delete(cache.keys().next().value);
  cache.set(date, detail);
  return detail;
}

export function ownTrafficModels(data) {
  return (data?.ownModels || data?.models || []).filter(model => model.kind !== 'competitor' && !model.competitorId);
}
export function modelTrafficKey(model) { return `${model.countryCode || 'CA'}:${model.parentAsin}`; }
export function latestTrafficDetail(model) {
  let date = '';
  for (const row of model.historyRecords || []) if (row.snapshotDate > date) date = row.snapshotDate;
  return buildTrafficDetail(model.historyRecords, date);
}
export function trafficSignatures(data) {
  return new Map(ownTrafficModels(data).map(model => [modelTrafficKey(model), latestTrafficDetail(model)?.signature]));
}

export function buildTrafficAlerts(data, threshold, beforeSignatures = new Map(), seen = new Set()) {
  const alerts = [];
  for (const model of ownTrafficModels(data)) {
    const detail = latestTrafficDetail(model);
    const modelKey = modelTrafficKey(model);
    if (!detail?.previousDate || beforeSignatures.get(modelKey) === detail.signature) continue;
    const id = `${modelKey}:${detail.signature}`;
    if (seen.has(id)) continue;
    const metrics = TRAFFIC_METRICS.map(metric => ({ ...metric, ...detail.comparison[metric.key] }))
      .filter(metric => metric.change != null && Math.abs(metric.change) - threshold > 1e-9);
    if (metrics.length) alerts.push({ id, modelKey, parentAsin: model.parentAsin, countryCode: model.countryCode || 'CA',
      modelName: model.modelName, date: detail.date, previousDate: detail.previousDate,
      volumeCount: detail.volumeCount, count: detail.count, metrics });
  }
  return alerts;
}
