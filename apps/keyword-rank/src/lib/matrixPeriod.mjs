export function periodSelection(dates, filter = {}) {
  const validDates = [...new Set((dates || []).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();
  const months = [...new Set(validDates.map(date => date.slice(0, 7)))];
  const year = filter.matrixYear || months.at(-1)?.slice(0, 4) || '';
  const available = months.filter(month => month.startsWith(year + '-'));
  const latest = available.at(-1);
  let defaults = latest ? [latest] : [];
  if (latest && validDates.filter(date => date.startsWith(latest + '-')).length < 15) {
    const [y, m] = latest.split('-').map(Number);
    const previous = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    if (months.includes(previous)) defaults = [previous, latest];
  }
  const selected = filter.matrixMonths == null ? defaults : filter.matrixMonths;
  return { months, year, available, selected };
}

export function filterPeriodDates(dates, filter = {}) {
  const { selected } = periodSelection(dates, filter);
  return (dates || []).filter(date => selected.includes(date.slice(0, 7)));
}
