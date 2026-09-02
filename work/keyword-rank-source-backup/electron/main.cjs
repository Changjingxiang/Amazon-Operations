const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { readData, mutateWatch, replaceWatches, setAnnotation, addModel, importReports, STORE_NAME } = require('./native-store.cjs');

const WORKBOOK_NAME = '关键词排名每日跟进表.xlsx';
const IMPORT_SCRIPT = 'import_keyword_rank.ps1';
const ICON_CONFIG_NAME = '产品图标配置.json';
const APPAREL_ICON_KEYS = new Set([
  'tank-top', 'jacket', 'sweater', 'tshirt', 'sleeveless-tshirt', 'hooded-jacket', 'shirt', 'polo',
  'sweatshirt', 'hoodie', 'puffer-coat', 'bomber-jacket', 'vest', 'trench-coat', 'long-sleeve-tshirt', 'generic-apparel',
]);

function candidateToolRoots() {
  return [
    process.env.KEYWORD_TOOL_ROOT,
    process.env.PORTABLE_EXECUTABLE_DIR,
    path.dirname(process.execPath),
    path.resolve(__dirname, '..', '..'),
    'C:\\Users\\Admin\\Desktop\\关键词排名每日跟进工具',
  ].filter(Boolean);
}

function findToolRoot() {
  for (const candidate of candidateToolRoots()) {
    const resolved = path.resolve(candidate);
    const hasLocalStore = fs.existsSync(path.join(resolved, STORE_NAME));
    const hasLegacyWorkbook = fs.existsSync(path.join(resolved, WORKBOOK_NAME)) && fs.existsSync(path.join(resolved, IMPORT_SCRIPT));
    if (hasLocalStore || hasLegacyWorkbook) {
      return resolved;
    }
  }
  throw new Error('找不到关键词工具目录。请把软件放在“关键词排名每日跟进工具”文件夹内。');
}

function bridgePath(fileName = 'keyword_app_bridge.ps1') {
  if (!app.isPackaged) return path.join(__dirname, '..', 'bridge', fileName);

  // The portable build runs from a temporary extraction directory. Windows or
  // security software can clean that directory while the app is still open,
  // leaving the UI alive but breaking every action that needs a bridge script.
  // Keep a durable copy outside the portable extraction directory.
  const cacheRoot = path.join(
    process.env.LOCALAPPDATA || app.getPath('userData'),
    'KeywordRankTracker',
    'bridge',
  );
  const cachedPath = path.join(cacheRoot, fileName);
  const bundledPath = path.join(process.resourcesPath, 'bridge', fileName);
  fs.mkdirSync(cacheRoot, { recursive: true });
  if (fs.existsSync(bundledPath)) {
    fs.copyFileSync(bundledPath, cachedPath);
  }
  if (!fs.existsSync(cachedPath)) {
    throw new Error(`找不到软件桥接脚本：${fileName}。请重新打开软件。`);
  }
  return cachedPath;
}

function loadTrackerData() {
  const toolRoot = findToolRoot();
  return readData(toolRoot, bridgePath('export_tracker_data.ps1'), path.join(app.getPath('userData'), 'tracker-data-migration.json'));
}

function saveModelIcon(parentAsin, iconKey) {
  const toolRoot = findToolRoot();
  const asin = String(parentAsin || '').trim().toUpperCase();
  const key = String(iconKey || '').trim();
  if (!/^B0[A-Z0-9]{8}$/.test(asin)) throw new Error('父体 ASIN 格式不正确。');
  if (!APPAREL_ICON_KEYS.has(key)) throw new Error('不支持的产品图标。');
  const configPath = path.join(toolRoot, ICON_CONFIG_NAME);
  let config = { version: 1, products: {} };
  try {
    const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (current && typeof current === 'object') config = { ...config, ...current, products: { ...(current.products || {}) } };
  } catch {}
  config.version = 1;
  config.products[asin] = key;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return { ok: true, output: '产品图标已保存。' };
}

