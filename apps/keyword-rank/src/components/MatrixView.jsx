import MatrixPeriodSelect, { filterPeriodDates } from './MatrixPeriodSelect.jsx';
import { createPortal } from 'react-dom';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, Star } from 'lucide-react';
import { buildSifAbaTrendMap, rankClass, shortDate } from '../lib/format.js';
import { ResizeHandle, useColumnWidths } from '../lib/columnWidths.jsx';
import AbaTrendPopover, { trendPopoverStyle } from './AbaTrendPopover.jsx';
import FilterCascade, { WATCH_FILTER_OPTIONS, filterDates } from './FilterCascade.jsx';
import AnnotationEditor from './AnnotationEditor.jsx';
import { reviewCore, EMPTY_REVIEWS } from '../lib/adReview.js';

function keywordKey(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US');
}

function monthLabel(monthKey) { return `${Number(monthKey.slice(5, 7))}月`; }

// The measured rank is always visible, including while its note is edited.
function displayRank(value) {
  return value == null || value === '' ? 0 : value;
}

function revealRankCell(cell) {
  const scroll = cell.closest('.matrix-scroll');
  if (!scroll) return;
  const rect = cell.getBoundingClientRect();
  const frozenRight = cell.parentElement.querySelector('.translation-col')?.getBoundingClientRect().right || scroll.getBoundingClientRect().left;
  if (rect.left < frozenRight) scroll.scrollLeft -= frozenRight - rect.left;
  else if (rect.right > scroll.getBoundingClientRect().right) scroll.scrollLeft += rect.right - scroll.getBoundingClientRect().right;
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
  const action = `点击${metric === 'natural' ? '自然' : 'SP'}排名单元格添加标注`;
  const movement = rankMovement(value, previous);
  const detail = annotation ? `标注：${annotation}` : action;
  return movement ? `${detail}；${movement}` : detail;
}

