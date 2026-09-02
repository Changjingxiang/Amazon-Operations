import { Download, FolderOpen, Plus, Settings } from 'lucide-react';
import { getApparelIcon } from '../lib/apparelIcons.js';

export default function Sidebar({ models, activeIndex, onSelect, onChooseIcon, onAddModel, onHistory, onOpenFolder, onSettings }) {
  return (
    <aside className="sidebar">
      <nav className="model-list" aria-label="产品型号">
        {models.map((model, index) => (
          <div
            className={`model-item ${index === activeIndex ? 'active' : ''}`}
            key={model.parentAsin}
          >
            <button type="button" className="model-icon" onClick={() => onChooseIcon(model)} title="点击更换产品图标" aria-label={`更换 ${model.modelName} 的图标`}>
              <img src={getApparelIcon(model.iconKey).image} alt="" />
              <i>换</i>
            </button>
            <button type="button" className="model-copy" onClick={() => onSelect(index)}>
              <strong>{model.modelName.split(' ')[0]}</strong>
              <small>{model.modelName.replace(model.modelName.split(' ')[0], '').trim() || model.parentAsin}</small>
            </button>
          </div>
        ))}
        <button type="button" className="sidebar-action" onClick={onAddModel}>
          <Plus size={23} strokeWidth={2.3} />
          <span>新增型号</span>
        </button>
      </nav>
      <div className="sidebar-footer">
        <button type="button" onClick={onHistory}><Download size={22} />导入日志</button>
        <button type="button" onClick={onOpenFolder}><FolderOpen size={22} />工具文件夹</button>
        <button type="button" onClick={onSettings}><Settings size={22} />设置</button>
      </div>
    </aside>
  );
}
