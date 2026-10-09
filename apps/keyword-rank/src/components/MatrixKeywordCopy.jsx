import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Keyboard, X } from 'lucide-react';
import searchMascot from '../assets/keyword-copy/k-search.webp';
import successMascot from '../assets/keyword-copy/k-copy-success.webp';

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
  return [...document.querySelectorAll('[role="dialog"]')].some(
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
    const previousFocus = document.activeElement;
    let copied = false;
    try {
      input.select();
      copied = document.execCommand('copy');
    } finally {
      input.remove();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    }
    if (!copied) throw new Error('无法写入剪贴板');
  }
}

function KeywordCopyFeedback({ phase, selectedCount, copiedCount, successId }) {
  const [placement, setPlacement] = useState(null);

  useLayoutEffect(() => {
    const header = document.querySelector('.topbar');
    const titlebar = document.querySelector('.window-titlebar');
    const actions = header?.querySelector('.header-actions');
    const title = header?.querySelector('h1');
    const subtitle = header?.querySelector('p');
    const dragSpace = titlebar?.querySelector('.window-drag-space');
    const textRight = (element) => {
      if (!element) return 0;
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().right;
    };
    const place = () => {
      const headerBox = header?.getBoundingClientRect();
      const actionsBox = actions?.getBoundingClientRect();
      let gap = headerBox && actionsBox && headerBox.height && !document.querySelector('.dashboard-expanded')
        ? { left: Math.max(headerBox.left + 16, textRight(title) + 20, textRight(subtitle) + 20), right: actionsBox.left - 16, top: headerBox.top, height: headerBox.height }
        : null;
      let compact = false;
      // Use the existing titlebar space when the product header is hidden,
      // covered by the expanded dashboard, or too crowded for the feedback.
      if (!gap || gap.right - gap.left < 260) {
        const dragBox = dragSpace?.getBoundingClientRect();
        gap = dragBox?.height ? { left: dragBox.left + 8, right: dragBox.right - 8, top: dragBox.top, height: dragBox.height } : null;
        compact = true;
      }
      const size = compact ? Math.min(34, gap?.height || 0) : 64;
      const width = Math.min(compact ? 240 : 260, gap ? gap.right - gap.left : 0);
      const next = width >= size && size > 0 ? {
        left: Math.max(gap.left, Math.min(window.innerWidth / 2 - width / 2, gap.right - width)),
        top: gap.top + (gap.height - size) / 2, width, size, compact,
        hideLabel: width < size + 100,
      } : null;
      setPlacement((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    place();
    const resize = new ResizeObserver(place);
    [header, actions, title, subtitle, titlebar, dragSpace].filter(Boolean).forEach((element) => resize.observe(element));
    const changes = new MutationObserver(place);
    changes.observe(document.body, { childList: true });
    const main = document.querySelector('.main-area');
    if (main) changes.observe(main, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { resize.disconnect(); changes.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, []);

  const message = phase === 'success' ? `复制成功 · ${copiedCount} 个关键词` : phase === 'copying' ? '正在复制关键词…' : selectedCount ? `正在选择 · ${selectedCount} 个关键词` : '正在寻找关键词…';
  if (phase === 'idle') return null;
  return createPortal(
    <div className={`keyword-copy-feedback-slot ${placement?.compact ? 'is-compact' : ''} ${placement?.hideLabel ? 'is-icon-only' : ''}`} role="status" aria-live="polite" aria-atomic="true" data-copy-placement={placement?.compact ? 'titlebar' : 'header'} style={placement ? { left: placement.left, top: placement.top, width: placement.width, '--copy-feedback-size': `${placement.size}px` } : { visibility: 'hidden' }}>
      <div key={successId} className={`keyword-copy-feedback ${phase === 'success' ? 'is-success' : ''}`} data-copy-phase={phase}>
        <img src={phase === 'success' ? `${successMascot}?copy=${successId}` : searchMascot} width="64" height="64" alt="" aria-hidden="true" draggable="false" />
        <span>{message}</span>
      </div>
    </div>, document.body,
  );
}

export function useMatrixKeywordCopy(scope) {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState(() => new Map());
  const shortcut = useCopyShortcut();
  const [status, setStatus] = useState('');
  const [phase, setPhase] = useState('selecting');
  const [copying, setCopying] = useState(false);
  const [copiedCount, setCopiedCount] = useState(0);
  const [successId, setSuccessId] = useState(0);
  const dragRef = useRef(null);
  const ignoreClickRef = useRef(null);
  const feedbackTimerRef = useRef(null);
  const contextRef = useRef(0);
  const activeRef = useRef(false);
  const copyingRef = useRef(false);

  const clearFeedbackTimer = useCallback(() => {
    window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = null;
  }, []);

  const showSelecting = useCallback(() => {
    clearFeedbackTimer();
    setStatus('');
    setPhase('selecting');
  }, [clearFeedbackTimer]);

  useEffect(() => {
    contextRef.current += 1;
    activeRef.current = false;
    copyingRef.current = false;
    setActive(false);
    setSelected(new Map());
    setCopying(false);
    showSelecting();
    dragRef.current = null;
    ignoreClickRef.current = null;
    return () => { contextRef.current += 1; clearFeedbackTimer(); };
  }, [scope, clearFeedbackTimer, showSelecting]);

  const toggleActive = useCallback(() => {
    activeRef.current = !activeRef.current;
    setActive(activeRef.current);
    showSelecting();
    dragRef.current = null;
  }, [showSelecting]);

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
    showSelecting();
  }, [showSelecting]);

  const selectKeywords = useCallback((keywords) => {
    setSelected((current) => {
      const next = new Map(current);
      for (const keyword of keywords) {
        const value = String(keyword || '').trim();
        if (value) next.set(value.toLocaleLowerCase('en-US'), value);
      }
      return next;
    });
    showSelecting();
  }, [showSelecting]);

  const copy = useCallback(async () => {
    if (copyingRef.current) return;
    if (!selected.size) { setStatus('请先选择关键词'); return; }
    const context = contextRef.current;
    const count = selected.size;
    copyingRef.current = true;
    setCopying(true);
    clearFeedbackTimer();
    setStatus('');
    setPhase('copying');
    try {
      await writeClipboard([...selected.values()].join('\n'));
      if (context !== contextRef.current || !activeRef.current) return;
      setCopiedCount(count);
      setSuccessId((value) => Math.max(Date.now(), value + 1));
      setPhase('success');
      feedbackTimerRef.current = window.setTimeout(() => { setPhase('idle'); feedbackTimerRef.current = null; }, 2000);
    } catch {
      if (context !== contextRef.current || !activeRef.current) return;
      setStatus('复制失败，请检查剪贴板权限后重试');
      setPhase('selecting');
    } finally {
      if (context === contextRef.current) { copyingRef.current = false; setCopying(false); }
    }
  }, [selected, clearFeedbackTimer]);

  useEffect(() => {
    const handleKey = (event) => {
      if (isEditable(event.target) || hasOpenDialog()) return;
      if (active && event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        toggleActive();
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
      root: cell.closest('.matrix-scroll, .comparison-scroll, .dashboard-scroll'),
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
      {active && <><span className="matrix-copy-count" title="按 Enter 复制所选关键词">已选 {selected.size}<span className="matrix-copy-key-hint"> · 按 Enter 复制</span></span><button type="button" disabled={!selected.size || copying} onClick={copy}><Check size={14} />{copying ? '正在复制…' : '复制关键词'}</button><button type="button" disabled={!selected.size} onClick={() => { setSelected(new Map()); showSelecting(); }}>清空</button></>}
      {status && <span role="status" className="matrix-copy-status">{status}</span>}
    </div>
  );

  const feedback = active ? <KeywordCopyFeedback phase={phase} selectedCount={selected.size} copiedCount={copiedCount} successId={successId} /> : null;

  return { active, selected, isSelected, toggleKeyword, consumePointerClick, cellHandlers, controls, feedback };
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
    <div><strong>多选复制关键词快捷键</strong><small>适用于看板、自然、SP、对比和 ABA 矩阵；点选或按住鼠标左键拖选，按 Enter 复制。</small></div>
    <button type="button" className={recording ? 'is-recording' : ''} onClick={() => { setRecording((value) => !value); setMessage(''); }} onKeyDown={recording ? recordKey : undefined} onBlur={() => setRecording(false)}><Keyboard size={16} />{recording ? '请按新快捷键…' : shortcut}</button>
    {recording && <button type="button" className="settings-shortcut-cancel" onClick={() => setRecording(false)} aria-label="取消设置快捷键"><X size={15} /></button>}
    {message && <small role="status" className="settings-shortcut-status">{message}</small>}
  </div>;
}

export function KeywordCopyButton({ keyword, selected, onToggle, onConsumeClick }) {
  return <button type="button" className="matrix-copy-row-button" aria-pressed={selected} aria-label={`${selected ? '取消选择' : '选择'}关键词 ${keyword}`} title={selected ? '取消选择' : '选择复制'} onClick={(event) => { event.stopPropagation(); if (!onConsumeClick(event)) onToggle(keyword); }}>{selected ? <Check size={13} /> : null}</button>;
}
