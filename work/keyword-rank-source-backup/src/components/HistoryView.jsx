import { useMemo } from 'react';
import { FileSpreadsheet, FolderOpen } from 'lucide-react';
import { ResizeHandle, useColumnWidths } from '../lib/columnWidths.jsx';

export default function HistoryView({ model, sourceCount, workbookModifiedAt, storage, onOpenWorkbook, onOpenSourceFolder }) {
  const defaults = useMemo(() => ({ date: 130, count: 110, watched: 110, source: 220, status: 220 }), []);
  const { widths, nudgeWidth, startResize } = useColumnWidths('keyword-tracker:columns:history', defaults);
  const widthStyle = (column) => ({ width: widths[column], minWidth: widths[column] });
  const resizeHandle = (column, label) => <ResizeHandle columnKey={column} onResize={startResize} onNudge={nudgeWidth} label={label} />;
  return (
    <section className="history-panel">
      <div className="history-actions">
        <div><strong>{model.snapshotSummary.length}</strong><span>历史快照日期</span></div>
        <div><strong>{sourceCount}</strong><span>每日源文件</span></div>
        <div><strong>{model.historyRecords.length.toLocaleString('zh-CN')}</strong><span>历史关键词记录</span></div>
        <button type="button" onClick={onOpenWorkbook}><FileSpreadsheet size={19} />打开跟进表</button>
        <button type="button" onClick={onOpenSourceFolder}><FolderOpen size={19} />打开源文件夹</button>
      </div>
      <div className="history-table-wrap">
        <table className="history-table">
        <colgroup>{Object.keys(defaults).map((column) => <col key={column} style={widthStyle(column)} />)}</colgroup>
        <thead><tr><th style={widthStyle('date')}>快照日期{resizeHandle('date', '快照日期')}</th><th style={widthStyle('count')}>写入数量{resizeHandle('count', '写入数量')}</th><th style={widthStyle('watched')}>关注词数量{resizeHandle('watched', '关注词数量')}</th><th style={widthStyle('source')}>源文件{resizeHandle('source', '源文件')}</th><th style={widthStyle('status')}>{storage === 'local-json' ? '本地数据状态' : '工作簿状态'}{resizeHandle('status', '状态')}</th></tr></thead>
          <tbody>
            {model.snapshotSummary.map((item, index) => (
              <tr key={item.date}>
                <td>{item.date}</td><td>{item.count}</td><td>{item.watchedCount}</td>
                <td title={item.sourceFiles.join('；')}>{item.sourceFiles.join('；') || '—'}</td>
                <td>{storage === 'local-json' ? (index === 0 ? '最新 · 本地已保存' : '已保存') : (index === 0 ? `最新 · 文件更新 ${new Date(workbookModifiedAt).toLocaleString('zh-CN', { hour12: false })}` : '已保存')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
