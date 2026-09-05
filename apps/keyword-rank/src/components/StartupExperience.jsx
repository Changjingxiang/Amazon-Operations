import { useCallback, useEffect, useRef, useState } from 'react';
import App from '../App.jsx';
import './StartupExperience.css';

// The same rising ranking line is the running route and the seam of the reveal.
const ROUTE = 'M 0 900 L 150 764 L 330 652 L 405 678 L 590 486 L 675 518 L 885 302 L 965 332 L 1180 130 L 1440 0';
const TOP = '0,0 1440,0 1180,130 965,332 885,302 675,518 590,486 405,678 330,652 150,764 0,900';
const BOTTOM = '0,900 150,764 330,652 405,678 590,486 675,518 885,302 965,332 1180,130 1440,0 1440,900';
const ease = (t) => t * t * (3 - 2 * t);

function Runner({ letter, color, index, runnerRef }) {
  return <g ref={runnerRef} className="key-runner" style={{ '--stride-delay': `${-index * 0.11}s` }}>
    <ellipse cx="0" cy="1" rx="24" ry="4" fill="#173b64" opacity=".08" />
    <g className="key-leg key-leg-back"><path d="M -10 -15 Q -25 1 -15 9 L -25 10" /></g>
    <g className="key-leg key-leg-front"><path d="M 10 -15 Q 27 -7 20 9 L 32 9" /></g>
    <text x="0" y="-14" textAnchor="middle" fontSize="70" fontWeight="900" fontFamily="Arial, sans-serif" fill={color} stroke={color} strokeWidth="1">{letter}</text>
    <g fill="white" stroke="#173b64" strokeWidth="1.3"><ellipse cx="-10" cy="-60" rx="5" ry="6" /><ellipse cx="3" cy="-60" rx="5" ry="6" /></g>
    <g fill="#173b64"><circle cx="-8" cy="-59" r="2.1" /><circle cx="5" cy="-59" r="2.1" /></g>
    <path d="M -5 -47 Q 0 -42 6 -48" fill="none" stroke="#173b64" strokeWidth="1.8" strokeLinecap="round" />
    {index === 0 && <path d="M -21 -38 Q -35 -40 -37 -26" fill="none" stroke="#173b64" strokeWidth="3" strokeLinecap="round" />}
    {index === 2 && <path d="M 19 -42 Q 34 -49 33 -62 M 29 -63 L 35 -65" fill="none" stroke="#173b64" strokeWidth="3" strokeLinecap="round" />}
  </g>;
}

