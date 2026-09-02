import { ArrowDown, ArrowUp, GripVertical, Lightbulb, Star, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

function moveItem(items, from, to) {
  if (from == null || to == null || from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const itemKey = item.keyword.trim().toLocaleLowerCase();
    if (!itemKey || seen.has(itemKey)) return false;
    seen.add(itemKey);
    return true;
  });
}

export default function WatchDrawer({ open, model, onClose, onSave, initialKeyword = '' }) {
  const [keywords, setKeywords] = useState('');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState([]);
  const [dragIndex, setDragIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [keyboardGrabbed, setKeyboardGrabbed] = useState(null);
  const pointerRef = useRef({ id: null, index: null });

  useEffect(() => {
    if (open) {
      setKeywords(initialKeyword || '');
      setNote('');
      setDragIndex(null);
      setDropIndex(null);
      setKeyboardGrabbed(null);
      setDraft((model?.watches || []).map((watch) => ({ keyword: watch.keyword, note: watch.note || '' })));
    }
  }, [open, initialKeyword, model?.parentAsin]);

  const pendingKeywords = useMemo(
    () => keywords.split(/[\r\n,，;；]+/).map((value) => value.trim()).filter(Boolean),
    [keywords],
  );
  const saveItems = useMemo(() => {
    const merged = [...draft];
    const seen = new Set(merged.map((item) => item.keyword.trim().toLocaleLowerCase()));
    for (const keyword of pendingKeywords) {
      const itemKey = keyword.toLocaleLowerCase();
      if (!seen.has(itemKey)) { merged.push({ keyword, note: note.trim() }); seen.add(itemKey); }
    }
    return dedupe(merged);
  }, [draft, pendingKeywords, note]);

  const finishPointerDrag = (event) => {
    if (pointerRef.current.id !== event.pointerId) return;
    const from = pointerRef.current.index;
    const to = dropIndex;
    const normalizedTo = to != null && from != null && to > from ? to - 1 : to;
    if (from != null && normalizedTo != null && from !== normalizedTo) setDraft((items) => moveItem(items, from, normalizedTo));
    pointerRef.current = { id: null, index: null };
    setDragIndex(null);
    setDropIndex(null);
  };

  const updateDropTarget = (event) => {
    if (pointerRef.current.id !== event.pointerId) return;
    const itemElement = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-watch-index]');
    if (!itemElement) return;
    const target = Number(itemElement.dataset.watchIndex);
    const rect = itemElement.getBoundingClientRect();
    setDropIndex(event.clientY > rect.top + rect.height / 2 ? target + 1 : target);
  };

  const startPointerDrag = (event, index) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointerRef.current = { id: event.pointerId, index };
    setDragIndex(index);
    setDropIndex(index);
  };

  const moveWithKeyboard = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= draft.length) return;
    setDraft((items) => moveItem(items, index, target));
    setKeyboardGrabbed(target);
    setDragIndex(target);
    setDropIndex(target);
  };

  const handleHandleKeyDown = (event, index) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      setKeyboardGrabbed((current) => current === index ? null : index);
      setDragIndex((current) => current === index ? null : index);
      setDropIndex(null);
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      moveWithKeyboard(index, -1);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      moveWithKeyboard(index, 1);
    } else if (event.key === 'Escape') {
      setKeyboardGrabbed(null);
      setDragIndex(null);
      setDropIndex(null);
    }
  };

  if (!open) return null;
  return (
    <aside className="watch-drawer" aria-label="关注关键词">
      <div className="drawer-header"><h2>关注关键词</h2><button type="button" onClick={onClose}><X /></button></div>
      <p className="drawer-intro">支持批量导入；拖拽手柄、触屏或键盘都能调整同一张卡片的顺序。</p>
      <label>所属产品<input value={model.modelName} disabled /></label>
      <label>新增关键词（可批量填写）<textarea className="watch-keywords-input" value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="每行一个关键词，也支持逗号、分号分隔" /></label>
      <label>新增词备注（可选）<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={100} placeholder="例如：重点观察" /></label>
      <div className="watch-save-row">
        <span><Star size={24} fill="currentColor" />待保存 {saveItems.length} 个</span>
        <button type="button" className="primary-button" onClick={() => onSave(saveItems)}>{saveItems.length ? '保存并同步' : '清空并同步'}</button>
      </div>
      <div className="current-watches">
        <h3>当前关注词 <span>{draft.length}</span></h3>
        <div className="watch-list" onPointerMove={updateDropTarget} onPointerUp={finishPointerDrag} onPointerCancel={finishPointerDrag}>
          {draft.map((watch, index) => {
            const isDragging = dragIndex === index;
            const showDropBefore = dropIndex === index && dragIndex !== index;
            const showDropAfter = dropIndex === index + 1 && dragIndex !== index && index === draft.length - 1;
            return (
              <div key={`${watch.keyword}-${index}`}>
                {showDropBefore && <div className="watch-drop-placeholder" aria-label="放置到此处">放置到这里</div>}
                <div data-watch-index={index} className={`watch-item${isDragging ? ' dragging' : ''}${keyboardGrabbed === index ? ' keyboard-grabbed' : ''}`}>
                  <button type="button" className="drag-handle" aria-label={`拖拽调整“${watch.keyword}”顺序`} aria-grabbed={keyboardGrabbed === index} title="拖拽排序；键盘可用空格抓取、上下箭头移动" onPointerDown={(event) => startPointerDrag(event, index)} onKeyDown={(event) => handleHandleKeyDown(event, index)}><GripVertical size={18} /></button>
                  <Star size={18} fill="currentColor" className="watch-star" />
                  <span className="watch-keyword-text">{watch.keyword}</span>
                  <button type="button" className="move-button" title="上移" aria-label={`上移“${watch.keyword}”`} disabled={index === 0} onClick={() => moveWithKeyboard(index, -1)}><ArrowUp size={15} /></button>
                  <button type="button" className="move-button" title="下移" aria-label={`下移“${watch.keyword}”`} disabled={index === draft.length - 1} onClick={() => moveWithKeyboard(index, 1)}><ArrowDown size={15} /></button>
                  <button type="button" className="remove-watch-button" title="移除" aria-label={`移除“${watch.keyword}”`} onClick={() => setDraft((items) => items.filter((_item, itemIndex) => itemIndex !== index))}><X size={16} /></button>
                </div>
                {showDropAfter && <div className="watch-drop-placeholder" aria-label="放置到此处">放置到这里</div>}
              </div>
            );
          })}
          {!draft.length && <div className="watch-empty">还没有关注词；可在上方一次粘贴多个关键词。</div>}
        </div>
      </div>
      <div className="drawer-note"><Lightbulb size={21} /><span>鼠标/触屏：只拖左侧手柄；键盘：聚焦手柄后按空格，再按 ↑/↓。上移、下移按钮与拖拽使用同一排序结果。</span></div>
    </aside>
  );
}
