import { CalendarDays, FolderInput, RefreshCw } from 'lucide-react';
import importIcon from '../assets/icons/05_daily-import.png';

const tabs = [
  ['dashboard', '看板'],
  ['natural', '自然矩阵'],
  ['sp', 'SP矩阵'],
  ['aba', 'ABA月榜'],
  ['history', '历史记录'],
];

export default function Header({ model, activeTab, onTab, selectedDate, onDate, onRefresh, onImport, busy }) {
  return (
    <>
      <header className="topbar">
        <div>
          <h1>{model.modelName}</h1>
          <p>ASIN：{model.parentAsin}</p>
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
          <button type="button" className="primary-button" disabled={busy} onClick={onImport}>
            <img src={importIcon} alt="" />导入今日报表
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
