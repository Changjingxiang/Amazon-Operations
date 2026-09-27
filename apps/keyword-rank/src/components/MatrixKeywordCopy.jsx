import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Keyboard, X } from 'lucide-react';

const SHORTCUT_KEY = 'keyword-tracker:matrix-copy-shortcut';
const DEFAULT_SHORTCUT = 'Ctrl+Alt+K';
const RESERVED = new Set(['Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+A', 'Ctrl+F', 'Ctrl+P', 'Ctrl+R', 'Ctrl+W', 'Ctrl+T', 'Ctrl+N']);

function shortcutFromEvent(event) {
  const key = event.key.length === 1 ? event.key.toUpperCase() : '';
  if (!/^[A-Z0-9]$/.test(key) || !(event.ctrlKey || event.altKey || event.metaKey)) return '';
  return `${event.ctrlKey ? 'Ctrl+' : ''}${event.altKey ? 'Alt+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.metaKey ? 'Meta+' : ''}${key}`;
}

function isEditable(target) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function hasOpenDialog() {
  return [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(
    (dialog) => !dialog.closest('[aria-hidden="true"], [hidden]') && dialog.getClientRects().length > 0,
  );
}

function readShortcut() {
  try { return localStorage.getItem(SHORTCUT_KEY) || DEFAULT_SHORTCUT; } catch { return DEFAULT_SHORTCUT; }
}

function useCopyShortcut() {
  const [shortcut, setShortcut] = useState(readShortcut);
  useEffect(() => {
    const update = () => setShortcut(readShortcut());
    window.addEventListener('matrix-copy-shortcut-change', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('matrix-copy-shortcut-change', update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return shortcut;
}

async function writeClipboard(value) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('无法写入剪贴板');
  }
}

export function useMatrixKeywordCopy(scope) {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState(() => new Map());
  const shortcut = useCopyShortcut();
  const [status, setStatus] = useState('');
  const dragRef = useRef(null);
  const ignoreClickRef = useRef(null);

  useEffect(() => { setActive(false); setSelected(new Map()); setStatus(''); dragRef.current = null; }, [scope]);

  const toggleActive = useCallback(() => {
    setActive((value) => !value);
    setStatus('');
  }, []);

  const toggleKeyword = useCallback((keyword) => {
    const value = String(keyword || '').trim();
    if (!value) return;
    const key = value.toLocaleLowerCase('en-US');
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(key)) next.delete(key);
      else next.set(key, value);
      return next;
    });
    setStatus('');
  }, []);

  const selectKeywords = useCallback((keywords) => {
    setSelected((current) => {
      const next = new Map(current);
      for (const keyword of keywords) {
        const value = String(keyword || '').trim();
        if (value) next.set(value.toLocaleLowerCase('en-US'), value);
      }
      return next;
    });
    setStatus('');
  }, []);

  const copy = useCallback(async () => {
    if (!selected.size) { setStatus('请先选择关键词'); return; }
    try {
      await writeClipboard([...selected.values()].join('\n'));
      setStatus(`已复制 ${selected.size} 个关键词，每行一个`);
    } catch {
      setStatus('复制失败，请检查剪贴板权限后重试');
    }
  }, [selected]);

  useEffect(() => {
    const handleKey = (event) => {
      if (isEditable(event.target) || hasOpenDialog()) return;
      if (active && event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setActive(false);
        return;
      }
      const keywordCell = event.target?.closest?.('.matrix-copy-selectable');
      if (active && event.key === 'Enter' && !event.repeat && (keywordCell || event.target === document.body)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void copy();
        return;
      }
      if (shortcutFromEvent(event) !== shortcut) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleActive();
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [active, shortcut, toggleActive, copy]);

  useEffect(() => {
    const finish = (event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      if (!drag.dragged && event.type === 'pointerup') toggleKeyword(drag.keyword);
      ignoreClickRef.current = event.timeStamp;
    };
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
    return () => {
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
    };
  }, [toggleKeyword]);

  const onCellPointerDown = useCallback((event) => {
    if (!active || event.pointerType !== 'mouse' || event.button !== 0) return;
    event.preventDefault();
    const cell = event.currentTarget;
    cell.focus({ preventScroll: true });
    dragRef.current = {
      pointerId: event.pointerId,
      keyword: cell.dataset.copyKeyword,
      startCell: cell,
      root: cell.closest('.matrix-scroll, .comparison-scroll'),
      dragged: false,
    };
  }, [active]);

  const onCellPointerEnter = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !(event.buttons & 1)) return;
    const cell = event.currentTarget;
    if (cell === drag.startCell) return;
    drag.dragged = true;
    const cells = [...(drag.root?.querySelectorAll('.matrix-copy-selectable[data-copy-keyword]') || [])];
    const first = cells.indexOf(drag.startCell);
    const last = cells.indexOf(cell);
    const range = first >= 0 && last >= 0
      ? cells.slice(Math.min(first, last), Math.max(first, last) + 1).map((item) => item.dataset.copyKeyword)
      : [drag.keyword, cell.dataset.copyKeyword];
    selectKeywords(range);
  }, [selectKeywords]);

  const consumePointerClick = useCallback((event) => {
    const endedAt = ignoreClickRef.current;
    ignoreClickRef.current = null;
    return endedAt != null && event.timeStamp - endedAt < 150;
  }, []);

  const onCellClick = useCallback((event) => {
    if (!consumePointerClick(event)) toggleKeyword(event.currentTarget.dataset.copyKeyword);
  }, [consumePointerClick, toggleKeyword]);

  const cellHandlers = { onPointerDown: onCellPointerDown, onPointerEnter: onCellPointerEnter, onClick: onCellClick };

  const isSelected = useCallback((keyword) => selected.has(String(keyword || '').trim().toLocaleLowerCase('en-US')), [selected]);

  const controls = (
    <div className="matrix-copy-controls" role="group" aria-label="批量复制关键词">
      <button type="button" className={active ? 'is-active' : ''} aria-pressed={active} onClick={toggleActive}><Copy size={14} />{active ? '退出多选' : '多选复制'}</button>
      {active && <><span className="matrix-copy-count">已选 {selected.size} · 按 Enter 复制</span><button type="button" disabled={!selected.size} onClick={copy}><Check size={14} />复制关键词</button><button type="button" disabled={!selected.size} onClick={() => { setSelected(new Map()); setStatus(''); }}>清空</button></>}
      {status && <span role="status" className="matrix-copy-status">{status}</span>}
    </div>
  );

  return { active, selected, isSelected, toggleKeyword, consumePointerClick, cellHandlers, controls };
}

