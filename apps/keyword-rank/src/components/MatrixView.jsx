import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Star } from 'lucide-react';
import { rankClass, shortDate } from '../lib/format.js';
import { ResizeHandle, useColumnWidths } from '../lib/columnWidths.jsx';

function monthLabel(monthKey) { return `${Number(monthKey.slice(5, 7))}月`; }

// Keep the measured rank visible independently from the annotation editor.
// Some Chromium builds can briefly paint a cell with no text while React swaps
// the editor input back to a text node after an async save.  Rendering an
// explicit value element makes the post-save black/white rank deterministic.
function displayRank(value) {
  return value == null || value === '' ? 0 : value;
}

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function rankMovement(value, previous) {
  const currentRank = Number(value);
  const previousRank = Number(previous);
  if (!Number.isFinite(currentRank) || !Number.isFinite(previousRank) || currentRank <= 0 || previousRank <= 0 || currentRank === previousRank) return '';
  const delta = Math.abs(previousRank - currentRank);
  return currentRank < previousRank
    ? `↑ 较前日提升 ${delta} 位`
    : `↓ 较前日下降 ${delta} 位`;
}

function rankTitle(value, previous, metric, annotation) {
  const action = `点击${metric === 'natural' ? '自然' : 'SP'}排名单元格添加标注；双击可再次编辑`;
  const movement = rankMovement(value, previous);
  const detail = annotation ? `标注：${annotation}` : action;
  return movement ? `${detail}；${movement}` : detail;
}

// Keep row identity stable while the virtual window advances. The parent still
// recalculates the small visible window, but rows that remain in that window do
// not rebuild every date cell or icon on each scroll tick.
const MatrixRow = memo(function MatrixRow({ row, columns, dateIndexMap, valueField, annotationField, metric, selectedDate, editing, onToggleWatch, onBeginAnnotation, onEditDraft, onCommitAnnotation, onCancelAnnotation }) {
  const values = row[valueField] || [];
  const annotations = annotationField ? (row[annotationField] || []) : [];
  const editingKey = editing ? `${editing.keyword}|${editing.date}` : '';
  return (
    <tr data-matrix-keyword={row.keyword} className={row.watched ? 'watched-row' : ''}>
      <td className="sticky-col star-col"><button type="button" className={`star-button ${row.watched ? 'watched' : ''}`} title={row.watched ? '取消关注' : '设为关注'} onClick={() => onToggleWatch(row.keyword, !row.watched, row.note)}><Star size={18} fill={row.watched ? 'currentColor' : 'none'} /></button></td>
      <td className="sticky-col keyword-col" title={row.keyword}>{row.keyword}</td><td className="sticky-col translation-col" title={row.translation}>{row.translation || '—'}</td>
      {columns.map((column) => {
        if (column.type !== 'date') return <td key={`${row.keyword}-${column.key}`} className="matrix-placeholder" aria-label="折叠分组" />;
        const index = dateIndexMap.get(column.date);
        const value = values[index];
        const visibleValue = displayRank(value);
        const annotation = annotations[index] || '';
        const previous = index ? values[index - 1] : null;
        const isEditing = editingKey === `${row.keyword}|${column.date}`;
        return <td key={`${row.keyword}-${column.date}`} className={`${rankClass(value, previous)} matrix-annotation-cell matrix-rank-cell ${annotation ? 'matrix-annotated-cell' : ''} ${metric === 'sp' ? 'sp-annotation-cell' : ''} ${annotation ? 'sp-annotated-cell' : ''} ${column.date === selectedDate ? 'selected-date' : ''}`} data-rank={visibleValue} data-matrix-date={column.date} data-matrix-keyword={row.keyword} aria-label={rankTitle(value, previous, metric, annotation)} onClick={() => onBeginAnnotation(row, column.date, annotation)} onDoubleClick={() => onBeginAnnotation(row, column.date, annotation)}>{isEditing ? <input className="cell-annotation-input" autoFocus value={editing?.draft || ''} onChange={(event) => onEditDraft(event.target.value)} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onBlur={onCommitAnnotation} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onCommitAnnotation(); } if (event.key === 'Escape') { event.preventDefault(); onCancelAnnotation(); } }} aria-label={`编辑${row.keyword} ${column.date}标注`} /> : <span className="sp-rank-value">{visibleValue}</span>}</td>;
      })}
    </tr>
  );
}, (previous, next) => (
  previous.row === next.row
  && previous.columns === next.columns
  && previous.dateIndexMap === next.dateIndexMap
  && previous.valueField === next.valueField
  && previous.annotationField === next.annotationField
  && previous.metric === next.metric
  && previous.selectedDate === next.selectedDate
  && previous.editing?.keyword === next.editing?.keyword
  && previous.editing?.date === next.editing?.date
  && previous.editing?.draft === next.editing?.draft
));

