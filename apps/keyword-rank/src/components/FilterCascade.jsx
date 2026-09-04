import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Pencil, Save, Search, Trash2, X } from 'lucide-react';

const KEYWORD_COMBINATION_STORAGE_KEY = 'keyword-tracker:keyword-combinations:v1';

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

function uniqueValues(values) {
  return [...new Set((values || []).map(keywordKey).filter(Boolean))];
}

function readKeywordCombinations() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEYWORD_COMBINATION_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.reduce((result, item) => {
      const name = String(item?.name || '').trim();
      const keywords = uniqueValues(item?.keywords);
      if (!name || !keywords.length) return result;
      result.push({
        id: String(item.id || `${Date.now()}-${result.length}`),
        name,
        keywords,
        updatedAt: String(item.updatedAt || ''),
      });
      return result;
    }, []);
  } catch {
    return [];
  }
}

function writeKeywordCombinations(items) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEYWORD_COMBINATION_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Keep the active session usable when storage is disabled or full.
  }
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

function FilterGroup({ label, options, values, onToggle, onToggleAll, allLabel = '全选' }) {
  const optionValues = options.map((option) => option.value);
  const allSelected = optionValues.length > 0 && optionValues.every((value) => values.includes(value));
  return (
    <section className="cascade-group">
      <div className="cascade-group-title">
        <strong>{label}</strong>
        <div className="cascade-group-actions">
          <small>{values.length ? `已选 ${values.length}` : '可多选'}</small>
          {optionValues.length > 0 && (
            <button type="button" onClick={() => onToggleAll(optionValues, !allSelected)}>{allSelected ? '取消全选' : allLabel}</button>
          )}
        </div>
      </div>
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

function KeywordCombinations({ items, currentKeywords, availableKeywords, onApply, onEdit, onDelete, onSave, editingId, name, onNameChange, message }) {
  const isEditing = Boolean(editingId);
  return (
    <section className="cascade-group cascade-combination-group">
      <div className="cascade-group-title"><strong>关键词组合</strong><small>{items.length ? `已保存 ${items.length}` : '保存后各页面可用'}</small></div>
      <div className="cascade-combination-editor">
        <input
          value={name}
          maxLength={30}
          placeholder={isEditing ? '修改组合名称' : '输入组合名称'}
          aria-label="关键词组合名称"
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onSave(); } }}
        />
        <button type="button" className="cascade-combination-save" onClick={onSave} disabled={!currentKeywords.length}>
          <Save size={13} />{isEditing ? '更新' : '保存当前选择'}
        </button>
      </div>
      {message && <div className="cascade-combination-message" role="status">{message}</div>}
      {items.length > 0 && (
        <div className="cascade-combination-list">
          {items.map((item) => {
            const availableCount = item.keywords.filter((keyword) => availableKeywords.has(keyword)).length;
            return (
              <div className={`cascade-combination-item ${editingId === item.id ? 'is-editing' : ''}`} key={item.id}>
                <button type="button" className="cascade-combination-apply" onClick={() => onApply(item)} disabled={!availableCount} title={`应用 ${item.name}`}>
                  <strong>{item.name}</strong><small>{availableCount === item.keywords.length ? `${item.keywords.length} 个关键词` : `当前可用 ${availableCount}/${item.keywords.length}`}</small>
                </button>
                <button type="button" className="cascade-combination-icon" aria-label={`编辑关键词组合“${item.name}”`} title="编辑" onClick={() => onEdit(item)}><Pencil size={13} /></button>
                <button type="button" className="cascade-combination-icon is-delete" aria-label={`删除关键词组合“${item.name}”`} title="删除" onClick={() => onDelete(item)}><Trash2 size={13} /></button>
              </div>
            );
          })}
        </div>
      )}
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
  const [keywordCombinations, setKeywordCombinations] = useState(readKeywordCombinations);
  const [combinationName, setCombinationName] = useState('');
  const [editingCombinationId, setEditingCombinationId] = useState('');
  const [combinationMessage, setCombinationMessage] = useState('');
  const [popoverStyle, setPopoverStyle] = useState(undefined);
  const rootRef = useRef(null);
  const popoverRef = useRef(null);
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
  const availableKeywordKeys = useMemo(() => new Set(keywordOptions.map((option) => option.value)), [keywordOptions]);
  const setOptionSelection = (field, optionValues, shouldSelect) => {
    const next = new Set(current[field] || []);
    optionValues.forEach((value) => (shouldSelect ? next.add(value) : next.delete(value)));
    update({ ...current, [field]: [...next] });
  };
  const resetCombinationEditor = (message = '') => {
    setCombinationName('');
    setEditingCombinationId('');
    setCombinationMessage(message);
  };
  const saveCombination = () => {
    const name = combinationName.trim();
    const keywords = uniqueValues(current.keywords);
    if (!name) { setCombinationMessage('请先输入组合名称。'); return; }
    if (!keywords.length) { setCombinationMessage('请先选择至少一个关键词。'); return; }
    const duplicate = keywordCombinations.find((item) => keywordKey(item.name) === keywordKey(name) && item.id !== editingCombinationId);
    if (duplicate) { setCombinationMessage('已有同名组合，请换一个名称或编辑原组合。'); return; }
    const now = new Date().toISOString();
    const next = editingCombinationId
      ? keywordCombinations.map((item) => (item.id === editingCombinationId ? { ...item, name, keywords, updatedAt: now } : item))
      : [...keywordCombinations, { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`, name, keywords, updatedAt: now }];
    setKeywordCombinations(next);
    writeKeywordCombinations(next);
    resetCombinationEditor(editingCombinationId ? '组合已更新。' : '组合已保存。');
  };
  const applyCombination = (item) => {
    const keywords = item.keywords.filter((keyword) => availableKeywordKeys.has(keyword));
    if (!keywords.length) { setCombinationMessage('这个组合在当前页面没有可用关键词。'); return; }
    update({ ...current, keywords });
    resetCombinationEditor(`已应用“${item.name}”，共 ${keywords.length} 个关键词。`);
  };
  const editCombination = (item) => {
    const keywords = item.keywords.filter((keyword) => availableKeywordKeys.has(keyword));
    update({ ...current, keywords });
    setCombinationName(item.name);
    setEditingCombinationId(item.id);
    setCombinationMessage('已载入组合；调整关键词或名称后点击“更新”。');
  };
  const deleteCombination = (item) => {
    if (!window.confirm(`确定删除关键词组合“${item.name}”吗？`)) return;
    const next = keywordCombinations.filter((candidate) => candidate.id !== item.id);
    setKeywordCombinations(next);
    writeKeywordCombinations(next);
    resetCombinationEditor(`已删除“${item.name}”。`);
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      if (!rootRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const positionPopover = () => {
      const trigger = rootRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const gutter = 12;
      const gap = 7;
      const width = Math.min(410, window.innerWidth - gutter * 2);
      const left = Math.max(gutter, Math.min(trigger.right - width, window.innerWidth - width - gutter));
      const spaceBelow = window.innerHeight - trigger.bottom - gap - gutter;
      const spaceAbove = trigger.top - gap - gutter;
      const placeAbove = spaceBelow < 260 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(180, Math.min(620, placeAbove ? spaceAbove : spaceBelow));
      const top = placeAbove ? trigger.top - gap - maxHeight : trigger.bottom + gap;
      setPopoverStyle({ position: 'fixed', top, left, right: 'auto', width, maxHeight });
    };
    positionPopover();
    window.addEventListener('resize', positionPopover);
    window.addEventListener('scroll', positionPopover, true);
    return () => {
      window.removeEventListener('resize', positionPopover);
      window.removeEventListener('scroll', positionPopover, true);
    };
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
      {open && createPortal(
        <div className="cascade-popover" ref={popoverRef} role="dialog" aria-label={`${label}条件`} style={popoverStyle}>
          <div className="cascade-popover-head"><strong>筛选条件</strong><button type="button" aria-label="关闭筛选条件" onClick={() => setOpen(false)}><X size={15} /></button></div>
          <div className="cascade-group-list">
            {groups.map((group) => (
              <FilterGroup
                key={group.key}
                label={group.label}
                options={group.options || []}
                values={current[group.key] || []}
                onToggle={(value) => update({ ...current, [group.key]: toggleValue(current[group.key], value) })}
                onToggleAll={(values, shouldSelect) => setOptionSelection(group.key, values, shouldSelect)}
              />
            ))}
            {keywordOptions.length > 0 && (
              <section className="cascade-group cascade-keyword-group">
                <div className="cascade-group-title">
                  <strong>关键词</strong>
                  <div className="cascade-group-actions">
                    <small>{current.keywords.length ? `已选 ${current.keywords.length}` : '可多选'}</small>
                    {visibleKeywordOptions.length > 0 && (
                      <button type="button" onClick={() => {
                        const values = visibleKeywordOptions.map((option) => option.value);
                        const allSelected = values.every((value) => current.keywords.includes(value));
                        setOptionSelection('keywords', values, !allSelected);
                      }}>{visibleKeywordOptions.every((option) => current.keywords.includes(option.value)) ? '取消全选' : (current.query ? '全选搜索结果' : '全选')}</button>
                    )}
                  </div>
                </div>
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
            {keywordOptions.length > 0 && (
              <KeywordCombinations
                items={keywordCombinations}
                currentKeywords={current.keywords}
                availableKeywords={availableKeywordKeys}
                onApply={applyCombination}
                onEdit={editCombination}
                onDelete={deleteCombination}
                onSave={saveCombination}
                editingId={editingCombinationId}
                name={combinationName}
                onNameChange={(value) => { setCombinationName(value); setCombinationMessage(''); }}
                message={combinationMessage}
              />
            )}
            {showDate && <DateFilterGroup filter={current} dates={dates} onChange={update} />}
          </div>
          <div className="cascade-popover-foot"><span>{hasAnyFilter ? '已应用筛选条件' : '未设置筛选条件'}</span><button type="button" onClick={() => setOpen(false)}>完成</button></div>
        </div>,
        document.body,
      )}
    </div>
  );
}
