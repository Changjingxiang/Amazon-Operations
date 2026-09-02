const fs = require('fs');
const vm = require('vm');

const base = 'C:/Users/Admin/Documents/Codex/2026-08-28/w-2/outputs/关键词排名每日跟进网页版-v1.8.2';
const window = {};
const document = { baseURI: 'file:///C:/placeholder/index.html', createElement() { return { style: {}, addEventListener() {}, click() {}, remove() {} }; }, body: { appendChild() {} } };
const context = { window, document, console, setTimeout, clearTimeout, URL, Blob, structuredClone, Date, Math, JSON, Promise };
vm.createContext(context);
vm.runInContext(fs.readFileSync(`${base}/data/initial-data.js`, 'utf8'), context);
const seed = window.__KEYWORD_TRACKER_SEED__;
const config = seed.configs[0];
const history = seed.histories[config.historySheet];
const keyword = history[0].keyword;
const template = history.find((item) => item.keyword === keyword && item.weeklyAbaRank != null) || history[0];
for (const [date, value] of [['2025-08-28', 9000], ['2025-09-28', 8800], ['2025-10-28', 8600]]) {
  history.push({ ...template, snapshotDate: date, importTime: `${date}T12:00:00.000Z`, weeklyAbaRank: value, sourceFile: 'synthetic-last-year.xlsx' });
}
vm.runInContext(fs.readFileSync(`${base}/browser-bridge.js`, 'utf8'), context);
window.keywordTracker.getData().then((data) => {
  const row = data.models[0].abaRows.find((item) => item.keyword.toLowerCase() === keyword.toLowerCase());
  console.log(JSON.stringify({ keyword, previousYear: row.previousYear, previousTrend: row.abaPreviousTrend }, null, 2));
}).catch((error) => { console.error(error); process.exitCode = 1; });
