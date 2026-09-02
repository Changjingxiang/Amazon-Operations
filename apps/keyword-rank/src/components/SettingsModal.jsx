import { AlertTriangle, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SIF_COUNTRIES } from '../lib/countries.js';

export default function SettingsModal({ open, onClose, onResetWidths, models = [], onDeleteModel, onAddModel, onSetCountry }) {
  const [pendingAsin, setPendingAsin] = useState('');
  useEffect(() => { if (!open) setPendingAsin(''); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="drawer-header settings-modal-header">
          <h2 id="settings-title">设置</h2>
          <button type="button" onClick={onClose} aria-label="关闭设置"><X size={20} /></button>
        </div>
        <div className="settings-modal-scroll">
          <p className="settings-intro">表格列宽会自动保存在本机。拖动表头最右侧的细线即可调整，恢复后自然矩阵、SP 矩阵、ABA 月榜和看板都会回到默认宽度。每个产品的国家也在这里保存，点击“自动导入今日报表”时会按对应国家打开 SIF。</p>
          <button type="button" className="secondary-button settings-reset-button" onClick={onResetWidths}>
            <RotateCcw size={17} />还原原表宽度
          </button>
          <div className="settings-divider" />
          <div className="settings-section-heading"><div><h3>产品管理</h3><p>删除产品会同时移除本地历史、关注词、标注和图标配置，源报表文件不会被删除。</p></div><div className="settings-section-actions"><button type="button" className="settings-add-button" onClick={() => { onClose?.(); onAddModel?.(); }}><Plus size={16} />新增型号</button><Trash2 size={19} /></div></div>
          <div className="settings-delete-list">
            {models.map((item) => {
              const pending = pendingAsin === item.parentAsin;
              return <div className={`settings-delete-item ${pending ? 'is-pending' : ''}`} key={item.parentAsin}>
                <div className="settings-product-copy"><strong>{item.modelName}</strong><small>{item.parentAsin}</small></div>
                <label className="settings-country-control">国家<select value={item.countryCode || 'CA'} onChange={(event) => onSetCountry?.(item, event.target.value)}>{SIF_COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.label}（{country.code}）</option>)}</select></label>
                <div className="settings-delete-actions">
                  <button type="button" className="danger-button danger-first" onClick={() => setPendingAsin(item.parentAsin)}><span>1</span>第一次确定删除</button>
                  <button type="button" className="danger-button danger-second" disabled={!pending} onClick={() => { onDeleteModel?.(item); setPendingAsin(''); }}><span>2</span>第二次确定删除</button>
                </div>
                {pending && <div className="settings-delete-warning"><AlertTriangle size={15} />已完成第一次确认，请点击右侧“第二次确定删除”完成删除。</div>}
              </div>;
            })}
            {!models.length && <div className="settings-empty">暂无已登记产品。</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
