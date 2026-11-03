import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreRecord, buildTrafficSeries, buildTrafficDetail, buildTrafficAlerts, trafficSignatures, percentChange } from '../src/lib/trafficIndex.mjs';
import { readTrafficThreshold, saveTrafficThreshold, readPendingTraffic, TRAFFIC_SETTINGS_KEY, TRAFFIC_PENDING_KEY } from '../src/lib/trafficPreferences.mjs';

const row = (date, volume, naturalRank = 1, spRank = 0, extras = {}) => ({ keyword: 'sweater', snapshotDate: date, weeklySearchVolume: volume, naturalRank, spRank, naturalRankDate: date, spRankDate: date, ...extras });
const model = records => ({ modelName: '1479', countryCode: 'CA', parentAsin: 'B012345678', historyRecords: records });
const data = records => ({ models: [model(records)] });

test('volume and rank affect scores monotonically; natural and SP stack additively', () => {
  const first = scoreRecord(row('2026-11-02', 1000, 1, 1));
  assert.equal(first.natural, 1000); assert.equal(first.total, 2000);
  const tenth = scoreRecord(row('2026-11-02', 1000, 10, 0));
  assert.ok(Math.abs(tenth.natural - 158.48931924611134) < 1e-8);
  assert.equal(scoreRecord(row('2026-11-02', 2000, 10)).natural, 2 * tenth.natural);
  assert.ok(tenth.natural < first.natural);
});
test('strict 20 percent threshold, configurable threshold and unchanged-import suppression', () => {
  const old = data([row('2026-11-01', 100)]);
  assert.equal(buildTrafficAlerts(data([row('2026-11-01', 100), row('2026-11-02', 120)]), 20, trafficSignatures(old)).length, 0);
  const next = data([row('2026-11-01', 100), row('2026-11-02', 121)]);
  const alerts = buildTrafficAlerts(next, 20, trafficSignatures(old));
  assert.equal(alerts.length, 1);
  assert.equal(buildTrafficAlerts(next, 25).length, 0);
  assert.equal(buildTrafficAlerts(next, 20, trafficSignatures(next)).length, 0);
  assert.equal(buildTrafficAlerts(next, 20, new Map(), new Set(alerts.map(x => x.id))).length, 0);
});
test('opposing natural/SP changes survive even when total is flat', () => {
  const records = [row('2026-11-01', 100, 1, 0, { keyword: 'natural' }), row('2026-11-01', 100, 0, 1, { keyword: 'ad' }),
    row('2026-11-02', 140, 1, 0, { keyword: 'natural' }), row('2026-11-02', 60, 0, 1, { keyword: 'ad' })];
  const [alert] = buildTrafficAlerts(data(records), 20);
  assert.deepEqual(alert.metrics.map(x => [x.key, x.change]), [['natural', 40], ['sp', -40]]);
});
test('daily comparison includes changes in scored coverage without assigning scores to missing data', () => {
  const records = [row('2026-11-01', 100, 1, 0, { keyword: 'stable' }), row('2026-11-02', 100, 1, 0, { keyword: 'stable' }),
    row('2026-11-01', 200, 1, 0, { keyword: 'missing volume' }), row('2026-11-02', null, 1, 0, { keyword: 'missing volume' }),
    row('2026-11-01', 300, 1, 0, { keyword: 'missing row' }),
    row('2026-11-01', 400, 1, 0, { keyword: 'stale rank' }), row('2026-11-02', 400, 1, 0, { keyword: 'stale rank', naturalRankDate: '2026-10-25' })];
  const point = buildTrafficDetail(records, '2026-11-02');
  assert.equal(point.natural, 100); assert.equal(point.volumeCount, 2);
  assert.equal(point.comparison.natural.current, point.natural);
  assert.equal(point.comparison.natural.previous, 1000);
  assert.equal(point.comparison.natural.change, -90);
  assert.equal(buildTrafficAlerts(data(records), 20)[0].metrics.find(metric => metric.key === 'natural').change, -90);
  assert.equal(scoreRecord(row('2026-11-02', null)).total, null);
  assert.equal(scoreRecord(row('2026-11-02', 100, null, null)).total, null);
});

test('rising daily natural total must not inherit a declining shared-keyword percentage', () => {
  const records = [
    row('2026-11-02', 1000, 1, 0, { keyword: 'shared natural' }),
    row('2026-11-03', 940, 1, 0, { keyword: 'shared natural' }),
    row('2026-11-02', 444.9, 1, 0, { keyword: 'yesterday natural' }),
    row('2026-11-03', 529.9, 1, 0, { keyword: 'today natural' }),
    row('2026-11-02', 2509, 0, 1, { keyword: 'ads' }),
    row('2026-11-03', 1636.5, 0, 1, { keyword: 'ads' }),
  ];
  const detail = buildTrafficDetail(records, '2026-11-03');
  assert.equal(detail.natural, 1469.9);
  assert.equal(detail.comparison.natural.previous, 1444.9);
  assert.equal(detail.comparison.natural.change.toFixed(1), '1.7');
  assert.equal(detail.comparison.sp.change.toFixed(1), '-34.8');
  assert.equal(detail.comparison.total.change.toFixed(1), '-21.4');
  const series = buildTrafficSeries(records);
  for (const key of ['natural', 'sp', 'total']) {
    assert.equal(detail.comparison[key].current, series[1][key]);
    assert.equal(detail.comparison[key].previous, series[0][key]);
  }
  const [alert] = buildTrafficAlerts(data(records), 20);
  assert.deepEqual(alert.metrics.map(metric => metric.key), ['total', 'sp']);
  alert.metrics.forEach(metric => assert.deepEqual(metric, { ...metric, ...detail.comparison[metric.key] }));
});

