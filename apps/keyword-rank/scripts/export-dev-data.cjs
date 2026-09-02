const fs = require('fs');
const path = require('path');
const { readTrackerWorkbook } = require('../electron/workbook.cjs');

const toolRoot = process.env.KEYWORD_TOOL_ROOT || 'C:\\Users\\Admin\\Desktop\\关键词排名每日跟进工具';
const outputDir = path.join(__dirname, '..', 'public');
fs.mkdirSync(outputDir, { recursive: true });
const data = readTrackerWorkbook(
  toolRoot,
  path.join(__dirname, '..', 'bridge', 'export_tracker_data.ps1'),
  path.join(outputDir, 'tracker-data-cache.json'),
);
fs.writeFileSync(path.join(outputDir, 'mock-data.json'), JSON.stringify(data), 'utf8');
console.log(`已导出演示数据：${data.models.length} 个型号，${data.sourceCount} 个源文件。`);
