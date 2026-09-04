import { useEffect, useMemo, useRef } from 'react';
import { Star } from 'lucide-react';
import { integer, rankClass, shortDate } from '../lib/format.js';
import { ResizeHandle, useColumnWidths } from '../lib/columnWidths.jsx';
import FilterCascade, {
  COMPARISON_FILTER_OPTIONS,
  EMPTY_FILTER,
  filterDates,
  filterRows,
  WATCH_FILTER_OPTIONS,
} from './FilterCascade.jsx';

function rankNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function pageMarker(value) {
  const rank = rankNumber(value);
  if (rank == null) return '—';
  if (rank <= 10) return '①';
  if (rank <= 20) return '②';
  if (rank <= 30) return '③';
  return '④+';
}

function pageText(value) {
  const rank = rankNumber(value);
  if (rank == null) return '未上榜';
  return rank <= 30 ? `第${Math.ceil(rank / 10)}页` : '第4页及以后';
}

function movementText(value, previous) {
  const currentRank = rankNumber(value);
  const previousRank = rankNumber(previous);
  if (currentRank == null) return '未上榜';
  if (previousRank == null) return '前一天未上榜，当前上榜';
  if (currentRank < previousRank) return '较前一天上升';
  if (currentRank > previousRank) return '较前一天下降';
  return '较前一天持平';
}

