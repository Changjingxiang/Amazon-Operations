export const watchKey = value => String(value || '').trim().toLocaleLowerCase('en-US');

// Patch only watch metadata. Keep row order and rank/ABA arrays stable so a
// click never shifts the next star under the pointer or rebuilds history.
export function patchWatchData(data, target, pending = false) {
  if (!data) return data;
  const keyword = watchKey(target.keyword), patched = new Map();
  function update(item) {
    if (patched.has(item)) return patched.get(item);
    let next = item;
    if (item.parentAsin === target.parentAsin) {
      const old = (item.watches || []).find(watch => watchKey(watch.keyword) === keyword);
      const record = { ...(old || {}), ...target, enabled: Boolean(target.enabled) };
      delete record.lightweight;
      if (record.order == null) record.order = Math.max(-1, ...(item.watches || []).map(watch => watch.order ?? 0)) + 1;
      let watches = (item.watches || []).filter(watch => watchKey(watch.keyword) !== keyword);
      if (target.enabled) watches = [...watches, record].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const fields = ['keyword', 'note', 'enabled', 'order', 'parentAsin', 'modelName'];
      if (watches.length === item.watches?.length && watches.every((watch, index) => fields.every(field => watch[field] === item.watches[index][field]))) watches = item.watches;
      const rowPatch = rows => rows?.map(row => watchKey(row.keyword) === keyword
        ? { ...row, watched: Boolean(target.enabled), note: target.note || '', watchNote: target.note || '', watchPending: pending, watchOrder: target.enabled ? watches.findIndex(watch => watchKey(watch.keyword) === keyword) : Number.MAX_SAFE_INTEGER }
        : row);
      const abaRowsByYear = item.abaRowsByYear && Object.fromEntries(Object.entries(item.abaRowsByYear).map(([year, rows]) => [year, rowPatch(rows)]));
      next = { ...item, watches, matrixRows: rowPatch(item.matrixRows), dashboardRows: rowPatch(item.dashboardRows),
        abaRows: abaRowsByYear?.[item.selectedYear] || rowPatch(item.abaRows), ...(abaRowsByYear ? { abaRowsByYear } : {}),
        metrics: item.metrics?.watchedCount === watches.length ? item.metrics : { ...item.metrics, watchedCount: watches.length } };
    }
    if (item.competitors) {
      const competitors = item.competitors.map(update);
      if (competitors.some((value, index) => value !== item.competitors[index])) next = { ...next, competitors };
    }
    patched.set(item, next);
    return next;
  }
  return { ...data, models: data.models.map(update),
    ...(data.ownModels ? { ownModels: data.ownModels.map(update) } : {}),
    ...(data.competitors ? { competitors: data.competitors.map(update) } : {}) };
}
