import test from 'node:test';
import assert from 'node:assert/strict';
import { sortDashboardRows } from '../src/lib/dashboardSort.mjs';

const rows = Object.freeze([
  { keyword: 'later week', weeklyAbaRank: 200, spRank: 1, naturalRank: 1 },
  { keyword: 'same SP worse natural', weeklyAbaRank: 100, spRank: 9, naturalRank: 8 },
  { keyword: 'same SP better natural', weeklyAbaRank: 100, spRank: 9, naturalRank: 3 },
  { keyword: 'lower SP', weeklyAbaRank: 100, spRank: 1, naturalRank: 1 },
  { keyword: 'missing worse natural', weeklyAbaRank: null, spRank: 9, naturalRank: 5 },
  { keyword: 'missing better natural', weeklyAbaRank: null, spRank: 9, naturalRank: 1 },
].map(Object.freeze));
const conditions = [
  { field: 'weeklyAbaRank', direction: 'asc' },
  { field: 'spRank', direction: 'desc' },
  { field: 'naturalRank', direction: 'asc' },
];
const keywords = (items) => items.map((item) => item.keyword);

test('weekly ascending, SP descending, natural ascending uses every priority only on ties', () => {
  assert.deepEqual(keywords(sortDashboardRows(rows, conditions)), [
    'same SP better natural', 'same SP worse natural', 'lower SP', 'later week',
    'missing better natural', 'missing worse natural',
  ]);
  assert.equal(rows[0].keyword, 'later week', 'sorting must not mutate the source rows');
});

test('changing one direction leaves the other conditions active', () => {
  assert.deepEqual(keywords(sortDashboardRows(rows, [{ ...conditions[0], direction: 'desc' }, ...conditions.slice(1)])), [
    'later week', 'same SP better natural', 'same SP worse natural', 'lower SP',
    'missing better natural', 'missing worse natural',
  ]);
});

test('moving SP ahead of weekly rank changes the primary group', () => {
  assert.deepEqual(keywords(sortDashboardRows(rows.slice(0, 4), [conditions[1], conditions[0], conditions[2]])), [
    'same SP better natural', 'same SP worse natural', 'lower SP', 'later week',
  ]);
  const sample = [{ keyword: 'best week', weeklyAbaRank: 1, spRank: 1 }, { keyword: 'best SP', weeklyAbaRank: 10, spRank: 10 }];
  assert.equal(sortDashboardRows(sample, conditions)[0].keyword, 'best week');
  assert.equal(sortDashboardRows(sample, [conditions[1], conditions[0]])[0].keyword, 'best SP');
});

test('missing values stay last in both directions and later conditions resolve missing ties', () => {
  const sample = [{ keyword: 'null', spRank: null, naturalRank: 2 }, { keyword: 'empty', spRank: '', naturalRank: 1 }, { keyword: 'ranked', spRank: 7, naturalRank: 3 }, { keyword: 'invalid', spRank: NaN, naturalRank: 4 }];
  for (const direction of ['asc', 'desc']) {
    assert.deepEqual(keywords(sortDashboardRows(sample, [{ field: 'spRank', direction }, conditions[2]])), ['ranked', 'empty', 'null', 'invalid']);
  }
});

test('watch drawer order stays pinned ahead of metric sorting', () => {
  const sample = [...rows.slice(0, 2), { keyword: 'second watch', watched: true, watchOrder: 2, weeklyAbaRank: 1 }, { keyword: 'first watch', watched: true, watchOrder: 1, weeklyAbaRank: null }];
  assert.deepEqual(keywords(sortDashboardRows(sample, conditions)).slice(0, 2), ['first watch', 'second watch']);
});

test('clear restores the exact incoming order; search volume remains numeric', () => {
  assert.equal(sortDashboardRows(rows, []), rows);
  const sample = [{ keyword: 'ten', weeklySearchVolume: '10' }, { keyword: 'two', weeklySearchVolume: 2 }, { keyword: 'missing', weeklySearchVolume: null }];
  assert.deepEqual(keywords(sortDashboardRows(sample, [{ field: 'weeklySearchVolume', direction: 'asc' }])), ['two', 'ten', 'missing']);
  assert.deepEqual(keywords(sortDashboardRows(sample, [{ field: 'weeklySearchVolume', direction: 'desc' }])), ['ten', 'two', 'missing']);
});
