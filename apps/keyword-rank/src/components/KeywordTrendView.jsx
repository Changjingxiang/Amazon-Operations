import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { ArrowLeft } from 'lucide-react';

const RANGES = [['7d', '7D'], ['14d', '14D'], ['30d', '30D'], ['90d', '90D'], ['all', '全部'], ['custom', '自定义日期']];
const SERIES_COLORS = { natural: '#1688a8', sp: '#d15a4f', aba: '#7566b8', share: '#e0a12d' };
const keyOf = (value) => String(value || '').trim().toLocaleLowerCase('en-US');
const numberOrNull = (value) => {
  if (value == null || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

function latestRecords(records = []) {
  const result = new Map();
  records.forEach((record) => {
    const keyword = keyOf(record?.keyword);
    const date = String(record?.snapshotDate || '');
    if (!keyword || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const mapKey = `${keyword}|${date}`;
    const previous = result.get(mapKey);
    if (!previous || String(record?.importTime || '') >= String(previous?.importTime || '')) result.set(mapKey, record);
  });
  return result;
}

function formatRank(value) { return value == null ? '暂无' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 }); }
function formatShare(value) { return value == null ? '暂无' : `${(Number(value) * 100).toFixed(2)}%`; }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

export default function KeywordTrendView({ model, row, onBack }) {
  const chartRef = useRef(null);
  const chartShellRef = useRef(null);
  const instanceRef = useRef(null);
  const annotationLayerRef = useRef(null);
  const [chartReady, setChartReady] = useState(false);
  const [range, setRange] = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const keyword = row?.keyword || '';
  const allDates = useMemo(() => [...new Set(model?.dates || [])].sort(), [model?.dates]);
  const ownerRecords = useMemo(() => latestRecords(model?.historyRecords || []), [model?.historyRecords]);
  const competitors = useMemo(() => (model?.competitors || []).map((competitor) => ({ ...competitor, records: latestRecords(competitor.historyRecords || []) })), [model?.competitors]);
  const dateList = useMemo(() => {
    if (!allDates.length) return [];
    if (range === 'custom') return allDates.filter((date) => (!customStart || date >= customStart) && (!customEnd || date <= customEnd));
    if (range === 'all') return allDates;
    return allDates.slice(-Number(range.replace('d', '')));
  }, [allDates, range, customStart, customEnd]);
  const seriesData = useMemo(() => {
    const keywordKey = keyOf(keyword);
    const annotationNatural = row?.naturalAnnotations || [];
    const annotationSp = row?.spAnnotations || [];
    return dateList.map((date) => {
      const record = ownerRecords.get(`${keywordKey}|${date}`);
      const index = allDates.indexOf(date);
      const competitorPoints = competitors.map((competitor) => {
        const candidate = competitor.records.get(`${keywordKey}|${date}`);
        return { name: competitor.competitorName || competitor.modelName || '竞品', rank: numberOrNull(candidate?.naturalRank), sp: numberOrNull(candidate?.spRank) };
      });
      return {
        date,
        natural: numberOrNull(record?.naturalRank),
        sp: numberOrNull(record?.spRank),
        aba: numberOrNull(record?.weeklyAbaRank),
        share: record?.trafficShare == null ? null : Number(record.trafficShare),
        naturalAnnotation: annotationNatural[index] || '',
        spAnnotation: annotationSp[index] || '',
        competitors: competitorPoints,
      };
    });
  }, [dateList, allDates, ownerRecords, competitors, keyword, row?.naturalAnnotations, row?.spAnnotations]);

  const markedPoints = useMemo(() => seriesData.flatMap((point, index) => [
    point.natural != null && point.naturalAnnotation ? { key: `natural-${point.date}`, index, value: point.natural, metric: 'natural', label: point.naturalAnnotation } : null,
    point.sp != null && point.spAnnotation ? { key: `sp-${point.date}`, index, value: point.sp, metric: 'sp', label: point.spAnnotation } : null,
  ].filter(Boolean)), [seriesData]);

  useEffect(() => {
    const chart = instanceRef.current;
    const layer = annotationLayerRef.current;
    if (!chart || !layer) return undefined;
    const renderStars = () => {
      const selected = chart.getOption()?.legend?.[0]?.selected || {};
      layer.replaceChildren();
      markedPoints.forEach((point) => {
        const seriesName = point.metric === 'natural' ? '自然位' : 'SP位';
        if (selected[seriesName] === false) return;
        const pixel = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [point.index, point.value]);
        if (!Array.isArray(pixel) || !pixel.every(Number.isFinite)) return;
        const star = document.createElement('span');
        star.className = `keyword-trend-annotation-star ${point.metric}`;
        star.setAttribute('aria-label', `${point.metric === 'natural' ? '自然位' : 'SP位'}标注：${point.label}`);
        star.title = point.label;
        star.style.left = `${pixel[0]}px`;
        star.style.top = `${pixel[1]}px`;
        layer.appendChild(star);
      });
    };
    const onLegend = () => renderStars();
    const onZoom = () => renderStars();
    chart.on('legendselectchanged', onLegend);
    chart.on('dataZoom', onZoom);
    renderStars();
    return () => { chart.off('legendselectchanged', onLegend); chart.off('dataZoom', onZoom); };
  }, [markedPoints, seriesData, chartReady]);

  useEffect(() => {
    if (!chartRef.current) return undefined;
    const chart = echarts.init(chartRef.current);
    instanceRef.current = chart;
    setChartReady(true);
    const onResize = () => { chart.resize(); window.requestAnimationFrame(() => chart.dispatchAction({ type: 'dataZoom' })); };
    window.addEventListener('resize', onResize);
      return () => { window.removeEventListener('resize', onResize); chart.dispose(); instanceRef.current = null; setChartReady(false); };
  }, []);

  useEffect(() => {
    const chart = instanceRef.current;
    if (!chart) return;
    const dates = seriesData.map((point) => point.date);
    const option = {
      animation: false,
      color: [SERIES_COLORS.natural, SERIES_COLORS.sp, SERIES_COLORS.aba, SERIES_COLORS.share],
      grid: { left: 58, right: 72, top: 56, bottom: 86, containLabel: true },
      legend: { top: 8, selected: { 自然位: true, SP位: true, ABA排名: true, 父体流量贡献: true }, data: ['自然位', 'SP位', 'ABA排名', '父体流量贡献'] },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter(params) {
          const point = seriesData[params?.[0]?.dataIndex];
          if (!point) return '';
          const hoveredSeries = [...new Set((params || []).map((item) => item.seriesName).filter((name) => name === '自然位' || name === 'SP位'))];
          const contextText = hoveredSeries.length ? `<div class="keyword-trend-tooltip-context">当前节点：${hoveredSeries.join(' / ')}</div>` : '';
          const competitorsText = point.competitors.length
            ? point.competitors.map((item) => `${escapeHtml(item.name)}: <span style="color:${SERIES_COLORS.natural}">自然 ${formatRank(item.rank)}</span> / <span style="color:${SERIES_COLORS.sp}">SP ${formatRank(item.sp)}</span>`).join('<br/>')
            : '暂无已关联竞品';
          return `<div>${contextText}<strong>${point.date}</strong><br/><span style="color:${SERIES_COLORS.natural}">● 自然位：${formatRank(point.natural)}</span><br/><span style="color:${SERIES_COLORS.sp}">◆ SP位：${formatRank(point.sp)}</span><br/><span style="color:${SERIES_COLORS.aba}">▰ ABA排名：${formatRank(point.aba)}</span><br/><span style="color:${SERIES_COLORS.share}">▮ 流量贡献：${formatShare(point.share)}</span><hr style="margin:6px 0;border:0;border-top:1px solid #dce5ec"/><b>标注</b><br/><span style="color:${SERIES_COLORS.natural}">自然：${escapeHtml(point.naturalAnnotation) || '暂无'}</span><br/><span style="color:${SERIES_COLORS.sp}">SP：${escapeHtml(point.spAnnotation) || '暂无'}</span><br/><b>竞品情况</b><br/>${competitorsText}</div>`;
        },
      },
      xAxis: { type: 'category', boundaryGap: true, data: dates, axisLabel: { color: '#5d7183' } },
      yAxis: [
        { type: 'value', inverse: true, name: '排名', min: 1, axisLabel: { color: '#1688a8' }, splitLine: { lineStyle: { color: '#edf1f4' } } },
        { type: 'value', inverse: true, name: 'ABA', position: 'right', offset: 0, axisLabel: { color: '#7566b8' }, splitLine: { show: false } },
        { type: 'value', name: '流量占比', position: 'right', offset: 52, min: 0, axisLabel: { color: '#c28a1c', formatter: (value) => `${(value * 100).toFixed(0)}%` }, splitLine: { show: false } },
      ],
      dataZoom: [{ type: 'slider', bottom: 22, height: 18 }, { type: 'inside' }],
      series: [
        { name: '自然位', type: 'line', smooth: true, yAxisIndex: 0, symbol: 'circle', symbolSize: 8, lineStyle: { width: 3 }, data: seriesData.map((p) => ({ value: p.natural })) },
        { name: 'SP位', type: 'line', smooth: true, yAxisIndex: 0, symbol: 'diamond', symbolSize: 8, lineStyle: { width: 3 }, data: seriesData.map((p) => ({ value: p.sp })) },
        { name: 'ABA排名', type: 'line', smooth: true, yAxisIndex: 1, symbol: 'none', lineStyle: { width: 2 }, areaStyle: { origin: 'end', opacity: 0.14 }, data: seriesData.map((p) => ({ value: p.aba })) },
        { name: '父体流量贡献', type: 'bar', yAxisIndex: 2, barMaxWidth: 16, itemStyle: { opacity: 0.22 }, z: 0, data: seriesData.map((p) => ({ value: p.share })) },
      ],
    };
    chart.setOption(option, true);
    chart.resize();
  }, [seriesData]);

  return <section ref={chartShellRef} className="keyword-trend-panel" data-keyword-trend>
    <header className="keyword-trend-toolbar">
      <button type="button" className="keyword-trend-back" onClick={onBack} title="返回对比矩阵"><ArrowLeft size={17} />返回矩阵</button>
      <div className="keyword-trend-title"><strong>{keyword}</strong><span>关键词趋势分析</span></div>
      <div className="keyword-trend-ranges">{RANGES.map(([value, label]) => <button key={value} type="button" className={range === value ? 'active' : ''} onClick={() => setRange(value)}>{label}</button>)}{range === 'custom' && <><input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} aria-label="趋势开始日期" /><span>至</span><input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} aria-label="趋势结束日期" /></>}</div>
    </header>
    <div className="keyword-trend-chart-wrap">
      <div ref={chartRef} className="keyword-trend-chart" aria-label={`${keyword}趋势图`} />
      <div ref={annotationLayerRef} className="keyword-trend-annotation-layer" aria-hidden="true" />
    </div>
  </section>;
}