// Keep row identity stable while the virtual window advances. The parent still
// recalculates the small visible window, but rows that remain in that window do
// not rebuild every date cell or icon on each scroll tick.
const MatrixRow = memo(function MatrixRow({ row, reviewCells, columns, dateIndexMap, valueField, annotationField, metric, selectedDate, editing, pendingDates, savedDates, onToggleWatch, onBeginAnnotation, onAI }) {
  const values = row[valueField] || [];
  const annotations = annotationField ? (row[annotationField] || []) : [];
  const editingKey = editing ? `${editing.keyword}|${editing.date}` : '';
  return (
    <tr data-matrix-keyword={row.keyword} className={row.watched ? 'watched-row' : ''}>
      <td className="sticky-col star-col"><button type="button" className={`star-button ${row.watched ? 'watched' : ''}`} aria-pressed={row.watched} aria-busy={row.watchPending || undefined} title={row.watched ? '取消关注' : '设为关注'} onClick={() => onToggleWatch(row.keyword, !row.watched, row.note)}><Star size={18} fill={row.watched ? 'currentColor' : 'none'} /></button></td>
      <td
        className={`sticky-col keyword-col ${metric === 'natural' ? 'matrix-keyword-aba-cell' : ''}`}
        data-text-tooltip={metric === 'sp' ? row.keyword : undefined}
        data-matrix-keyword={row.keyword}
        aria-label={metric === 'natural' ? `${row.keyword}，悬停查看 ABA 对照` : undefined}
        tabIndex={metric === 'natural' ? 0 : undefined}
      >{onAI ? <><span className="ai-keyword-label">{row.keyword}</span><button className="ai-row-button" title={`AI 分析 ${row.keyword}`} onClick={e => { e.stopPropagation(); onAI(row.keyword); }}>AI</button></> : row.keyword}</td><td className="sticky-col translation-col" data-text-tooltip={row.translation}>{row.translation || '—'}</td>
      {columns.map((column) => {
        if (column.type !== 'date') return <td key={`${row.keyword}-${column.key}`} className="matrix-placeholder" aria-label="折叠分组" />;
        const index = dateIndexMap.get(column.date);
        const value = values[index];
        const visibleValue = displayRank(value);
        const annotation = annotations[index] || '';
        const review = reviewCells?.[reviewCore.key(row.keyword)]?.[column.date];
        const previous = index ? values[index - 1] : null;
        const isSaving = Boolean(pendingDates?.[column.date]);
        const isEditing = editingKey === `${row.keyword}|${column.date}`;
        const openEditor = (event) => { if (!isSaving && !isEditing) onBeginAnnotation(row, column.date, annotation, event.currentTarget, visibleValue); };
        return <td key={`${row.keyword}-${column.date}`} className={`${rankClass(value, previous)} matrix-annotation-cell matrix-rank-cell ${review?.accepted ? 'ad-review-accepted' : ''} ${isSaving ? 'annotation-saving' : ''} ${isEditing ? 'annotation-editing' : ''} ${annotation ? 'matrix-annotated-cell' : ''} ${metric === 'sp' ? 'sp-annotation-cell' : ''} ${annotation ? 'sp-annotated-cell' : ''} ${column.date === selectedDate ? 'selected-date' : ''}`}
          tabIndex={0} aria-haspopup="dialog" aria-expanded={isEditing} aria-busy={isSaving || undefined} data-rank={visibleValue} data-annotation={annotation} data-matrix-date={column.date} data-matrix-keyword={row.keyword} aria-label={rankTitle(value, previous, metric, annotation)} onFocus={(event) => revealRankCell(event.currentTarget)} onClick={openEditor} onDoubleClick={openEditor} data-ad-review={review ? "true" : undefined} data-ad-accepted={review?.accepted ? "true" : undefined}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEditor(event); } }}>
          <span className="sp-rank-value">{visibleValue}</span>
          {review && <span className="ad-review-corner" title="双击查看广告分析" />}
          {review?.accepted && <span className="ad-review-check" aria-label="已采纳">✓</span>}
          {annotation && <span className="annotation-corner" aria-hidden="true" />}
          {isSaving ? <span className="annotation-save-indicator" role="status" aria-label="正在保存标注" title="正在保存标注"><LoaderCircle size={12} className="spin" aria-hidden="true" /></span>
            : savedDates?.[column.date] && <span className="annotation-saved-indicator" role="status">已保存</span>}
        </td>;
      })}
    </tr>
  );
}, (previous, next) => (
  previous.row === next.row
  && previous.reviewCells === next.reviewCells
  && previous.columns === next.columns
  && previous.dateIndexMap === next.dateIndexMap
  && previous.valueField === next.valueField
  && previous.annotationField === next.annotationField
  && previous.pendingDates === next.pendingDates
  && previous.savedDates === next.savedDates
  && previous.metric === next.metric
  && previous.selectedDate === next.selectedDate
  && previous.editing?.keyword === next.editing?.keyword
  && previous.editing?.date === next.editing?.date
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

export default function MatrixView({ reviewState = EMPTY_REVIEWS, onAcceptReview, model, pendingAnnotationCells, metric, rows: filteredRows, filters, onFiltersChange, selectedDate, onToggleWatch, onSetAnnotation, onAI }) {
  const reviewEntries = useMemo(() => metric === 'natural' ? reviewCore.entries(reviewState, model) : [], [reviewState, model.parentAsin, model.legacyParentAsins, model.countryCode, model.kind, metric]);
  const reviewCells = useMemo(() => {
    const cells = Object.create(null);
    for (const entry of reviewEntries) {
      const date = reviewCore.anchor(entry.report, model.dates || []);
      if (!date) continue;
      const keyword = reviewCore.key(entry.item.keyword);
      cells[keyword] ||= Object.create(null);
      cells[keyword][date] ||= entry;
    }
    return cells;
  }, [reviewEntries, model.dates]);
  const valueField = metric === 'natural' ? 'naturalValues' : 'spValues';
  const annotationField = metric === 'natural' ? 'naturalAnnotations' : 'spAnnotations';
  const rows = Array.isArray(filteredRows) ? filteredRows : (model.matrixRows || []);
  const rowCount = rows.length;
  const [editing, setEditing] = useState(null);
  const [savedCells, setSavedCells] = useState({});
  const savedTimers = useRef(new Map());
  const saveScope = useRef(null);
  const [hovered, setHovered] = useState(null);
  const tableRef = useRef(null);
  const scrollRef = useRef(null);
  const columnOverlayRef = useRef(null);
  const [virtualRange, setVirtualRange] = useState(() => ({ start: 0, end: Math.min(rowCount, MATRIX_INITIAL_ROWS) }));
  const virtualRangeRef = useRef(virtualRange);
  const defaults = useMemo(() => ({ star: 54, keyword: 250, translation: 180, date: 82 }), []);
  const { widths, nudgeWidth, startResize } = useColumnWidths(`keyword-tracker:columns:${metric}`, defaults);
  const sifAbaTrendByKeyword = useMemo(
    () => metric === 'natural' ? buildSifAbaTrendMap(model) : new Map(),
    [model.historyRecords, model.selectedYear, metric],
  );
  const groups = useMemo(() => {
    const byYear = new Map();
    filterDates(filterPeriodDates(model.dates, filters), filters).forEach((date) => {
      const year = date.slice(0, 4); const month = date.slice(0, 7);
      if (!byYear.has(year)) byYear.set(year, new Map());
      if (!byYear.get(year).has(month)) byYear.get(year).set(month, []);
      byYear.get(year).get(month).push(date);
    });
    return [...byYear.entries()].map(([year, months]) => ({ year, months: [...months.entries()] }));
  }, [model.dates, filters?.dateMode, filters?.dateStart, filters?.dateEnd, filters?.matrixYear, filters?.matrixMonths]);
  const columns = useMemo(() => groups.flatMap(({ year, months }) => months.flatMap(([month, dates]) => dates.map(date => ({ type: 'date', key: date, year, month, date })))), [groups]);
  const dateIndexMap = useMemo(() => new Map((model.dates || []).map((date, index) => [date, index])), [model.dates]);
  const today = useMemo(() => localToday(), []);

  useEffect(() => {
    const scope = {};
    saveScope.current = scope;
    setSavedCells({});
    return () => {
      saveScope.current = null;
      savedTimers.current.forEach(clearTimeout);
      savedTimers.current.clear();
    };
  }, [model.parentAsin, metric]);

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
      const firstVisible = Math.floor(Math.max(0, scroll.scrollTop - 68) / MATRIX_ROW_HEIGHT);
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

  // The natural-matrix keyword uses the shared chart shell with a trend built
  // from each day's SIF snapshot.  Delegate the listeners from the table so
  // virtualized rows do not receive new callback props on every hover.
  useEffect(() => {
    const table = tableRef.current;
    if (!table || metric !== 'natural') return undefined;
    const scroll = scrollRef.current;
    const getKeywordCell = (target) => target?.closest?.('td.matrix-keyword-aba-cell');
    const showTrend = (event, cell) => {
      if (!cell || !table.contains(cell)) return;
      const keyword = cell.dataset.matrixKeyword || '';
      const row = sifAbaTrendByKeyword.get(keywordKey(keyword)) || { keyword };
      setHovered({ keyword, row, style: trendPopoverStyle(event, cell) });
    };
    const updateTrend = (event) => {
      const cell = getKeywordCell(event.target);
      if (!cell || !table.contains(cell)) return;
      const keyword = cell.dataset.matrixKeyword || '';
      setHovered((current) => current?.keyword === keyword
        ? { ...current, style: trendPopoverStyle(event, cell) }
        : current);
    };
    const handlePointerOver = (event) => {
      const cell = getKeywordCell(event.target);
      if (!cell || !table.contains(cell)) return;
      if (getKeywordCell(event.relatedTarget) === cell) return;
      showTrend(event, cell);
    };
    const handlePointerOut = (event) => {
      const cell = getKeywordCell(event.target);
      if (!cell || !table.contains(cell)) return;
      if (getKeywordCell(event.relatedTarget) === cell) return;
      setHovered(null);
    };
    const handleFocusIn = (event) => {
      const cell = getKeywordCell(event.target);
      if (cell) showTrend(event, cell);
    };
    const handleFocusOut = (event) => {
      const cell = getKeywordCell(event.target);
      if (!cell || getKeywordCell(event.relatedTarget) === cell) return;
      setHovered(null);
    };
    const handleScroll = () => setHovered(null);
    table.addEventListener('pointerover', handlePointerOver);
    table.addEventListener('pointermove', updateTrend);
    table.addEventListener('pointerout', handlePointerOut);
    table.addEventListener('focusin', handleFocusIn);
    table.addEventListener('focusout', handleFocusOut);
    scroll?.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      table.removeEventListener('pointerover', handlePointerOver);
      table.removeEventListener('pointermove', updateTrend);
      table.removeEventListener('pointerout', handlePointerOut);
      table.removeEventListener('focusin', handleFocusIn);
      table.removeEventListener('focusout', handleFocusOut);
      scroll?.removeEventListener('scroll', handleScroll);
      setHovered(null);
    };
  }, [sifAbaTrendByKeyword, metric]);

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
  const beginAnnotation = (row, date, existing = '', anchor, rank) => {
    if (!date) return;
    setHovered(null);
    setEditing({ keyword: row.keyword, date, original: existing, anchor, rank });
  };
  const commitAnnotation = async (draft) => {
    if (!editing) return;
    const target = editing;
    const scope = saveScope.current;
    setEditing(null);
    const text = draft.trim();
    if (text === target.original) return;
    const ok = await onSetAnnotation?.({ keyword: target.keyword, date: target.date, text, metric });
    if (!ok || !scope || saveScope.current !== scope) return;
    const key = JSON.stringify([target.keyword, target.date]);
    clearTimeout(savedTimers.current.get(key));
    setSavedCells((current) => ({ ...current, [target.keyword]: { ...current[target.keyword], [target.date]: true } }));
    savedTimers.current.set(key, setTimeout(() => {
      setSavedCells((current) => {
        const dates = { ...current[target.keyword] };
        delete dates[target.date];
        return { ...current, [target.keyword]: dates };
      });
      savedTimers.current.delete(key);
    }, 1500));
  };
  const widthStyle = (column) => ({ width: widths[column], minWidth: widths[column] });
  const resizeHandle = (column, label) => <ResizeHandle columnKey={column} onResize={startResize} onNudge={nudgeWidth} label={label} />;
  const stickyLayoutStyle = {
    '--sticky-keyword-left': `${widths.star}px`,
    '--sticky-translation-left': `${widths.star + widths.keyword}px`,
  };
  const visibleRows = rows.slice(virtualRange.start, virtualRange.end);
  const topSpacerHeight = virtualRange.start * MATRIX_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, rowCount - virtualRange.end) * MATRIX_ROW_HEIGHT;
  const renderSpacer = (height, key) => height > 0 ? (
    <tr key={key} className="matrix-virtual-spacer" aria-hidden="true">
      <td colSpan={columns.length + 3}><div style={{ height: `${height}px` }} /></td>
    </tr>
  ) : null;

  return (
    <section className="matrix-panel">
      <div className="matrix-note matrix-group-note">
        <div className="matrix-note-copy"><span>{metric === 'natural' ? '自然矩阵' : 'SP矩阵'}</span><span>关键词为行、日期为列；0 表示未上榜。点击排名添加标注，<i className="annotation-legend-corner" aria-hidden="true" />蓝色折角表示已标注。</span><span><b className="legend-up">红色</b>=排名上升　<b className="legend-down">绿色</b>=排名下降　<b className="legend-none">灰色</b>=未上榜</span></div>
        <FilterCascade
          rows={model.matrixRows || []}
          filter={filters}
          showDate
          dates={model.dates || []}
          onChange={onFiltersChange}
          groups={[{ key: 'watch', label: '关注状态', options: WATCH_FILTER_OPTIONS }]}
          label="筛选"
          placeholder="搜索矩阵关键词…"
        />
      </div>
      <MatrixPeriodSelect dates={model.dates || []} filter={filters} onChange={onFiltersChange} />
      <div ref={scrollRef} className="matrix-scroll">
        <div ref={columnOverlayRef} className="matrix-column-hover-overlay" hidden aria-hidden="true" />
        <table ref={tableRef} data-annotation-editor-open={editing ? 'true' : undefined} style={stickyLayoutStyle} className="matrix-table matrix-group-table matrix-clean-table">
          <colgroup>
            <col style={widthStyle('star')} /><col style={widthStyle('keyword')} /><col style={widthStyle('translation')} />
            {columns.map((column) => <col key={`width-${column.key}`} style={widthStyle('date')} />)}
          </colgroup>
          <thead>
            <tr className="matrix-month-row">
              <th rowSpan="2" className="sticky-col star-col">关注{resizeHandle('star', '关注')}</th>
              <th rowSpan="2" className="sticky-col keyword-col">关键词{resizeHandle('keyword', '关键词')}</th>
              <th rowSpan="2" className="sticky-col translation-col">翻译{resizeHandle('translation', '翻译')}</th>
              {groups.flatMap(({ months }) => months.map(([month, dates]) => <th key={month} colSpan={dates.length}>{monthLabel(month)}</th>))}
            </tr>
            <tr className="matrix-dates-row">{columns.map(column => <th key={column.date} data-matrix-date={column.date} className={column.date === selectedDate ? 'selected-date' : ''}><span>{shortDate(column.date)}</span>{column.date === today && <span className="matrix-today-dot" title="今天" />}{resizeHandle('date', '日期')}</th>)}</tr>
          </thead>
          <tbody>{renderSpacer(topSpacerHeight, 'matrix-virtual-top')}{visibleRows.map((row) => <MatrixRow
            key={row.keyword}
            row={row}
            reviewCells={reviewCells}
            columns={columns}
            dateIndexMap={dateIndexMap}
            valueField={valueField}
            annotationField={annotationField}
            metric={metric}
            selectedDate={selectedDate}
            editing={editing}
            pendingDates={pendingAnnotationCells?.[JSON.stringify([model.parentAsin, metric, row.keyword])]}
            savedDates={savedCells[row.keyword]}
            onToggleWatch={onToggleWatch}
            onBeginAnnotation={beginAnnotation}
            onAI={onAI}
          />)}{renderSpacer(bottomSpacerHeight, 'matrix-virtual-bottom')}</tbody>
        </table>
      </div>
      {!columns.length && <div className="matrix-period-empty">当前条件下没有日期，请选择月份或调整日期筛选。</div>}
      {editing && <AnnotationEditor key={`${editing.keyword}|${editing.date}`} editor={editing} metric={metric} reviewEntries={reviewEntries.filter(e => reviewCore.key(e.item.keyword) === reviewCore.key(editing.keyword))} onAcceptReview={onAcceptReview} onSave={commitAnnotation} onCancel={() => setEditing(null)} />}
      {hovered && createPortal(
        <AbaTrendPopover
          keyword={hovered.keyword}
          trend={hovered.row?.trend}
          previousTrend={hovered.row?.previousTrend}
          year={model?.selectedYear}
          previousYear={hovered.row?.previousYear}
          sourceLabelText="SIF源文件"
          fitToData
          showPointLabels={false}
          style={hovered.style}
        />,
        document.body,
      )}
    </section>
  );
}