const CATEGORY_META = {
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

function RankCell({ value, previous, metric, date, selected }) {
  const currentRank = rankNumber(value);
  const className = rankClass(value, previous);
  const label = `${metric === 'natural' ? '自然' : 'SP'}排名 ${currentRank == null ? '未上榜' : integer(currentRank)}，${pageText(value)}，${movementText(value, previous)}`;
  return (
    <td
      className={`comparison-rank-cell ${className} ${selected ? 'selected-date' : ''}`}
      data-comparison-date={date}
      data-comparison-metric={metric}
      aria-label={label}
      title={label}
    >
      <span className="comparison-rank-number">{currentRank == null ? '—' : integer(currentRank)}</span>
      <small className="comparison-page-marker">{pageMarker(value)}</small>
    </td>
  );
}

function ComparisonSection({ category, rows, dates, dateIndexMap, comparisonDate, onToggleWatch, widths, resizeHandle, sectionRef }) {
  const meta = CATEGORY_META[category] || CATEGORY_META.common;
  return (
    <section ref={sectionRef} className={`comparison-section comparison-section-${category}`} data-comparison-section={category} aria-labelledby={`comparison-${category}-title`}>
      <div className="comparison-section-header">
        <div>
          <h2 id={`comparison-${category}-title`}>{meta.title}</h2>
          <span>{meta.subtitle} · {comparisonDate || '当前日期'} · 共 {rows.length} 个关键词</span>
        </div>
        <div className="comparison-section-legend"><span className="legend-up">红色＝排名上升</span><span className="legend-down">绿色＝排名下降</span></div>
      </div>
      {rows.length && dates.length ? (
        <div className="comparison-table-scroll">
          <table className="comparison-table" style={{ '--comparison-keyword-left': `${widths.star}px`, '--comparison-translation-left': `${widths.star + widths.keyword}px` }}>
            <colgroup>
              <col style={{ width: widths.star, minWidth: widths.star }} />
              <col style={{ width: widths.keyword, minWidth: widths.keyword }} />
              <col style={{ width: widths.translation, minWidth: widths.translation }} />
              {dates.flatMap((date) => [
                <col key={`${date}-natural`} style={{ width: widths.rank, minWidth: widths.rank }} />,
                <col key={`${date}-sp`} style={{ width: widths.rank, minWidth: widths.rank }} />,
              ])}
            </colgroup>
            <thead>
              <tr className="comparison-date-row">
                <th className="comparison-fixed-head comparison-star-head" rowSpan="2" style={{ width: widths.star, minWidth: widths.star }}>关注{resizeHandle('star', '关注')}</th>
                <th className="comparison-fixed-head comparison-keyword-head" rowSpan="2" style={{ width: widths.keyword, minWidth: widths.keyword }}>关键词{resizeHandle('keyword', '关键词')}</th>
                <th className="comparison-fixed-head comparison-translation-head" rowSpan="2" style={{ width: widths.translation, minWidth: widths.translation }}>翻译{resizeHandle('translation', '翻译')}</th>
                {dates.map((date) => <th key={date} colSpan="2" className={date === comparisonDate ? 'selected-date' : ''}>{shortDate(date)}</th>)}
              </tr>
              <tr className="comparison-metric-row">
                {dates.flatMap((date) => [
                  <th key={`${date}-natural`} className={date === comparisonDate ? 'selected-date' : ''}>自然{resizeHandle('rank', '自然排名')}</th>,
                  <th key={`${date}-sp`} className={date === comparisonDate ? 'selected-date' : ''}>SP{resizeHandle('rank', 'SP排名')}</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ row, order }) => (
                <tr key={`${category}-${row.keyword}-${order}`} className={row.watched ? 'watched-row' : ''}>
                  <td className="comparison-star-cell">
                    <button
                      type="button"
                      className={`star-button ${row.watched ? 'watched' : ''}`}
                      onClick={() => onToggleWatch?.(row.keyword, !row.watched, row.note)}
                      title={row.watched ? '取消关注' : '设为关注'}
                      aria-label={row.watched ? `取消关注 ${row.keyword}` : `关注 ${row.keyword}`}
                    ><Star size={18} fill={row.watched ? 'currentColor' : 'none'} /></button>
                  </td>
                  <td className="comparison-keyword-cell" title={row.keyword}>{row.keyword}</td>
                  <td className="comparison-translation-cell" title={row.translation}>{row.translation || '—'}</td>
                  {dates.flatMap((date) => {
                    const index = dateIndexMap.get(date);
                    const naturalValues = row.naturalValues || [];
                    const spValues = row.spValues || [];
                    const previousNatural = index > 0 ? naturalValues[index - 1] : null;
                    const previousSp = index > 0 ? spValues[index - 1] : null;
                    return [
                      <RankCell key={`${date}-natural`} value={naturalValues[index]} previous={previousNatural} metric="natural" date={date} selected={date === comparisonDate} />,
                      <RankCell key={`${date}-sp`} value={spValues[index]} previous={previousSp} metric="sp" date={date} selected={date === comparisonDate} />,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="comparison-empty">{dates.length ? meta.empty : '当前筛选范围没有可显示的日期。'}</div>}
    </section>
  );
}

export default function ComparisonMatrixView({ model, rows: visibleRows, filters, onFiltersChange, selectedDate, focusSection, onFocusHandled, onToggleWatch }) {
  const comparisonScrollRef = useRef(null);
  const sectionRefs = useRef({});
  const defaults = useMemo(() => ({ star: 54, keyword: 250, translation: 180, rank: 82 }), []);
  const { widths, nudgeWidth, startResize } = useColumnWidths('keyword-tracker:columns:comparison', defaults);
  const currentFilter = { ...EMPTY_FILTER, ...(filters || {}) };
  const sourceRows = useMemo(
    () => filterRows(Array.isArray(visibleRows) ? visibleRows : (model?.matrixRows || []), currentFilter),
    [visibleRows, model?.matrixRows, currentFilter.query, currentFilter.watch, currentFilter.keywords],
  );
  const allDates = model?.dates || [];
  const dates = useMemo(() => filterDates(allDates, currentFilter), [allDates, currentFilter.dateMode, currentFilter.dateStart, currentFilter.dateEnd]);
  const comparisonDate = dates.includes(selectedDate) ? selectedDate : dates.at(-1) || selectedDate || allDates.at(-1) || '';
  const dateIndexMap = useMemo(() => new Map(allDates.map((date, index) => [date, index])), [allDates]);
  const activeCategories = useMemo(() => {
    const requested = new Set(currentFilter.relations || []);
    const categoryOrder = ['natural', 'sp', ...COMPARISON_FILTER_OPTIONS.map((option) => option.value).filter((value) => value !== 'natural' && value !== 'sp')];
    return categoryOrder.filter((value) => requested.size ? requested.has(value) : value === 'natural' || value === 'sp');
  }, [currentFilter.relations]);
  const rowsByCategory = useMemo(() => Object.fromEntries(activeCategories.map((category) => [category, categoryRows(model, comparisonDate, category, sourceRows)])), [activeCategories, model, comparisonDate, sourceRows]);
  const dateAxisKey = dates.join('|');
  const resizeHandle = (column, label) => <ResizeHandle columnKey={column} onResize={startResize} onNudge={nudgeWidth} label={label} />;

  useEffect(() => {
    const scroll = comparisonScrollRef.current;
    if (!(scroll instanceof HTMLElement)) return undefined;
    let frame = 0;
    let attempts = 0;
    const align = () => {
      frame = 0;
      if (!scroll.isConnected) return;
      const tableScrolls = [...scroll.querySelectorAll('.comparison-table-scroll')];
      if ((!tableScrolls.length || !scroll.clientWidth || !scroll.clientHeight) && attempts++ < 18) {
        frame = window.requestAnimationFrame(align);
        return;
      }
      tableScrolls.forEach((tableScroll) => {
        tableScroll.scrollLeft = Math.max(0, tableScroll.scrollWidth - tableScroll.clientWidth);
      });
    };
    frame = window.requestAnimationFrame(() => { frame = window.requestAnimationFrame(align); });
    return () => { if (frame) window.cancelAnimationFrame(frame); };
  }, [model?.parentAsin, model?.latestDate, dateAxisKey, activeCategories.join('|')]);

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
    <section className="comparison-panel" data-comparison-matrix aria-labelledby="comparison-matrix-title">
      <div className="comparison-note">
        <div className="comparison-note-copy"><strong id="comparison-matrix-title">对比矩阵</strong><span>按当前日期筛选分类；每个日期下分别显示自然、SP排名。五类筛选同级，可多选。</span></div>
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
          label="筛选"
          placeholder="搜索对比关键词…"
        />
        <div className="comparison-note-legend"><span>排名数字越小越好</span><span>①/②/③＝第1/2/3页，④+＝第4页及以后</span></div>
      </div>
      <div ref={comparisonScrollRef} className="comparison-scroll">
        {activeCategories.map((category) => (
          <ComparisonSection
            key={category}
            category={category}
            rows={rowsByCategory[category] || []}
            dates={dates}
            dateIndexMap={dateIndexMap}
            comparisonDate={comparisonDate}
            onToggleWatch={onToggleWatch}
            widths={widths}
            resizeHandle={resizeHandle}
            sectionRef={(node) => { sectionRefs.current[category] = node; }}
          />
        ))}
      </div>
    </section>
  );
}
