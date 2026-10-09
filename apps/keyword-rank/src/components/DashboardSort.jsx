import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, ListOrdered, Plus, Trash2, X } from 'lucide-react';
import { DASHBOARD_SORT_FIELDS } from '../lib/dashboardSort.mjs';

export default function DashboardSort({ conditions, onChange }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ visibility: 'hidden' });
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const dialogId = useId();
  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  const available = DASHBOARD_SORT_FIELDS.filter(({ field }) => !conditions.some((condition) => condition.field === field));
  const summary = conditions.map(({ field, direction }, index) => `${index + 1}. ${DASHBOARD_SORT_FIELDS.find((item) => item.field === field)?.label} ${direction === 'desc' ? '降序' : '升序'}`).join(' → ');
  const update = (index, patch) => onChange(conditions.map((condition, itemIndex) => itemIndex === index ? { ...condition, ...patch } : condition));
  const move = (index, offset) => {
    const next = [...conditions];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  };

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => {
      if (!triggerRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const popover = popoverRef.current;
      if (!trigger || !popover) return;
      const gutter = 12;
      const gap = 7;
      const width = Math.min(490, window.innerWidth - gutter * 2);
      const spaceBelow = window.innerHeight - trigger.bottom - gap - gutter;
      const spaceAbove = trigger.top - gap - gutter;
      const above = spaceBelow < Math.min(popover.scrollHeight, 300) && spaceAbove > spaceBelow;
      const maxHeight = Math.max(0, Math.min(560, above ? spaceAbove : spaceBelow));
      const height = Math.min(popover.scrollHeight, maxHeight);
      setPosition({ position: 'fixed', width, maxHeight, left: Math.max(gutter, Math.min(trigger.right - width, window.innerWidth - width - gutter)), top: above ? trigger.top - gap - height : trigger.bottom + gap });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, conditions.length]);

  return (
    <div className="dashboard-sort-control">
      <button ref={triggerRef} type="button" className={`sort-button dashboard-sort-trigger ${conditions.length ? 'active' : ''}`} aria-label="多条件排序" aria-haspopup="dialog" aria-controls={open ? dialogId : undefined} aria-expanded={open} title={summary || '设置多个字段及各自的升序、降序'} onClick={() => setOpen((value) => !value)}>
        <ListOrdered size={15} />多条件排序{conditions.length > 0 && <b>{conditions.length}</b>}
      </button>
      {conditions.length > 0 && <span className="dashboard-sort-summary" title={summary}>{summary}</span>}
      {open && createPortal(
        <div ref={popoverRef} id={dialogId} role="dialog" aria-label="看板多条件排序" className="dashboard-sort-popover" style={position}>
          <div className="cascade-popover-head"><strong>多条件排序</strong><button type="button" aria-label="关闭多条件排序" onClick={close}><X size={15} /></button></div>
          <p className="dashboard-sort-hint">从上到下依次排序，数值相同时再比较下一条件。关注词保持置顶。</p>
          <ol className="dashboard-sort-list">
            {conditions.map(({ field, direction }, index) => (
              <li className="dashboard-sort-row" key={field}>
                <span className="dashboard-sort-priority" title={`第${index + 1}优先级`}>{index + 1}</span>
                <select aria-label={`第${index + 1}排序字段`} value={field} onChange={(event) => update(index, { field: event.target.value })}>
                  {DASHBOARD_SORT_FIELDS.filter((item) => item.field === field || available.some((candidate) => candidate.field === item.field)).map((item) => <option key={item.field} value={item.field}>{item.label}</option>)}
                </select>
                <div className="dashboard-sort-directions" role="group" aria-label={`第${index + 1}排序方向`}>
                  <button type="button" aria-pressed={direction === 'asc'} onClick={() => update(index, { direction: 'asc' })}><ArrowUp size={12} />升序</button>
                  <button type="button" aria-pressed={direction === 'desc'} onClick={() => update(index, { direction: 'desc' })}><ArrowDown size={12} />降序</button>
                </div>
                <div className="dashboard-sort-row-actions">
                  <button type="button" aria-label={`提高第${index + 1}条件优先级`} title="提高优先级" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={13} /></button>
                  <button type="button" aria-label={`降低第${index + 1}条件优先级`} title="降低优先级" disabled={index === conditions.length - 1} onClick={() => move(index, 1)}><ArrowDown size={13} /></button>
                  <button type="button" aria-label={`删除第${index + 1}排序条件`} title="删除条件" onClick={() => onChange(conditions.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={13} /></button>
                </div>
              </li>
            ))}
          </ol>
          {!conditions.length && <p className="dashboard-sort-empty">尚未设置排序条件，按原有流量顺序显示。</p>}
          <button type="button" className="dashboard-sort-add" disabled={!available.length} onClick={() => onChange([...conditions, { field: available[0].field, direction: 'asc' }])}><Plus size={14} />添加排序条件</button>
          <div className="cascade-popover-foot"><button type="button" className="dashboard-sort-clear" disabled={!conditions.length} onClick={() => onChange([])}>清除排序</button><span>修改即时生效 · 缺失值排在最后</span><button type="button" onClick={close}>完成</button></div>
        </div>, document.body,
      )}
    </div>
  );
}
