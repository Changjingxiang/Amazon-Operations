import { useCallback, useEffect, useState } from 'react';
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
  const [shortcut, setShortcut] = useState(() => {
    try { return localStorage.getItem(SHORTCUT_KEY) || DEFAULT_SHORTCUT; } catch { return DEFAULT_SHORTCUT; }
  });
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => { setActive(false); setSelected(new Map()); setRecording(false); setStatus(''); }, [scope]);

  const toggleActive = useCallback(() => {
    setActive((value) => !value);
    setRecording(false);
    setStatus('');
  }, []);

  useEffect(() => {
    const handleKey = (event) => {
      if (recording || isEditable(event.target) || hasOpenDialog()) return;
      if (active && event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setActive(false);
        return;
      }
      if (shortcutFromEvent(event) !== shortcut) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleActive();
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [active, recording, shortcut, toggleActive]);

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

  const isSelected = useCallback((keyword) => selected.has(String(keyword || '').trim().toLocaleLowerCase('en-US')), [selected]);

  const copy = async () => {
    if (!selected.size) return;
    try {
      await writeClipboard([...selected.values()].join('\n'));
      setStatus(`已复制 ${selected.size} 个关键词，每行一个`);
    } catch {
      setStatus('复制失败，请检查剪贴板权限后重试');
    }
  };

  const recordKey = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') { setRecording(false); return; }
    const next = shortcutFromEvent(event);
    if (!next || RESERVED.has(next)) { setStatus('请按 Ctrl／Alt 加字母或数字，避开浏览器常用快捷键'); return; }
    setShortcut(next);
    setRecording(false);
    setStatus(`快捷键已设为 ${next}`);
    try { localStorage.setItem(SHORTCUT_KEY, next); } catch {}
  };

  const controls = (
    <div className="matrix-copy-controls" role="group" aria-label="批量复制关键词">
      <button type="button" className={active ? 'is-active' : ''} aria-pressed={active} onClick={toggleActive}><Copy size={14} />{active ? '退出多选' : '多选复制'}</button>
      {active && <><span className="matrix-copy-count">已选 {selected.size}</span><button type="button" disabled={!selected.size} onClick={copy}><Check size={14} />复制关键词</button><button type="button" disabled={!selected.size} onClick={() => { setSelected(new Map()); setStatus(''); }}>清空</button></>}
      <button type="button" className="matrix-copy-shortcut" title="点击后按下新的快捷键；Esc 取消" onClick={() => { setRecording(true); setStatus(''); }} onKeyDown={recording ? recordKey : undefined}><Keyboard size={14} />{recording ? '请按新快捷键…' : `快捷键 ${shortcut}`}</button>
      {recording && <button type="button" aria-label="取消设置快捷键" onClick={() => setRecording(false)}><X size={13} /></button>}
      {status && <span role="status" className="matrix-copy-status">{status}</span>}
    </div>
  );

  return { active, selected, isSelected, toggleKeyword, controls };
}

export function KeywordCopyButton({ keyword, selected, onToggle }) {
  return <button type="button" className="matrix-copy-row-button" aria-pressed={selected} aria-label={`${selected ? '取消选择' : '选择'}关键词 ${keyword}`} title={selected ? '取消选择' : '选择复制'} onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onToggle(keyword); }}>{selected ? <Check size={13} /> : null}</button>;
}
