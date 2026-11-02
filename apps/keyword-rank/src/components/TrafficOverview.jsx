import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { SlidersHorizontal } from 'lucide-react';
import { buildTrafficSeries, buildTrafficDetail, previousDay } from '../lib/trafficIndex.mjs';
import './TrafficOverview.css';

const number = value => value == null ? '—' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
const change = value => value == null ? '暂无可比数据' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function rankText(point, metric) {
  if (!point) return '无记录';
  const state = point[`${metric}State`];
  return state === 'ranked' ? `#${point[`${metric}Rank`]}` : state === 'unranked' ? '未上榜' : state === 'stale' ? '旧排名' : state === 'undated' ? '日期未知' : '无排名';
}
function movement(now, before, metric) {
  const current = rankText(now, metric), prior = rankText(before, metric);
  if (now?.[`${metric}State`] !== 'ranked' || before?.[`${metric}State`] !== 'ranked') return `${prior} → ${current}`;
  const delta = before[`${metric}Rank`] - now[`${metric}Rank`];
  return `${prior} → ${current} ${delta > 0 ? `↑${delta}` : delta < 0 ? `↓${-delta}` : '持平'}`;
}

export function trafficTooltip(detail) {
  if (!detail) return '';
  const rows = detail.topKeywords.map(item => `<tr><td title="${html(item.keyword)}">${html(item.keyword)}</td><td>${number(item.now?.volume)}</td><td>${html(movement(item.now, item.before, 'natural'))}</td><td>${html(movement(item.now, item.before, 'sp'))}</td><td>${number(item.now?.natural)}</td><td>${number(item.now?.sp)}</td><td>${change(item.change)}</td></tr>`).join('');
  return `<div class="traffic-tooltip"><div class="traffic-tooltip-heading"><b>${html(detail.date)}</b><span>有效搜索量 ${detail.volumeCount} / ${detail.count} 词</span></div><div class="traffic-tooltip-totals"><span>自然 <b>${number(detail.natural)}</b></span><span>SP 广告 <b>${number(detail.sp)}</b></span><span>综合 <b>${number(detail.total)}</b></span></div><p>较前一天 · 综合 ${change(detail.comparison.total.change)} · 自然 ${change(detail.comparison.natural.change)} · SP ${change(detail.comparison.sp.change)}</p><strong class="traffic-tooltip-subtitle">贡献关键词 TOP 5</strong><table><thead><tr><th>关键词</th><th>周搜索量</th><th>自然排名</th><th>SP 排名</th><th>自然分</th><th>广告分</th><th>综合变化</th></tr></thead><tbody>${rows || '<tr><td colspan="7">暂无可计算的关键词</td></tr>'}</tbody></table><small>按今日 / 昨日较高贡献排序；涨跌仅比较两日数据有效的同一批词。<br>— 表示未计分；旧排名及缺少搜索量不补零。排名日期须为快照当日或前一天。</small></div>`;
}

