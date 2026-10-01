import test from 'node:test';
import assert from 'node:assert/strict';
import { periodSelection, filterPeriodDates } from '../src/lib/matrixPeriod.mjs';
const days = (month, count) => Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
test('14 imported dates show previous and latest month; 15 show latest only', () => {
  assert.deepEqual(periodSelection([...days('2026-09', 30), ...days('2026-10', 14)]).selected, ['2026-09', '2026-10']);
  assert.deepEqual(periodSelection([...days('2026-09', 30), ...days('2026-10', 15)]).selected, ['2026-10']);
});
test('counts unique imported dates, independent of the day of month and product', () => {
  const a = ['2026-09-30', '2026-10-20', '2026-10-20'];
  const b = [...days('2026-09', 30), ...days('2026-10', 15)];
  assert.deepEqual(periodSelection(a).selected, ['2026-09', '2026-10']);
  assert.deepEqual(periodSelection(b).selected, ['2026-10']);
});
test('January carries December across the year boundary', () => {
  const dates = ['2025-12-31', '2026-01-01'];
  assert.deepEqual(periodSelection(dates).selected, ['2025-12', '2026-01']);
  assert.deepEqual(filterPeriodDates(dates), dates);
});
test('manual selection overrides automatic months and respects the selected year', () => {
  const dates = [...days('2025-09', 30), ...days('2025-10', 2), ...days('2026-10', 3)];
  assert.deepEqual(periodSelection(dates, { matrixYear: '2025' }).selected, ['2025-09', '2025-10']);
  assert.deepEqual(filterPeriodDates(dates, { matrixYear: '2025', matrixMonths: ['2025-09'] }), days('2025-09', 30));
});
test('missing previous month does not substitute a distant month', () => {
  assert.deepEqual(periodSelection(['2026-08-31', '2026-10-01']).selected, ['2026-10']);
  assert.deepEqual(periodSelection([]).selected, []);
});
