export const DASHBOARD_SORT_FIELDS = Object.freeze([
  { field: 'weeklyAbaRank', label: '周ABA排名' },
  { field: 'spRank', label: 'SP排名' },
  { field: 'naturalRank', label: '自然排名' },
  { field: 'weeklySearchVolume', label: '周搜索量' },
]);

function metricValue(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function sortDashboardRows(rows, conditions = [], { sortWatched = false } = {}) {
  if (!conditions.length) return rows;
  return [...rows].sort((a, b) => {
    // Watch words remain pinned; metric sorting within that group is optional.
    if (Boolean(a.watched) !== Boolean(b.watched)) return a.watched ? -1 : 1;
    if (a.watched && b.watched && !sortWatched) {
      const orderDiff = (a.watchOrder ?? Number.MAX_SAFE_INTEGER) - (b.watchOrder ?? Number.MAX_SAFE_INTEGER);
      return orderDiff;
    }
    for (const { field, direction } of conditions) {
      const av = metricValue(a[field]);
      const bv = metricValue(b[field]);
      // Missing ranks stay last in either direction. Equal missing values can
      // still be ordered by the next condition.
      if (av == null && bv == null) continue;
      if (av == null) return 1;
      if (bv == null) return -1;
      const difference = (av - bv) * (direction === 'desc' ? -1 : 1);
      if (difference !== 0) return difference;
    }
    if (a.watched && b.watched) return (a.watchOrder ?? Number.MAX_SAFE_INTEGER) - (b.watchOrder ?? Number.MAX_SAFE_INTEGER);
    return String(a.keyword || '').localeCompare(String(b.keyword || ''), 'en', { sensitivity: 'base' });
  });
}
