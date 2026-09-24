const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ExcelJS = require('../apps/keyword-rank/node_modules/exceljs');

async function main() {
  const source = path.resolve(process.argv[2] || 'web/browser-bridge/current-excel-export.js');
  const window = { ExcelJS };
  vm.runInThisContext(`(function(window) { ${fs.readFileSync(source, 'utf8')}\n})`)(window);
  const makeModel = (countryCode, keywords, kind = 'product') => ({
    countryCode, kind, modelName: countryCode, parentAsin: countryCode,
    dates: [], dashboardRows: [], watches: [], historyRecords: [],
    matrixRows: keywords.map(keyword => ({ keyword })),
    abaRowsByYear: {}, iconHistory: [],
  });
  const models = [
    makeModel('CA', [' Jacket ', 'history only', 'watch only']),
    makeModel('CA', ['jacket', 'competitor only'], 'competitor'),
    makeModel('US', ['us only']),
  ];
  const rows = { jacket: 10, 'history only': 20, 'watch only': 30, 'competitor only': 40, 'us only': 999 };
  // Reproduce the failure: the imported full-market data exceeds one Excel sheet.
  for (let i = 0; i < 1048577; i++) rows[`unrelated ${i}`] = i + 1;
  Object.freeze(rows);
  const store = { abaMonthly: {
    'CA:2026-08': { countryCode: 'CA', month: '2026-08', rows },
    'CA-2026-07': { month: '2026-07', rows: [
      { keyword: ' JACKET ', searchFrequencyRank: 50 },
      { keyword: 'jacket', rank: 51 },
      { keyword: 'unrelated', rank: 1 },
    ] },
    'US:2026-08': { countryCode: 'US', month: '2026-08', rows: { jacket: 888, 'us only': 60 } },
    'DE:2026-08': { countryCode: 'DE', month: '2026-08', rows: { jacket: 777 } },
    '2025-08': { month: '2025-08', rows: { jacket: 70 } },
  } };
  const { buffer } = await window.KeywordCurrentExcelExport.build(store, models);
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(buffer);
  const sheet = restored.getWorksheet('ABA月榜原始数据');
  const actual = [];
  sheet.eachRow((row, index) => { if (index > 3) actual.push(row.values.slice(1, 5)); });
  assert.deepEqual(actual, [
    ['CA', '2026-08', 'jacket', 10],
    ['CA', '2026-08', 'history only', 20],
    ['CA', '2026-08', 'watch only', 30],
    ['CA', '2026-08', 'competitor only', 40],
    ['CA', '2026-07', ' JACKET ', 50],
    ['US', '2026-08', 'us only', 60],
    ['CA', '2025-08', 'jacket', 70],
  ]);
  assert.equal(rows['us only'], 999);
  assert.equal(Object.keys(rows).length, 1048582);
  const empty = await window.KeywordCurrentExcelExport.build(store, []);
  assert.equal(empty.workbook.getWorksheet('ABA月榜原始数据').rowCount, 3);
  console.log(JSON.stringify({ passed: true, source, importedRows: Object.keys(rows).length, exportedRows: actual.length, bytes: buffer.byteLength, checks: ['large monthly import', 'country isolation', 'shared keyword deduplication', 'case and whitespace', 'historical and watched keywords', 'competitor keywords', 'array compatibility', 'empty products', 'XLSX readback', 'source data preserved'] }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
