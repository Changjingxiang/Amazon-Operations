import { ComparisonHoverProvider, ComparisonRankCell as RankCell } from './ComparisonRankCell.jsx';
import MatrixPeriodSelect, { filterPeriodDates } from './MatrixPeriodSelect.jsx';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Star, ChartNoAxesCombined, Maximize2, Minimize2 } from 'lucide-react';
import { shortDate } from '../lib/format.js';
import { ResizeHandle, useColumnWidths } from '../lib/columnWidths.jsx';
import FilterCascade, {
  COMPARISON_FILTER_OPTIONS,
  EMPTY_FILTER,
  filterDates,
  filterRows,
  WATCH_FILTER_OPTIONS,
} from './FilterCascade.jsx';
import { KeywordCopyButton, useMatrixKeywordCopy } from './MatrixKeywordCopy.jsx';
import { useMatrixTranslation } from '../lib/matrixPreferences.js';

function rankNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const CATEGORY_META = {
  all: { title: '全部关键词', subtitle: '未选择对比关系，合并显示全部关键词', empty: '当前筛选没有关键词。' },
  natural: {
    title: '自然领先',
    subtitle: '当前日期自然排名优于 SP 排名',
    empty: '当前日期没有自然领先的关键词。',
  },
  sp: {
    title: 'SP领先',
    subtitle: '当前日期 SP 排名优于自然排名',
    empty: '当前日期没有 SP 领先的关键词。',
  },
  'only-natural': {
    title: '仅自然上榜',
    subtitle: '当前日期有自然排名，SP 未上榜',
    empty: '当前日期没有仅自然上榜的关键词。',
  },
  'only-sp': {
    title: '仅SP上榜',
    subtitle: '当前日期有 SP 排名，自然未上榜',
    empty: '当前日期没有仅 SP 上榜的关键词。',
  },
  common: {
    title: '共同上榜',
    subtitle: '当前日期自然和 SP 均有排名（包含自然/SP领先）',
    empty: '当前日期没有共同上榜的关键词。',
  },
};

function inCategory(natural, sp, category) {
  if (category === 'natural') return natural != null && sp != null && natural < sp;
  if (category === 'sp') return natural != null && sp != null && sp < natural;
  if (category === 'only-natural') return natural != null && sp == null;
  if (category === 'only-sp') return natural == null && sp != null;
  if (category === 'common') return natural != null && sp != null;
  return false;
}

function categoryRows(model, comparisonDate, category, sourceRows) {
  if (category === 'all') return (sourceRows || []).map((row, order) => ({ row, order }));
  const dates = model?.dates || [];
  const selectedIndex = dates.indexOf(comparisonDate);
  if (selectedIndex < 0) return [];
  return (Array.isArray(sourceRows) ? sourceRows : []).reduce((result, row, order) => {
    const natural = rankNumber(row?.naturalValues?.[selectedIndex]);
    const sp = rankNumber(row?.spValues?.[selectedIndex]);
    if (inCategory(natural, sp, category)) result.push({ row, order });
    return result;
  }, []);
}

const COMPARISON_ROW_HEIGHT = 36;
const COMPARISON_ROW_OVERSCAN = 24;
const COMPARISON_RANGE_MARGIN = 8;
const COMPARISON_RANGE_CHUNK = 48;
const COMPARISON_INITIAL_ROWS = 48;
const COMPARISON_SECTION_HEADER_HEIGHT = 36;
const COMPARISON_TABLE_HEADER_HEIGHT = 66;

