import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Star } from 'lucide-react';
import { integer, percent } from '../lib/format.js';
import { ResizeHandle, useColumnWidths } from '../lib/columnWidths.jsx';
import AbaTrendPopover, { trendPopoverStyle } from './AbaTrendPopover.jsx';

const ABA_ROW_HEIGHT = 38;
const ABA_ROW_OVERSCAN = 8;
const ABA_INITIAL_ROWS = 48;

export default function ABAView({ model, onToggleWatch }) {
  const [collapsedYears, setCollapsedYears] = useState(() => new Set());
  const [collapsedMonths, setCollapsedMonths] = useState(() => new Set());
  const [layoutAnimating, setLayoutAnimating] = useState(false);
  const [hovered, setHovered] = useState(null);
  const rowCount = model.abaRows?.length || 0;
  const scrollRef = useRef(null);
  const [virtualRange, setVirtualRange] = useState(() => ({ start: 0, end: Math.min(rowCount, ABA_INITIAL_ROWS) }));
  const virtualRangeRef = useRef(virtualRange);
  const defaults = useMemo(() => ({ star: 54, keyword: 250, translation: 180, search: 86, conversion: 86, month: 86 }), []);
  const { widths, nudgeWidth, startResize } = useColumnWidths('keyword-tracker:columns:aba', defaults);
  const year = String(model.selectedYear);
  const monthKeys = useMemo(() => Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`), [year]);
  const yearClosed = collapsedYears.has(year);
  const columns = yearClosed ? [{ type: 'year', key: year }] : monthKeys.map((month) => collapsedMonths.has(month) ? ({ type: 'month', key: month, month }) : ({ type: 'month', key: month, month, expanded: true }));
  useEffect(() => {
    const next = { start: 0, end: Math.min(rowCount, ABA_INITIAL_ROWS) };
    virtualRangeRef.current = next;
    setVirtualRange(next);
    setHovered(null);
  }, [model.parentAsin, model.selectedYear, rowCount]);
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return undefined;
    let frame = 0;
    const updateRange = () => {
      frame = 0;
      const firstVisible = Math.floor(Math.max(0, scroll.scrollTop - 102) / ABA_ROW_HEIGHT);
      const visibleCount = Math.ceil(scroll.clientHeight / ABA_ROW_HEIGHT) + ABA_ROW_OVERSCAN * 2 + 4;
      const start = Math.min(rowCount, Math.max(0, firstVisible - ABA_ROW_OVERSCAN));
      const end = Math.min(rowCount, start + visibleCount);
      const current = virtualRangeRef.current;
      if (current.start === start && current.end === end) return;
      const next = { start, end };
      virtualRangeRef.current = next;
      setVirtualRange(next);
    };
    const handleScroll = () => { if (!frame) frame = window.requestAnimationFrame(updateRange); };
    scroll.addEventListener('scroll', handleScroll, { passive: true });
    updateRange();
    return () => {
      scroll.removeEventListener('scroll', handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [rowCount, model.parentAsin, model.selectedYear]);
  const animateLayout = () => { setLayoutAnimating(false); requestAnimationFrame(() => { setLayoutAnimating(true); window.setTimeout(() => setLayoutAnimating(false), 300); }); };
  const toggleYear = () => { animateLayout(); setCollapsedYears((current) => { const next = new Set(current); next.has(year) ? next.delete(year) : next.add(year); return next; }); };
  const toggleMonth = (month) => { animateLayout(); setCollapsedMonths((current) => { const next = new Set(current); next.has(month) ? next.delete(month) : next.add(month); return next; }); };
  const showTrend = (row, event) => setHovered({ keyword: row.keyword, row, style: trendPopoverStyle(event, event?.currentTarget) });
  const updateTrend = (row, event) => setHovered((current) => current?.keyword === row.keyword ? { ...current, style: trendPopoverStyle(event) } : current);
  const widthStyle = (column) => ({ width: widths[column], minWidth: widths[column] });
  const resizeHandle = (column, label) => <ResizeHandle columnKey={column} onResize={startResize} onNudge={nudgeWidth} label={label} />;
  const stickyLayoutStyle = {
    '--sticky-keyword-left': `${widths.star}px`,
    '--sticky-translation-left': `${widths.star + widths.keyword}px`,
  };
  const visibleRows = (model.abaRows || []).slice(virtualRange.start, virtualRange.end);
  const topSpacerHeight = virtualRange.start * ABA_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, rowCount - virtualRange.end) * ABA_ROW_HEIGHT;
  const renderSpacer = (height, key) => height > 0 ? (
    <tr key={key} className="matrix-virtual-spacer" aria-hidden="true">
      <td colSpan={columns.length + 7}><div style={{ height: `${height}px` }} /></td>
    </tr>
  ) : null;
  const popup = hovered ? createPortal(<AbaTrendPopover keyword={hovered.keyword} trend={hovered.row.abaTrend} previousTrend={hovered.row.abaPreviousTrend} year={model.selectedYear} previousYear={hovered.row.previousYear} style={hovered.style} />, document.body) : null;
  return <section className="matrix-panel aba-panel"><div className="matrix-note"><span>{model.selectedYear} 年 ABA 月度排名：可按年份、月份收放</span><span>每月排名和对照折线均以已导入的 ABA CSV 为准；悬停关键词可查看今年与去年两种颜色的 ABA 对照趋势，各月点位会标出具体排名。</span></div><div ref={scrollRef} className="matrix-scroll"><table style={stickyLayoutStyle} className={`matrix-table aba-table aba-group-table matrix-layout-transition ${layoutAnimating ? 'is-animating' : ''}`}><colgroup><col style={widthStyle('star')} /><col style={widthStyle('keyword')} /><col style={widthStyle('translation')} /><col style={widthStyle('search')} /><col style={widthStyle('conversion')} />{columns.map((column) => <col key={`width-${column.key}`} style={widthStyle('month')} />)}</colgroup><thead>
    <tr className="matrix-year-row"><th className="sticky-col aba-fixed-head" colSpan="3">年份</th><th colSpan="2" className="aba-meta-spacer" aria-hidden="true" /><th colSpan={columns.length} className="matrix-group-cell"><button type="button" onClick={toggleYear} aria-expanded={!yearClosed}><span className="group-chevron">{yearClosed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>{year}年</button></th></tr>
    <tr className="matrix-month-row"><th className="sticky-col aba-fixed-head" colSpan="3">月份</th><th colSpan="2" className="aba-meta-spacer" aria-hidden="true" />{yearClosed ? <th className="matrix-group-cell matrix-collapsed-label" aria-label="年份分组" /> : monthKeys.map((month) => { const closed = collapsedMonths.has(month); return <th key={month} className="matrix-group-cell"><button type="button" onClick={() => toggleMonth(month)} aria-expanded={!closed}><span className="group-chevron">{closed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>{Number(month.slice(5, 7))}月</button></th>; })}</tr>
    <tr><th className="sticky-col star-col" style={widthStyle('star')}>关注{resizeHandle('star', '关注')}</th><th className="sticky-col keyword-col" style={widthStyle('keyword')}>关键词{resizeHandle('keyword', '关键词')}</th><th className="sticky-col translation-col" style={widthStyle('translation')}>翻译{resizeHandle('translation', '翻译')}</th><th style={widthStyle('search')}>搜索量<br />年内最高{resizeHandle('search', '搜索量')}</th><th style={widthStyle('conversion')}>点击转化率<br />年内最高{resizeHandle('conversion', '点击转化率')}</th>{columns.map((column) => <th key={column.key} style={widthStyle('month')} className={column.expanded ? '' : 'matrix-placeholder-head'}>{resizeHandle('month', '月份')}</th>)}</tr>
  </thead><tbody>{renderSpacer(topSpacerHeight, 'aba-virtual-top')}{visibleRows.map((row) => <tr key={row.keyword} className={row.watched ? 'watched-row' : ''}><td className="sticky-col star-col"><button type="button" className={`star-button ${row.watched ? 'watched' : ''}`} onClick={() => onToggleWatch(row.keyword, !row.watched, '')}><Star size={18} fill={row.watched ? 'currentColor' : 'none'} /></button></td><td className="sticky-col keyword-col aba-keyword-cell" onMouseEnter={(event) => showTrend(row, event)} onMouseMove={(event) => updateTrend(row, event)} onMouseLeave={() => setHovered(null)} onFocus={(event) => showTrend(row, event)} onBlur={() => setHovered(null)} tabIndex="0"><span>{row.keyword}</span></td><td className="sticky-col translation-col">{row.translation || '—'}</td><td>{integer(row.maxSearch)}</td><td>{percent(row.maxConversion)}</td>{columns.map((column) => { if (!column.expanded) return <td key={`${row.keyword}-${column.key}`} className="matrix-placeholder" aria-label="折叠分组" />; const index = Number(column.month.slice(5, 7)) - 1; return <td key={`${row.keyword}-${column.key}`}>{integer(row.months[index])}</td>; })}</tr>)}{renderSpacer(bottomSpacerHeight, 'aba-virtual-bottom')}</tbody></table></div>{popup}</section>;
}
