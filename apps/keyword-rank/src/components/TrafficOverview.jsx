import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { SlidersHorizontal } from 'lucide-react';
import { buildTrafficSeries, buildTrafficDetail, previousDay } from '../lib/trafficIndex.mjs';
import './TrafficOverview.css';

const number = value => value == null ? '—' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
const change = value => value == null ? '暂无可比数据' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
const changeArrow = value => value > 0 ? '↑ ' : value < 0 ? '↓ ' : '';
const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const changeTone = value => value == null || value === 0 ? 'flat' : value > 0 ? 'up' : 'down';
const changeMarkup = value => `<span class="traffic-change traffic-change-${changeTone(value)}">${changeArrow(value)}${change(value)}</span>`;
function rankText(point, metric) {
  if (!point) return '无记录';
  const state = point[`${metric}State`];
  return state === 'ranked' ? `#${point[`${metric}Rank`]}` : state === 'unranked' ? '未上榜' : state === 'stale' ? '旧排名' : state === 'undated' ? '日期未知' : '无排名';
}
function movement(now, before, metric) {
  const current = rankText(now, metric), prior = rankText(before, metric);
  const nowState = now?.[`${metric}State`], beforeState = before?.[`${metric}State`];
  let delta = null, label = '';
  if (nowState === 'ranked' && beforeState === 'ranked') {
    delta = before[`${metric}Rank`] - now[`${metric}Rank`];
    label = delta > 0 ? `↑${delta}` : delta < 0 ? `↓${-delta}` : '持平';
  } else if (beforeState === 'unranked' && nowState === 'ranked') { delta = 1; label = '↑ 上榜'; }
  else if (beforeState === 'ranked' && nowState === 'unranked') { delta = -1; label = '↓ 未上榜'; }
  return `<span class="traffic-rank-route">${html(prior)} → ${html(current)}</span>${label ? ` <b class="traffic-change traffic-change-${changeTone(delta)}">${label}</b>` : ''}`;
}

export function trafficTooltip(detail) {
  if (!detail) return '';
  const rows = detail.topKeywords.map(item => `<tr><td title="${html(item.keyword)}">${html(item.keyword)}</td><td>${number(item.now?.volume)}</td><td>${movement(item.now, item.before, 'natural')}</td><td>${movement(item.now, item.before, 'sp')}</td><td>${number(item.now?.natural)}</td><td>${number(item.now?.sp)}</td><td>${changeMarkup(item.change)}</td></tr>`).join('');
  return `<div class="traffic-tooltip"><div class="traffic-tooltip-heading"><div><b>${html(detail.date)}</b><strong class="traffic-tooltip-subtitle">贡献关键词 TOP 5</strong></div><span>有效搜索量 ${detail.volumeCount} / ${detail.count} 词</span></div><div class="traffic-tooltip-totals"><span>自然 <b>${number(detail.natural)}</b></span><span>SP 广告 <b>${number(detail.sp)}</b></span><span>综合 <b>${number(detail.total)}</b></span></div><p>较前一天 · 综合 ${changeMarkup(detail.comparison.total.change)} · 自然 ${changeMarkup(detail.comparison.natural.change)} · SP ${changeMarkup(detail.comparison.sp.change)}</p><table><thead><tr><th>关键词</th><th>周搜索量</th><th>自然排名</th><th>SP 排名</th><th>自然分</th><th>广告分</th><th>综合变化</th></tr></thead><tbody>${rows || '<tr><td colspan="7">暂无可计算的关键词</td></tr>'}</tbody></table><small>按今日 / 昨日较高贡献排序；涨跌按两日各自得分比较，与柱形口径一致。<br>— 表示未计分；旧排名及缺少搜索量不补零。排名日期须为快照当日或前一天。</small></div>`;
}

