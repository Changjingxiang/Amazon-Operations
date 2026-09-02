import { useMemo, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, Star } from 'lucide-react';
import Sparkline from './Sparkline.jsx';
import { integer, percent } from '../lib/format.js';
import { ResizeHandle, useColumnWidths } from '../lib/columnWidths.jsx';

function RankCell({ value, direction }) {
  const className = value == null ? 'rank-unranked' : direction === 'up' ? 'rank-up' : direction === 'down' ? 'rank-down' : 'rank-neutral';
  return <td className={className}>{value == null ? '未上榜' : integer(value)}</td>;
}

export default function DashboardView({ rows, onToggleWatch, onManage }) {
  const [sort, setSort] = useState({ field: null, direction: 'asc' });
  const defaults = useMemo(() => ({ star: 52, traffic: 72, keyword: 190, translation: 130, naturalTrend: 92, spTrend: 92, trafficShare: 105, naturalRank: 82, spRank: 82, weeklyAbaRank: 98, weeklySearchVolume: 98, status: 128 }), []);
  const { widths, nudgeWidth, startResize } = useColumnWidths('keyword-tracker:columns:dashboard', defaults);
  const sortedRows = useMemo(() => {
    if (!sort.field) return rows;
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      // Pin关注词 first, preserving the explicit order from the watch drawer.
      // Do this before comparing the selected metric so asc/desc never moves a
      // watched row below an ordinary traffic row.
      if (Boolean(a.watched) !== Boolean(b.watched)) return a.watched ? -1 : 1;
      if (a.watched && b.watched) {
        const orderDiff = (a.watchOrder ?? Number.MAX_SAFE_INTEGER) - (b.watchOrder ?? Number.MAX_SAFE_INTEGER);
        if (orderDiff !== 0) return orderDiff;
      }
      const av = a[sort.field];
      const bv = b[sort.field];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const valueDiff = (Number(av) - Number(bv)) * direction;
      if (valueDiff !== 0) return valueDiff;
      // A deterministic tie-break makes repeated toggles predictable without
      // changing the requested metric ordering.
      return String(a.keyword || '').localeCompare(String(b.keyword || ''), 'en', { sensitivity: 'base' });
    });
  }, [rows, sort]);

  const chooseSort = (field, direction) => setSort({ field, direction });
  const widthStyle = (column) => ({ width: widths[column], minWidth: widths[column] });
  const resizeHandle = (column, label) => <ResizeHandle columnKey={column} onResize={startResize} onNudge={nudgeWidth} label={label} />;
  const sortButton = (field, direction, label, Icon) => (
    <button
      type="button"
      className={`sort-button ${sort.field === field && sort.direction === direction ? 'active' : ''}`}
      onClick={() => chooseSort(field, direction)}
      aria-label={`${label}${direction === 'asc' ? '升序' : '降序'}`}
      title={`${label}${direction === 'asc' ? '升序' : '降序'}`}
    ><Icon size={14} />{label}{direction === 'asc' ? '升' : '降'}</button>
  );

  return (
    <section className="dashboard-panel">
      <div className="table-toolbar">
        <span>关注词置顶，其后保留完整流量前 100</span>
        <div className="sort-controls" aria-label="看板排序">
          <span className="sort-label">排序</span>
          {sortButton('weeklyAbaRank', 'asc', '周ABA', ArrowUpAZ)}
          {sortButton('weeklyAbaRank', 'desc', '周ABA', ArrowDownAZ)}
          {sortButton('weeklySearchVolume', 'asc', '周搜索量', ArrowUpAZ)}
          {sortButton('weeklySearchVolume', 'desc', '周搜索量', ArrowDownAZ)}
        </div>
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
                    className={`star-button ${row.watched ? 'watched' : ''}`}
                    onClick={() => onToggleWatch(row.keyword, !row.watched, row.watchNote)}
                    title={row.watched ? '取消关注' : '设为关注'}
                  ><Star size={18} fill={row.watched ? 'currentColor' : 'none'} /></button>
                </td>
                <td>{row.trafficRank ?? '—'}</td>
                <td className="keyword-cell" title={row.keyword}>{row.keyword}</td>
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
    </section>
  );
}
