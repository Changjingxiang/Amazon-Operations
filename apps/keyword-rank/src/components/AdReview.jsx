import { useState } from 'react';
import { reviewCore, EMPTY_REVIEWS } from '../lib/adReview.js';
import './ad-review.css';

export function AdReviewDetails({ entries, onAccept }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  if (!entries.length) return <p>本词暂无广告分析。请先在「每周广告关注词分析」导入 Skill 结果。</p>;
  const toggle = async (entry, accepted) => {
    setBusy(`${entry.report.runId}|${entry.item.itemId}`); setError('');
    try { await onAccept(entry.report.runId, entry.item.itemId, accepted); }
    catch (err) { setError(`采纳状态未保存：${err.message}`); }
    finally { setBusy(''); }
  };
  return <div className="ad-review-details">
    <p className="ad-review-hint">采纳仅记录决定，不代表已执行，也不会自动修改广告。历史批次各自保存采纳状态。</p>
    {error && <p role="alert" className="ad-review-error">{error}</p>}
    {entries.map(({ report, item, accepted }, index) => <details key={`${report.runId}|${item.itemId}`} open={index === 0}>
      <summary>{report.analysisDate} · {reviewCore.label(report.slot)} {index === 0 ? '· 最新' : ''} {accepted ? ' · ✓ 已采纳' : ''}</summary>
      <div className="ad-review-detail-body">
        <p className="ad-review-hint">数据 {report.dataStart} — {report.dataEnd} · {item.strategy} · 置信度：{item.confidence}</p>
        <h4>分析建议</h4><p className="ad-review-copy">{item.recommendation}</p>
        {item.actions.map((action, idx) => <div className="ad-review-action" key={idx}>
          <strong>{action.campaign} / {action.match}</strong><small>{action.adGroup}</small>
          <p>竞价 {action.currentBid ?? '待核实'} → {action.proposedBid ?? '暂不定价'}{action.bidDate ? `（基准 ${action.bidDate}）` : ''}</p><p className="ad-review-copy">{action.instruction}</p>
        </div>)}
        <h4>依据：广告、排名与标注</h4><p className="ad-review-copy">{item.evidence}</p>
        <h4>预算建议</h4><p className="ad-review-copy">{item.budget}</p>
        <h4>时段建议</h4><p className="ad-review-copy">{item.dayparting}</p>
        <h4>下次复盘</h4><p className="ad-review-copy">{item.review}</p>
        <details><summary>本次确认目标与来源</summary><p className="ad-review-copy">{report.goals.find(g => g.parentAsin === item.parentAsin && g.countryCode === item.countryCode)?.text}</p><p>{report.sources.join('；')}</p></details>
        <label className={`ad-review-accept ${accepted ? 'accepted' : ''}`}><input type="checkbox" checked={accepted} disabled={Boolean(busy)} onChange={e => toggle({ report, item, accepted }, e.target.checked)} />{busy === `${report.runId}|${item.itemId}` ? '正在保存…' : accepted ? '✓ 已采纳本词建议（点击可取消）' : '采纳本词建议'}</label>
      </div>
    </details>)}
  </div>;
}

export default function AdReview({ model, state = EMPTY_REVIEWS, onState, onAccept }) {
  const [preview, setPreview] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [selectedRun, setSelectedRun] = useState(''), [keyword, setKeyword] = useState('');
  const all = reviewCore.entries(state, model);
  const runs = [...new Map(all.map(e => [e.report.runId, e.report])).values()];
  const currentRun = runs.some(r => r.runId === selectedRun) ? selectedRun : runs[0]?.runId;
  const list = all.filter(e => e.report.runId === currentRun);
  const selected = list.find(e => e.item.keyword === keyword);
  const loadFile = async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    setError(''); setPreview(null); setBusy(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('分析文件不能超过10 MB');
      const parsed = JSON.parse(await file.text());
      setPreview(await window.keywordTracker.previewAdReview(parsed));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const commit = async () => {
    setBusy(true); setError('');
    try { const next = await window.keywordTracker.importAdReview(preview.report); onState(next); setSelectedRun(preview.report.runId); setPreview(null); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <section className="ad-review-workspace">
    <header><h2>每周广告关注词分析</h2><p>周一上午 · 周四下午：导出网页备份 + 领星近30天广告数据 → 调用 Skill 并确认各产品目标 → 导入结果 → 查看与采纳。</p></header>
    <div className="ad-review-toolbar"><button disabled={busy} onClick={() => window.keywordTracker.exportImportBackup().catch(e => setError(e.message))}>导出本次网页备份</button><label className="ad-review-file">导入 Agent 分析结果<input aria-label="导入 Agent 分析结果" type="file" accept=".json,application/json" disabled={busy} onChange={loadFile} /></label><span>Skill：亚马逊关键词分析</span></div>
    <p className="ad-review-hint">每次运行 Skill 先确认：产品目标、ABA策略、目标ACoS、预算金额及日/周单位、时区、重点词。周四同时复核周一建议；勾选采纳不能代替实际调价证据。</p>
    {error && <p className="ad-review-error" role="alert">{error}</p>}
    {preview && <section className="ad-review-preview"><h3>导入预览 · {preview.report.analysisDate} {reviewCore.label(preview.report.slot)}</h3><p>已匹配 {preview.matches.filter(m => m.matched).length} / {preview.matches.length} 词条。{preview.duplicate ? '此批次已导入，重复导入不会覆盖采纳状态。' : '确认后新增独立批次，原报告与人工标注保留。'}</p><div className="ad-review-scroll"><table><thead><tr><th>产品</th><th>关键词</th><th>匹配结果</th></tr></thead><tbody>{preview.matches.map(m => <tr key={m.itemId}><td>{m.modelName || m.parentAsin}</td><td>{m.keyword}</td><td>{m.reason}</td></tr>)}</tbody></table></div><button disabled={busy || !preview.valid} onClick={commit}>{busy ? '保存中…' : '确认导入'}</button><button disabled={busy} onClick={() => setPreview(null)}>取消</button></section>}
    <label className="ad-review-period">分析批次 <select aria-label="分析批次" value={currentRun || ''} onChange={e => { setSelectedRun(e.target.value); setKeyword(''); }}><option value="" disabled>尚无分析</option>{runs.map(r => <option key={r.runId} value={r.runId}>{r.analysisDate} {reviewCore.label(r.slot)} · 截止 {r.dataEnd} · {r.runId}</option>)}</select></label>
    {list.length ? <><p className="ad-review-copy">{list[0].report.summary}</p><div className="ad-review-scroll"><table><thead><tr><th>关注词</th><th>策略</th><th>建议摘要</th><th>状态</th></tr></thead><tbody>{list.map(e => <tr key={e.item.itemId} className={e.accepted ? 'ad-review-row-accepted' : ''}><td><button onClick={() => setKeyword(e.item.keyword)}>{e.item.keyword}</button></td><td>{e.item.strategy}</td><td>{e.item.recommendation.slice(0, 160)}</td><td>{e.accepted ? '✓ 已采纳' : '待评估'}</td></tr>)}</tbody></table></div></> : <p>当前产品暂无导入结果。导入文件将匹配所有自有产品；切换左侧产品可查看对应建议。</p>}
    {selected && <section className="ad-review-selected"><h3>{selected.item.keyword}</h3><AdReviewDetails entries={all.filter(e => reviewCore.key(e.item.keyword) === reviewCore.key(selected.item.keyword))} onAccept={onAccept} /></section>}
  </section>;
}
