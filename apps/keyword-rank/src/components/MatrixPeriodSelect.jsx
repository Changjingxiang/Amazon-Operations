import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function periodSelection(dates, filter = {}) {
  const months = [...new Set((dates || []).filter(Boolean).map(d => d.slice(0, 7)))].sort();
  const year = filter.matrixYear || months.at(-1)?.slice(0, 4) || '';
  const available = months.filter(m => m.startsWith(year + '-'));
  const selected = filter.matrixMonths == null ? available.slice(-1) : filter.matrixMonths;
  return { months, year, available, selected };
}
export function filterPeriodDates(dates, filter = {}) {
  const { year, selected } = periodSelection(dates, filter);
  return (dates || []).filter(d => d.startsWith(year + '-') && selected.includes(d.slice(0, 7)));
}
export default function MatrixPeriodSelect({ dates, filter = {}, onChange }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const { months, year, available, selected } = periodSelection(dates, filter);
  const years = [...new Set(months.map(m => m.slice(0, 4)))].reverse();
  useEffect(() => {
    const outside = e => { if (!root.current?.contains(e.target)) setOpen(false); };
    const escape = e => { if (e.key === 'Escape' && open) { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const update = matrixMonths => {
    if (!matrixMonths.length) return;
    onChange?.({ ...filter, matrixYear: year, matrixMonths });
  };
  return <div className="matrix-period-select" ref={root}>
    <label>年份 <select aria-label="矩阵年份" value={year} onChange={e => { const y = e.target.value; onChange?.({ ...filter, matrixYear: y, matrixMonths: months.filter(m => m.startsWith(y + '-')).slice(-1) }); }}>
      {years.map(y => <option key={y} value={y}>{y}年</option>)}
    </select></label>
    <button ref={trigger} type="button" className="matrix-month-trigger" aria-expanded={open} onClick={() => setOpen(!open)}>月份：{selected.length ? selected.map(m => Number(m.slice(5)) + '月').join('、') : '请选择'}<ChevronDown size={14} /></button>
    <div className={`matrix-month-menu ${open ? 'is-open' : ''}`} inert={!open ? true : undefined} aria-hidden={!open}>
      <div className="matrix-month-shortcuts"><button type="button" onClick={() => update(available)}>全部月份</button><button type="button" onClick={() => update(available.slice(-1))}>最新月份</button></div>
      <div className="matrix-month-grid">{Array.from({length:12}, (_, i) => { const m = year + '-' + String(i + 1).padStart(2, '0'); return <label key={m} className={!available.includes(m) ? 'unavailable' : ''}><input type="checkbox" disabled={!available.includes(m)} checked={selected.includes(m)} onChange={() => update(selected.includes(m) ? selected.filter(v => v !== m) : [...selected, m].sort())} />{i + 1}月</label>; })}</div>
      <small>至少保留一个月份 · 无数据月份不可选</small>
    </div>
  </div>;
}
