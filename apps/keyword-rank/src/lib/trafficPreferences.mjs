import { TRAFFIC_VERSION } from './trafficIndex.mjs';

export const TRAFFIC_SETTINGS_KEY = 'keyword-tracker:traffic-settings:v1';
export const TRAFFIC_PENDING_KEY = 'keyword-tracker:traffic-pending:v1';
export const TRAFFIC_SEEN_KEY = 'keyword-tracker:traffic-seen:v1';
export const DEFAULT_TRAFFIC_THRESHOLD = 20;
export function validThreshold(value) { return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 1000; }
export function readTrafficThreshold(storage = globalThis.localStorage) {
  try { const value = JSON.parse(storage.getItem(TRAFFIC_SETTINGS_KEY))?.threshold;
    return validThreshold(value) ? Number(value) : DEFAULT_TRAFFIC_THRESHOLD;
  } catch { return DEFAULT_TRAFFIC_THRESHOLD; }
}
export function saveTrafficThreshold(value, storage = globalThis.localStorage) {
  if (!validThreshold(value)) throw new Error('请输入 1–1000 之间的整数百分比。');
  storage.setItem(TRAFFIC_SETTINGS_KEY, JSON.stringify({ threshold: Number(value) }));
}
export function readTrafficSeen(storage = globalThis.localStorage) {
  try { const list = JSON.parse(storage.getItem(TRAFFIC_SEEN_KEY)); return new Set(Array.isArray(list) ? list.filter(x => typeof x === 'string') : []); }
  catch { return new Set(); }
}
export function readPendingTraffic(storage = globalThis.localStorage) {
  // Old notices contain percentages from the previous comparison formula.
  try { const value = JSON.parse(storage.getItem(TRAFFIC_PENDING_KEY)); return Array.isArray(value) ? value.filter(x => x?.id && x.calculationVersion === TRAFFIC_VERSION && Array.isArray(x.metrics)) : []; }
  catch { return []; }
}