function StartupCurtain({ status, onDone }) {
  const root = useRef(null);
  const route = useRef(null);
  const progress = useRef(null);
  const runners = useRef([]);
  const hands = useRef([]);
  const sheets = useRef([]);
  const seams = useRef([]);
  const zipper = useRef(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const [phase, setPhase] = useState('running');
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const length = route.current.getTotalLength();
    const seamPoints = Array.from({ length: 101 }, (_, index) => route.current.getPointAtLength(length * index / 100));
    const start = performance.now();
    let frame;
    let distance = 0.16;
    let previous = start;
    let finishAt = 0;
    let completed = false;
    const tick = (now) => {
      if (completed) return;
      if (statusRef.current === 'error') { completed = true; onDone(); return; }
      const delta = Math.min(64, now - previous); previous = now;
      const ready = statusRef.current === 'ready';
      if (reduced && ready) { completed = true; onDone(); return; }
      // This is a loading illustration, not an invented byte-count percentage.
      // Hold before the finish until the actual initial data request succeeds.
      const target = ready ? .92 : .16 + .66 * (1 - Math.exp(-(now - start) / 2600));
      distance = Math.min(target, distance + delta / 4200);
      progress.current.style.strokeDasharray = `${length * distance} ${length}`;
      const points = [0, 1, 2].map((index) => {
        const point = route.current.getPointAtLength(length * distance - (2 - index) * 76);
        const hop = reduced || finishAt ? 0 : Math.sin((now - start) / 85 - index * .65) * 3;
        const y = point.y - 12 + hop;
        runners.current[index].setAttribute('transform', `translate(${point.x},${y})`);
        return { x: point.x, y };
      });
      hands.current.forEach((hand, index) => {
        const a = points[index], b = points[index + 1];
        hand.setAttribute('d', `M ${a.x + 22} ${a.y - 39} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - 27} ${b.x - 21} ${b.y - 39}`);
      });
      if (ready && distance >= .919 && !finishAt) { finishAt = now; setPhase('arrived'); }
      if (finishAt && now - finishAt > 260) {
        const t = Math.min(1, (now - finishAt - 260) / 1100);
        if (root.current?.dataset.opening !== 'true') { root.current.dataset.opening = 'true'; setPhase('opening'); }
        const spread = ease(t) * 1050;
        const head = 1 - ease(t);
        const edges = [-1, 1].map((side) => seamPoints.map((point, index) => {
          const released = ease(Math.min(1, Math.max(0, (index / 100 - head) * 8)));
          return [point.x + side * spread * .7 * released, point.y + side * spread * released];
        }));
        sheets.current[0].setAttribute('points', [[-spread * .7, -spread], [1440 - spread * .7, -spread], ...edges[0].slice().reverse()].map((point) => point.join(',')).join(' '));
        sheets.current[1].setAttribute('points', [...edges[1], [1440 + spread * .7, 900 + spread], [spread * .7, 900 + spread]].map((point) => point.join(',')).join(' '));
        edges.forEach((edge, index) => seams.current[index].setAttribute('d', edge.map((point, i) => (i ? 'L ' : 'M ') + point.join(' ')).join(' ')));
        const pull = route.current.getPointAtLength(length * (1 - ease(t)));
        zipper.current.setAttribute('transform', `translate(${pull.x},${pull.y}) rotate(42)`);
        zipper.current.style.opacity = String(Math.min(1, (1 - t) * 6));
        if (t === 1) { completed = true; onDone(); return; }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [onDone]);

  return <div className={`key-startup key-startup-${phase}`} ref={root} role="status" aria-label={status === 'ready' ? '数据已就绪，正在打开工作台' : '正在读取关键词数据'}>
    <svg className="key-startup-stage" viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="key-cream" x2="1" y2="1"><stop stopColor="#fffdf7" /><stop offset="1" stopColor="#f6f4eb" /></linearGradient><linearGradient id="key-trail"><stop stopColor="#168da0" /><stop offset="1" stopColor="#27c7d9" /></linearGradient></defs>
      <g><polygon ref={(node) => { sheets.current[0] = node; }} points={TOP} fill="url(#key-cream)" /><path ref={(node) => { seams.current[0] = node; }} d={ROUTE} className="key-seam" /></g>
      <g><polygon ref={(node) => { sheets.current[1] = node; }} points={BOTTOM} fill="url(#key-cream)" /><path ref={(node) => { seams.current[1] = node; }} d={ROUTE} className="key-seam" /></g>
      <g className="key-journey">
        <path d={ROUTE} ref={route} fill="none" stroke="#d7e1e5" strokeWidth="3" strokeLinejoin="round" />
        <path d={ROUTE} ref={progress} fill="none" stroke="url(#key-trail)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="0 3000" />
        {[0, 1].map((index) => <path key={index} ref={(node) => { hands.current[index] = node; }} fill="none" stroke="#173b64" strokeWidth="3" strokeLinecap="round" />)}
        {[['K', '#173b64'], ['E', '#1ab4c6'], ['Y', '#e6ad39']].map(([letter, color], index) => <Runner key={letter} letter={letter} color={color} index={index} runnerRef={(node) => { runners.current[index] = node; }} />)}
      </g>
      <g className="key-zipper" ref={zipper}><rect x="-11" y="-18" width="22" height="36" rx="7" fill="#27c7d9" stroke="#173b64" strokeWidth="2" /><rect x="-5" y="-8" width="10" height="16" rx="4" fill="#fffdf7" /></g>
    </svg>
    <div className="key-startup-copy"><div className="key-startup-brand">KEY <span>关键词排名每日跟进</span></div><h1>每一步，<br />都向更好的排名。</h1><p>一起向上，开启今天的工作台。</p></div>
    <div className="key-startup-status"><span className="key-startup-dot" /><span>{phase === 'running' ? (status === 'ready' ? '数据已就绪 · 正在奔向终点' : '正在读取关键词数据…') : '加载完成 · 正在展开工作台'}</span><small>Y 牵着 E，E 牵着 K · 一起向上</small></div>
    {status === 'ready' && <button className="key-startup-skip" onClick={onDone}>进入工作台 ↗</button>}
  </div>;
}

export default function StartupExperience() {
  const [status, setStatus] = useState('loading');
  const [visible, setVisible] = useState(() => Boolean(window.keywordTracker?.isWeb));
  const settle = useCallback((result) => setStatus(result), []);
  const done = useCallback(() => setVisible(false), []);
  return <><div className={visible ? 'key-app-under-curtain' : undefined} inert={visible ? '' : undefined}><App onStartupSettled={settle} /></div>{visible && <StartupCurtain status={status} onDone={done} />}</>;
}
