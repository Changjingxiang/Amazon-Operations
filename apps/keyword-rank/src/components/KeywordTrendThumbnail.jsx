import { useMemo } from 'react';

const COLORS = { natural: '#1688a8', sp: '#d15a4f', aba: '#7566b8', share: '#e0a12d' };
const keyOf = (value) => String(value || '').trim().toLocaleLowerCase('en-US');
const valueOf = (value) => {
  if (value == null || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

function pathFor(values, x, y) {
  let path = '';
  let open = false;
  values.forEach((value, index) => {
    if (value == null) { open = false; return; }
    path += `${open ? ' L' : 'M'}${x(index)},${y(value)}`;
    open = true;
  });
  return path;
}

function rankBounds(values) {
  const present = values.filter((value) => value != null);
  if (!present.length) return { min: 1, max: 1 };
  const min = Math.min(...present);
  const max = Math.max(...present);
  if (min === max) return { min: Math.max(1, min - 1), max: max + 1 };
  return { min, max };
}

function formatRank(value) {
  return value == null ? '暂无' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

export default function KeywordTrendThumbnail({ model, keyword, onDoubleClick }) {
  const points = useMemo(() => {
    const target = keyOf(keyword);
    const dates = [...new Set(model?.dates || [])].sort().slice(-30);
    const records = new Map();
    (model?.historyRecords || []).forEach((record) => {
      if (keyOf(record?.keyword) !== target || !dates.includes(record?.snapshotDate)) return;
      const mapKey = record.snapshotDate;
      const previous = records.get(mapKey);
      if (!previous || String(record.importTime || '') >= String(previous.importTime || '')) records.set(mapKey, record);
    });
    return dates.map((date) => {
      const record = records.get(date);
      return { date, natural: valueOf(record?.naturalRank), sp: valueOf(record?.spRank), aba: valueOf(record?.weeklyAbaRank), share: record?.trafficShare == null ? null : Number(record.trafficShare) };
    });
  }, [model?.dates, model?.historyRecords, keyword]);

  const width = 292;
  const height = 164;
  const pad = { top: 10, right: 10, bottom: 10, left: 34 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const x = (index) => pad.left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const trackGap = 18;
  const trackHeight = (plotHeight - trackGap) / 2;
  const naturalTop = pad.top;
  const spTop = pad.top + trackHeight + trackGap;
  const naturalBounds = rankBounds(points.map((point) => point.natural));
  const spBounds = rankBounds(points.map((point) => point.sp));
  const yFor = (value, bounds, top) => top + ((value - bounds.min) / Math.max(1, bounds.max - bounds.min)) * trackHeight;
  const yNatural = (value) => yFor(value, naturalBounds, naturalTop);
  const ySp = (value) => yFor(value, spBounds, spTop);
  const latest = points.at(-1);
  return <div className="keyword-trend-thumbnail" role="status" onDoubleClick={onDoubleClick}>
    <div className="keyword-trend-thumbnail-head"><strong>{keyword}</strong><span>最近 30D · 双击查看完整趋势</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} aria-label={`${keyword}最近30天趋势缩略图`}>
      <rect x={pad.left} y={naturalTop} width={plotWidth} height={trackHeight} rx="3" fill="#f5fafb" />
      <rect x={pad.left} y={spTop} width={plotWidth} height={trackHeight} rx="3" fill="#fff7f5" />
      <line x1={pad.left} y1={naturalTop + trackHeight} x2={width - pad.right} y2={naturalTop + trackHeight} stroke="#d7e1e7" />
      <line x1={pad.left} y1={spTop + trackHeight} x2={width - pad.right} y2={spTop + trackHeight} stroke="#d7e1e7" />
      <text x="4" y={naturalTop + 11} fill={COLORS.natural} fontSize="9" fontWeight="700">自然位</text>
      <text x={width - pad.right} y={naturalTop + 11} textAnchor="end" fill="#718092" fontSize="8">最新 {formatRank(latest?.natural)}</text>
      <text x="4" y={spTop + 11} fill={COLORS.sp} fontSize="9" fontWeight="700">SP位</text>
      <text x={width - pad.right} y={spTop + 11} textAnchor="end" fill="#718092" fontSize="8">最新 {formatRank(latest?.sp)}</text>
      <path d={pathFor(points.map((point) => point.natural), x, yNatural)} fill="none" stroke={COLORS.natural} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d={pathFor(points.map((point) => point.sp), x, ySp)} fill="none" stroke={COLORS.sp} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <div className="keyword-trend-thumbnail-legend"><span style={{ color: COLORS.natural }}>━ 自然位</span><span style={{ color: COLORS.sp }}>━ SP位</span><b>{latest?.date || '暂无数据'}</b></div>
  </div>;
}
