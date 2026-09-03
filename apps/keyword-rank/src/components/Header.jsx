import { CalendarDays, FileInput, RefreshCw } from 'lucide-react';
import importIcon from '../assets/icons/05_daily-import.png';

const tabs = [
  ['dashboard', '看板'],
  ['natural', '自然矩阵'],
  ['sp', 'SP矩阵'],
  ['comparison', '对比矩阵'],
  ['aba', 'ABA月榜'],
  ['history', '历史记录'],
];

export default function Header({ model, activeTab, onTab, selectedDate, onDate, onRefresh, onImport, onSifImport, busy }) {
  return (
    <>
      <header className="topbar">
        <div>
          <h1>{model.modelName}</h1>
          <p>ASIN：{model.parentAsin} · 站点：{model.site || '加拿大站'}（{model.countryCode || 'CA'}）</p>
        </div>
        <div className="header-actions">
          <label className="date-control">
            <CalendarDays size={18} />
            <input
              type="date"
              value={selectedDate || ''}
              min={model.dates.at(0) || undefined}
              max={model.dates.at(-1) || undefined}
              onChange={(event) => onDate(event.target.value)}
              aria-label="查看日期"
              title="选择查看日期"
            />
          </label>
          <button type="button" className="secondary-button" disabled={busy} onClick={onRefresh}>
            <RefreshCw size={19} className={busy ? 'spin' : ''} />刷新
          </button>
          <button type="button" className="primary-button sif-import-button" disabled={busy} onClick={onSifImport} title={`自动打开 SIF ${model.site || '加拿大站'}并下载后导入`}>
            <img src={importIcon} alt="" /><span>自动导入今日报表</span>
          </button>
          <button type="button" className="secondary-button manual-import-button" disabled={busy} onClick={onImport} title="扫描工具文件夹中的本地报表">
            <FileInput size={18} />本地导入
          </button>
        </div>
      </header>
      <nav className="tabs" aria-label="功能页面">
        {tabs.map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={activeTab === key ? 'active' : ''}
            onClick={() => onTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}
