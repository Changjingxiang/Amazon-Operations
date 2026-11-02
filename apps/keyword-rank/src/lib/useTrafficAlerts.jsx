import { useEffect, useRef, useState } from 'react';
import { buildTrafficAlerts, trafficSignatures, modelTrafficKey, ownTrafficModels } from './trafficIndex.mjs';
import { readTrafficThreshold, saveTrafficThreshold, readTrafficSeen, readPendingTraffic, TRAFFIC_PENDING_KEY, TRAFFIC_SEEN_KEY, TRAFFIC_SETTINGS_KEY } from './trafficPreferences.mjs';

export default function useTrafficAlerts(data) {
  const [threshold, setThreshold] = useState(readTrafficThreshold);
  const [pending, setPending] = useState(readPendingTraffic);
  const dataRef = useRef(data);
  const baseline = useRef(null);
  const seen = useRef(null);
  if (!seen.current) seen.current = readTrafficSeen();
  dataRef.current = data;
  useEffect(() => {
    const sync = event => {
      if (event.key === TRAFFIC_SETTINGS_KEY) setThreshold(readTrafficThreshold());
      if (event.key === TRAFFIC_SEEN_KEY) { seen.current = readTrafficSeen(); setPending(items => items.filter(item => !seen.current.has(item.id))); }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const capture = () => { baseline.current = trafficSignatures(dataRef.current); };
  const review = nextData => {
    const before = baseline.current || trafficSignatures(dataRef.current);
    baseline.current = null;
    const next = buildTrafficAlerts(nextData, readTrafficThreshold(), before, seen.current);
    if (!next.length) return;
    // Persist unread notices so reloading after a completed import does not
    // lose the announcement. The history itself is never modified here.
    setPending(items => {
      const merged = [...new Map([...items, ...next].map(item => [item.modelKey, item])).values()];
      try { localStorage.setItem(TRAFFIC_PENDING_KEY, JSON.stringify(merged)); } catch { /* still show in this session */ }
      return merged;
    });
  };
  const dismiss = () => {
    pending.forEach(item => seen.current.add(item.id));
    const last = [...seen.current].slice(-400);
    try {
      localStorage.setItem(TRAFFIC_SEEN_KEY, JSON.stringify(last));
      localStorage.removeItem(TRAFFIC_PENDING_KEY);
    } catch { /* acknowledgement remains valid for this session */ }
    setPending([]);
  };
  const saveThreshold = value => { saveTrafficThreshold(value); setThreshold(Number(value)); };
  const ownKeys = new Set(ownTrafficModels(data).map(modelTrafficKey));
  const alerts = pending.filter(item => ownKeys.has(item.modelKey)).map(item => ({ ...item, metrics: item.metrics.filter(metric => Number.isFinite(metric.change) && Math.abs(metric.change) - threshold > 1e-9) }))
    .filter(item => item.metrics.length && !seen.current.has(item.id));
  return { threshold, saveThreshold, alerts, capture, review, dismiss };
}
