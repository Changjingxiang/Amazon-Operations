import { useRef, useState } from 'react';
import runningKVideo from '../assets/running-k.mp4';
import LoadingWaves from './LoadingWaves.jsx';
import { AlertTriangle, CheckCircle2, LoaderCircle, X } from 'lucide-react';

function BusyVideo() {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const play = () => {
    const video = ref.current;
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.playbackRate = 1.5;
    video.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  };
  return <>{failed ? <LoaderCircle className="spin" size={34} /> : <video ref={ref} className="busy-k-video" src={runningKVideo} autoPlay muted loop playsInline preload="auto" disablePictureInPicture onLoadedData={play} onError={() => setFailed(true)} aria-hidden="true" />}{blocked && <button type="button" className="busy-video-play" onClick={play}>播放动画</button>}</>;
}

export function BusyOverlay({ label }) {
  if (!label) return null;
  return (
    <div className={`busy-overlay ${window.keywordTracker?.isWeb ? 'busy-overlay-video' : ''}`} role="status" aria-live="polite">
      {window.keywordTracker?.isWeb && <LoadingWaves />}
      <div>{window.keywordTracker?.isWeb ? <BusyVideo /> : <LoaderCircle className="spin" size={34} />}<strong>{label}</strong><span>请不要关闭软件窗口</span></div>
    </div>
  );
}

export function Toast({ toast, onClose }) {
  if (!toast) return null;
  const Icon = toast.type === 'error' ? AlertTriangle : CheckCircle2;
  return (
    <div className={`toast ${toast.type || 'success'}`} role="alert">
      <Icon size={22} />
      <div><strong>{toast.title}</strong><span>{toast.message}</span></div>
      <button type="button" aria-label="关闭提示" onClick={onClose}><X size={18} /></button>
    </div>
  );
}
