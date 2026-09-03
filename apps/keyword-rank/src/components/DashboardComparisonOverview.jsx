import { useMemo } from 'react';
import { integer } from '../lib/format.js';

const PAGE_BUCKETS = [
  { key: 'p1', label: 'P1', range: '1–10', test: (rank) => rank <= 10 },
  { key: 'p2', label: 'P2', range: '11–20', test: (rank) => rank >= 11 && rank <= 20 },
  { key: 'p3', label: 'P3', range: '21–30', test: (rank) => rank >= 21 && rank <= 30 },
  { key: 'p4', label: 'P4+', range: '31+', test: (rank) => rank >= 31 },
];

const DIFFERENCE_BUCKETS = [
  { key: 'natural-strong', label: '自然领先 ≥10', color: '#18a99b' },
  { key: 'natural-light', label: '自然领先 1–9', color: '#73d6c0' },
  { key: 'same', label: '差值为 0', color: '#c4cbd3' },
  { key: 'sp-light', label: 'SP领先 1–9', color: '#f3a274' },
  { key: 'sp-strong', label: 'SP领先 ≥10', color: '#df6873' },
];

function rankNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function ratioText(value, total) {
  if (!total) return '—';
  return `${((value / total) * 100).toFixed(2)}%`;
}

function pageDistribution(rows, field, total) {
  const counts = PAGE_BUCKETS.map((bucket) => ({
    ...bucket,
    count: rows.reduce((sum, row) => {
      const rank = rankNumber(row[field]);
      return sum + (rank != null && bucket.test(rank) ? 1 : 0);
    }, 0),
  }));
  const ranked = counts.reduce((sum, bucket) => sum + bucket.count, 0);
  return [...counts, { key: 'unranked', label: '未上榜', range: '', count: Math.max(0, total - ranked) }];
}

function buildOverview(rows) {
  const source = Array.isArray(rows) ? rows : [];
  const total = source.length;
  let common = 0;
  let naturalLeading = 0;
  let spLeading = 0;
  let onlyNatural = 0;
  let onlySp = 0;
  let commonP1 = 0;
  const differenceCounts = Object.fromEntries(DIFFERENCE_BUCKETS.map((bucket) => [bucket.key, 0]));

  source.forEach((row) => {
    const natural = rankNumber(row?.naturalRank);
    const sp = rankNumber(row?.spRank);
    if (natural != null && sp != null) {
      common += 1;
      if (natural < sp) naturalLeading += 1;
      else if (sp < natural) spLeading += 1;
      if (natural <= 10 && sp <= 10) commonP1 += 1;
      const difference = sp - natural;
      if (difference >= 10) differenceCounts['natural-strong'] += 1;
      else if (difference > 0) differenceCounts['natural-light'] += 1;
      else if (difference === 0) differenceCounts.same += 1;
      else if (difference <= -10) differenceCounts['sp-strong'] += 1;
      else differenceCounts['sp-light'] += 1;
    } else if (natural != null) {
      onlyNatural += 1;
    } else if (sp != null) {
      onlySp += 1;
    }
  });

  const naturalP1 = source.reduce((count, row) => count + (rankNumber(row?.naturalRank) != null && rankNumber(row.naturalRank) <= 10 ? 1 : 0), 0);
  const spP1 = source.reduce((count, row) => count + (rankNumber(row?.spRank) != null && rankNumber(row.spRank) <= 10 ? 1 : 0), 0);
  const differenceTotal = Object.values(differenceCounts).reduce((sum, count) => sum + count, 0);

  return {
    total,
    common,
    naturalLeading,
    spLeading,
    onlyNatural,
    onlySp,
    naturalP1,
    spP1,
    commonP1,
    naturalPages: pageDistribution(source, 'naturalRank', total),
    spPages: pageDistribution(source, 'spRank', total),
    differenceTotal,
    differences: DIFFERENCE_BUCKETS.map((bucket) => ({ ...bucket, count: differenceCounts[bucket.key] })),
  };
}

function OverviewMetric({ label, value, total, detail, tone }) {
  return (
    <div className={`dashboard-overview-metric tone-${tone}`}>
      <span className="dashboard-overview-metric-label">{label}</span>
      <div className="dashboard-overview-metric-value"><strong>{integer(value)}</strong><small>{ratioText(value, total)}</small></div>
      <span className="dashboard-overview-metric-detail">{detail}</span>
    </div>
  );
}

