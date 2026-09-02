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

export function buildDateView(model, selectedDate) {
  if (!model?.historyRecords?.length || !selectedDate) {
    return { rows: model?.dashboardRows || [], metrics: model?.metrics || {} };
  }
  const watchMap = new Map((model.watches || []).map((watch, index) => [watch.keyword.toLowerCase(), { ...watch, order: index }]));
  const records = model.historyRecords;
  const current = new Map();
  records
    .filter((item) => item.snapshotDate === selectedDate)
    .forEach((item) => {
      const key = item.keyword.toLowerCase();
      if (watchMap.has(key) || (item.trafficRank != null && item.trafficRank <= 100)) current.set(key, { ...item });
    });
  for (const watch of model.watches || []) {
    const key = watch.keyword.toLowerCase();
    if (current.has(key)) continue;
    const base = records
      .filter((item) => item.keyword.toLowerCase() === key && item.snapshotDate <= selectedDate)
      .sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate))[0];
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
    const previous = records
      .filter((item) => item.keyword.toLowerCase() === key && item.snapshotDate < selectedDate)
      .sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate))[0];
    const getValue = (date, field) => records.find((item) => item.keyword.toLowerCase() === key && item.snapshotDate === date)?.[field] ?? null;
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
  return {
    rows,
    metrics: {
      keywordCount: rows.length,
      watchedCount: model.watches.length,
      naturalUp: rows.filter((item) => item.naturalDirection === 'up').length,
      spUp: rows.filter((item) => item.spDirection === 'up').length,
      unrankedNatural: rows.filter((item) => item.naturalRank == null).length,
    },
  };
}
