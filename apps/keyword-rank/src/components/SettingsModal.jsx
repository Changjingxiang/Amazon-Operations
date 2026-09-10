import { AlertTriangle, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SIF_COUNTRIES } from '../lib/countries.js';
import AbaImportSection from './AbaImportSection.jsx';

const ASIN_PATTERN = /^B0[A-Z0-9]{8}$/;

export default function SettingsModal({ open, onClose, onResetWidths, models = [], activeModel, onDeleteModel, onAddModel, onSetCountry, onRenameModel, onChangeModelAsin, onReleaseModelAlias, abaMonthlyImports = [], onImportAba }) {
  const [pendingAsin, setPendingAsin] = useState('');
  const [pendingAlias, setPendingAlias] = useState('');
  const [editingName, setEditingName] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [asinDrafts, setAsinDrafts] = useState({});
  useEffect(() => {
    if (!open) {
      setPendingAsin('');
      setPendingAlias('');
      setEditingName('');
      setNameDraft('');
      return;
    }
    setAsinDrafts((current) => {
      const next = { ...current };
      let changed = false;
      models.forEach((item) => {
        if (next[item.parentAsin] == null) {
          next[item.parentAsin] = item.parentAsin;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [open, models]);
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
          <AbaImportSection
            imports={abaMonthlyImports}
            defaultCountry={activeModel?.countryCode || models[0]?.countryCode || 'CA'}
            defaultYear={activeModel?.selectedYear || models[0]?.selectedYear || new Date().getFullYear()}
            defaultMonth={activeModel?.latestDate ? Number(activeModel.latestDate.slice(5, 7)) : (models[0]?.latestDate ? Number(models[0].latestDate.slice(5, 7)) : new Date().getMonth() + 1)}
            onImport={onImportAba}
          />
          <div className="settings-divider" />
          <div className="settings-section-heading"><div><h3>产品管理</h3><p>可单独修改产品名称。修改父体 ASIN 会保留旧 ASIN 为历史别名；只有确认旧 ASIN 填错且不应再匹配时，才解除历史别名。删除产品会同时移除本地历史、关注词、标注和图标配置，源报表文件不会被删除。</p></div><div className="settings-section-actions"><button type="button" className="settings-add-button" onClick={() => { onClose?.(); onAddModel?.(); }}><Plus size={16} />新增型号</button><Trash2 size={19} /></div></div>
          <div className="settings-delete-list">
            {models.map((item) => {
              const pending = pendingAsin === item.parentAsin;
              const aliases = Array.isArray(item.legacyParentAsins) ? item.legacyParentAsins : [];
              const draftAsin = asinDrafts[item.parentAsin] ?? item.parentAsin;
              const nameEditing = editingName === item.parentAsin;
              return <div className={`settings-delete-item ${pending ? 'is-pending' : ''}`} key={item.parentAsin}>
                <div className="settings-product-copy">
                  {nameEditing ? <div className="settings-name-edit">
                    <input aria-label={`产品名称-${item.parentAsin}`} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setEditingName(''); if (event.key === 'Enter') { event.preventDefault(); void (async () => { const next = nameDraft.trim(); if (!next) return; const ok = await onRenameModel?.(item, next); if (ok !== false) setEditingName(''); })(); } }} autoFocus />
                    <button type="button" className="settings-inline-button settings-inline-primary" onClick={async () => { const next = nameDraft.trim(); if (!next) return; const ok = await onRenameModel?.(item, next); if (ok !== false) setEditingName(''); }}>保存</button>
                    <button type="button" className="settings-inline-button" onClick={() => setEditingName('')}>取消</button>
                  </div> : <div className="settings-name-row"><strong title={item.modelName}>{item.modelName}</strong><button type="button" className="settings-inline-button" onClick={() => { setEditingName(item.parentAsin); setNameDraft(item.modelName || ''); }}>编辑名称</button></div>}
                  <small data-product-asin>{item.parentAsin}</small>
                  <div className="settings-asin-editor" data-parent-asin-editor>
                    <span className="settings-asin-editor-title">修改父体 ASIN</span>
                    <div className="settings-asin-editor-row">
                      <input aria-label={`父体 ASIN-${item.parentAsin}`} value={draftAsin} onChange={(event) => setAsinDrafts((current) => ({ ...current, [item.parentAsin]: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))} />
                      <button type="button" className="settings-asin-save" disabled={!ASIN_PATTERN.test(draftAsin) || draftAsin === item.parentAsin} onClick={async () => { const ok = await onChangeModelAsin?.(item, draftAsin); if (ok !== false) setAsinDrafts((current) => ({ ...current, [draftAsin]: draftAsin })); }}>保存 ASIN</button>
                    </div>
                    <small className="settings-asin-editor-help">变更后旧 ASIN 会保留为历史别名，导入旧报表仍会归入当前产品。</small>
                  </div>
                  {aliases.length > 0 && <div className="settings-alias-list">
                    <span className="settings-alias-title">历史别名（导入仍会归入本产品）</span>
                    {aliases.map((alias) => {
                      const aliasKey = `${item.parentAsin}:${alias}`;
                      const aliasPending = pendingAlias === aliasKey;
                      return <div className="settings-alias-item" key={alias}>
                        <code>{alias}</code>
                        <button type="button" className={`settings-alias-remove ${aliasPending ? 'is-armed' : ''}`} onClick={async () => { if (!aliasPending) { setPendingAlias(aliasKey); return; } const ok = await onReleaseModelAlias?.(item, alias); if (ok !== false) setPendingAlias(''); }}>{aliasPending ? '再次点击解除' : '解除别名'}</button>
                      </div>;
                    })}
                    {pendingAlias.startsWith(`${item.parentAsin}:`) && <div className="settings-alias-warning"><AlertTriangle size={14} />解除后该旧 ASIN 的新报表不会再自动归入本产品，历史记录不会删除。</div>}
                  </div>}
                </div>
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