function RankDistributionPanel({ overview }) {
  const rows = [
    { key: 'natural', label: '自然排名', tone: 'natural', values: overview.naturalPages },
    { key: 'sp', label: 'SP排名', tone: 'sp', values: overview.spPages },
  ];
  return (
    <section className="dashboard-overview-panel dashboard-overview-rank-panel" aria-labelledby="dashboard-overview-rank-title">
      <div className="dashboard-overview-panel-head">
        <div><h3 id="dashboard-overview-rank-title">排名页分布</h3><span>P1=1–10名，未上榜单列</span></div>
      </div>
      <div className="dashboard-overview-rank-table">
        <div className="dashboard-overview-rank-row dashboard-overview-rank-heading"><span>类型</span>{PAGE_BUCKETS.map((bucket) => <span key={bucket.key}>{bucket.label}</span>)}<span>未上榜</span></div>
        {rows.map((row) => (
          <div className={`dashboard-overview-rank-row tone-${row.tone}`} key={row.key}>
            <strong>{row.label}</strong>
            {row.values.map((bucket) => <span key={bucket.key}><b>{integer(bucket.count)}</b><small>{ratioText(bucket.count, overview.total)}</small></span>)}
          </div>
        ))}
      </div>
    </section>
  );
}

function DifferencePanel({ overview }) {
  let cursor = 0;
  const gradientStops = overview.differences.map((bucket) => {
    const start = cursor;
    cursor += overview.differenceTotal ? (bucket.count / overview.differenceTotal) * 100 : 0;
    return `${bucket.color} ${start}% ${cursor}%`;
  });
  const donutStyle = { background: overview.differenceTotal ? `conic-gradient(${gradientStops.join(', ')})` : '#edf1f4' };
  return (
    <section className="dashboard-overview-panel dashboard-overview-difference-panel" aria-labelledby="dashboard-overview-difference-title">
      <div className="dashboard-overview-panel-head">
        <div><h3 id="dashboard-overview-difference-title">差值分布</h3><span>SP排名 − 自然排名（正数=自然领先）· 仅共同上榜</span></div>
      </div>
      <div className="dashboard-overview-difference-content">
        <div className="dashboard-overview-donut" style={donutStyle} aria-label={`共同上榜 ${integer(overview.differenceTotal)} 个关键词的差值分布`}><div><strong>{integer(overview.differenceTotal)}</strong><small>共同上榜</small></div></div>
        <div className="dashboard-overview-difference-legend">
          {overview.differences.map((bucket) => <div className="dashboard-overview-difference-item" key={bucket.key}><i style={{ backgroundColor: bucket.color }} /><span>{bucket.label}</span><b>{integer(bucket.count)}</b><small>{ratioText(bucket.count, overview.differenceTotal)}</small></div>)}
        </div>
      </div>
    </section>
  );
}

function FirstPagePanel({ overview }) {
  const rows = [
    ['自然P1', overview.naturalP1, 'natural'],
    ['SP P1', overview.spP1, 'sp'],
    ['共同P1', overview.commonP1, 'common'],
  ];
  return (
    <section className="dashboard-overview-panel dashboard-overview-p1-panel" aria-labelledby="dashboard-overview-p1-title">
      <div className="dashboard-overview-panel-head">
        <div><h3 id="dashboard-overview-p1-title">第一页关键词数（P1）</h3><span>当前日期排名 ≤ 10</span></div>
      </div>
      <div className="dashboard-overview-mini-table" role="table" aria-label="第一页关键词数">
        <div className="dashboard-overview-mini-row dashboard-overview-mini-heading" role="row"><span role="columnheader">类型</span><span role="columnheader">关键词数</span><span role="columnheader">占比</span></div>
        {rows.map(([label, count, tone]) => <div className={`dashboard-overview-mini-row tone-${tone}`} role="row" key={label}><strong role="cell">{label}</strong><b role="cell">{integer(count)}</b><small role="cell">{ratioText(count, overview.total)}</small></div>)}
      </div>
    </section>
  );
}

export default function DashboardComparisonOverview({ rows, selectedDate }) {
  const overview = useMemo(() => buildOverview(rows), [rows]);
  return (
    <section className="dashboard-overview" data-dashboard-overview aria-labelledby="dashboard-overview-title">
      <div className="dashboard-overview-titlebar">
        <div><h2 id="dashboard-overview-title">自然/SP对比总览</h2><span>关键词：{integer(overview.total)}</span></div>
        <span>{selectedDate || '当前日期'} · 排名数字越小越好</span>
      </div>
      <div className="dashboard-overview-layout">
        <div className="dashboard-overview-main">
          <div className="dashboard-overview-primary-grid">
            <OverviewMetric label="共同上榜" value={overview.common} total={overview.total} detail="自然 & SP 均有排名" tone="common" />
            <OverviewMetric label="自然领先" value={overview.naturalLeading} total={overview.total} detail="自然排名更好" tone="natural" />
            <OverviewMetric label="SP领先" value={overview.spLeading} total={overview.total} detail="SP排名更好" tone="sp" />
            <OverviewMetric label="仅自然上榜" value={overview.onlyNatural} total={overview.total} detail="SP未上榜" tone="natural-only" />
            <OverviewMetric label="仅SP上榜" value={overview.onlySp} total={overview.total} detail="自然未上榜" tone="sp-only" />
          </div>
          <RankDistributionPanel overview={overview} />
        </div>
        <div className="dashboard-overview-side">
          <FirstPagePanel overview={overview} />
          <DifferencePanel overview={overview} />
        </div>
      </div>
    </section>
  );
}
