import { ImagePlus, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { apparelIcons } from '../lib/apparelIcons.js';

export default function IconPickerModal({ model, onClose, onSelect }) {
  const fileInputRef = useRef(null);
  useEffect(() => {
    if (!model) return undefined;
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [model, onClose]);
  if (!model) return null;
  const customIcon = model.iconKey && typeof model.iconKey === 'object' && model.iconKey.key === 'custom'
    ? model.iconKey
    : (typeof model.iconKey === 'string' && model.iconKey.startsWith('data:image/') ? { key: 'custom', label: '自定义图片', dataUrl: model.iconKey } : null);
  const chooseCustomImage = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { window.alert('请选择 PNG、JPG、GIF、WEBP 或 BMP 图片。'); return; }
    if (file.size > 5 * 1024 * 1024) { window.alert('图片不能超过 5 MB。'); return; }
    const reader = new FileReader();
    reader.onload = () => onSelect({ key: 'custom', label: file.name, dataUrl: String(reader.result || '') });
    reader.readAsDataURL(file);
  };
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="icon-picker-modal" role="dialog" aria-modal="true" aria-label="选择产品图标">
        <div className="drawer-header">
          <div><h2>选择产品图标</h2><p>{model.modelName}</p></div>
          <button type="button" onClick={onClose} aria-label="关闭"><X /></button>
        </div>
        <input ref={fileInputRef} className="custom-icon-file-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" onChange={chooseCustomImage} />
        <button type="button" className={`custom-icon-option ${customIcon ? 'selected' : ''}`} onClick={() => fileInputRef.current?.click()}>
          <span className="custom-icon-preview">{customIcon ? <img src={customIcon.dataUrl} alt="当前自定义图片" /> : <ImagePlus size={30} />}</span>
          <span className="custom-icon-copy"><strong>{customIcon ? '更换自定义图片' : '自定义图片'}</strong><small>{customIcon ? (customIcon.label || '已上传图片') : '从电脑选择一张产品图片'}</small></span>
          <ImagePlus size={20} />
        </button>
        <div className="apparel-icon-grid">
          {apparelIcons.map((item) => (
            <button
              type="button"
              key={item.key}
              className={model.iconKey === item.key ? 'selected' : ''}
              onClick={() => onSelect(item.key)}
            >
              <span><img src={item.image} alt="" /></span>
              <strong>{item.label}</strong>
            </button>
          ))}
        </div>
        <p className="icon-picker-note">图标选择保存在软件配置中，不会修改关键词历史或源报表。</p>
      </section>
    </div>
  );
}