// Anchor the external bubble to the viewport, independently of the chart's
// scrolling ancestors. Limit its scroll height when five rows cannot fit.
function positionTrafficTooltip(element, point, dom) {
  const chart = element.getBoundingClientRect();
  const inset = 12, gap = 12;
  const viewWidth = document.documentElement.clientWidth, viewHeight = document.documentElement.clientHeight;
  dom.style.width = `${Math.min(940, viewWidth - inset * 2)}px`;
  dom.style.maxHeight = `${viewHeight - inset * 2}px`;
  const width = dom.offsetWidth, desiredHeight = dom.offsetHeight;
  const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));
  let x, y, availableHeight = viewHeight - inset * 2;
  if (viewWidth - chart.right - gap - inset >= width) {
    dom.dataset.placement = 'right';
    x = chart.right + gap;
    y = clamp(chart.top + point[1], inset, viewHeight - desiredHeight - inset);
  } else if (chart.left - gap - inset >= width) {
    dom.dataset.placement = 'left';
    x = chart.left - gap - width;
    y = clamp(chart.top + point[1], inset, viewHeight - desiredHeight - inset);
  } else {
    const below = viewHeight - chart.bottom - gap - inset, above = chart.top - gap - inset;
    const useBelow = below >= Math.min(desiredHeight, 320) || (above < desiredHeight && below >= above);
    availableHeight = Math.max(1, useBelow ? below : above);
    dom.style.maxHeight = `${availableHeight}px`;
    dom.dataset.placement = useBelow ? 'below' : 'above';
    x = clamp(chart.left + point[0] - width / 2, inset, viewWidth - width - inset);
    y = useBelow ? chart.bottom + gap : chart.top - gap - Math.min(desiredHeight, availableHeight);
  }
  dom.style.maxHeight = `${availableHeight}px`;
  dom.style.setProperty('--traffic-tooltip-left', `${x}px`);
  dom.style.setProperty('--traffic-tooltip-top', `${y}px`);
  return [0, 0];
}

export default function TrafficOverview({ model, selectedDate, onDate, threshold, onSettings }) {
  const node = useRef(null), chartRef = useRef(null), tooltipRef = useRef(null);
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
    const hide = event => {
      if (event?.target instanceof Element && event.target.closest('.traffic-tooltip-host')) return;
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
      chart.dispatchAction({ type: 'hideTip' });
    };
    const resize = new ResizeObserver(() => { hide(); chart.resize(); });
    resize.observe(node.current);
    window.addEventListener('scroll', hide, { capture: true, passive: true });
    window.addEventListener('resize', hide);
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); resize.disconnect(); chart.dispose(); chartRef.current = null; tooltipRef.current = null; };
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
      tooltip: { trigger: 'axis', confine: false, appendTo: 'body', className: 'traffic-tooltip-host', axisPointer: { type: 'shadow', shadowStyle: { color: '#173b6409' } },
        enterable: true, hideDelay: 250, transitionDuration: 0, backgroundColor: '#fff', borderColor: '#dce3e8', padding: 0,
        extraCssText: 'position:fixed;z-index:210;box-sizing:border-box;overflow:auto;overscroll-behavior:contain;box-shadow:0 10px 32px #173b6424;border-radius:10px;white-space:normal;',
        position: (point, params, dom) => { tooltipRef.current = dom; return positionTrafficTooltip(node.current, point, dom); },
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
    <div className="traffic-summary"><span className="traffic-date">{focusedDate || '暂无日期'}</span>{[['natural', '自然', 'natural'], ['sp', 'SP 广告', 'sp'], ['total', '综合', 'total']].map(([metric, label, tone]) => <div key={metric} className={`traffic-stat traffic-stat-${tone}`}><span><i />{label}</span><strong>{number(detail?.[metric])}</strong><small className={`traffic-stat-change traffic-change-${changeTone(detail?.comparison?.[metric]?.change)}`}>{changeArrow(detail?.comparison?.[metric]?.change)}{change(detail?.comparison?.[metric]?.change)}<em>较前一天</em></small></div>)}</div>
    <div className="traffic-chart" ref={node} role="img" aria-label="绿色自然指数在下、红色 SP 广告指数在上的每日堆叠柱状图" />
    {!series.length && <p className="traffic-empty">导入关键词日报后，在这里查看曝光指数走势。</p>}
    <div className="traffic-chart-footer"><span>有效周搜索量 <b>{detail?.volumeCount || 0} / {detail?.count || 0}</b> 词 · 缺失数据不补零{detail?.staleCount > 0 ? ` · ${detail.staleCount} 词含旧排名或缺少排名日期` : ''}</span><details><summary>计算说明</summary><p>自然 / SP 指数 = Σ（周搜索量 ÷ 对应排名的 0.8 次方）。这是相对曝光指数，不是访客数或市场份额。只使用快照当日或前一天采集的排名；缺少搜索量、排名或排名日期时不计分。涨跌幅 =（当天总分 − 前一天总分）÷ 前一天总分 × 100%，与柱高、气泡和异动提醒使用同一口径。有效词数量变化也会影响总分；缺少任一天得分或前一天为零时不计算百分比。</p></details></div>
  </section>;
}
