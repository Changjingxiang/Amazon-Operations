import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Star, Maximize2, Minimize2 } from 'lucide-react';
import Sparkline from './Sparkline.jsx';
import KeywordTrendThumbnail from './KeywordTrendThumbnail.jsx';
import { integer, percent } from '../lib/format.js';
import { ResizeHandle, useColumnWidths } from '../lib/columnWidths.jsx';
import FilterCascade, { WATCH_FILTER_OPTIONS } from './FilterCascade.jsx';
import DashboardSort from './DashboardSort.jsx';
import { sortDashboardRows } from '../lib/dashboardSort.mjs';

function RankCell({ value, direction }) {
  const className = value == null ? 'rank-unranked' : direction === 'up' ? 'rank-up' : direction === 'down' ? 'rank-down' : 'rank-neutral';
  return <td className={className}>{value == null ? '未上榜' : integer(value)}</td>;
}

function keywordKey(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US');
}

function TrendPreview({ point, children }) {
  const ref = useRef(null);
  const [position, setPosition] = useState(point);
  useLayoutEffect(() => {
    const place = () => {
      const box = ref.current.getBoundingClientRect();
      const top = point.top + box.height <= innerHeight - 10 ? point.top : point.top - box.height - 28;
      setPosition({ left: Math.max(10, Math.min(point.left, innerWidth - box.width - 10)), top: Math.max(10, Math.min(top, innerHeight - box.height - 10)) });
    };
    place(); window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [point]);
  return <div ref={ref} className="keyword-trend-thumbnail-portal" style={position}>{children}</div>;
}

function previewPoint(event) {
  const box = event.currentTarget.getBoundingClientRect();
  return { left: (Number.isFinite(event.clientX) ? event.clientX : box.left) + 14, top: (Number.isFinite(event.clientY) ? event.clientY : box.bottom) + 14 };
}

export default function DashboardView({ rows, sourceRows, model, filters, onFiltersChange, onToggleWatch, onManage, onOpenTrend, onAI }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { const escape = (event) => { if (event.key === 'Escape' && !event.defaultPrevented) setExpanded(false); }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape); }, []);
  const [sortConditions, setSortConditions] = useState([]);
  const [hovered, setHovered] = useState(null);
  const defaults = useMemo(() => ({ star: 52, traffic: 72, keyword: 190, translation: 130, naturalTrend: 92, spTrend: 92, trafficShare: 105, naturalRank: 82, spRank: 82, weeklyAbaRank: 98, weeklySearchVolume: 98, status: 128 }), []);
  const { widths, nudgeWidth, startResize } = useColumnWidths('keyword-tracker:columns:dashboard', defaults);
  const sortedRows = useMemo(() => sortDashboardRows(rows, sortConditions), [rows, sortConditions]);

  useEffect(() => { setHovered(null); }, [model?.parentAsin, model?.selectedYear, rows]);

  const widthStyle = (column) => ({ width: widths[column], minWidth: widths[column] });
  const resizeHandle = (column, label) => <ResizeHandle columnKey={column} onResize={startResize} onNudge={nudgeWidth} label={label} />;
  const showTrend = (row, event) => setHovered({ keyword: row.keyword, style: previewPoint(event) });
  const updateTrend = (row, event) => { const point = previewPoint(event); setHovered((current) => current?.keyword === row.keyword ? { ...current, style: point } : current); };

  const content = (
    <section className={`dashboard-panel ${expanded ? 'dashboard-expanded' : ''}`}>
      <div className="table-toolbar"><button type="button" className="sort-button" aria-expanded={expanded} onClick={() => { setHovered(null); setExpanded(value => !value); }}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}{expanded ? '恢复看板' : '放大表格'}</button>
        <span>关注词置顶，其后保留完整流量前 1000</span>
        <FilterCascade
          rows={sourceRows || rows}
          filter={filters}
          onChange={onFiltersChange}
          groups={[{ key: 'watch', label: '关注状态', options: WATCH_FILTER_OPTIONS }]}
          label="筛选"
          placeholder="搜索看板关键词…"
        />
        <DashboardSort conditions={sortConditions} onChange={setSortConditions} />
        <button type="button" className="manage-watch-button" onClick={onManage}><Star size={17} fill="currentColor" />管理关注词</button>
      </div>
      <div className="dashboard-scroll">
        <table className="dashboard-table">
          <colgroup>{Object.keys(defaults).map((column) => <col key={column} style={widthStyle(column)} />)}</colgroup>
          <thead>
            <tr>
              <th style={widthStyle('star')}>关注{resizeHandle('star', '关注')}</th><th style={widthStyle('traffic')}>流量排名{resizeHandle('traffic', '流量排名')}</th><th style={widthStyle('keyword')}>关键词{resizeHandle('keyword', '关键词')}</th><th style={widthStyle('translation')}>翻译{resizeHandle('translation', '翻译')}</th><th style={widthStyle('naturalTrend')}>自然走势{resizeHandle('naturalTrend', '自然走势')}</th><th style={widthStyle('spTrend')}>SP走势{resizeHandle('spTrend', 'SP走势')}</th>
              <th style={widthStyle('trafficShare')}>父体流量占比{resizeHandle('trafficShare', '父体流量占比')}</th><th style={widthStyle('naturalRank')}>自然排名{resizeHandle('naturalRank', '自然排名')}</th><th style={widthStyle('spRank')}>SP排名{resizeHandle('spRank', 'SP排名')}</th><th style={widthStyle('weeklyAbaRank')}>周ABA排名{resizeHandle('weeklyAbaRank', '周ABA排名')}</th><th style={widthStyle('weeklySearchVolume')}>周搜索量{resizeHandle('weeklySearchVolume', '周搜索量')}</th><th style={widthStyle('status')}>状态{resizeHandle('status', '状态')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.keyword} className={row.watched ? 'watched-row' : ''}>
                <td>
                  <button
                    type="button"
                    className={`star-button ${row.watched ? 'watched' : ''}`} aria-pressed={row.watched} aria-busy={row.watchPending || undefined}
                    onClick={() => onToggleWatch(row.keyword, !row.watched, row.watchNote)}
                    title={row.watched ? '取消关注' : '设为关注'}
                  ><Star size={18} fill={row.watched ? 'currentColor' : 'none'} /></button>
                </td>
                <td>{row.trafficRank ?? '—'}</td>
                <td
                  className="keyword-cell"
                  data-keyword={row.keyword}
                  aria-label={`${row.keyword}，悬停查看 ABA 对照`}
                  onMouseEnter={(event) => showTrend(row, event)}
                  onMouseMove={(event) => updateTrend(row, event)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={(event) => showTrend(row, event)}
                  onBlur={() => setHovered(null)}
                  onDoubleClick={() => onOpenTrend?.(model.matrixRows?.find((item) => keywordKey(item.keyword) === keywordKey(row.keyword)) || row)}
                  tabIndex="0"
                >{onAI ? <><span className="ai-keyword-label">{row.keyword}</span><button className="ai-row-button" title={`AI 分析 ${row.keyword}`} onClick={e => { e.stopPropagation(); onAI(row.keyword); }}>AI</button></> : row.keyword}</td>
                <td title={row.translation}>{row.translation || '—'}</td>
                <td><Sparkline values={row.naturalTrend || []} /></td>
                <td><Sparkline values={row.spTrend || []} color="#FF6B6B" /></td>
                <td>{percent(row.trafficShare)}</td>
                <RankCell value={row.naturalRank} direction={row.naturalDirection} />
                <RankCell value={row.spRank} direction={row.spDirection} />
                <td>{integer(row.weeklyAbaRank)}</td>
                <td>{integer(row.weeklySearchVolume)}</td>
                <td className={row.status === '本日报表未出现' ? 'status-missing' : ''}>{row.status || '正常'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hovered && createPortal(
        <TrendPreview point={hovered.style}><KeywordTrendThumbnail model={model} keyword={hovered.keyword} onDoubleClick={() => onOpenTrend?.(model.matrixRows?.find((item) => keywordKey(item.keyword) === keywordKey(hovered.keyword)) || { keyword: hovered.keyword })} /></TrendPreview>,
        document.body,
      )}
    </section>
  );
  return expanded ? createPortal(content, document.body) : content;
}
