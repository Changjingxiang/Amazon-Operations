import { useEffect, useMemo, useRef } from 'react';
import { Star } from 'lucide-react';
import { integer, rankClass, shortDate } from '../lib/format.js';
import { ResizeHandle, useColumnWidths } from '../lib/columnWidths.jsx';

function rankNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function keywordKey(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US');
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

function leadingRows(model, selectedDate, lead, visibleRows) {
  const dates = model?.dates || [];
  if (!dates.length) return { rows: [], selectedIndex: -1 };
  const selectedIndex = Math.max(0, dates.indexOf(selectedDate) >= 0 ? dates.indexOf(selectedDate) : dates.length - 1);
  const visibleKeys = Array.isArray(visibleRows) ? new Set(visibleRows.map((row) => keywordKey(row?.keyword))) : null;
  const rows = (model.matrixRows || []).reduce((result, row, order) => {
    if (visibleKeys && !visibleKeys.has(keywordKey(row?.keyword))) return result;
    const natural = rankNumber(row?.naturalValues?.[selectedIndex]);
    const sp = rankNumber(row?.spValues?.[selectedIndex]);
    if (natural == null || sp == null) return result;
    const difference = lead === 'natural' ? sp - natural : natural - sp;
    if (difference <= 0) return result;
    result.push({ row, order, difference });
    return result;
  }, []);
  return { rows, selectedIndex };
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

function ComparisonSection({ lead, rows, dates, selectedDate, onToggleWatch, widths, resizeHandle, sectionRef }) {
  const title = lead === 'natural' ? '自然领先' : 'SP领先';
  const subtitle = lead === 'natural' ? '当前日期自然排名优于 SP 排名' : '当前日期 SP 排名优于自然排名';
  return (
    <section ref={sectionRef} className={`comparison-section comparison-section-${lead}`} data-comparison-section={lead} aria-labelledby={`comparison-${lead}-title`}>
      <div className="comparison-section-header">
        <div>
          <h2 id={`comparison-${lead}-title`}>{title}</h2>
          <span>{subtitle} · {selectedDate || '当前日期'} · 共 {rows.length} 个关键词</span>
        </div>
        <div className="comparison-section-legend"><span className="legend-up">红色＝排名上升</span><span className="legend-down">绿色＝排名下降</span></div>
      </div>
      {rows.length ? (
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
                {dates.map((date) => <th key={date} colSpan="2" className={date === selectedDate ? 'selected-date' : ''}>{shortDate(date)}</th>)}
              </tr>
              <tr className="comparison-metric-row">
                {dates.flatMap((date) => [
                  <th key={`${date}-natural`} className={date === selectedDate ? 'selected-date' : ''}>自然{resizeHandle('rank', '自然排名')}</th>,
                  <th key={`${date}-sp`} className={date === selectedDate ? 'selected-date' : ''}>SP{resizeHandle('rank', 'SP排名')}</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ row, order }) => (
                <tr key={`${lead}-${row.keyword}-${order}`} className={row.watched ? 'watched-row' : ''}>
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
                  {dates.flatMap((date, index) => [
                    <RankCell key={`${date}-natural`} value={row.naturalValues?.[index]} previous={index ? row.naturalValues?.[index - 1] : null} metric="natural" date={date} selected={date === selectedDate} />,
                    <RankCell key={`${date}-sp`} value={row.spValues?.[index]} previous={index ? row.spValues?.[index - 1] : null} metric="sp" date={date} selected={date === selectedDate} />,
                  ])}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="comparison-empty">当前日期没有符合条件的关键词。</div>}
    </section>
  );
}

export default function ComparisonMatrixView({ model, rows: visibleRows, selectedDate, focusSection, onFocusHandled, onToggleWatch }) {
  const naturalSectionRef = useRef(null);
  const spSectionRef = useRef(null);
  const comparisonScrollRef = useRef(null);
  const defaults = useMemo(() => ({ star: 54, keyword: 250, translation: 180, rank: 82 }), []);
  const { widths, nudgeWidth, startResize } = useColumnWidths('keyword-tracker:columns:comparison', defaults);
  const natural = useMemo(() => leadingRows(model, selectedDate, 'natural', visibleRows), [model, selectedDate, visibleRows]);
  const sp = useMemo(() => leadingRows(model, selectedDate, 'sp', visibleRows), [model, selectedDate, visibleRows]);
  const dates = model?.dates || [];
  const dateAxisKey = dates.join('|');
  const resizeHandle = (column, label) => <ResizeHandle columnKey={column} onResize={startResize} onNudge={nudgeWidth} label={label} />;

  // Match the natural/SP matrix opening behavior: keep the fixed identity
  // columns pinned on the left while the newest date is immediately visible
  // at the right edge of the horizontal scroller.  The retry frames wait for
  // table layout to settle after React mounts the two sections.
  useEffect(() => {
    const scroll = comparisonScrollRef.current;
    if (!(scroll instanceof HTMLElement)) return undefined;
    let frame = 0;
    let attempts = 0;
    const align = () => {
      frame = 0;
      if (!scroll.isConnected) return;
      const table = scroll.querySelector('.comparison-table');
      if ((!table || !scroll.clientWidth || !scroll.clientHeight) && attempts++ < 18) {
        frame = window.requestAnimationFrame(align);
        return;
      }
      scroll.scrollLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
    };
    frame = window.requestAnimationFrame(() => { frame = window.requestAnimationFrame(align); });
    return () => { if (frame) window.cancelAnimationFrame(frame); };
  }, [model?.parentAsin, model?.latestDate, dateAxisKey]);

  useEffect(() => {
    if (!focusSection) return undefined;
    const target = focusSection === 'sp' ? spSectionRef.current : naturalSectionRef.current;
    if (!target) return undefined;
    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
      onFocusHandled?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusSection, model?.parentAsin, selectedDate, onFocusHandled]);

  return (
    <section className="comparison-panel" data-comparison-matrix aria-labelledby="comparison-matrix-title">
      <div className="comparison-note">
        <div><strong id="comparison-matrix-title">对比矩阵</strong><span>按当前日期筛选自然领先和 SP 领先关键词；每个日期下分别显示自然、SP排名。</span></div>
        <div><span>排名数字越小越好</span><span>①/②/③＝第1/2/3页，④+＝第4页及以后</span></div>
      </div>
      <div ref={comparisonScrollRef} className="comparison-scroll">
        <ComparisonSection lead="natural" rows={natural.rows} dates={dates} selectedDate={selectedDate} onToggleWatch={onToggleWatch} widths={widths} resizeHandle={resizeHandle} sectionRef={naturalSectionRef} />
        <ComparisonSection lead="sp" rows={sp.rows} dates={dates} selectedDate={selectedDate} onToggleWatch={onToggleWatch} widths={widths} resizeHandle={resizeHandle} sectionRef={spSectionRef} />
      </div>
    </section>
  );
}