export default function TrafficOverview({ model, selectedDate, onDate, threshold, onSettings }) {
  const node = useRef(null), chartRef = useRef(null);
  const [range, setRange] = useState('30');
  const [activeDate, setActiveDate] = useState('');
  const records = model?.historyRecords;
  const series = useMemo(() => buildTrafficSeries(records), [records]);
  const dates = useMemo(() => {
    if (!series.length) return [];
    const end = series.at(-1).date;
    const start = range === 'all' ? series[0].date : new Date(Date.parse(`${end}T00:00:00Z`) - (Number(range) - 1) * 86400000).toISOString().slice(0, 10);
    // Include missing calendar days as gaps, rather than implying continuous data.
    const result = [];
    for (let date = end; date >= start; date = previousDay(date)) { result.push(date); if (result.length >= 3660) break; }
    return result.reverse();
  }, [series, range]);
  const focusedDate = activeDate || selectedDate || series.at(-1)?.date;
  const detail = useMemo(() => buildTrafficDetail(records, focusedDate), [records, focusedDate]);
  useEffect(() => { setActiveDate(''); }, [model?.parentAsin, selectedDate]);
  useEffect(() => {
    const chart = echarts.init(node.current);
    chartRef.current = chart;
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(node.current);
    return () => { resize.disconnect(); chart.dispose(); chartRef.current = null; };
  }, []);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return undefined;
    const byDate = new Map(series.map(point => [point.date, point]));
    let hoverDate = '', hoverHtml = '';
    chart.setOption({
      animationDuration: 280,
      color: ['#35a878', '#e66b67'],
      grid: { left: 58, right: 20, top: 26, bottom: 35 },
      tooltip: { trigger: 'axis', confine: true, axisPointer: { type: 'shadow', shadowStyle: { color: '#173b6409' } },
        enterable: true, backgroundColor: '#fff', borderColor: '#dce3e8', padding: 0,
        extraCssText: 'z-index:210;max-width:calc(100vw - 48px);box-shadow:0 10px 32px #173b6424;border-radius:10px;white-space:normal;',
        position: (point, params, dom, rect, size) => [Math.max(0, Math.min(point[0] + 15, size.viewSize[0] - size.contentSize[0])), Math.max(0, Math.min(point[1], size.viewSize[1] - size.contentSize[1]))],
        formatter: params => { const date = params?.[0]?.axisValue; if (date !== hoverDate) { hoverDate = date; hoverHtml = byDate.has(date) ? trafficTooltip(buildTrafficDetail(records, date)) : `<div class="traffic-tooltip">${html(date)} · 未导入数据</div>`; } return hoverHtml; } },
      xAxis: { type: 'category', data: dates, axisLabel: { color: '#778598', fontSize: 10, formatter: value => value.slice(5).replace('-', '/') }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#dce4eb' } } },
      yAxis: { type: 'value', name: '指数', nameTextStyle: { color: '#8a96a5', fontSize: 10 }, splitLine: { lineStyle: { color: '#edf1f4', type: 'dashed' } }, axisLabel: { color: '#778598', fontSize: 10, formatter: value => value >= 10000 ? `${number(value / 10000)}万` : number(value) } },
      series: ['natural', 'sp'].map((metric, i) => ({ name: i ? 'SP 广告指数' : '自然指数', type: 'bar', stack: 'traffic', barMaxWidth: 28,
        emphasis: { focus: 'series' }, itemStyle: { borderRadius: i ? [3, 3, 0, 0] : 0 },
        data: dates.map(date => byDate.get(date)?.[metric] ?? null) })),
    }, true);
    const click = params => { if (params.name && byDate.has(params.name)) { setActiveDate(params.name); onDate?.(params.name); } };
    chart.on('click', click);
    return () => chart.off('click', click);
  }, [dates, series, records, onDate]);
  return <section className="traffic-overview" aria-label="关键词曝光指数趋势">
    <div className="traffic-overview-head">
      <div><h2>关键词曝光指数 <span>自然 + SP</span></h2><p>周搜索量 × 排名权重 · 按日快照 · 覆盖全部导入关键词</p></div>
      <div className="traffic-controls"><div className="traffic-range" aria-label="图表时间范围">{[['7', '7 天'], ['30', '30 天'], ['90', '90 天'], ['all', '全部']].map(([key, label]) => <button type="button" key={key} aria-pressed={range === key} onClick={() => setRange(key)}>{label}</button>)}</div><button type="button" className="traffic-settings-button" onClick={onSettings} title="设置异动阈值"><SlidersHorizontal size={14} />阈值 {threshold}%</button></div>
    </div>
    <div className="traffic-summary"><span className="traffic-date">{focusedDate || '暂无日期'}</span>{[['natural', '自然', 'natural'], ['sp', 'SP 广告', 'sp'], ['total', '综合', 'total']].map(([metric, label, tone]) => <div key={metric} className={`traffic-stat traffic-stat-${tone}`}><span><i />{label}</span><strong>{number(detail?.[metric])}</strong><small>{change(detail?.comparison?.[metric]?.change)}<em>可比词较昨日</em></small></div>)}</div>
    <div className="traffic-chart" ref={node} role="img" aria-label="绿色自然指数在下、红色 SP 广告指数在上的每日堆叠柱状图" />
    {!series.length && <p className="traffic-empty">导入关键词日报后，在这里查看曝光指数走势。</p>}
    <div className="traffic-chart-footer"><span>有效周搜索量 <b>{detail?.volumeCount || 0} / {detail?.count || 0}</b> 词 · 缺失数据不补零{detail?.staleCount > 0 ? ` · ${detail.staleCount} 词含旧排名或缺少排名日期` : ''}</span><details><summary>计算说明</summary><p>自然 / SP 指数 = Σ（周搜索量 ÷ 对应排名的 0.8 次方）。这是相对曝光指数，不是访客数或市场份额。只使用快照当日或前一天采集的排名；缺少搜索量、排名或排名日期时不计分。较昨日变化按连续两天均有有效数据的同一组关键词、同一渠道计算；零基数不计算百分比。柱形保留当日全部有效词，可能与可比词范围不同。</p></details></div>
  </section>;
}
