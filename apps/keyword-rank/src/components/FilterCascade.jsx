import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export const WATCH_FILTER_OPTIONS = [
  { value: 'watched', label: '关注' },
  { value: 'unwatched', label: '非关注' },
];

export const COMPARISON_FILTER_OPTIONS = [
  { value: 'sp', label: 'SP领先' },
  { value: 'natural', label: '自然领先' },
  { value: 'only-natural', label: '仅自然上榜' },
  { value: 'only-sp', label: '仅SP上榜' },
  { value: 'common', label: '共同上榜' },
];

export const EMPTY_FILTER = Object.freeze({
  query: '',
  watch: [],
  keywords: [],
  relations: [],
  dateMode: 'all',
  dateStart: '',
  dateEnd: '',
});

export function keywordKey(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US');
}

export function filterRows(rows, filter = EMPTY_FILTER) {
  const source = Array.isArray(rows) ? rows : [];
  const query = keywordKey(filter.query);
  const keywordSet = new Set((filter.keywords || []).map(keywordKey).filter(Boolean));
  const watch = new Set(filter.watch || []);
  const hasWatched = watch.has('watched');
  const hasUnwatched = watch.has('unwatched');
  return source.filter((row) => {
    const rowKey = keywordKey(row?.keyword);
    const translationKey = keywordKey(row?.translation);
    if (query && !rowKey.includes(query) && !translationKey.includes(query)) return false;
    if (keywordSet.size && !keywordSet.has(rowKey)) return false;
    if (hasWatched !== hasUnwatched) {
      if (hasWatched && !row?.watched) return false;
      if (hasUnwatched && row?.watched) return false;
    }
    return true;
  });
}

export function filterDates(dates, filter = EMPTY_FILTER) {
  const source = Array.isArray(dates) ? dates.filter(Boolean) : [];
  const mode = filter.dateMode || 'all';
  if (mode === 'single') {
    return filter.dateStart && source.includes(filter.dateStart) ? [filter.dateStart] : [];
  }
  if (mode !== 'range') return source;
  const start = String(filter.dateStart || '');
  const end = String(filter.dateEnd || '');
  if (!start && !end) return source;
  const first = start && end ? (start <= end ? start : end) : (start || end);
  const last = start && end ? (start <= end ? end : start) : (start || end);
  return source.filter((date) => date >= first && date <= last);
}

function toggleValue(values, value) {
  const next = new Set(values || []);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return [...next];
}

