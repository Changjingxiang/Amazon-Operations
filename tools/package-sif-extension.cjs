// Build the downloadable extension from authoritative source, including offline
// bytes for file:// pages where fetch of a sibling ZIP is blocked by browsers.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const table = Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
module.exports = function packageExtension(source, output) {
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
  const entries = [];
  function walk(dir, prefix = '') {
    for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (item.name === 'tests' || item.name.startsWith('.')) continue;
      const relative = prefix + item.name;
      if (item.isDirectory()) walk(path.join(dir, item.name), relative + '/');
      else if (item.isFile()) entries.push({ name: Buffer.from('sif-batch-reverse-downloader/' + relative), bytes: fs.readFileSync(path.join(dir, item.name)) });
    }
  }
  walk(source);
  const local = [], central = [];
  let offset = 0;
  for (const { name, bytes } of entries) {
    const compressed = zlib.deflateRawSync(bytes), crc = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(8, 10); directory.writeUInt16LE(33, 14);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(bytes.length, 24);
    directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
    local.push(header, name, compressed); central.push(directory, name);
    offset += header.length + name.length + compressed.length;
  }
  const centralBytes = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  const archive = Buffer.concat([...local, centralBytes, end]);
  const filename = `SIF在线版扩展-v${manifest.version}.zip`;
  fs.writeFileSync(path.join(output, filename), archive);
  fs.writeFileSync(path.join(output, 'sif-extension-download.js'), `window.__SIF_EXTENSION_PACKAGE__ = ${JSON.stringify({ filename, version: manifest.version, base64: archive.toString('base64') })};\n`);
};