export function MatrixCopyShortcutSetting() {
  const shortcut = useCopyShortcut();
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState('');
  const recordKey = (event) => {
    if (event.key === 'Tab') { setRecording(false); return; }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') { setRecording(false); return; }
    const next = shortcutFromEvent(event);
    if (!next || RESERVED.has(next)) { setMessage('请按 Ctrl／Alt 加字母或数字，避开浏览器常用快捷键'); return; }
    try { localStorage.setItem(SHORTCUT_KEY, next); } catch {}
    window.dispatchEvent(new Event('matrix-copy-shortcut-change'));
    setRecording(false);
    setMessage(`已设为 ${next}`);
  };
  return <div className="settings-matrix-shortcut">
    <div><strong>多选复制关键词快捷键</strong><small>适用于自然、SP、对比和 ABA 矩阵；点选或按住鼠标左键拖选，按 Enter 复制。</small></div>
    <button type="button" className={recording ? 'is-recording' : ''} onClick={() => { setRecording((value) => !value); setMessage(''); }} onKeyDown={recording ? recordKey : undefined} onBlur={() => setRecording(false)}><Keyboard size={16} />{recording ? '请按新快捷键…' : shortcut}</button>
    {recording && <button type="button" className="settings-shortcut-cancel" onClick={() => setRecording(false)} aria-label="取消设置快捷键"><X size={15} /></button>}
    {message && <small role="status" className="settings-shortcut-status">{message}</small>}
  </div>;
}

export function KeywordCopyButton({ keyword, selected, onToggle, onConsumeClick }) {
  return <button type="button" className="matrix-copy-row-button" aria-pressed={selected} aria-label={`${selected ? '取消选择' : '选择'}关键词 ${keyword}`} title={selected ? '取消选择' : '选择复制'} onClick={(event) => { event.stopPropagation(); if (!onConsumeClick(event)) onToggle(keyword); }}>{selected ? <Check size={13} /> : null}</button>;
}
