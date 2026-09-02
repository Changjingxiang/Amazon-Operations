#!/usr/bin/env node

/*
 * Build and package the standalone keyword-rank web edition.
 *
 * The React/Vite bundle is always rebuilt from apps/keyword-rank. The bridge,
 * settings enhancement, seed data, extension, and documentation are copied
 * from web/ and never read from an existing outputs directory.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const appDir = path.join(root, 'apps', 'keyword-rank');
const webDir = path.join(root, 'web');
const outputsDir = path.join(root, 'outputs');

function fail(message) {
  console.error(`[release:web] ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function requiredFile(filePath, label = filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) fail(`缺少 ${label}: ${filePath}`);
  return filePath;
}

function requiredDirectory(dirPath, label = dirPath) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) fail(`缺少 ${label}: ${dirPath}`);
  return dirPath;
}

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyDirectory(source, destination) {
  requiredDirectory(source);
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function walkFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(entryPath));
    else if (entry.isFile()) result.push(entryPath);
  }
  return result;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toUpperCase();
}

function parseArgs(argv) {
  const args = { force: false, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--force') args.force = true;
    else if (value === '--output' || value === '--out-dir') {
      args.output = argv[index + 1];
      index += 1;
      if (!args.output) fail(`${value} 需要目录参数`);
    } else if (value === '--help' || value === '-h') {
      console.log('用法: npm run release:web [-- --force] [--output <目录>]');
      console.log('默认输出 outputs/关键词排名每日跟进网页版-v<major.minor>。');
      console.log('已有版本目录不会被覆盖；更新同一版本时显式传 --force。');
      process.exit(0);
    } else {
      fail(`未知参数: ${value}`);
    }
  }
  return args;
}

function runBuild() {
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run build'] : ['run', 'build'];
  const result = spawnSync(command, args, { cwd: appDir, stdio: 'inherit', shell: false });
  if (result.error) fail(`无法执行 npm run build: ${result.error.message}`);
  if (result.status !== 0) fail(`React/Vite build 失败（退出码 ${result.status}）。`);
}

function releaseVersion(version) {
  const match = String(version).match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) fail(`package.json version 不是有效的 semver: ${version}`);
  const patch = match[3] || '0';
  return patch === '0' ? `${match[1]}.${match[2]}` : `${match[1]}.${match[2]}.${patch}`;
}

function assertSafeOutput(target) {
  const outputsRoot = path.resolve(outputsDir);
  const resolved = path.resolve(target);
  const relative = path.relative(outputsRoot, resolved);
  if (relative === '' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`输出目录必须位于 outputs 下：${target}`);
  }
}

function copyViteDist(distDir, targetDir) {
  const files = walkFiles(distDir);
  const bundleFiles = files.filter((filePath) => /^index-[^/]+\.(?:js|css)$/.test(path.basename(filePath)));
  const jsBundles = bundleFiles.filter((filePath) => filePath.endsWith('.js'));
  if (jsBundles.length !== 1) fail(`Vite dist 中应有且仅有一个入口 JS bundle，实际 ${jsBundles.length} 个。`);
  const entryBundle = path.basename(jsBundles[0]);
  const cssBundles = bundleFiles.filter((filePath) => filePath.endsWith('.css')).map(path.basename);

  for (const filePath of files) {
    const relative = path.relative(distDir, filePath);
    if (relative === 'index.html') continue;
    const basename = path.basename(filePath);
    // These are developer-only fallbacks. The packaged web edition is seeded
    // from web/data/initial-data.js and must not ship machine-specific cache
    // paths from public/tracker-data-cache.json.
    if (basename === 'mock-data.json' || basename === 'tracker-data-cache.json') continue;
    if (basename === 'favicon.png') {
      copyFile(filePath, path.join(targetDir, 'favicon.png'));
    } else if (/^index-[^/]+\.(?:js|css)$/.test(basename) || /\.(?:png|jpe?g|gif|svg|webp|ico|woff2?|ttf)$/.test(basename)) {
      copyFile(filePath, path.join(targetDir, 'assets', relative));
    } else {
      // Keep public fallback data at the same relative URL expected by src/lib/api.js.
      copyFile(filePath, path.join(targetDir, relative));
    }
  }
  return { entryBundle, cssBundles };
}

function writeIndex(targetDir, entryBundle, cssBundles, version) {
  const cssLinks = cssBundles
    .map((fileName) => `    <link rel="stylesheet" href="./assets/${fileName}" />`)
    .join('\n');
  const cssBlock = cssLinks ? `${cssLinks}\n` : '';
  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <meta name="application-name" content="关键词排名每日跟进" />
    <link rel="icon" type="image/png" href="./favicon.png" />
${cssBlock}    <title>关键词排名每日跟进｜网页版 v${version}</title>
  </head>
  <body>
    <div id="root"></div>
    <script src="./vendor/xlsx.full.min.js"></script>
    <script src="./data/initial-data.js"></script>
    <script src="./browser-bridge.js"></script>
    <script src="./assets/${entryBundle}"></script>
    <script src="./web-settings-enhancements.js"></script>
  </body>
</html>
`;
  fs.writeFileSync(path.join(targetDir, 'index.html'), html, 'utf8');
}

function writeLauncher(targetDir) {
  fs.writeFileSync(path.join(targetDir, '打开网页版.cmd'), '@echo off\r\nstart "" "%~dp0index.html"\r\n', 'utf8');
}

function packageRelease(targetDir, packageJson, version) {
  const distDir = requiredDirectory(path.join(appDir, 'dist'), 'Vite dist');
  const { entryBundle, cssBundles } = copyViteDist(distDir, targetDir);

  requiredFile(path.join(webDir, 'browser-bridge', 'browser-bridge.js'), 'browser bridge 源文件');
  requiredFile(path.join(webDir, 'web-settings', 'web-settings-enhancements.js'), 'web-settings 源文件');
  requiredFile(path.join(webDir, 'data', 'initial-data.js'), '初始数据源文件');
  requiredFile(path.join(webDir, 'data', '关键词排名每日跟进表.xlsx'), '随包 Excel 数据源');
  requiredDirectory(path.join(webDir, 'extensions', 'sif-batch-reverse-downloader'), 'SIF 扩展源目录');
  requiredDirectory(path.join(webDir, 'docs'), '网页版说明文档源目录');
  const xlsxVendor = path.join(appDir, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js');
  requiredFile(xlsxVendor, 'xlsx 浏览器 vendor（请先 npm install）');

  copyFile(path.join(webDir, 'browser-bridge', 'browser-bridge.js'), path.join(targetDir, 'browser-bridge.js'));
  copyFile(path.join(webDir, 'web-settings', 'web-settings-enhancements.js'), path.join(targetDir, 'web-settings-enhancements.js'));
  copyFile(path.join(webDir, 'data', 'initial-data.js'), path.join(targetDir, 'data', 'initial-data.js'));
  copyFile(path.join(webDir, 'data', '关键词排名每日跟进表.xlsx'), path.join(targetDir, 'data', '关键词排名每日跟进表.xlsx'));
  copyFile(xlsxVendor, path.join(targetDir, 'vendor', 'xlsx.full.min.js'));
  copyDirectory(path.join(webDir, 'extensions', 'sif-batch-reverse-downloader'), path.join(targetDir, 'sif-batch-reverse-downloader'));
  for (const filePath of walkFiles(path.join(webDir, 'docs'))) {
    copyFile(filePath, path.join(targetDir, path.relative(path.join(webDir, 'docs'), filePath)));
  }
  writeIndex(targetDir, entryBundle, cssBundles, version);
  writeLauncher(targetDir);

  const manifestFiles = walkFiles(targetDir)
    .filter((filePath) => path.basename(filePath) !== 'BUILD-MANIFEST.json')
    .map((filePath) => ({
      path: path.relative(targetDir, filePath).replaceAll(path.sep, '/'),
      bytes: fs.statSync(filePath).size,
      sha256: sha256(filePath),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    package: packageJson.name,
    version: packageJson.version,
    webVersion: version,
    generatedAt: new Date().toISOString(),
    source: 'apps/keyword-rank + web',
    entryBundle,
    cssBundles,
    files: manifestFiles,
  };
  fs.writeFileSync(path.join(targetDir, 'BUILD-MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const packageJson = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
  const version = releaseVersion(packageJson.version);
  const defaultTarget = path.join(outputsDir, `关键词排名每日跟进网页版-v${version}`);
  const targetDir = path.resolve(root, args.output || defaultTarget);
  if (!args.output) assertSafeOutput(targetDir);
  if (fs.existsSync(targetDir)) {
    if (!args.force) fail(`目标目录已存在，为保护现有发布包未覆盖：${targetDir}\n需要更新同一版本时显式使用 --force，或传 --output 到新的目录。`);
    if (!args.output) assertSafeOutput(targetDir);
  }

  console.log(`[release:web] rebuilding ${packageJson.name}@${packageJson.version}`);
  runBuild();
  // Do not remove/replace an existing package until the new build succeeds.
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  packageRelease(targetDir, packageJson, version);
  console.log(`[release:web] 已生成: ${targetDir}`);
}

try {
  main();
} catch (error) {
  if (!process.exitCode) process.exitCode = 1;
  console.error(`[release:web] ${error.message}`);
}
