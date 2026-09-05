import { useCallback, useEffect, useState } from 'react';
import App from '../App.jsx';
import runningKVideo from '../assets/running-k.mp4';
import './StartupExperience.css';

function RunningK({ status, onDone }) {
  const [leaving, setLeaving] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [reducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
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
      <div className="k-loading-media" aria-hidden="true">
        {(!videoReady || videoFailed) && <span className="k-video-fallback">K</span>}
        {!videoFailed && <video className={videoReady ? 'k-loading-video is-ready' : 'k-loading-video'} src={runningKVideo} autoPlay={!reducedMotion} loop muted playsInline preload="auto" disablePictureInPicture onLoadedData={(event) => {
          if (reducedMotion) { event.currentTarget.pause(); setVideoReady(true); }
          else event.currentTarget.play().catch(() => setVideoFailed(true));
        }} onPlaying={() => setVideoReady(true)} onError={() => setVideoFailed(true)} />}
      </div>
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
