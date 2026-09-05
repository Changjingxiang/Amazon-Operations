import { useCallback, useEffect, useState } from 'react';
import App from '../App.jsx';
import './StartupExperience.css';

function RunningK({ status, onDone }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (status === 'loading') return undefined;
    if (status === 'error' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onDone();
      return undefined;
    }
    setLeaving(true);
    // Fallback also completes the reveal when transition events are suppressed.
    const timer = window.setTimeout(onDone, 280);
    return () => window.clearTimeout(timer);
  }, [status, onDone]);
  return <div className={`k-loading ${leaving ? 'is-leaving' : ''}`} role="status" aria-live="polite" onTransitionEnd={(event) => { if (event.target === event.currentTarget && event.propertyName === 'opacity' && leaving) onDone(); }}>
    <div className="k-loading-content">
      <svg viewBox="0 0 240 200" className="k-loading-art" aria-hidden="true">
        <ellipse className="k-run-shadow" cx="122" cy="166" rx="39" ry="5" fill="#173b64" opacity=".09" />
        <g className="k-ground" stroke="#27c7d9" strokeWidth="2" strokeLinecap="round"><path d="M 57 175 H 91 M 106 175 H 164 M 182 175 H 196" /></g>
        <g className="k-run-body">
          <g className="k-limb k-arm-back"><path d="M 105 110 Q 84 103 79 117 L 68 113" /></g>
          <g className="k-limb k-leg-back"><path d="M 111 134 L 96 148 L 105 162 L 95 164" /></g>
          <path d="M 100 57 H 119 V 89 L 143 57 H 167 L 135 96 L 169 136 H 145 L 119 104 V 136 H 100 Z" fill="#173b64" />
          <g fill="white"><ellipse cx="108" cy="72" rx="5" ry="7" /><ellipse cx="121" cy="72" rx="5" ry="7" /></g>
          <g fill="#173b64"><circle cx="110" cy="73" r="2.3" /><circle cx="123" cy="73" r="2.3" /></g>
          <path d="M 108 86 Q 115 92 121 85" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
          <g className="k-limb k-leg-front"><path d="M 143 134 L 159 145 L 148 159 L 160 161" /></g>
          <g className="k-limb k-arm-front"><path d="M 143 104 Q 158 112 168 92 L 175 95" /></g>
          <path d="M 92 94 H 73 M 91 102 H 80" stroke="#27c7d9" strokeWidth="3" strokeLinecap="round" opacity=".7" />
        </g>
      </svg>
      <strong>{leaving ? '准备就绪' : '正在读取关键词数据…'}</strong>
      <span>关键词排名每日跟进</span>
    </div>
  </div>;
}

export default function StartupExperience() {
  const [status, setStatus] = useState('loading');
  const [visible, setVisible] = useState(() => Boolean(window.keywordTracker?.isWeb));
  const settle = useCallback((result) => setStatus(result), []);
  const done = useCallback(() => setVisible(false), []);
  return <><div className="startup-app-host" inert={visible ? '' : undefined}><App onStartupSettled={settle} /></div>{visible && <RunningK status={status} onDone={done} />}</>;
}
