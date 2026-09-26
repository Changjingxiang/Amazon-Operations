import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDateView } from '../../src/lib/format.js';

test('SP and natural missing-rank summaries use their own series and selected day', () => {
  const model = {
    watches: [], dates: ['2026-08-31', '2026-09-22'],
    historyRecords: [
      { keyword: 'a', snapshotDate: '2026-08-31', trafficRank: 1, naturalRank: null, spRank: 3 },
      { keyword: 'a', snapshotDate: '2026-09-22', trafficRank: 1, naturalRank: 2, spRank: null },
      { keyword: 'b', snapshotDate: '2026-09-22', trafficRank: 2, naturalRank: 3, spRank: null },
      { keyword: 'c', snapshotDate: '2026-09-22', trafficRank: 3, naturalRank: null, spRank: 4 },
    ],
  };
  const latest = buildDateView(model, '2026-09-22');
  assert.equal(latest.metrics.unrankedNatural, 1);
  assert.equal(latest.metrics.unrankedSp, 2);
  assert.equal(latest.metrics.keywordCount, 3);
  const previous = buildDateView(model, '2026-08-31');
  assert.equal(previous.metrics.unrankedSp, 0);
  assert.equal(previous.metrics.unrankedNatural, 1);
  assert.equal(buildDateView(model, '2026-09-22').metrics.unrankedSp, 2);
});

test('models without history still show an SP summary from dashboard rows', () => {
  const result = buildDateView({ dashboardRows: [{ naturalRank: 1, spRank: null }, { naturalRank: null, spRank: 3 }], metrics: { keywordCount: 2 } }, '2026-09-22');
  assert.equal(result.metrics.unrankedSp, 1);
  assert.equal(result.metrics.keywordCount, 2);
  assert.equal(buildDateView(null, '').metrics.unrankedSp, 0);
});