// Matrix rows are deliberately virtualized without touching the date axis.
// The row height is fixed by the table CSS (34px content + 4px vertical
// padding/borders = 38px in the rendered table), so spacer rows can preserve
// the native scrollbar geometry while keeping only the viewport rows in DOM.
const MATRIX_ROW_HEIGHT = 38;
const MATRIX_ROW_OVERSCAN = 24;
const MATRIX_RANGE_MARGIN = 8;
const MATRIX_RANGE_CHUNK = 48;
const MATRIX_INITIAL_ROWS = 48;

export default function MatrixView({ model, metric, selectedDate, onToggleWatch, onSetAnnotation }) {
  const valueField = metric === 'natural' ? 'naturalValues' : 'spValues';
  const annotationField = metric === 'natural' ? 'naturalAnnotations' : 'spAnnotations';
  const rowCount = model.matrixRows?.length || 0;
  const [editing, setEditing] = useState(null);
  const tableRef = useRef(null);
  const scrollRef = useRef(null);
  const columnOverlayRef = useRef(null);
  const [virtualRange, setVirtualRange] = useState(() => ({ start: 0, end: Math.min(rowCount, MATRIX_INITIAL_ROWS) }));
  const virtualRangeRef = useRef(virtualRange);
  const defaults = useMemo(() => ({ star: 54, keyword: 250, translation: 180, date: 82 }), []);
  const { widths, nudgeWidth, startResize } = useColumnWidths(`keyword-tracker:columns:${metric}`, defaults);
  const [collapsedYears, setCollapsedYears] = useState(() => new Set());
  const [collapsedMonths, setCollapsedMonths] = useState(() => new Set());
  const [layoutAnimating, setLayoutAnimating] = useState(false);
  const animateLayout = () => {
    setLayoutAnimating(false);
    requestAnimationFrame(() => {
      setLayoutAnimating(true);
      window.setTimeout(() => setLayoutAnimating(false), 300);
    });
  };
  const groups = useMemo(() => {
    const byYear = new Map();
    (model.dates || []).forEach((date) => {
      const year = date.slice(0, 4); const month = date.slice(0, 7);
      if (!byYear.has(year)) byYear.set(year, new Map());
      if (!byYear.get(year).has(month)) byYear.get(year).set(month, []);
      byYear.get(year).get(month).push(date);
    });
    return [...byYear.entries()].map(([year, months]) => ({ year, months: [...months.entries()] }));
  }, [model.dates]);
  const columns = useMemo(() => {
    const next = [];
    groups.forEach(({ year, months }) => {
      if (collapsedYears.has(year)) { next.push({ type: 'year', key: year, year }); return; }
      months.forEach(([month, dates]) => {
        if (collapsedMonths.has(month)) next.push({ type: 'month', key: month, year, month });
        else dates.forEach((date) => next.push({ type: 'date', key: date, year, month, date }));
      });
    });
    return next;
  }, [groups, collapsedYears, collapsedMonths]);
  const dateIndexMap = useMemo(() => new Map((model.dates || []).map((date, index) => [date, index])), [model.dates]);
  const today = useMemo(() => localToday(), []);

  useEffect(() => {
    const next = { start: 0, end: Math.min(rowCount, MATRIX_INITIAL_ROWS) };
    virtualRangeRef.current = next;
    setVirtualRange(next);
    setEditing(null);
  }, [model.parentAsin, metric, rowCount]);

  // Scroll updates are throttled to one animation frame and only change the
  // range when a new row crosses the viewport.  This keeps wheel/trackpad
  // input off the full-table React tree while preserving a native scrollbar.
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return undefined;
    let frame = 0;
    const updateRange = () => {
      frame = 0;
      const firstVisible = Math.floor(Math.max(0, scroll.scrollTop - 102) / MATRIX_ROW_HEIGHT);
      const viewportCount = Math.ceil(scroll.clientHeight / MATRIX_ROW_HEIGHT) + 4;
      const current = virtualRangeRef.current;
      const viewportEnd = Math.min(rowCount, firstVisible + viewportCount);
      const safeStart = current.start === 0 ? 0 : current.start + MATRIX_RANGE_MARGIN;
      const safeEnd = current.end === rowCount ? rowCount : Math.max(current.start, current.end - MATRIX_RANGE_MARGIN);
      // Keep the existing window while the viewport is inside its buffered
      // region.  The previous implementation moved the window one row at a
      // time, which caused a table layout/paint pass for nearly every wheel
      // tick.  Re-centre in fixed chunks instead, preserving a generous
      // native-scroll buffer in both directions.
      if (firstVisible >= safeStart && viewportEnd <= safeEnd) return;
      const start = Math.min(rowCount, Math.max(0, Math.floor(Math.max(0, firstVisible - MATRIX_ROW_OVERSCAN) / MATRIX_RANGE_CHUNK) * MATRIX_RANGE_CHUNK));
      const end = Math.min(rowCount, Math.max(start + viewportCount + MATRIX_ROW_OVERSCAN * 2, viewportEnd + MATRIX_ROW_OVERSCAN));
      if (current.start === start && current.end === end) return;
      const next = { start, end };
      virtualRangeRef.current = next;
      setVirtualRange(next);
    };
    const handleScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateRange);
    };
    scroll.addEventListener('scroll', handleScroll, { passive: true });
    updateRange();
    return () => {
      scroll.removeEventListener('scroll', handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [rowCount, model.parentAsin, metric]);

  useEffect(() => {
    const table = tableRef.current;
    if (!table) return undefined;
    let active = null;
    const overlay = columnOverlayRef.current;
    const scroll = table.closest('.matrix-scroll');
    const clearColumnOverlay = () => {
      if (!overlay) return;
      overlay.hidden = true;
      overlay.style.left = '';
      overlay.style.width = '';
    };
    const clearHover = () => {
      if (!active) return;
      clearColumnOverlay();
      active = null;
    };
    const handleScroll = () => clearHover();
    const showColumnOverlay = (cell) => {
      if (!overlay || !cell) return;
      const tableRect = table.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      // The overlay is a sibling inside the scroll content. `tableRect` already
      // includes the scroll offset, so subtracting it from the rendered cell
      // position yields the table-content coordinate directly. Adding
      // scrollLeft here would double-count horizontal scrolling and place the
      // highlight to the right of the hovered column.
      overlay.style.left = `${Math.round(cellRect.left - tableRect.left)}px`;
      overlay.style.width = `${Math.round(cellRect.width)}px`;
      overlay.style.height = `${Math.max(table.offsetHeight, table.parentElement?.clientHeight || 0)}px`;
      overlay.hidden = false;
    };
    const handlePointerOver = (event) => {
      const cell = event.target.closest?.('td.matrix-rank-cell');
      if (!cell || !table.contains(cell)) return;
      if (active?.cell === cell) return;
      clearHover();
      showColumnOverlay(cell);
      active = { cell };
    };
    const handlePointerOut = (event) => {
      const next = event.relatedTarget;
      if (!(next instanceof Node) || !table.contains(next) || !next.closest?.('td.matrix-rank-cell')) clearHover();
    };
    table.addEventListener('pointerover', handlePointerOver);
    table.addEventListener('pointerout', handlePointerOut);
    scroll?.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      table.removeEventListener('pointerover', handlePointerOver);
      table.removeEventListener('pointerout', handlePointerOut);
      scroll?.removeEventListener('scroll', handleScroll);
      clearHover();
    };
  }, []);
  const columnCount = (year, month) => columns.filter((column) => column.year === year && (!month || column.month === month)).length || 1;
  const toggleYear = (year) => { animateLayout(); setCollapsedYears((current) => { const next = new Set(current); next.has(year) ? next.delete(year) : next.add(year); return next; }); };
  const toggleMonth = (month) => { animateLayout(); setCollapsedMonths((current) => { const next = new Set(current); next.has(month) ? next.delete(month) : next.add(month); return next; }); };
  const beginAnnotation = (row, date, existing = '') => {
    if (!date) return;
    setEditing({ keyword: row.keyword, date, draft: existing });
  };
  const commitAnnotation = async () => {
    if (!editing) return;
    const payload = { keyword: editing.keyword, date: editing.date, text: editing.draft.trim(), metric };
    const ok = await onSetAnnotation?.(payload);
    if (ok !== false) setEditing(null);
  };
  const widthStyle = (column) => ({ width: widths[column], minWidth: widths[column] });
  const resizeHandle = (column, label) => <ResizeHandle columnKey={column} onResize={startResize} onNudge={nudgeWidth} label={label} />;
  const stickyLayoutStyle = {
    '--sticky-keyword-left': `${widths.star}px`,
    '--sticky-translation-left': `${widths.star + widths.keyword}px`,
  };
  const visibleRows = (model.matrixRows || []).slice(virtualRange.start, virtualRange.end);
  const topSpacerHeight = virtualRange.start * MATRIX_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, rowCount - virtualRange.end) * MATRIX_ROW_HEIGHT;
  const renderSpacer = (height, key) => height > 0 ? (
    <tr key={key} className="matrix-virtual-spacer" aria-hidden="true">
      <td colSpan={columns.length + 3}><div style={{ height: `${height}px` }} /></td>
    </tr>
  ) : null;

  return (
    <section className="matrix-panel">
      <div className="matrix-note matrix-group-note"><span>{metric === 'natural' ? '自然矩阵' : 'SP矩阵'}：可按年份、月份收放</span><span>关键词为行、日期为列；0 表示未上榜。点击{metric === 'natural' ? '自然' : 'SP'}排名单元格添加标注，黑底白字表示已标注。</span><span><b className="legend-up">红色</b>=排名上升　<b className="legend-down">绿色</b>=排名下降　<b className="legend-none">灰色</b>=未上榜</span></div>
      <div ref={scrollRef} className="matrix-scroll">
        <div ref={columnOverlayRef} className="matrix-column-hover-overlay" hidden aria-hidden="true" />
        <table ref={tableRef} style={stickyLayoutStyle} className={`matrix-table matrix-group-table matrix-layout-transition ${layoutAnimating ? 'is-animating' : ''}`}>
          <colgroup>
            <col style={widthStyle('star')} /><col style={widthStyle('keyword')} /><col style={widthStyle('translation')} />
            {columns.map((column) => <col key={`width-${column.key}`} style={widthStyle('date')} />)}
          </colgroup>
          <thead>
            <tr className="matrix-year-row"><th className="sticky-col matrix-fixed-head" colSpan="3">年份</th>{groups.map(({ year }) => { const closed = collapsedYears.has(year); return <th key={year} colSpan={columnCount(year)} className="matrix-group-cell"><button type="button" onClick={() => toggleYear(year)} aria-expanded={!closed}><span className="group-chevron">{closed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>{year}年</button></th>; })}</tr>
            <tr className="matrix-month-row"><th className="sticky-col matrix-fixed-head" colSpan="3">月份</th>{groups.flatMap(({ year, months }) => collapsedYears.has(year) ? [<th key={`${year}-closed`} className="matrix-group-cell matrix-collapsed-label" aria-label="月份分组" />] : months.map(([month]) => { const closed = collapsedMonths.has(month); return <th key={month} colSpan={columnCount(year, month)} className="matrix-group-cell"><button type="button" onClick={() => toggleMonth(month)} aria-expanded={!closed}><span className="group-chevron">{closed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>{monthLabel(month)}</button></th>; }))}</tr>
            <tr><th className="sticky-col star-col" style={widthStyle('star')}>关注{resizeHandle('star', '关注')}</th><th className="sticky-col keyword-col" style={widthStyle('keyword')}>关键词{resizeHandle('keyword', '关键词')}</th><th className="sticky-col translation-col" style={widthStyle('translation')}>翻译{resizeHandle('translation', '翻译')}</th>{columns.map((column) => { const isDate = column.type === 'date'; const className = [!isDate ? 'matrix-placeholder-head' : '', column.date === selectedDate ? 'selected-date' : '', column.date === today ? 'is-today' : ''].filter(Boolean).join(' '); return <th key={column.key} style={widthStyle('date')} className={className} data-matrix-date={isDate ? column.date : undefined} aria-label={isDate ? `${column.date}${column.date === today ? '，今天' : ''}` : '折叠分组'}>{isDate ? <><span className="matrix-date-label">{shortDate(column.date)}</span>{column.date === today && <span className="matrix-today-dot" title="今天" aria-label="今天" />}</> : ''}{resizeHandle('date', '日期')}</th>; })}</tr>
          </thead>
          <tbody>{renderSpacer(topSpacerHeight, 'matrix-virtual-top')}{visibleRows.map((row) => <MatrixRow
            key={row.keyword}
            row={row}
            columns={columns}
            dateIndexMap={dateIndexMap}
            valueField={valueField}
            annotationField={annotationField}
            metric={metric}
            selectedDate={selectedDate}
            editing={editing}
            onToggleWatch={onToggleWatch}
            onBeginAnnotation={beginAnnotation}
            onEditDraft={(draft) => setEditing((current) => current ? { ...current, draft } : current)}
            onCommitAnnotation={commitAnnotation}
            onCancelAnnotation={() => setEditing(null)}
          />)}{renderSpacer(bottomSpacerHeight, 'matrix-virtual-bottom')}</tbody>
        </table>
      </div>
    </section>
  );
}
