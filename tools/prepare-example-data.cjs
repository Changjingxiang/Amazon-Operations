// Prepare a portable, deliberately scoped seed from an explicit user backup.
// Never edits the backup or reads a generated release as a source.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const input = process.argv[2];
if (!input) throw new Error('Usage: node tools/prepare-example-data.cjs <backup.json>');
const bytes = fs.readFileSync(input);
const original = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
const matches = original.configs.filter(c => /^L23M911(?:\D|$)/i.test(c.modelName));
assert.equal(matches.length, 1, 'expected exactly one L23M911 product');
const owner = { ...matches[0], order: 0 };
const ownerAsins = new Set([owner.parentAsin, ...(owner.legacyParentAsins || [])]);
const competitors = original.competitors.filter(c => [c.ownerParentAsin, ...(c.ownerParentAsins || [])].some(a => ownerAsins.has(a)))
  .map((c, order) => ({ ...c, ownerParentAsin: owner.parentAsin, ownerParentAsins: [owner.parentAsin], ownerModelName: owner.modelName, order }));
const products = [owner, ...competitors];
const asins = new Set(products.flatMap(c => [c.parentAsin, ...(c.legacyParentAsins || [])]));
const names = new Set(products.map(c => c.modelName));
const belongs = item => item.parentAsin ? asins.has(item.parentAsin) : names.has(item.modelName);
const histories = Object.fromEntries(products.map(c => [c.historySheet, original.histories[c.historySheet] || []]));
const historyRows = Object.values(histories).flat();
assert(historyRows.every(belongs), 'history sheet contains an unexpected product');
const watches = original.watches.filter(belongs);
const annotations = original.annotations.filter(belongs);
const sourceFiles = new Set(historyRows.map(r => r.sourceFile).filter(Boolean));
const importedFiles = Object.fromEntries(Object.entries(original.importedFiles).filter(([name, item]) => item.parentAsin ? asins.has(item.parentAsin) : sourceFiles.has(name) || [...asins].some(asin => name.includes(asin))));
const key = text => String(text || '').trim().toLocaleLowerCase('en-US');
const keywords = new Set([...historyRows, ...watches, ...annotations].map(r => key(r.keyword)));
const countries = new Set(products.map(c => c.countryCode || 'CA'));
const abaMonthly = Object.fromEntries(Object.entries(original.abaMonthly || {}).filter(([, month]) => countries.has(month.countryCode)).map(([id, month]) => {
  const rows = Object.fromEntries(Object.entries(month.rows || {}).filter(([keyword]) => keywords.has(key(keyword))));
  // The initial example carries only its keyword subset, with unchanged ranks.
  return [id, { ...month, fileName: '示例词子集_' + month.fileName, fingerprint: '', rows, rowCount: Object.keys(rows).length }];
}));
const seed = {
  schemaVersion: original.schemaVersion, configs: [owner], competitors, watches, histories, importedFiles, abaMonthly, annotations,
  adReviews: { reports: [], decisions: [] },
  iconSelections: Object.fromEntries(Object.entries(original.iconSelections || {}).filter(([asin]) => asins.has(asin))),
  sourceCount: Object.values(importedFiles).filter(item => !item.unsupported).length,
  migratedFromWorkbookAt: original.migratedFromWorkbookAt, updatedAt: original.updatedAt, storageRevision: null,
};
const encoded = JSON.stringify(seed);
for (const config of [...original.configs, ...original.competitors].filter(c => !asins.has(c.parentAsin))) {
  assert(!encoded.includes(config.parentAsin), `excluded ASIN still present: ${config.parentAsin}`);
  assert(!encoded.includes(config.modelName), `excluded model still present: ${config.modelName}`);
}
const output = path.join(root, 'web', 'data');
fs.writeFileSync(path.join(output, 'initial-data.js'), 'window.__KEYWORD_TRACKER_SEED__ = ' + encoded + ';\n');
fs.writeFileSync(path.join(output, 'Amazon关键词每日跟进-v3.0-示例数据.json'), encoded + '\n');
const summary = {
  sourceBackup: path.basename(input), sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'), sourceUpdatedAt: original.updatedAt,
  ownProductCount: 1, competitorCount: competitors.length,
  products: products.map(c => ({ name: c.modelName, asin: c.parentAsin, rows: histories[c.historySheet].length, watches: watches.filter(w => w.parentAsin ? w.parentAsin === c.parentAsin : w.modelName === c.modelName).length, annotations: annotations.filter(a => a.parentAsin ? a.parentAsin === c.parentAsin : a.modelName === c.modelName).length })),
  historyRows: historyRows.length, sourceCount: seed.sourceCount, abaMonths: Object.keys(abaMonthly).length,
  abaKeywordRows: Object.values(abaMonthly).reduce((sum, m) => sum + m.rowCount, 0),
};
fs.writeFileSync(path.join(output, 'example-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