const ComparisonRow = memo(function ComparisonRow({ category, row, order, dates, allDates, dateIndexMap, comparisonDate, onToggleWatch, onOpenTrend, showTranslation, copyActive, copySelected, onToggleCopy, onConsumeCopyClick, copyCellHandlers }) {
  return (
    <tr key={`${category}-${row.keyword}-${order}`} className={row.watched ? 'watched-row' : ''}>
      <td className="comparison-star-cell">
        <button
          type="button"
          className={`star-button ${row.watched ? 'watched' : ''}`} aria-pressed={row.watched} aria-busy={row.watchPending || undefined}
          onClick={() => onToggleWatch?.(row.keyword, !row.watched, row.note)}
          title={row.watched ? '取消关注' : '设为关注'}
          aria-label={row.watched ? `取消关注 ${row.keyword}` : `关注 ${row.keyword}`}
        ><Star size={18} fill={row.watched ? 'currentColor' : 'none'} /></button>
      </td>
      <td
        className={`comparison-keyword-cell comparison-trend-keyword ${copyActive ? 'matrix-copy-selectable' : ''}`}
        data-copy-keyword={copyActive ? row.keyword : undefined}
        data-text-tooltip={copyActive ? '点击选择复制' : '点击趋势图标，或双击关键词查看趋势'}
        title={copyActive ? '点击选择复制' : '点击趋势图标，或双击关键词查看趋势'}
        tabIndex={copyActive ? 0 : undefined}
        {...(copyActive ? copyCellHandlers : {})}
        onKeyDown={copyActive ? (event) => { if (event.key === ' ') { event.preventDefault(); onToggleCopy(row.keyword); } } : undefined}
        onDoubleClick={copyActive ? undefined : () => onOpenTrend?.(row, category)}
      >{copyActive && <KeywordCopyButton keyword={row.keyword} selected={copySelected} onToggle={onToggleCopy} onConsumeClick={onConsumeCopyClick} />}<span className="comparison-keyword-text" title={row.keyword}>{row.keyword}</span>{!copyActive && <button type="button" className="comparison-trend-button" data-trend-keyword={row.keyword} aria-label={`查看 ${row.keyword} 趋势`} title="查看趋势" onDoubleClick={(event) => event.stopPropagation()} onClick={() => onOpenTrend?.(row, category)}><ChartNoAxesCombined size={16} /></button>}</td>
      {showTranslation && <td className="comparison-translation-cell" data-text-tooltip={row.translation}>{row.translation || '—'}</td>}
      {dates.flatMap((date) => {
        const index = dateIndexMap.get(date);
        const naturalValues = row.naturalValues || [];
        const spValues = row.spValues || [];
        const previousNatural = index > 0 ? naturalValues[index - 1] : null;
        const previousSp = index > 0 ? spValues[index - 1] : null;
        return [
          <RankCell key={`${date}-natural`} value={naturalValues[index]} previous={previousNatural} row={row} index={index} previousDate={allDates[index - 1]} metric="natural" date={date} selected={date === comparisonDate} />,
          <RankCell key={`${date}-sp`} value={spValues[index]} previous={previousSp} row={row} index={index} previousDate={allDates[index - 1]} metric="sp" date={date} selected={date === comparisonDate} />,
        ];
      })}
    </tr>
  );
});

