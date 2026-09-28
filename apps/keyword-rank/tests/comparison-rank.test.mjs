import test from 'node:test';
import assert from 'node:assert/strict';
import { detailPage, rankMovement } from '../src/lib/comparisonRank.mjs';

test('page uses the source p token, including multi-digit and uppercase pages', () => {
  for (const [detail, page] of [['p3-r2', 3], ['P12-r6', 12], ['自然 (p 2) 位置 9', 2], ['p01', 1]]) {
    assert.equal(detailPage(detail), page);
  }
});

test('missing and malformed details cannot be inferred from the numeric rank', () => {
  for (const detail of [undefined, null, '', 12, '12', '第2页', 'sp12', 'p0', 'p-2', 'p1.5']) {
    assert.equal(detailPage(detail), null, String(detail));
  }
});

test('changes compare ranks without treating missing values as zero', () => {
  assert.equal(rankMovement(12, 17, '2026-09-24').text, '↑5');
  assert.equal(rankMovement(6, 4, '2026-09-24').text, '↓2');
  assert.equal(rankMovement(6, 6, '2026-09-24').text, '—');
  assert.equal(rankMovement(12, null, '2026-09-24').text, '无可比排名');
  assert.equal(rankMovement(12, 0, '2026-09-24').text, '重新上榜');
  assert.equal(rankMovement(12, null, undefined).text, '首次记录');
  assert.equal(rankMovement(null, 12, '2026-09-24').text, '无记录');
  assert.equal(rankMovement(0, 12, '2026-09-24').text, '未上榜');
});
