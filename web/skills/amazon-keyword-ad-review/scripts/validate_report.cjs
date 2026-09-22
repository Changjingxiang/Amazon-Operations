const fs = require('node:fs');
const path = require('node:path');
const local = path.join(__dirname, 'review-core.cjs');
const core = require(fs.existsSync(local) ? local : path.resolve(__dirname, '../../../ad-review/review-core.js'));
try {
  if (process.argv.length < 4) throw Error('用法: node validate_report.cjs <报告.json> <网页备份.json>');
  const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
  const report = read(process.argv[2]), backup = read(process.argv[3]);
  const result = core.preview(report, backup.configs, backup.watches || [], backup.adReviews?.reports || []);
  if (!result.valid) throw Error(JSON.stringify(result.matches.filter(m => !m.matched), null, 2));
  console.log(JSON.stringify({valid:true, items:result.matches.length, duplicate:result.duplicate, runId:result.report.runId}));
} catch (error) { console.error(error.message); process.exitCode = 1; }
