import { RotateCcw, X } from 'lucide-react';

export default function SettingsModal({ open, onClose, onResetWidths }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="drawer-header">
          <h2 id="settings-title">设置</h2>
          <button type="button" onClick={onClose} aria-label="关闭设置"><X size={20} /></button>
        </div>
        <p className="settings-intro">表格列宽会自动保存在本机。拖动表头最右侧的细线即可调整，恢复后自然矩阵、SP 矩阵、ABA 月榜和看板都会回到默认宽度。</p>
        <button type="button" className="secondary-button settings-reset-button" onClick={onResetWidths}>
          <RotateCcw size={17} />还原原表宽度
        </button>
      </section>
    </div>
  );
}
