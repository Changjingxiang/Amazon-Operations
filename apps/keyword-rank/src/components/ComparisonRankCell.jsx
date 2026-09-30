import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { detailPage, positiveRank, rankMovement } from '../lib/comparisonRank.mjs';

const HoverContext = createContext(null);
const rankText = (value) => positiveRank(value) ?? (value === 0 ? '未上榜' : '无记录');

function highlightDate(anchor, date) {
  const table = anchor.closest('table');
  if (!table) return;
  table.querySelectorAll('.comparison-date-hover').forEach((cell) => cell.classList.remove('comparison-date-hover'));
  if (date) table.querySelectorAll(`[data-comparison-date="${date}"]`).forEach((cell) => cell.classList.add('comparison-date-hover'));
}

export function ComparisonHoverProvider({ children, resetKey }) {
  const [hover, setHover] = useState(null);
  const [position, setPosition] = useState(null);
  const cardRef = useRef(null);
  const showTimer = useRef(null);
  const hideTimer = useRef(null);
  const controls = useMemo(() => {
    const cancel = () => { clearTimeout(showTimer.current); clearTimeout(hideTimer.current); };
    const close = () => { cancel(); setHover(null); setPosition(null); };
    return {
      close,
      show: (anchor, payload, immediate = false) => {
        close();
        showTimer.current = setTimeout(() => {
          if (anchor.isConnected) setHover({ anchor, ...payload });
        }, immediate ? 0 : 250);
      },
      leave: () => { cancel(); hideTimer.current = setTimeout(close, 160); },
      keep: cancel,
    };
  }, []);

  useEffect(() => { controls.close(); }, [resetKey, controls]);
  useEffect(() => {
    const scroll = (event) => { if (!cardRef.current?.contains(event.target)) controls.close(); };
    const escape = (event) => { if (event.key === 'Escape') controls.close(); };
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', controls.close);
    window.addEventListener('keydown', escape);
    window.addEventListener('pointerdown', scroll);
    return () => {
      clearTimeout(showTimer.current); clearTimeout(hideTimer.current);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', controls.close);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('pointerdown', scroll);
    };
  }, [controls]);

  useLayoutEffect(() => {
    if (!hover || !cardRef.current) return;
    const cell = hover.anchor.getBoundingClientRect();
    const card = cardRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(cell.left, window.innerWidth - card.width - 8));
    const top = cell.bottom + card.height + 8 <= window.innerHeight
      ? cell.bottom + 6 : Math.max(8, cell.top - card.height - 6);
    setPosition({ left, top });
  }, [hover]);

  return <HoverContext.Provider value={controls}>
    {children}
    {hover && createPortal(<div ref={cardRef} className="comparison-hover-card" role="tooltip" id="comparison-rank-tooltip"
      onMouseEnter={controls.keep} onMouseLeave={controls.leave}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}>
      <div className="comparison-hover-heading"><strong>{hover.row.keyword}</strong><time>{hover.date}</time></div>
      <div className="comparison-hover-ranks">{['natural', 'sp'].map((metric) => {
        const value = hover.row[`${metric}Values`]?.[hover.index];
        const previous = hover.row[`${metric}Values`]?.[hover.index - 1];
        const detail = hover.row[`${metric}RankDetails`]?.[hover.index] || '';
        const page = detailPage(detail);
        const movement = rankMovement(value, previous, hover.previousDate);
        return <div key={metric} className={`comparison-hover-metric ${metric} ${hover.metric === metric ? 'is-current' : ''}`}>
          <div><strong>{metric === 'natural' ? '自然排名' : 'SP 排名'}</strong><b>{rankText(value)}</b><span className={`comparison-movement ${movement.className}`}>{movement.text === '—' ? '持平' : movement.text}</span><small>{page == null ? '页码未知' : `第 ${page} 页`}</small></div>
          <p>{hover.previousDate ? `上次 ${rankText(previous)}（${hover.previousDate}）` : '当前为首条日期记录'}</p>
          {detail && <p className="comparison-source-detail">导入详情：{detail}</p>}
        </div>;
      })}</div>
      <div className="comparison-hover-notes">{['natural', 'sp'].map((metric) => <section key={metric}>
        <strong>{metric === 'natural' ? '自然标注' : 'SP 标注'}</strong>
        <p>{hover.row[`${metric}Annotations`]?.[hover.index] || '当天暂无标注'}</p>
      </section>)}</div>
      <footer>页码读取排名详情中的 p 后数字；未保存详情时不推算。</footer>
    </div>, document.body)}
  </HoverContext.Provider>;
}

export function ComparisonRankCell({ value, previous, metric, date, selected, row, index, previousDate }) {
  const hover = useContext(HoverContext);
  const page = detailPage(row[`${metric}RankDetails`]?.[index]);
  const annotation = row[`${metric}Annotations`]?.[index] || '';
  const movement = rankMovement(value, previous, previousDate);
  const label = `${date} ${metric === 'natural' ? '自然' : 'SP'}排名 ${rankText(value)}，${page == null ? '页码未知' : `第${page}页`}，${movement.text}${annotation ? `，标注：${annotation}` : ''}`;
  const payload = { row, index, metric, date, previousDate };
  return <td className={`comparison-rank-cell comparison-${metric}-cell ${movement.className} ${selected ? 'selected-date' : ''}`}
    data-comparison-date={date} data-comparison-metric={metric} data-page={page ?? ''} data-rank-state={positiveRank(value) != null ? 'ranked' : value === 0 ? 'unranked' : 'missing'}
    aria-label={label} tabIndex={0}
    onMouseEnter={(event) => { highlightDate(event.currentTarget, date); hover.show(event.currentTarget, payload); }} onMouseLeave={(event) => { highlightDate(event.currentTarget); hover.leave(); }}
    onFocus={(event) => { highlightDate(event.currentTarget, date); hover.show(event.currentTarget, payload, true); }} onBlur={(event) => { highlightDate(event.currentTarget); hover.leave(); }}>
    <span className="comparison-rank-line"><span className="comparison-rank-number">{positiveRank(value) ?? (value === 0 ? '—' : '·')}</span>{['rank-up', 'rank-down'].includes(movement.className) && <span className="comparison-rank-delta">{movement.text}</span>}</span>
    {positiveRank(value) != null && page != null && <small className="comparison-page-marker">{`P${page}`}</small>}
    {annotation && <span className="comparison-annotation-corner" aria-hidden="true" />}
  </td>;
}
