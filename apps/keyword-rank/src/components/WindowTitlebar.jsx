import appShellIcon from '../assets/app-shell-icon.png';
import { Minus, Square, X } from 'lucide-react';
import { api } from '../lib/api.js';

export default function WindowTitlebar() {
  return (
    <header className="window-titlebar" aria-label="关键词排名每日跟进软件标题栏">
      <img src={appShellIcon} alt="" />
      <strong>关键词排名每日跟进</strong>
      <span className="window-drag-space" aria-hidden="true" />
      <div className="window-controls" aria-label="窗口控制">
        <button type="button" onClick={() => api.minimizeWindow()} aria-label="最小化"><Minus size={18} /></button>
        <button type="button" onClick={() => api.toggleMaximizeWindow()} aria-label="最大化或还原"><Square size={15} /></button>
        <button type="button" className="window-close" onClick={() => api.closeWindow()} aria-label="关闭"><X size={20} /></button>
      </div>
    </header>
  );
}
