import { ImagePlus, Shapes, X, ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apparelIcons, getApparelIcon } from '../lib/apparelIcons.js';

export default function IconPickerModal(props) {
  return props.model ? <ProductGallery key={props.model.parentAsin} {...props} /> : null;
}

function ProductGallery({ model, onClose, onSelect }) {
  const [picker, setPicker] = useState(false);
  const [selected, setSelected] = useState(0);
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const panel = useRef(null);
  const front = useRef(null);
  const closeButton = useRef(null);
  const closeTimer = useRef(null);
  const entries = [{ iconKey: model.iconKey }, ...(model.iconHistory || [])].filter((entry, i, all) =>
    all.findIndex(other => getApparelIcon(other.iconKey).image === getApparelIcon(entry.iconKey).image) === i);
  const close = () => { if (saving) return; setClosing(true); closeTimer.current = setTimeout(onClose, 220); };
  useEffect(() => {
    const previousFocus = document.activeElement;
    closeButton.current?.focus();
    const rect = model.previewRect;
    if (rect && panel.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const end = panel.current.getBoundingClientRect();
      panel.current.animate([
        { transform: `translate(${rect.left - end.left}px, ${rect.top - end.top}px) scale(${rect.width / end.width}, ${rect.height / end.height})`, opacity: .6 },
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      ], { duration: 380, easing: 'cubic-bezier(.2,.75,.2,1)' });
    }
    return () => { clearTimeout(closeTimer.current); previousFocus?.focus?.(); };
  }, []);
  const save = async (icon) => {
    setSaving(true); setError('');
    try { if (await onSelect(icon) === false) setError('图片保存失败，请重试。'); } catch (e) { setError(e.message || '图片保存失败，请重试。'); }
    finally { setSaving(false); }
  };
  const chooseCustomImage = async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|gif|webp|bmp)$/.test(file.type)) { setError('请选择 PNG、JPG、GIF、WEBP 或 BMP 图片。'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('图片不能超过 5 MB。'); return; }
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('读取图片失败。')); reader.readAsDataURL(file);
      });
      const img = new Image(); img.src = dataUrl; await img.decode();
      // Keep small images unchanged; normalize larger photos to a durable preview size.
      let stored = dataUrl;
      if (dataUrl.length > 4 * 1024 * 1024 || Math.max(img.width, img.height) > 1600) {
        const ratio = Math.min(1, 1600 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * ratio); canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); stored = canvas.toDataURL('image/webp', .9);
      }
      await save({ key: 'custom', label: file.name, dataUrl: stored });
    } catch { setError('无法读取这张图片，请选择有效的图片文件。'); }
  };
  const handleKey = (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); picker ? setPicker(false) : close(); }
    if (event.key === 'Tab') {
      const nodes = [...panel.current.querySelectorAll('button:not(:disabled), input:not([type="file"])')].filter(el => el.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };
  return <div className={`product-gallery-backdrop ${closing ? 'is-closing' : ''}`} onKeyDown={handleKey}
    onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <section ref={panel} className="product-gallery" role="dialog" aria-modal="true" aria-label="产品图片">
      <header className="product-gallery-header"><div><h2>{picker ? '选择简略图标' : '产品图片'}</h2><p>{model.modelName}</p></div>
        <button ref={closeButton} type="button" onClick={close} disabled={saving} aria-label="关闭产品图片"><X size={22} /></button></header>
      {picker ? <div className="product-gallery-picker"><button className="gallery-back" onClick={() => setPicker(false)}><ArrowLeft size={16} />返回图片</button>
        <div className="apparel-icon-grid">{apparelIcons.map(item => <button type="button" key={item.key} disabled={saving} className={model.iconKey === item.key ? 'selected' : ''} onClick={() => save(item.key)}><span><img src={item.image} alt="" /></span><strong>{item.label}</strong></button>)}</div></div>
        : <><div className="product-image-stack">
          {entries.map((entry, index) => ({ ...entry, index })).filter(entry => entry.index !== selected).slice(0, 3).reverse().map((entry, index, back) =>
            <button key={entry.index} className="product-image-card stacked" style={{ '--depth': back.length - index }} onClick={() => setSelected(entry.index)} aria-label={`查看${entry.index === 0 ? '当前图片' : `历史图片 ${entry.index}`}`}>
              <img src={getApparelIcon(entry.iconKey).image} alt="" /><span>{entry.index === 0 ? '当前图片' : `历史图片 ${entry.index}`}</span>
            </button>)}
          <div ref={front} className="product-image-card front" key={selected}><img src={getApparelIcon(entries[selected].iconKey).image} alt={`${model.modelName} ${selected === 0 ? '当前图片' : '历史图片'}`} />
            <span>{selected === 0 ? '当前图片 · 最新' : `历史图片 ${selected} · 仅查看`}</span></div>
        </div>
        {entries.length > 1 ? <div className="product-image-history" aria-label="图片历史">{entries.map((entry, index) =>
          <button key={index} className={selected === index ? 'selected' : ''} onClick={() => setSelected(index)} aria-label={index === 0 ? '选择当前图片' : `选择历史图片 ${index}`} aria-pressed={selected === index}>
            <img src={getApparelIcon(entry.iconKey).image} alt="" /><small>{index === 0 ? '当前' : `历史 ${index}`}</small></button>)}</div>
          : <p className="product-gallery-empty">更换图片后，旧图片会保留在这里</p>}</>}
      {error && <p role="alert" className="product-gallery-error">{error}</p>}
      <footer className="product-gallery-actions"><button type="button" disabled={saving} onClick={() => setPicker(!picker)}><Shapes size={18} />选择简略图标</button>
        <button type="button" disabled={saving} onClick={() => fileInputRef.current?.click()}><ImagePlus size={18} />{saving ? '正在保存…' : '更换自定义图片'}</button></footer>
      <input ref={fileInputRef} className="custom-icon-file-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" onChange={chooseCustomImage} />
    </section>
  </div>;
}
