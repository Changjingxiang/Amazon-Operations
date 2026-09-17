import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquareText, X } from 'lucide-react';

// A non-modal editor: the rank remains visible and other cells stay usable.
export default function AnnotationEditor({ editor, metric, onSave, onCancel }) {
  const [draft, setDraft] = useState(editor.original);
  const [position, setPosition] = useState({ left: 8, top: 8, visibility: 'hidden' });
  const cardRef = useRef(null);
  const draftRef = useRef(draft);
  const actionsRef = useRef({ onSave, onCancel });
  const finished = useRef(false);
  draftRef.current = draft;
  actionsRef.current = { onSave, onCancel };

  const finish = (save, text, restoreFocus = true) => {
    if (finished.current) return;
    finished.current = true;
    if (save) actionsRef.current.onSave(text ?? draftRef.current);
    else actionsRef.current.onCancel();
    if (restoreFocus && editor.anchor?.isConnected) editor.anchor.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    const place = () => {
      const card = cardRef.current;
      if (!card || !editor.anchor?.isConnected) return;
      const rect = editor.anchor.getBoundingClientRect();
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const below = rect.bottom + 8;
      const top = below + height <= window.innerHeight - 8 ? below : rect.top - height - 8;
      setPosition({ left, top: Math.max(8, Math.min(top, window.innerHeight - height - 8)), visibility: 'visible' });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(cardRef.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [editor.anchor]);

  useEffect(() => {
    const outside = (event) => {
      if (cardRef.current?.contains(event.target) || editor.anchor?.contains(event.target)) return;
      finish(true, undefined, false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [editor.anchor]);

  return createPortal(
    <div ref={cardRef} className="annotation-editor" role="dialog" aria-label="编辑排名标注" style={position}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); finish(false); }
      }}>
      <div className="annotation-editor-heading"><span><MessageSquareText size={15} />{editor.original ? '编辑标注' : '添加标注'}</span><button type="button" className="annotation-editor-close" aria-label="取消并关闭标注" onClick={() => finish(false)}><X size={16} /></button></div>
      <div className="annotation-editor-keyword" title={editor.keyword}>{editor.keyword}</div>
      <div className="annotation-editor-context"><span>{editor.date}</span><span>{metric === 'natural' ? '自然排名' : 'SP排名'} · <b>{Number(editor.rank) > 0 ? editor.rank : '未上榜'}</b></span></div>
      <label className="annotation-editor-label" htmlFor="matrix-annotation-draft">标注内容</label>
      <textarea id="matrix-annotation-draft" autoFocus value={draft} placeholder="记录出价调整、观察原因或后续安排…" onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); finish(true); }
        }} />
      <div className="annotation-editor-hint">Enter 保存 · Shift+Enter 换行 · Esc 取消<br />点击卡片外也会保存</div>
      <div className="annotation-editor-actions">{editor.original && <button type="button" className="annotation-editor-clear" onClick={() => finish(true, '')}>清除标注</button>}<span /><button type="button" onClick={() => finish(false)}>取消</button><button type="button" className="annotation-editor-save" onClick={() => finish(true)}>保存</button></div>
    </div>, document.body,
  );
}
