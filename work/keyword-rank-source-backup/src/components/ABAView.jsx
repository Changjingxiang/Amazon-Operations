import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Star } from 'lucide-react';
import { integer, percent, shortDate } from '../lib/format.js';
import { ResizeHandle, useColumnWidths } from '../lib/columnWidths.jsx';

function TrendPopover({ trend, year, style }) {
  const width = 300; const height = 142; const pad = { top: 18, right: 14, bottom: 27, left: 35 };
  const valid = (trend || []).filter((point) => point.value != null);
  if (valid.length < 2) return <div className="aba-trend-popover" style={style}><strong>{year} 年 ABA 趋势</strong><span className="aba-trend-empty">有效记录不足 2 个，暂无法绘制趋势。</span></div>;
  const values = valid.map((point) => Number(point.value)); const min = Math.min(...values); const max = Math.max(...values); const range = Math.max(1, max - min);
  const xAt = (index) => pad.left + (index / Math.max(1, valid.length - 1)) * (width - pad.left - pad.right); const yAt = (value) => pad.top + ((value - min) / range) * (height - pad.top - pad.bottom);
  const latest = valid.at(-1); const points = valid.map((point, index) => `${xAt(index)},${yAt(point.value)}`).join(' ');
  return <div className="aba-trend-popover" style={style}><div className="aba-trend-title"><strong>{year} 年 ABA 趋势</strong><span>共 {valid.length} 个记录</span></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${year}年ABA排名趋势折线图`}><line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} stroke="#b9c7d2" /><line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} stroke="#b9c7d2" /><polyline points={points} fill="none" stroke="#27c7d9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />{valid.map((point, index) => <circle key={`${point.date}-${index}`} cx={xAt(index)} cy={yAt(point.value)} r="2.6" fill="#173b64" />)}<text x="4" y={pad.top + 4} className="aba-axis-label">{integer(min)}</text><text x="4" y={height - pad.bottom + 4} className="aba-axis-label">{integer(max)}</text><text x={pad.left} y={height - 7} className="aba-axis-label">{shortDate(valid[0].date)}</text><text x={width - pad.right} y={height - 7} textAnchor="end" className="aba-axis-label">{shortDate(latest.date)}</text></svg><span className="aba-trend-latest">最新 {shortDate(latest.date)}：{integer(latest.value)}</span></div>;
}

export default function ABAView({ model, onToggleWatch }) {
  const [collapsedYears, setCollapsedYears] = useState(() => new Set());
  const [collapsedMonths, setCollapsedMonths] = useState(() => new Set());
  const [layoutAnimating, setLayoutAnimating] = useState(false);
  const [hovered, setHovered] = useState(null);
  const defaults = useMemo(() => ({ star: 54, keyword: 250, translation: 180, search: 86, conversion: 86, month: 86 }), []);
  const { widths, nudgeWidth, startResize } = useColumnWidths('keyword-tracker:columns:aba', defaults);
  const year = String(model.selectedYear);
  const monthKeys = useMemo(() => Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`), [year]);
  const yearClosed = collapsedYears.has(year);
  const columns = yearClosed ? [{ type: 'year', key: year }] : monthKeys.map((month) => collapsedMonths.has(month) ? ({ type: 'month', key: month, month }) : ({ type: 'month', key: month, month, expanded: true }));
  const animateLayout = () => { setLayoutAnimating(false); requestAnimationFrame(() => { setLayoutAnimating(true); window.setTimeout(() => setLayoutAnimating(false), 300); }); };
  const toggleYear = () => { animateLayout(); setCollapsedYears((current) => { const next = new Set(current); next.has(year) ? next.delete(year) : next.add(year); return next; }); };
  const toggleMonth = (month) => { animateLayout(); setCollapsedMonths((current) => { const next = new Set(current); next.has(month) ? next.delete(month) : next.add(month); return next; }); };
  const trendStyle = (event, anchor) => {
    const width = 326; const height = 205;
    // Mouse coordinates keep the chart next to the pointer. Keyboard focus
    // has no useful client coordinates, so anchor it to the keyword cell.
    const rect = anchor?.getBoundingClientRect?.();
    const x = Number(event?.clientX) || (rect ? rect.right : Math.round(window.innerWidth / 2));
    const y = Number(event?.clientY) || (rect ? rect.top : Math.round(window.innerHeight / 2));
    const left = Math.max(8, Math.min(x + 14, window.innerWidth - width - 8));
    const top = y + height < window.innerHeight - 8 ? y + 14 : Math.max(8, y - height - 14);
    return { left, top };
  };
  const showTrend = (row, event) => setHovered({ keyword: row.keyword, row, style: trendStyle(event, event?.currentTarget) });
  const updateTrend = (row, event) => setHovered((current) => current?.keyword === row.keyword ? { ...current, style: trendStyle(event) } : current);
  const widthStyle = (column) => ({ width: widths[column], minWidth: widths[column] });
  const resizeHandle = (column, label) => <ResizeHandle columnKey={column} onResize={startResize} onNudge={nudgeWidth} label={label} />;
  const popup = hovered ? createPortal(<TrendPopover trend={hovered.row.abaTrend} year={model.selectedYear} style={hovered.style} />, document.body) : null;
  return <section className="matrix-panel aba-panel"><div className="matrix-note"><span>{model.selectedYear} 年 ABA 月度排名：可按年份、月份收放</span><span>每月取当月最后一次有效排名；搜索量和点击转化率显示年内最高值。将鼠标移到关键词可查看全年连贯趋势。</span></div><div className="matrix-scroll"><table className={`matrix-table aba-table aba-group-table matrix-layout-transition ${layoutAnimating ? 'is-animating' : ''}`}><colgroup><col style={widthStyle('star')} /><col style={widthStyle('keyword')} /><col style={widthStyle('translation')} /><col style={widthStyle('search')} /><col style={widthStyle('conversion')} />{columns.map((column) => <col key={`width-${column.key}`} style={widthStyle('month')} />)}</colgroup><thead>
    <tr className="matrix-year-row"><th className="sticky-col aba-fixed-head" colSpan="3">年份</th><th colSpan="2" className="aba-meta-spacer" aria-hidden="true" /><th colSpan={columns.length} className="matrix-group-cell"><button type="button" onClick={toggleYear} aria-expanded={!yearClosed}><span className="group-chevron">{yearClosed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>{year}年</button></th></tr>
    <tr className="matrix-month-row"><th className="sticky-col aba-fixed-head" colSpan="3">月份</th><th colSpan="2" className="aba-meta-spacer" aria-hidden="true" />{yearClosed ? <th className="matrix-group-cell matrix-collapsed-label" aria-label="年份分组" /> : monthKeys.map((month) => { const closed = collapsedMonths.has(month); return <th key={month} className="matrix-group-cell"><button type="button" onClick={() => toggleMonth(month)} aria-expanded={!closed}><span className="group-chevron">{closed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>{Number(month.slice(5, 7))}月</button></th>; })}</tr>
    <tr><th className="sticky-col star-col" style={widthStyle('star')}>关注{resizeHandle('star', '关注')}</th><th className="sticky-col keyword-col" style={widthStyle('keyword')}>关键词{resizeHandle('keyword', '关键词')}</th><th className="sticky-col translation-col" style={widthStyle('translation')}>翻译{resizeHandle('translation', '翻译')}</th><th style={widthStyle('search')}>搜索量<br />年内最高{resizeHandle('search', '搜索量')}</th><th style={widthStyle('conversion')}>点击转化率<br />年内最高{resizeHandle('conversion', '点击转化率')}</th>{columns.map((column) => <th key={column.key} style={widthStyle('month')} className={column.expanded ? '' : 'matrix-placeholder-head'}>{resizeHandle('month', '月份')}</th>)}</tr>
  </thead><tbody>{model.abaRows.map((row) => <tr key={row.keyword} className={row.watched ? 'watched-row' : ''}><td className="sticky-col star-col"><button type="button" className={`star-button ${row.watched ? 'watched' : ''}`} onClick={() => onToggleWatch(row.keyword, !row.watched, '')}><Star size={18} fill={row.watched ? 'currentColor' : 'none'} /></button></td><td className="sticky-col keyword-col aba-keyword-cell" onMouseEnter={(event) => showTrend(row, event)} onMouseMove={(event) => updateTrend(row, event)} onMouseLeave={() => setHovered(null)} onFocus={(event) => showTrend(row, event)} onBlur={() => setHovered(null)} tabIndex="0"><span>{row.keyword}</span></td><td className="sticky-col translation-col">{row.translation || '—'}</td><td>{integer(row.maxSearch)}</td><td>{percent(row.maxConversion)}</td>{columns.map((column) => { if (!column.expanded) return <td key={`${row.keyword}-${column.key}`} className="matrix-placeholder" aria-label="折叠分组" />; const index = Number(column.month.slice(5, 7)) - 1; return <td key={`${row.keyword}-${column.key}`}>{integer(row.months[index])}</td>; })}</tr>)}</tbody></table></div>{popup}</section>;
}