function ComparisonSection({ category, rows, dates, allDates, dateIndexMap, comparisonDate, onToggleWatch, onOpenTrend, widths, resizeHandle, sectionRef, scrollContainerRef, showTranslation, copy }) {
  const meta = CATEGORY_META[category] || CATEGORY_META.common;
  const sectionElementRef = useRef(null);
  const [virtualRange, setVirtualRange] = useState(() => ({ start: 0, end: Math.min(rows.length, COMPARISON_INITIAL_ROWS) }));
  const virtualRangeRef = useRef(virtualRange);
  const rowCount = rows.length;

  useEffect(() => {
    const next = { start: 0, end: Math.min(rowCount, COMPARISON_INITIAL_ROWS) };
    virtualRangeRef.current = next;
    setVirtualRange(next);
  }, [category, rowCount, dates.length]);

  useEffect(() => {
    const scroll = scrollContainerRef?.current;
    const section = sectionElementRef.current;
    if (!(scroll instanceof HTMLElement) || !(section instanceof HTMLElement)) return undefined;
    let frame = 0;
    const updateRange = () => {
      frame = 0;
      if (!section.isConnected || !rowCount) return;
      const containerRect = scroll.getBoundingClientRect();
      const sectionRect = section.getBoundingClientRect();
      const sectionTop = sectionRect.top - containerRect.top + scroll.scrollTop;
      const bodyTop = sectionTop + (category === 'all' ? 0 : COMPARISON_SECTION_HEADER_HEIGHT) + COMPARISON_TABLE_HEADER_HEIGHT;
      const firstVisible = Math.floor(Math.max(0, scroll.scrollTop - bodyTop) / COMPARISON_ROW_HEIGHT);
      const viewportCount = Math.ceil(scroll.clientHeight / COMPARISON_ROW_HEIGHT) + 4;
      const viewportEnd = Math.min(rowCount, firstVisible + viewportCount);
      const current = virtualRangeRef.current;
      const safeStart = current.start === 0 ? 0 : current.start + COMPARISON_RANGE_MARGIN;
      const safeEnd = current.end === rowCount ? rowCount : Math.max(current.start, current.end - COMPARISON_RANGE_MARGIN);
      if (firstVisible >= safeStart && viewportEnd <= safeEnd) return;
      const start = Math.min(rowCount, Math.max(0, Math.floor(Math.max(0, firstVisible - COMPARISON_ROW_OVERSCAN) / COMPARISON_RANGE_CHUNK) * COMPARISON_RANGE_CHUNK));
      const end = Math.min(rowCount, Math.max(start + viewportCount + COMPARISON_ROW_OVERSCAN * 2, viewportEnd + COMPARISON_ROW_OVERSCAN));
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
  }, [category, rowCount, scrollContainerRef]);

  const visibleRows = rows.slice(virtualRange.start, virtualRange.end);
  const topSpacerHeight = virtualRange.start * COMPARISON_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, rowCount - virtualRange.end) * COMPARISON_ROW_HEIGHT;
  const renderSpacer = (height, key) => height > 0 ? (
    <tr key={key} className="comparison-virtual-spacer" aria-hidden="true">
      <td colSpan={dates.length * 2 + (showTranslation ? 3 : 2)}><div style={{ height: `${height}px` }} /></td>
    </tr>
  ) : null;

  return (
    <section ref={(node) => { sectionElementRef.current = node; sectionRef?.(node); }} className={`comparison-section comparison-section-${category}`} data-comparison-section={category} aria-labelledby={`comparison-${category}-title`}>
      <div className="comparison-section-header">
        <div>
          <h2 id={`comparison-${category}-title`}>{meta.title}</h2>
          <span title={meta.subtitle}>基准 {comparisonDate || '无日期'} · {rows.length} 个关键词</span>
        </div>
      </div>
      {rows.length && dates.length ? (
        <div className="comparison-table-scroll">
          <table className="comparison-table" style={{ width: `${widths.star + widths.keyword + (showTranslation ? widths.translation : 0) + dates.length * 2 * widths.rank}px`, minWidth: `${widths.star + widths.keyword + (showTranslation ? widths.translation : 0) + dates.length * 2 * widths.rank}px`, '--comparison-keyword-left': `${widths.star}px`, '--comparison-translation-left': `${widths.star + widths.keyword}px`, '--comparison-star-width': `${widths.star}px`, '--comparison-keyword-width': `${widths.keyword}px`, '--comparison-translation-width': `${widths.translation}px`, '--comparison-rank-width': `${widths.rank}px` }}>
            <colgroup>
              <col style={{ width: widths.star, minWidth: widths.star }} />
              <col style={{ width: widths.keyword, minWidth: widths.keyword }} />
              {showTranslation && <col style={{ width: widths.translation, minWidth: widths.translation }} />}
              {dates.flatMap((date) => [
                <col key={`${date}-natural`} style={{ width: widths.rank, minWidth: widths.rank }} />,
                <col key={`${date}-sp`} style={{ width: widths.rank, minWidth: widths.rank }} />,
              ])}
            </colgroup>
            <thead>
              <tr className="comparison-date-row">
                <th className="comparison-fixed-head comparison-star-head" rowSpan="2" style={{ width: widths.star, minWidth: widths.star }}>关注{resizeHandle('star', '关注')}</th>
                <th className="comparison-fixed-head comparison-keyword-head" rowSpan="2" style={{ width: widths.keyword, minWidth: widths.keyword }}>关键词{resizeHandle('keyword', '关键词')}</th>
                {showTranslation && <th className="comparison-fixed-head comparison-translation-head" rowSpan="2" style={{ width: widths.translation, minWidth: widths.translation }}>翻译{resizeHandle('translation', '翻译')}</th>}
                {dates.map((date) => <th key={date} colSpan="2" className={date === comparisonDate ? 'selected-date' : ''}>{shortDate(date)}</th>)}
              </tr>
              <tr className="comparison-metric-row">
                {dates.flatMap((date) => [
                  <th key={`${date}-natural`} className={`comparison-natural-head ${date === comparisonDate ? 'selected-date' : ''}`}>自然{resizeHandle('rank', '自然排名')}</th>,
                  <th key={`${date}-sp`} className={`comparison-sp-head ${date === comparisonDate ? 'selected-date' : ''}`}>SP{resizeHandle('rank', 'SP排名')}</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {renderSpacer(topSpacerHeight, 'comparison-virtual-top')}
              {visibleRows.map(({ row, order }) => <ComparisonRow key={`${category}-${row.keyword}-${order}`} category={category} row={row} order={order} dates={dates} allDates={allDates} dateIndexMap={dateIndexMap} comparisonDate={comparisonDate} onToggleWatch={onToggleWatch} onOpenTrend={onOpenTrend} showTranslation={showTranslation} copyActive={copy.active} copySelected={copy.isSelected(row.keyword)} onToggleCopy={copy.toggleKeyword} onConsumeCopyClick={copy.consumePointerClick} copyCellHandlers={copy.cellHandlers} />)}
              {renderSpacer(bottomSpacerHeight, 'comparison-virtual-bottom')}
            </tbody>
          </table>
        </div>
      ) : <div className="comparison-empty">{dates.length ? meta.empty : '当前筛选范围没有可显示的日期。'}</div>}
    </section>
  );
}

export default function ComparisonMatrixView({ model, rows: visibleRows, filters, onFiltersChange, selectedDate, focusSection, onFocusHandled, onToggleWatch, onOpenTrend, restoreScroll, focused, onFocusToggle, onDisplayCount }) {
  const { showTranslation, toggleTranslation } = useMatrixTranslation();
  const copy = useMatrixKeywordCopy(model?.parentAsin);
  const comparisonScrollRef = useRef(null);
  const dateScrollbarRef = useRef(null);
  const [dateScrollWidth, setDateScrollWidth] = useState(0);
  const sectionRefs = useRef({});
  const defaults = useMemo(() => ({ star: 54, keyword: 250, translation: 180, rank: 82 }), []);
  const minimums = useMemo(() => ({ star: 48, keyword: 160, translation: 96, rank: 64 }), []);
  const { widths, nudgeWidth, startResize } = useColumnWidths('keyword-tracker:columns:comparison', defaults, minimums);
  const currentFilter = { ...EMPTY_FILTER, ...(filters || {}) };
  const sourceRows = useMemo(
    () => filterRows(Array.isArray(visibleRows) ? visibleRows : (model?.matrixRows || []), currentFilter),
    [visibleRows, model?.matrixRows, currentFilter.query, currentFilter.watch, currentFilter.keywords],
  );
  const allDates = model?.dates || [];
  const dates = useMemo(() => filterDates(filterPeriodDates(allDates, currentFilter), currentFilter), [allDates, currentFilter.dateMode, currentFilter.dateStart, currentFilter.dateEnd, currentFilter.matrixYear, currentFilter.matrixMonths]);
  const comparisonDate = dates.includes(selectedDate) ? selectedDate : dates.at(-1) || selectedDate || allDates.at(-1) || '';
  const dateIndexMap = useMemo(() => new Map(allDates.map((date, index) => [date, index])), [allDates]);
  const activeCategories = useMemo(() => {
    const requested = new Set(currentFilter.relations || []);
    const categoryOrder = ['natural', 'sp', ...COMPARISON_FILTER_OPTIONS.map((option) => option.value).filter((value) => value !== 'natural' && value !== 'sp')];
    return requested.size ? categoryOrder.filter((value) => requested.has(value)) : ['all'];
  }, [currentFilter.relations]);
  const rowsByCategory = useMemo(() => Object.fromEntries(activeCategories.map((category) => [category, categoryRows(model, comparisonDate, category, sourceRows)])), [activeCategories, model, comparisonDate, sourceRows]);
  const categoryCounts = useMemo(() => Object.fromEntries(COMPARISON_FILTER_OPTIONS.map(({ value }) => [value, dates.length ? categoryRows(model, comparisonDate, value, sourceRows).length : 0])), [model, comparisonDate, sourceRows, dates.length]);
  const displayedCount = useMemo(() => dates.length ? new Set(Object.values(rowsByCategory).flat().map(({ row }) => row.keyword)).size : 0, [rowsByCategory, dates.length]);
  useEffect(() => { onDisplayCount?.(displayedCount); }, [displayedCount, onDisplayCount]);
  const dateAxisKey = dates.join('|');
  const resizeHandle = (column, label) => <ResizeHandle columnKey={column} onResize={startResize} onNudge={nudgeWidth} label={label} />;

  useEffect(() => {
    const scroll = comparisonScrollRef.current;
    if (!(scroll instanceof HTMLElement)) return undefined;
    let frame = 0;
    let attempts = 0;
    const targetTop = restoreScroll?.top;
    const targetLeft = restoreScroll?.left;
    const align = () => {
      frame = 0;
      if (!scroll.isConnected) return;
      const tableScrolls = [...scroll.querySelectorAll('.comparison-table-scroll')];
      if ((!tableScrolls.length || !scroll.clientWidth || !scroll.clientHeight) && attempts++ < 24) {
        frame = window.requestAnimationFrame(align);
        return;
      }
      tableScrolls.forEach((tableScroll) => {
        tableScroll.scrollLeft = targetLeft ?? Math.max(0, tableScroll.scrollWidth - tableScroll.clientWidth);
      });
      if (targetTop != null) {
        scroll.scrollTop = targetTop;
        // Virtual rows update over the next few frames; keep the saved position
        // until the table's spacer heights have settled.
        if (attempts++ < 18) frame = window.requestAnimationFrame(align);
        else if (restoreScroll?.keyword) {
          const section = [...scroll.querySelectorAll('[data-comparison-section]')].find((node) => node.dataset.comparisonSection === restoreScroll.category) || scroll;
          [...section.querySelectorAll('[data-trend-keyword]')].find((node) => node.dataset.trendKeyword === restoreScroll.keyword)?.focus({ preventScroll: true });
        }
      }
    };
    frame = window.requestAnimationFrame(() => { frame = window.requestAnimationFrame(align); });
    const resize = new ResizeObserver(() => {
      if (restoreScroll?.left == null) scroll.querySelectorAll('.comparison-table-scroll').forEach((node) => { node.scrollLeft = node.scrollWidth - node.clientWidth; });
    });
    resize.observe(scroll);
    return () => { resize.disconnect(); if (frame) window.cancelAnimationFrame(frame); };
  }, [model?.parentAsin, model?.latestDate, dateAxisKey, activeCategories.join('|'), restoreScroll?.left, restoreScroll?.top, showTranslation]);

  // Keep date navigation visible at the panel bottom, even with virtualized rows.
  useEffect(() => {
    const container = comparisonScrollRef.current;
    const scrollbar = dateScrollbarRef.current;
    if (!container || !scrollbar) return undefined;
    const tables = [...container.querySelectorAll('.comparison-table-scroll')];
    const sync = (left) => {
      for (const node of [...tables, scrollbar]) {
        if (Math.abs(node.scrollLeft - left) > 1) node.scrollLeft = left;
      }
    };
    const measure = () => {
      const maximum = Math.max(0, ...tables.map((node) => node.scrollWidth - node.clientWidth));
      const width = maximum > 0 ? scrollbar.clientWidth + maximum : 0;
      // Update the spacer before scrollLeft so the browser can clamp correctly.
      if (scrollbar.firstElementChild) scrollbar.firstElementChild.style.width = `${width}px`;
      setDateScrollWidth(width);
      sync(tables[0]?.scrollLeft || 0);
    };
    const onScroll = (event) => {
      if (event.target === scrollbar || tables.includes(event.target)) sync(event.target.scrollLeft);
    };
    container.addEventListener('scroll', onScroll, true);
    scrollbar.addEventListener('scroll', onScroll, { passive: true });
    const resize = new ResizeObserver(measure);
    resize.observe(container);
    for (const node of tables) {
      resize.observe(node);
      if (node.firstElementChild) resize.observe(node.firstElementChild);
    }
    const frame = window.requestAnimationFrame(measure);
    return () => {
      window.cancelAnimationFrame(frame);
      resize.disconnect();
      container.removeEventListener('scroll', onScroll, true);
      scrollbar.removeEventListener('scroll', onScroll);
    };
  }, [dateAxisKey, activeCategories.join('|'), model?.parentAsin, showTranslation, widths, displayedCount]);

  useEffect(() => {
    if (!focusSection) return undefined;
    const target = sectionRefs.current[focusSection];
    if (!target) return undefined;
    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
      onFocusHandled?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusSection, model?.parentAsin, comparisonDate, activeCategories.join('|'), onFocusHandled]);

  return (
    <ComparisonHoverProvider resetKey={`${model?.parentAsin}|${dateAxisKey}|${activeCategories.join()}|${currentFilter.query}|${currentFilter.watch}`} >
    <section className="comparison-panel" data-comparison-matrix aria-labelledby="comparison-matrix-title">
      <div className="comparison-note">
        <div className="comparison-note-copy"><strong id="comparison-matrix-title" title="排名越小越好；P 为导入排名详情中的页码。红↑上升，绿↓下降，比较上一条日期记录。蓝色折角表示有标注，悬停查看。">对比矩阵</strong>{focused && <span title={model?.modelName}>{model?.modelName}</span>}</div>
        <FilterCascade
          rows={model?.matrixRows || []}
          filter={currentFilter}
          onChange={onFiltersChange}
          groups={[
            { key: 'watch', label: '关注状态', options: WATCH_FILTER_OPTIONS },
            { key: 'relations', label: '对比关系', options: COMPARISON_FILTER_OPTIONS },
          ]}
          dates={allDates}
          showDate
          dateScopeHint="日期条件与所选年份、月份共同生效；关系可多选，分组中的关键词可能重复。"
          label="高级筛选"
          placeholder="搜索对比关键词…"
        />
        <div className="comparison-view-actions">{copy.controls}<button type="button" aria-pressed={!showTranslation} onClick={toggleTranslation}>{showTranslation ? '收起翻译' : '显示翻译'}</button><button type="button" aria-pressed={focused} onClick={onFocusToggle}>{focused ? <Minimize2 size={15} /> : <Maximize2 size={15} />}{focused ? '退出专注' : '专注矩阵'}</button></div>
      </div>
      <div className="comparison-period-bar">
        <MatrixPeriodSelect dates={allDates} filter={currentFilter} onChange={onFiltersChange} />
        <div className={`comparison-date-scope ${dates.length && comparisonDate !== selectedDate ? 'is-fallback' : ''}`} role="status">
          <strong>分组基准：{dates.length ? comparisonDate : '无可用日期'}</strong>
          <span>{dates.length ? `展示 ${dates[0]} 至 ${dates.at(-1)} · ${dates.length} 天` : '当前日期条件没有交集'}</span>
          {dates.length > 0 && comparisonDate !== selectedDate && <span>摘要日 {selectedDate} 不在展示区间，分组使用区间末日</span>}
        </div>
      </div>
      <div className="comparison-quick-filters" role="group" aria-label="快捷对比关系">
        <button type="button" aria-pressed={!currentFilter.relations.length} onClick={() => onFiltersChange({ ...currentFilter, relations: [] })}>全部 <b>{dates.length ? sourceRows.length : 0}</b></button>
        {COMPARISON_FILTER_OPTIONS.map(({ value, label }) => <button key={value} type="button" aria-pressed={currentFilter.relations.includes(value)} onClick={() => onFiltersChange({ ...currentFilter, relations: currentFilter.relations.includes(value) ? currentFilter.relations.filter((item) => item !== value) : [...currentFilter.relations, value] })}>{label} <b>{categoryCounts[value]}</b></button>)}
        <span>显示 {displayedCount} / 历史 {model?.matrixRows?.length || 0}{activeCategories.length > 1 ? ' · 多组选词已去重计数' : ''}</span>
      </div>
      <div ref={comparisonScrollRef} className="comparison-scroll">
        {activeCategories.map((category) => (
          <ComparisonSection
            key={category}
            category={category}
            rows={rowsByCategory[category] || []}
            dates={dates}
            allDates={allDates}
            dateIndexMap={dateIndexMap}
            comparisonDate={comparisonDate}
            onToggleWatch={onToggleWatch}
            onOpenTrend={onOpenTrend}
            widths={widths}
            showTranslation={showTranslation}
            copy={copy}
            resizeHandle={resizeHandle}
            scrollContainerRef={comparisonScrollRef}
            sectionRef={(node) => { sectionRefs.current[category] = node; }}
          />
        ))}
      </div>
      <div ref={dateScrollbarRef} className="comparison-date-scrollbar" role="region" aria-label="横向滚动查看日期" tabIndex={0} style={{ visibility: dateScrollWidth ? 'visible' : 'hidden' }}>
        <div style={{ width: dateScrollWidth, height: 1 }} />
      </div>
    </section>
    </ComparisonHoverProvider>
  );
}
