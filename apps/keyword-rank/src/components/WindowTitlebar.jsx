import appShellIcon from '../assets/app-shell-icon.png';
import { Minus, Square, X, Download, FolderOpen, Settings, ChevronDown } from 'lucide-react';
import { api } from '../lib/api.js';

export default function WindowTitlebar({ onTool, activeTool }) {
  return (
    <header className="window-titlebar" aria-label="关键词排名每日跟进软件标题栏">
      <img src={appShellIcon} alt="" />
      <strong>关键词排名每日跟进</strong>
      <span className="window-drag-space" aria-hidden="true" />
      {window.keywordTracker?.isWeb ? <div className="web-tools" aria-label="网页工具">{[['history', '导入日志', Download], ['files', '工具文件夹', FolderOpen], ['settings', '设置', Settings]].map(([key, label, Icon]) => <button key={key} type="button" aria-expanded={activeTool === key} aria-haspopup="dialog" onClick={() => onTool?.(key)}><Icon size={16} />{label}<ChevronDown size={13} /></button>)}</div> : <div className="window-controls" aria-label="窗口控制">
        <button type="button" onClick={() => api.minimizeWindow()} aria-label="最小化"><Minus size={18} /></button>
        <button type="button" onClick={() => api.toggleMaximizeWindow()} aria-label="最大化或还原"><Square size={15} /></button>
        <button type="button" className="window-close" onClick={() => api.closeWindow()} aria-label="关闭"><X size={20} /></button>
      </div>}
    </header>
  );
}