test('keyword change follows the displayed sum of natural and SP scores', () => {
  const records = [row('2026-11-02', 100, 1, 1), row('2026-11-03', 100, 1, null)];
  const [keyword] = buildTrafficDetail(records, '2026-11-03').topKeywords;
  assert.equal(keyword.before.total, 200); assert.equal(keyword.now.total, 100);
  assert.equal(keyword.now.sp, null); assert.equal(keyword.change, -50);
  const missingDay = data([row('2026-11-02', 100, 1, 1), row('2026-11-03', null, 1, 1)]);
  assert.equal(buildTrafficAlerts(missingDay, 20).length, 0);
});

test('old queued cohort notices are not shown after the daily-total fix', () => {
  const [current] = buildTrafficAlerts(data([row('2026-11-02', 100), row('2026-11-03', 140)]), 20);
  const legacy = { ...current, id: 'old-cohort-notice' }; delete legacy.calculationVersion;
  const storage = { getItem: key => key === TRAFFIC_PENDING_KEY ? JSON.stringify([legacy, current]) : null };
  assert.deepEqual(readPendingTraffic(storage), [current]);
});
test('zero means explicitly unranked; unknown is not zero; zero baseline and missing yesterday have no percentage', () => {
  assert.equal(scoreRecord(row('2026-11-02', 100, 0, 0)).total, 0);
  assert.equal(percentChange(100, 0), null);
  assert.equal(buildTrafficAlerts(data([row('2026-11-01', 0), row('2026-11-02', 100)]), 20).length, 0);
  assert.equal(buildTrafficAlerts(data([row('2026-10-31', 100), row('2026-11-02', 200)]), 20).length, 0);
  const [drop] = buildTrafficAlerts(data([row('2026-11-01', 100), row('2026-11-02', 100, 0)]), 20);
  assert.equal(drop.metrics[0].change, -100);
});
test('one import per keyword/date is counted and source history stays unchanged', () => {
  const records = [row('2026-11-02', 100, 1, 0, { importTime: '2026-11-02T08:00:00Z' }),
    row('2026-11-02', 300, 1, 0, { importTime: '2026-11-02T10:00:00Z', keyword: ' SWEATER ' }),
    row('2026-11-02', 200, 1, 0, { importTime: '2026-11-02T09:00:00Z' })];
  const before = JSON.stringify(records);
  assert.equal(buildTrafficSeries(records)[0].natural, 300);
  assert.equal(buildTrafficSeries(records)[0].count, 1);
  assert.equal(JSON.stringify(records), before);
  assert.equal(buildTrafficSeries(records), buildTrafficSeries(records));
});
test('top five includes a formerly large keyword that drops to zero', () => {
  const records = Array.from({ length: 6 }, (_, i) => [row('2026-11-01', 100 + i, 1, 0, { keyword: `term ${i}` }), row('2026-11-02', 100 + i, 1, 0, { keyword: `term ${i}` })]).flat();
  records.push(row('2026-11-01', 10000, 1, 0, { keyword: 'important lost term' }), row('2026-11-02', 10000, 0, 0, { keyword: 'important lost term' }));
  const detail = buildTrafficDetail(records, '2026-11-02');
  assert.equal(detail.topKeywords.length, 5);
  assert.equal(detail.topKeywords[0].keyword, 'important lost term');
  assert.equal(detail.topKeywords[0].change, -100);
});
test('only owned products alert and country remains part of the identity', () => {
  const records = [row('2026-11-01', 100), row('2026-11-02', 140)];
  const own = model(records);
  const alerts = buildTrafficAlerts({ models: [own, { ...own, countryCode: 'US' }, { ...own, kind: 'competitor', parentAsin: 'B087654321' }] }, 20);
  assert.equal(alerts.length, 2); assert.notEqual(alerts[0].id, alerts[1].id);
});
test('threshold persists, rejects invalid settings, and recovers from damaged storage', () => {
  const map = new Map(), storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  assert.equal(readTrafficThreshold(storage), 20);
  saveTrafficThreshold(35, storage); assert.equal(readTrafficThreshold(storage), 35);
  assert.throws(() => saveTrafficThreshold(0, storage)); assert.throws(() => saveTrafficThreshold(10.5, storage));
  map.set(TRAFFIC_SETTINGS_KEY, 'broken'); assert.equal(readTrafficThreshold(storage), 20);
});