function runPowerShell(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args],
      {
        cwd,
        windowsHide: true,
        env: { ...process.env },
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      const plainStdout = stdout.replace(/#< CLIXML[\s\S]*/g, '').trim();
      const plainStderr = stderr.replace(/#< CLIXML[\s\S]*/g, '').trim();
      if (code === 0) {
        resolve({ ok: true, output: plainStdout || plainStderr });
      } else {
        reject(new Error((`${plainStdout}\n${plainStderr}`).trim() || `PowerShell 执行失败，退出码 ${code}`));
      }
    });
  });
}

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runPowerShellScript(scriptPath, parameters, cwd) {
  const invocation = [`& ${quotePowerShell(scriptPath)}`];
  for (const [name, value] of Object.entries(parameters || {})) {
    if (value === false || value === null || value === undefined) continue;
    invocation.push(`-${name}`);
    if (value !== true) invocation.push(quotePowerShell(value));
  }
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    "$InformationPreference = 'SilentlyContinue'",
    "$VerbosePreference = 'SilentlyContinue'",
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    '$OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    'try {',
    `  ${invocation.join(' ')} 4>$null 6>$null`,
    '} catch {',
    '  [Console]::Error.WriteLine($_.Exception.Message)',
    '  exit 1',
    '}',
  ].join('\r\n');
  const encoded = Buffer.from(command, 'utf16le').toString('base64');
  return runPowerShell(['-EncodedCommand', encoded], cwd);
}

function createWindow() {
  const appIcon = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '..', 'build', 'icon.ico');
  const win = new BrowserWindow({
    width: 1536,
    height: 1024,
    minWidth: 1120,
    minHeight: 720,
    title: '关键词排名每日跟进',
    icon: appIcon,
    backgroundColor: '#FFF7E6',
    show: false,
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const showWindow = () => {
    if (!win.isDestroyed() && !win.isVisible()) win.show();
  };
  win.once('ready-to-show', showWindow);
  win.webContents.once('did-finish-load', showWindow);
  setTimeout(showWindow, 5000);
  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    win.loadURL('http://127.0.0.1:5173');
    if (process.env.KEYWORD_TRACKER_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  ipcMain.handle('tracker:get-data', async () => loadTrackerData());
  ipcMain.handle('tracker:run-import', async (_event, { mode }) => {
    const toolRoot = findToolRoot();
    return importReports(toolRoot, bridgePath('export_tracker_data.ps1'), path.join(app.getPath('userData'), 'tracker-data-migration.json'), mode || 'normal');
  });
  ipcMain.handle('tracker:set-watch', async (_event, payload) => {
    const toolRoot = findToolRoot();
    return mutateWatch(toolRoot, bridgePath('export_tracker_data.ps1'), path.join(app.getPath('userData'), 'tracker-data-migration.json'), payload || {});
  });
  ipcMain.handle('tracker:replace-watches', async (_event, payload) => {
    const toolRoot = findToolRoot();
    return replaceWatches(toolRoot, bridgePath('export_tracker_data.ps1'), path.join(app.getPath('userData'), 'tracker-data-migration.json'), payload || {});
  });
  ipcMain.handle('tracker:set-annotation', async (_event, payload) => {
    const toolRoot = findToolRoot();
    return setAnnotation(toolRoot, bridgePath('export_tracker_data.ps1'), path.join(app.getPath('userData'), 'tracker-data-migration.json'), payload || {});
  });
  ipcMain.handle('tracker:add-model', async (_event, payload) => {
    const toolRoot = findToolRoot();
    return addModel(toolRoot, bridgePath('export_tracker_data.ps1'), path.join(app.getPath('userData'), 'tracker-data-migration.json'), payload || {});
  });
  ipcMain.handle('tracker:set-model-icon', async (_event, payload) => {
    const result = saveModelIcon(payload.parentAsin, payload.iconKey);
    return { ...result, data: loadTrackerData() };
  });
  ipcMain.handle('tracker:open-workbook', async () => shell.openPath(path.join(findToolRoot(), WORKBOOK_NAME)));
  ipcMain.handle('tracker:open-source-folder', async () => shell.openPath(path.join(findToolRoot(), '每日源文件')));
  ipcMain.handle('tracker:open-tool-folder', async () => shell.openPath(findToolRoot()));
  ipcMain.handle('tracker:window-minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle('tracker:window-toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle('tracker:window-close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
