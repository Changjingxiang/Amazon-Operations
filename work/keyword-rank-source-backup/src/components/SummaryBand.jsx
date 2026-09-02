import appLogo from '../assets/icons/01_app-logo.png';

export default function SummaryBand({ metrics, latestDate, loadedAt, mode = 'dashboard' }) {
  const items = mode === 'natural'
    ? [
        ['关键词', metrics.keywordCount],
        ['关注词', metrics.watchedCount],
        ['自然上升', metrics.naturalUp, 'coral'],
        ['未上榜', metrics.unrankedNatural],
      ]
    : mode === 'sp'
      ? [
          ['关键词', metrics.keywordCount],
          ['关注词', metrics.watchedCount],
          ['SP上升', metrics.spUp, 'coral'],
          ['未上榜', metrics.unrankedNatural],
        ]
      : [
          ['关键词', metrics.keywordCount],
          ['关注词', metrics.watchedCount],
          ['自然上升', metrics.naturalUp, 'coral'],
          ['SP上升', metrics.spUp, 'coral'],
        ];
  return (
    <section className="summary-band">
      <img src={appLogo} alt="" className="summary-logo" />
      {items.map(([label, value, tone]) => (
        <div className="summary-item" key={label}>
          <span>{label}</span>
          <strong className={tone || ''}>{value ?? 0}</strong>
        </div>
      ))}
      <div className="summary-item summary-time">
        <span>最近数据</span>
        <strong>{latestDate || '尚未导入'}</strong>
        <small>{loadedAt ? `软件刷新 ${new Date(loadedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : ''}</small>
      </div>
    </section>
  );
}
