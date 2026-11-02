import { ArrowDownRight, ArrowUpRight, X } from 'lucide-react';
import useDialogFocus from '../lib/useDialogFocus.js';
import upImage from '../assets/traffic-k/k-up.png';
import downImage from '../assets/traffic-k/k-down.png';
import './TrafficOverview.css';

const value = number => Number(number).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
export default function TrafficAlertDialog({ alerts, threshold, onClose, onOpen }) {
  const ref = useDialogFocus(true, onClose);
  const groups = [
    { key: 'up', title: '这些产品有好消息', sub: '关键词曝光分量正在提升', image: upImage, icon: ArrowUpRight, sign: 1 },
    { key: 'down', title: '这些变化值得关注', sub: '看看哪些关键词的曝光在回落', image: downImage, icon: ArrowDownRight, sign: -1 },
  ].map(group => ({ ...group, items: alerts.map(item => ({ ...item, metrics: item.metrics.filter(metric => metric.change * group.sign > threshold) })).filter(item => item.metrics.length) }))
    .filter(group => group.items.length);
  return <div className="traffic-alert-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`traffic-alert-dialog ${groups.length === 1 ? 'traffic-alert-single' : ''}`} ref={ref} role="dialog" aria-modal="true" aria-labelledby="traffic-alert-title" tabIndex={-1}>
      <header className="traffic-alert-header"><div><span className="traffic-alert-eyebrow">导入完成 · 数据已保存</span><h2 id="traffic-alert-title">关键词曝光异动公示</h2><p>较前一天涨跌超过 {threshold}% · {alerts.length} 个自有产品</p></div><button type="button" data-dialog-close aria-label="关闭异动公示" onClick={onClose}><X size={20} /></button></header>
      <div className="traffic-alert-columns">{groups.map(group => <section className={`traffic-alert-group traffic-alert-${group.key}`} key={group.key} aria-label={group.sign > 0 ? '上涨产品' : '下跌产品'}>
        <div className="traffic-alert-mascot"><img src={group.image} alt={group.sign > 0 ? 'K 开心地竖起大拇指' : 'K 露出失落的表情'} /><div><h3>{group.title}</h3><p>{group.sub}</p></div></div>
        <div className="traffic-alert-items">{group.items.map(item => <article key={item.id} className="traffic-alert-item"><div className="traffic-alert-product"><strong>{item.modelName}</strong><small>{item.countryCode} · {item.parentAsin}</small></div><p className="traffic-alert-dates">{item.previousDate} → {item.date}</p><div className="traffic-alert-metrics">{item.metrics.map(metric => <div key={metric.key}><span>{metric.label}<small>{value(metric.previous)} → {value(metric.current)}</small></span><strong><group.icon size={16} />{metric.change > 0 ? '+' : ''}{metric.change.toFixed(1)}%</strong></div>)}</div><div className="traffic-alert-links">{[['dashboard', '查看看板'], ['natural', '自然矩阵'], ['sp', 'SP 矩阵']].map(([tab, label]) => <button type="button" key={tab} onClick={() => onOpen(item, tab)}>{label}</button>)}</div></article>)}</div>
      </section>)}</div>
      <footer className="traffic-alert-footer"><p>仅比较两日都有有效搜索量和排名的同一批词；缺失及旧排名不计作下跌。<br />同一产品不同分项可能分别上涨和下跌。</p><button type="button" onClick={onClose}>知道了，进入软件</button></footer>
    </section>
  </div>;
}
