import { AlertTriangle, CheckCircle2, LoaderCircle, X } from 'lucide-react';

export function BusyOverlay({ label }) {
  if (!label) return null;
  return (
    <div className="busy-overlay" role="status">
      <div><LoaderCircle className="spin" size={34} /><strong>{label}</strong><span>请不要关闭软件窗口</span></div>
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