function CheckboxOption({ option, checked, onChange }) {
  return (
    <label className={`cascade-option ${checked ? 'is-selected' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="cascade-checkbox" aria-hidden="true">{checked && <Check size={12} strokeWidth={3} />}</span>
      <span className="cascade-option-label" title={option.label}>{option.label}</span>
      {option.count != null && <small>{option.count}</small>}
    </label>
  );
}

function FilterGroup({ label, options, values, onToggle }) {
  return (
    <section className="cascade-group">
      <div className="cascade-group-title"><strong>{label}</strong><small>{values.length ? `已选 ${values.length}` : '可多选'}</small></div>
      <div className="cascade-options">
        {options.map((option) => (
          <CheckboxOption
            key={option.value}
            option={option}
            checked={values.includes(option.value)}
            onChange={() => onToggle(option.value)}
          />
        ))}
      </div>
    </section>
  );
}

function DateFilterGroup({ filter, dates, onChange }) {
  const min = dates[0] || undefined;
  const max = dates.at(-1) || undefined;
  const setDate = (field, value) => onChange({ ...filter, [field]: value });
  return (
    <section className="cascade-group cascade-date-group">
      <div className="cascade-group-title"><strong>日期</strong><small>范围含首尾日期</small></div>
      <div className="cascade-date-modes" role="group" aria-label="日期筛选方式">
        {[['all', '全部日期'], ['single', '单日'], ['range', '日期范围']].map(([value, label]) => (
          <button key={value} type="button" className={filter.dateMode === value ? 'is-selected' : ''} onClick={() => onChange({ ...filter, dateMode: value })}>{label}</button>
        ))}
      </div>
      {filter.dateMode === 'single' && (
        <label className="cascade-date-field"><span>选择日期</span><input type="date" value={filter.dateStart || ''} min={min} max={max} onChange={(event) => setDate('dateStart', event.target.value)} /></label>
      )}
      {filter.dateMode === 'range' && (
        <div className="cascade-date-range">
          <label className="cascade-date-field"><span>开始</span><input type="date" value={filter.dateStart || ''} min={min} max={max} onChange={(event) => setDate('dateStart', event.target.value)} /></label>
          <span className="cascade-date-separator">至</span>
          <label className="cascade-date-field"><span>结束</span><input type="date" value={filter.dateEnd || ''} min={min} max={max} onChange={(event) => setDate('dateEnd', event.target.value)} /></label>
        </div>
      )}
    </section>
  );
}

export default function FilterCascade({
  rows = [],
  filter = EMPTY_FILTER,
  onChange,
  groups = [],
  dates = [],
  showDate = false,
  placeholder = '搜索关键词…',
  label = '筛选',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const current = { ...EMPTY_FILTER, ...(filter || {}) };
  const keywordOptions = useMemo(() => {
    const seen = new Set();
    return (Array.isArray(rows) ? rows : []).reduce((result, row) => {
      const value = keywordKey(row?.keyword);
      const labelText = String(row?.keyword || '').trim();
      const translationText = String(row?.translation || '').trim();
      if (!value || !labelText || seen.has(value)) return result;
      seen.add(value);
      result.push({ value, label: labelText, searchText: `${labelText} ${translationText}` });
      return result;
    }, []);
  }, [rows]);
  const visibleKeywordOptions = useMemo(() => {
    const query = keywordKey(current.query);
    if (!query) return keywordOptions;
    return keywordOptions.filter((option) => keywordKey(option.searchText || option.label).includes(query));
  }, [keywordOptions, current.query]);
  const activeCount = current.watch.length + current.relations.length + current.keywords.length
    + (showDate && current.dateMode !== 'all' ? 1 : 0);
  const hasAnyFilter = Boolean(current.query) || activeCount > 0;
  const update = (next) => onChange?.({ ...EMPTY_FILTER, ...next });
  const clear = () => update(EMPTY_FILTER);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [open]);

  return (
    <div className="cascade-filter" ref={rootRef}>
      <div className="cascade-filter-bar">
        <label className="cascade-search" aria-label={placeholder}>
          <Search size={14} aria-hidden="true" />
          <input value={current.query} placeholder={placeholder} onChange={(event) => update({ ...current, query: event.target.value })} />
          {current.query && <button type="button" className="cascade-search-clear" aria-label="清除搜索内容" onClick={() => update({ ...current, query: '' })}><X size={13} /></button>}
        </label>
        <button type="button" className={`cascade-trigger ${open ? 'is-open' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <span>{label}</span>{activeCount > 0 && <b>{activeCount}</b>}<ChevronDown size={14} />
        </button>
        {hasAnyFilter && <button type="button" className="cascade-clear" onClick={clear}>清除</button>}
      </div>
      {open && (
        <div className="cascade-popover" role="dialog" aria-label={`${label}条件`}>
          <div className="cascade-popover-head"><strong>筛选条件</strong><button type="button" aria-label="关闭筛选条件" onClick={() => setOpen(false)}><X size={15} /></button></div>
          <div className="cascade-group-list">
            {groups.map((group) => (
              <FilterGroup
                key={group.key}
                label={group.label}
                options={group.options || []}
                values={current[group.key] || []}
                onToggle={(value) => update({ ...current, [group.key]: toggleValue(current[group.key], value) })}
              />
            ))}
            {keywordOptions.length > 0 && (
              <section className="cascade-group cascade-keyword-group">
                <div className="cascade-group-title"><strong>关键词</strong><small>{current.keywords.length ? `已选 ${current.keywords.length}` : '可多选'}</small></div>
                <div className="cascade-options cascade-keyword-options">
                  {visibleKeywordOptions.length ? visibleKeywordOptions.map((option) => (
                    <CheckboxOption
                      key={option.value}
                      option={option}
                      checked={current.keywords.includes(option.value)}
                      onChange={() => update({ ...current, keywords: toggleValue(current.keywords, option.value) })}
                    />
                  )) : <span className="cascade-empty">没有匹配的关键词</span>}
                </div>
              </section>
            )}
            {showDate && <DateFilterGroup filter={current} dates={dates} onChange={update} />}
          </div>
          <div className="cascade-popover-foot"><span>{hasAnyFilter ? '已应用筛选条件' : '未设置筛选条件'}</span><button type="button" onClick={() => setOpen(false)}>完成</button></div>
        </div>
      )}
    </div>
  );
}
