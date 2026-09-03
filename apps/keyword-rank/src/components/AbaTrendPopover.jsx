import { integer, shortDate } from '../lib/format.js';

const CURRENT_COLOR = '#16a7b7';
const PREVIOUS_COLOR = '#d85b64';

function validPoints(points) {
  return (Array.isArray(points) ? points : [])
    .filter((point) => point && point.date && Number.isFinite(Number(point.value)) && Number(point.value) > 0)
    .map((point) => ({ ...point, value: Number(point.value) }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function dayFraction(dateValue) {
  const match = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  // Use a leap-year-neutral calendar so the same month/day from this year
  // and last year lands on the same x coordinate.
  const date = Date.UTC(2000, Number(match[2]) - 1, Number(match[3]));
  const start = Date.UTC(2000, 0, 1);
  const end = Date.UTC(2001, 0, 1);
  if (!Number.isFinite(date) || date < start || date >= end) return null;
  return (date - start) / (end - start);
}

function sourceLabel(point) {
  return point?.source === 'csv' ? 'CSV补缺' : '自有记录';
}

export function trendPopoverStyle(event, anchor) {
  const width = 340;
  const height = 236;
  const rect = anchor?.getBoundingClientRect?.();
  const x = Number(event?.clientX) || (rect ? rect.right : Math.round(window.innerWidth / 2));
  const y = Number(event?.clientY) || (rect ? rect.top : Math.round(window.innerHeight / 2));
  const left = Math.max(8, Math.min(x + 14, window.innerWidth - width - 8));
  const top = y + height < window.innerHeight - 8 ? y + 14 : Math.max(8, y - height - 14);
  return { left, top };
}

export default function AbaTrendPopover({ keyword, trend, previousTrend, year, previousYear, style }) {
  const current = validPoints(trend);
  const previous = validPoints(previousTrend);
  const all = [...current, ...previous];
  const title = keyword ? `ABA 对照：${keyword}` : 'ABA 对照';
  if (!all.length) {
    return <div className="aba-trend-popover" style={style} role="status"><div className="aba-trend-title"><strong>{title}</strong><span>{year} vs {previousYear || '去年'}</span></div><span className="aba-trend-empty">暂无可用的今年或去年 ABA 数据。</span></div>;
  }

  const width = 316;
  const height = 164;
  const pad = { top: 26, right: 12, bottom: 25, left: 34 };
  const chartRight = width - pad.right;
  const chartBottom = height - pad.bottom;
  const values = all.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const xFor = (point, index, length) => {
    const fraction = dayFraction(point.date);
    const fallback = index / Math.max(1, length - 1);
    return pad.left + (Number.isFinite(fraction) ? fraction : fallback) * (chartRight - pad.left);
  };
  const yFor = (value) => pad.top + ((value - min) / range) * (chartBottom - pad.top);
  const currentPoints = current.map((point, index) => `${xFor(point, index, current.length)},${yFor(point.value)}`).join(' ');
  const previousPoints = previous.map((point, index) => `${xFor(point, index, previous.length)},${yFor(point.value)}`).join(' ');
  const latestCurrent = current.at(-1);
  const latestPrevious = previous.at(-1);
  const firstDate = all[0].date;
  const lastDate = all.at(-1).date;
  const aria = `${year || '今年'}与${previousYear || '去年'} ABA 排名对照折线图${keyword ? `，关键词 ${keyword}` : ''}`;

  return (
    <div className="aba-trend-popover" style={style} role="status">
      <div className="aba-trend-title"><strong>{title}</strong><span>{year || '今年'} vs {previousYear || '去年'}</span></div>
      <div className="aba-trend-legend" aria-hidden="true">
        {current.length > 0 && <span className="aba-trend-legend-item current"><i />{year || '今年'}（自有优先）</span>}
        {previous.length > 0 && <span className="aba-trend-legend-item previous"><i />{previousYear || '去年'}</span>}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={aria}>
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={chartBottom} stroke="#b9c7d2" />
        <line x1={pad.left} y1={chartBottom} x2={chartRight} y2={chartBottom} stroke="#b9c7d2" />
        {current.length > 1 && <polyline points={currentPoints} fill="none" stroke={CURRENT_COLOR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        {previous.length > 1 && <polyline points={previousPoints} fill="none" stroke={PREVIOUS_COLOR} strokeWidth="2.5" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />}
        {current.map((point, index) => <circle key={`current-${point.date}-${index}`} cx={xFor(point, index, current.length)} cy={yFor(point.value)} r="2.8" fill="#0d6974" aria-label={`${shortDate(point.date)}：${integer(point.value)}（${sourceLabel(point)}）`} />)}
        {previous.map((point, index) => <circle key={`previous-${point.date}-${index}`} cx={xFor(point, index, previous.length)} cy={yFor(point.value)} r="2.8" fill="#a83f4a" aria-label={`${shortDate(point.date)}：${integer(point.value)}（${sourceLabel(point)}）`} />)}
        <text x="3" y={pad.top + 4} className="aba-axis-label">{integer(min)}</text>
        <text x="3" y={chartBottom + 4} className="aba-axis-label">{integer(max)}</text>
        <text x={pad.left} y={height - 7} className="aba-axis-label">{shortDate(firstDate)}</text>
        <text x={chartRight} y={height - 7} textAnchor="end" className="aba-axis-label">{shortDate(lastDate)}</text>
      </svg>
      <div className="aba-trend-latest">
        {latestCurrent && <span className="aba-trend-current-latest">今年 {shortDate(latestCurrent.date)}：{integer(latestCurrent.value)}（{sourceLabel(latestCurrent)}）</span>}
        {latestPrevious && <span className="aba-trend-previous-latest">去年 {shortDate(latestPrevious.date)}：{integer(latestPrevious.value)}（{sourceLabel(latestPrevious)}）</span>}
      </div>
    </div>
  );
}
