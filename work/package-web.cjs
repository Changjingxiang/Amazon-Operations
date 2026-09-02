const fs = require('fs');
const path = require('path');
const archiver = require('C:/Users/Admin/Documents/Codex/2026-07-23/new-chat-3/keyword-rank-desktop/node_modules/archiver');

const source = path.resolve(__dirname, '../outputs/关键词排名每日跟进网页版-v1.8.2');
const target = path.resolve(__dirname, '../outputs/关键词排名每日跟进网页版-v1.8.2.zip');
const temporary = `${target}.tmp`;
if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
const output = fs.createWriteStream(temporary);
const archive = archiver('zip', { zlib: { level: 9 } });
output.on('close', () => {
  fs.renameSync(temporary, target);
  console.log(`${target} ${archive.pointer()} bytes`);
});
archive.on('warning', (error) => { if (error.code !== 'ENOENT') throw error; });
archive.on('error', (error) => { throw error; });
archive.pipe(output);
archive.directory(source, false);
archive.finalize();
