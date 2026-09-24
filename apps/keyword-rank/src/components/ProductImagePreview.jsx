import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getApparelIcon } from '../lib/apparelIcons.js';

export default function ProductImagePreview({ model, onOpen }) {
  const [preview, setPreview] = useState(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef();
  const anchor = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  const hide = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 300);
  };
  const show = () => {
    clearTimeout(timer.current);
    const rect = anchor.current.getBoundingClientRect();
    const left = (anchor.current.closest('.sidebar')?.getBoundingClientRect().right || rect.right) + 14;
    const width = Math.min(336, window.innerWidth - left - 14);
    const height = Math.min(414, window.innerHeight - 32);
    setPreview({ left, top: Math.max(56, Math.min(rect.top - height / 3, window.innerHeight - height - 16)), width, height });
    setVisible(true);
  };
  const open = (element) => {
    let rect = element.getBoundingClientRect();
    if (anchor.current?.dataset.galleryOrigin) {
      try { rect = JSON.parse(anchor.current.dataset.galleryOrigin); } catch { /* use the element's position */ }
      delete anchor.current.dataset.galleryOrigin;
    }
    setVisible(false);
    onOpen({ ...model, previewRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } });
  };
  return <>
    <button ref={anchor} type="button" className="model-icon" onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}
      onClick={() => open(anchor.current)} aria-label={`查看 ${model.modelName} 的产品图片`}>
      <img src={getApparelIcon(model.iconKey).image} alt="" /><i>看</i>
    </button>
    {preview && createPortal(<div className={`product-image-preview ${visible ? 'is-visible' : ''}`} style={preview}
      onPointerEnter={() => { clearTimeout(timer.current); setVisible(true); }} onPointerLeave={hide}
      onTransitionEnd={() => { if (!visible) setPreview(null); }}>
      <button type="button" tabIndex={visible ? 0 : -1} onDoubleClick={(e) => open(e.currentTarget)}
        onKeyDown={(e) => { if (e.key === 'Enter') open(e.currentTarget); }} aria-label="双击放大产品图片">
        <img src={getApparelIcon(model.iconKey).image} alt={model.modelName} />
      </button><div><strong>{model.modelName}</strong><small>双击图片，放大查看</small></div>
    </div>, document.body)}
  </>;
}
