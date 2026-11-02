import { AlertTriangle, ChevronDown, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SIF_COUNTRIES } from '../lib/countries.js';
import AbaImportSection from './AbaImportSection.jsx';
import { MatrixCopyShortcutSetting } from './MatrixKeywordCopy.jsx';
import useDialogFocus from '../lib/useDialogFocus.js';
import { validThreshold } from '../lib/trafficPreferences.mjs';
import './SettingsDrawer.css';

const ASIN_PATTERN = /^B0[A-Z0-9]{8}$/;

function SettingsSection({ title, description, children, initialOpen = false, id }) {
  const [expanded, setExpanded] = useState(initialOpen);
  return <details className="settings-feature" id={id} open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary><div><strong>{title}</strong><small>{description}</small></div><ChevronDown size={18} /></summary>
    <div className="settings-feature-body">{children}</div>
  </details>;
}

export default function SettingsModal({ open, onClose, onResetWidths, models = [], activeModel, onDeleteModel, onAddModel, onSetCountry, onRenameModel, onChangeModelAsin, onReleaseModelAlias, abaMonthlyImports = [], onImportAba, trafficThreshold = 20, onTrafficThresholdChange }) {
  const dialogRef = useDialogFocus(open, onClose);
  const [thresholdDraft, setThresholdDraft] = useState(String(trafficThreshold));
  const [thresholdMessage, setThresholdMessage] = useState('');
  useEffect(() => { if (open) setThresholdDraft(String(trafficThreshold)); }, [open, trafficThreshold]);
  useEffect(() => { if (open) setThresholdMessage(''); }, [open]);
  const saveThreshold = value => {
    if (!validThreshold(value)) { setThresholdMessage('请输入 1–1000 之间的整数百分比。'); return; }
    try { onTrafficThresholdChange?.(Number(value)); setThresholdDraft(String(value)); setThresholdMessage(`已保存：涨跌超过 ${value}% 时公示。`); }
    catch { setThresholdMessage('设置未能保存，请检查浏览器存储后重试。'); }
  };
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
  if (!open) return null;
  return (
    <div className="settings-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-modal settings-drawer" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="settings-title" tabIndex={-1}>
        <div className="drawer-header settings-modal-header">
          <div><span className="settings-kicker">工作台偏好</span><h2 id="settings-title">设置</h2><p>按功能展开，调整你的日常工作方式。</p></div>
          <button type="button" data-dialog-close onClick={onClose} aria-label="关闭设置"><X size={20} /></button>
        </div>
        <div className="settings-modal-scroll">
          <SettingsSection title="曝光异动提醒" description="整批导入完成后，仅公示超过阈值的涨跌；没有异动就直接返回。" initialOpen id="settings-traffic">
            <form className="traffic-threshold-form" onSubmit={event => { event.preventDefault(); saveThreshold(thresholdDraft); }}>
              <label htmlFor="traffic-alert-threshold">涨跌幅阈值<div><input id="traffic-alert-threshold" type="number" min="1" max="1000" step="1" value={thresholdDraft} onChange={event => { setThresholdDraft(event.target.value); setThresholdMessage(''); }} aria-describedby="traffic-threshold-help" /><span>%</span></div></label>
              <button type="submit">保存阈值</button><button type="button" className="traffic-threshold-reset" onClick={() => saveThreshold(20)}>恢复默认 20%</button>
            </form>
            <p id="traffic-threshold-help" className="settings-feature-note">自然、SP 广告和综合指数分别检查，严格超过阈值才提醒。设置保存在本机；已查看的同一份异动不会反复弹出。</p>
            {thresholdMessage && <p className="settings-save-message" role="status">{thresholdMessage}</p>}
          </SettingsSection>
          <SettingsSection title="表格与快捷键" description="恢复各表格的列宽，或设置多选复制关键词的快捷键。">
          <p className="settings-feature-note">拖动表头右侧的细线调整列宽，修改会自动保存在本机。</p>
          <button type="button" className="secondary-button settings-reset-button" onClick={onResetWidths}>
            <RotateCcw size={17} />还原原表宽度
          </button>
          <MatrixCopyShortcutSetting />
          </SettingsSection>
          <SettingsSection title="月 ABA 数据" description="按站点、年份和月份导入 CSV，管理月度搜索频率排名。">
          <AbaImportSection
            imports={abaMonthlyImports}
            defaultCountry={activeModel?.countryCode || models[0]?.countryCode || 'CA'}
            defaultYear={activeModel?.selectedYear || models[0]?.selectedYear || new Date().getFullYear()}
            defaultMonth={activeModel?.latestDate ? Number(activeModel.latestDate.slice(5, 7)) : (models[0]?.latestDate ? Number(models[0].latestDate.slice(5, 7)) : new Date().getMonth() + 1)}
            onImport={onImportAba}
          />
          </SettingsSection>
          {window.keywordTracker?.isWeb && <SettingsSection title="共享竞品库" description="为自有产品添加或关联竞品，共用图片、排名和历史。"><div data-settings-competitor-slot /></SettingsSection>}
          <SettingsSection title="产品管理" description="编辑名称、站点和父体 ASIN，管理历史别名及产品。">
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
          </SettingsSection>
        </div>
        <footer className="settings-drawer-footer"><span>修改会保存在当前设备</span><button type="button" onClick={onClose}>完成</button></footer>
      </section>
    </div>
  );
}
