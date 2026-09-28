// Page numbers come only from the imported rank detail, never from rank / 10.
export function detailPage(detail) {
  const match = String(detail ?? '').match(/(?:^|[^a-z0-9])p\s*(\d+)(?![\d.])/i);
  const page = match ? Number(match[1]) : null;
  return Number.isSafeInteger(page) && page > 0 ? page : null;
}

export function positiveRank(value) {
  const rank = Number(value);
  return Number.isFinite(rank) && rank > 0 ? rank : null;
}

export function rankMovement(value, previous, previousDate) {
  const current = positiveRank(value);
  const prior = positiveRank(previous);
  if (current == null) return { text: value === 0 ? '未上榜' : '无记录', className: 'rank-unranked' };
  if (!previousDate) return { text: '首次记录', className: 'rank-neutral' };
  if (prior == null) return { text: previous === 0 ? '重新上榜' : '无可比排名', className: 'rank-neutral' };
  const delta = prior - current;
  return { text: delta > 0 ? `↑${delta}` : delta < 0 ? `↓${-delta}` : '—', className: delta > 0 ? 'rank-up' : delta < 0 ? 'rank-down' : 'rank-neutral' };
}
