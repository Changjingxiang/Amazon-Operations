export function percent(value, digits = 2) {
  if (value == null) return '—';
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

export function integer(value) {
  if (value == null) return '—';
  return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

export function shortDate(value) {
  if (!value) return '—';
  const parts = value.split('-');
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : value;
}

export function timeText(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function rankClass(current, previous) {
  if (!current) return 'rank-unranked';
  if (!previous) return previous === 0 ? 'rank-up' : 'rank-neutral';
  if (current < previous) return 'rank-up';
  if (current > previous) return 'rank-down';
  return 'rank-neutral';
}

// The date view is a projection of one immutable model plus the selected date.
// Product/tab interactions often revisit the same model/date pair; retaining
// both the immutable indexes and the final projection avoids rescanning and
// resorting the full history on every return visit. A new model object (after
// an import or edit) naturally creates new cache entries, so no stale-data
// invalidation is required here.
const dateViewCache = new WeakMap();
const dateViewIndexCache = new WeakMap();

function buildDateViewIndexes(model) {
  const cached = dateViewIndexCache.get(model);
  if (cached) return cached;
  const watchMap = new Map((model.watches || []).map((watch, index) => [watch.keyword.toLowerCase(), { ...watch, order: index }]));
  const recordsByDate = new Map();
  const recordsByKeyword = new Map();
  const recordsByKeywordDate = new Map();
  (model.historyRecords || []).forEach((item) => {
    const keywordKey = item.keyword.toLowerCase();
    const dateList = recordsByDate.get(item.snapshotDate) || [];
    dateList.push(item);
    recordsByDate.set(item.snapshotDate, dateList);

    const keywordList = recordsByKeyword.get(keywordKey) || [];
    keywordList.push(item);
    recordsByKeyword.set(keywordKey, keywordList);

    let dateMap = recordsByKeywordDate.get(keywordKey);
    if (!dateMap) {
      dateMap = new Map();
      recordsByKeywordDate.set(keywordKey, dateMap);
    }
    if (!dateMap.has(item.snapshotDate)) dateMap.set(item.snapshotDate, item);
  });
  const sortedRecordsByKeyword = new Map(
    [...recordsByKeyword.entries()].map(([key, list]) => [
      key,
      [...list].sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate)),
    ]),
  );
  const indexes = { watchMap, recordsByDate, recordsByKeywordDate, sortedRecordsByKeyword };
  dateViewIndexCache.set(model, indexes);
  return indexes;
}

export function buildDateView(model, selectedDate) {
  if (!model?.historyRecords?.length || !selectedDate) {
    return { rows: model?.dashboardRows || [], metrics: model?.metrics || {} };
  }
  if (model && typeof model === 'object') {
    const cached = dateViewCache.get(model);
    if (cached?.has(selectedDate)) return cached.get(selectedDate);
  }
  const { watchMap, recordsByDate, recordsByKeywordDate, sortedRecordsByKeyword } = buildDateViewIndexes(model);
  const latestRecord = (keywordKey, inclusive) => {
    const list = sortedRecordsByKeyword.get(keywordKey) || [];
    return list.find((item) => inclusive ? item.snapshotDate <= selectedDate : item.snapshotDate < selectedDate);
  };
  const current = new Map();
  (recordsByDate.get(selectedDate) || []).forEach((item) => {
    const key = item.keyword.toLowerCase();
    if (watchMap.has(key) || (item.trafficRank != null && item.trafficRank <= 100)) current.set(key, { ...item });
  });
  for (const watch of model.watches || []) {
    const key = watch.keyword.toLowerCase();
    if (current.has(key)) continue;
    const base = latestRecord(key, true);
    current.set(key, {
      ...(base || {}),
      snapshotDate: selectedDate,
      modelName: model.modelName,
      parentAsin: model.parentAsin,
      keyword: base?.keyword || watch.keyword,
      translation: base?.translation || '',
      trafficRank: null,
      trafficShare: null,
      naturalRank: null,
      spRank: null,
      weeklyAbaRank: null,
      weeklySearchVolume: null,
      status: '本日报表未出现',
    });
  }
  const trendDates = model.dates.filter((date) => date <= selectedDate).slice(-30);
  const rows = [...current.values()].map((record) => {
    const key = record.keyword.toLowerCase();
    const previous = latestRecord(key, false);
    const dateMap = recordsByKeywordDate.get(key) || new Map();
    const getValue = (date, field) => dateMap.get(date)?.[field] ?? null;
    const naturalDirection = record.naturalRank == null || previous?.naturalRank == null
      ? 'none'
      : record.naturalRank < previous.naturalRank ? 'up' : record.naturalRank > previous.naturalRank ? 'down' : 'same';
    const spDirection = record.spRank == null || previous?.spRank == null
      ? 'none'
      : record.spRank < previous.spRank ? 'up' : record.spRank > previous.spRank ? 'down' : 'same';
    return {
      ...record,
      watched: watchMap.has(key),
      // Keep the explicit watch-list order available to view-level sorting.
      // The dashboard may sort an unpinned field, but watched rows must stay
      // in the order the user arranged in the watch drawer.
      watchOrder: watchMap.get(key)?.order ?? Number.MAX_SAFE_INTEGER,
      watchNote: watchMap.get(key)?.note || '',
      naturalDirection,
      spDirection,
      naturalTrend: trendDates.map((date) => getValue(date, 'naturalRank')),
      spTrend: trendDates.map((date) => getValue(date, 'spRank')),
    };
  }).sort((a, b) => {
    const aw = watchMap.get(a.keyword.toLowerCase());
    const bw = watchMap.get(b.keyword.toLowerCase());
    if (aw && bw) return aw.order - bw.order;
    if (aw) return -1;
    if (bw) return 1;
    return (a.trafficRank ?? 999999) - (b.trafficRank ?? 999999);
  });
  const result = {
    rows,
    metrics: {
      keywordCount: rows.length,
      watchedCount: model.watches.length,
      naturalUp: rows.filter((item) => item.naturalDirection === 'up').length,
      spUp: rows.filter((item) => item.spDirection === 'up').length,
      unrankedNatural: rows.filter((item) => item.naturalRank == null).length,
    },
  };
  let modelCache = dateViewCache.get(model);
  if (!modelCache) {
    modelCache = new Map();
    dateViewCache.set(model, modelCache);
  }
  modelCache.set(selectedDate, result);
  return result;
}
