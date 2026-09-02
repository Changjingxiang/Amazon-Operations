import { X } from 'lucide-react';
import { apparelIcons } from '../lib/apparelIcons.js';

export default function IconPickerModal({ model, onClose, onSelect }) {
  if (!model) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="icon-picker-modal" role="dialog" aria-modal="true" aria-label="选择产品图标">
        <div className="drawer-header">
          <div><h2>选择产品图标</h2><p>{model.modelName}</p></div>
          <button type="button" onClick={onClose} aria-label="关闭"><X /></button>
        </div>
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
