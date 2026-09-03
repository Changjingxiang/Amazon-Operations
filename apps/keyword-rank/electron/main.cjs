const { app, BrowserWindow, dialog, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { readData, mutateWatch, replaceWatches, setAnnotation, addModel, deleteModel, setModelCountry, importReports, importAbaMonthlyCsv, STORE_NAME } = require('./native-store.cjs');
const { normalizeCountryCode, countryLabel } = require('./countries.cjs');

const WORKBOOK_NAME = '关键词排名每日跟进表.xlsx';
const IMPORT_SCRIPT = 'import_keyword_rank.ps1';
const ICON_CONFIG_NAME = '产品图标配置.json';
const SIF_ORIGIN = 'https://www.sif.com';
const SIF_DOWNLOAD_TIMEOUT_MS = 180000;
const APPAREL_ICON_KEYS = new Set([
  'tank-top', 'jacket', 'sweater', 'tshirt', 'sleeveless-tshirt', 'hooded-jacket', 'shirt', 'polo',
  'sweatshirt', 'hoodie', 'puffer-coat', 'bomber-jacket', 'vest', 'trench-coat', 'long-sleeve-tshirt', 'generic-apparel',
]);

let mainWindow = null;
let sifWindow = null;
let activeSifImport = null;

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
  const custom = iconKey && typeof iconKey === 'object' && String(iconKey.key || '').trim() === 'custom' ? {
    key: 'custom',
    label: String(iconKey.label || '自定义图片').trim().slice(0, 80) || '自定义图片',
    dataUrl: String(iconKey.dataUrl || '').trim(),
  } : null;
  const key = custom ? 'custom' : String(iconKey || '').trim();
  if (!/^B0[A-Z0-9]{8}$/.test(asin)) throw new Error('父体 ASIN 格式不正确。');
  if (!APPAREL_ICON_KEYS.has(key) && !(custom && /^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(custom.dataUrl) && custom.dataUrl.length <= 5 * 1024 * 1024)) {
    throw new Error('不支持的产品图标或图片格式。');
  }
  const configPath = path.join(toolRoot, ICON_CONFIG_NAME);
  let config = { version: 1, products: {} };
  try {
    const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (current && typeof current === 'object') config = { ...config, ...current, products: { ...(current.products || {}) } };
  } catch {}
  config.version = 1;
  config.products[asin] = custom || key;
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

function sendSifProgress(stage, message, extra = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('tracker:sif-progress', { stage, message, ...extra });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeFilePart(value) {
  return String(value || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'Sif';
}

function todayStamp() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function uniquePath(directory, filename) {
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  let candidate = path.join(directory, filename);
  let index = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${stem}_${index++}${extension}`);
  }
  return candidate;
}

function createSifWindow() {
  if (sifWindow && !sifWindow.isDestroyed()) {
    sifWindow.show();
    sifWindow.focus();
    return sifWindow;
  }
  const sifSession = session.fromPartition('persist:keyword-rank-sif');
  sifWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 980,
    minHeight: 650,
    title: 'Sif 反查流量词 · 关键词排名每日跟进',
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    backgroundColor: '#ffffff',
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      session: sifSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  sifWindow.setMenuBarVisibility(false);
  sifWindow.on('closed', () => { sifWindow = null; });
  return sifWindow;
}

function sifAutomationScript(targetAsin) {
  return `(async function runSifAutomation(targetAsin) {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const initialBody = document.body?.innerText || '';
    if (!/\\/reverse/.test(location.pathname) && /登录|注册免费领会员|验证码/.test(initialBody)) {
      throw new Error('AUTH_REQUIRED');
    }
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const loading = () => [...document.querySelectorAll('.reverse_table_warp .el-loading-mask, .keyword_list_table_wrap .el-loading-mask')].some(visible);
    const waitFor = async (probe, timeout = 90000) => {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        const result = probe();
        if (result) return result;
        await sleep(300);
      }
      throw new Error('SIF_SELECTOR_CHANGED');
    };
    const searchButton = await waitFor(() => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === '反查流量词'), 45000).catch(() => null);
    const input = await waitFor(() => document.querySelector('.search .search-input input:not([readonly])') || [...document.querySelectorAll('.search input:not([readonly])')].at(-1), 45000).catch(() => null);
    if (!searchButton || !input) {
      if (/登录|验证码|注册免费领会员/.test(document.body?.innerText || '')) throw new Error('AUTH_REQUIRED');
      throw new Error('SIF_SELECTOR_CHANGED');
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, targetAsin);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    searchButton.click();
    await waitFor(() => {
      const currentAsin = new URL(location.href).searchParams.get('asin')?.toUpperCase();
      return currentAsin === targetAsin || document.querySelector('.single_variant_wrap.pasin_item');
    }, 90000);
    const parentCard = await waitFor(() => [...document.querySelectorAll('.single_variant_wrap.pasin_item, .single_variant_wrap')].find((card) => {
      const header = card.querySelector('.single_variant_header.all, .single_variant_header');
      return header && (header.textContent.trim() === '父体' || /父体/.test(header.textContent));
    }), 120000);
    if (!parentCard.classList.contains('isActive')) {
      parentCard.click();
      await waitFor(() => parentCard.classList.contains('isActive'), 30000);
    }
    const downloadButton = await waitFor(() => {
      const button = document.querySelector('#title_top_color_pad .downloadPolorBtn') || document.querySelector('.keyword_list_table_wrap .downloadPolorBtn');
      return visible(button) && !loading() ? button : null;
    }, 120000);
    downloadButton.scrollIntoView({ block: 'center', inline: 'nearest' });
    await sleep(220);
    downloadButton.click();
    return { url: location.href, clickedAt: Date.now() };
  })(${JSON.stringify(String(targetAsin).toUpperCase())})`;
}

async function runSifImport(payload = {}) {
  const asin = String(payload.parentAsin || '').trim().toUpperCase();
  if (!/^B0[A-Z0-9]{8}$/.test(asin)) throw new Error('父体 ASIN 格式不正确。');
  const countryCode = normalizeCountryCode(payload.countryCode || payload.site || 'CA');
  const countryName = countryLabel(countryCode);
  const toolRoot = findToolRoot();
  const sourceFolder = path.join(toolRoot, '每日源文件');
  fs.mkdirSync(sourceFolder, { recursive: true });

  sendSifProgress('opening', `正在打开 SIF ${countryName}（${countryCode}）…`, { countryCode, parentAsin: asin });
  const win = createSifWindow();
  const sifSession = win.webContents.session;
  let shouldClose = false;
  let windowClosed = false;
  let downloadSettled = false;
  let downloadResolve;
  let downloadReject;
  const downloadPromise = new Promise((resolve, reject) => { downloadResolve = resolve; downloadReject = reject; });
  const onClosed = () => {
    windowClosed = true;
    if (!downloadSettled) downloadReject(new Error('SIF_WINDOW_CLOSED'));
  };
  const onWillDownload = (_event, item, contents) => {
    if (downloadSettled || windowClosed) return;
    let urlChain = '';
    try { urlChain = typeof item.getURLChain === 'function' ? item.getURLChain().join(' ') : ''; } catch {}
    const sourceUrl = `${item.getURL() || ''} ${urlChain}`;
    if (contents && contents !== win.webContents && !sourceUrl.includes('sif.com')) return;
    const originalName = item.getFilename() || `Sif反查流量词_${countryCode}_${asin}_${todayStamp()}.xlsx`;
    const extension = path.extname(originalName) || '.xlsx';
    if (!['.xlsx', '.xls', '.csv', '.zip'].includes(extension.toLowerCase())) return;
    const filename = safeFilePart(`Sif反查流量词_${countryCode}_${asin}_${todayStamp()}${extension}`);
    const targetPath = uniquePath(sourceFolder, filename);
    item.setSavePath(targetPath);
    sendSifProgress('downloading', `已开始下载 ${path.basename(targetPath)}…`, { countryCode, parentAsin: asin, filePath: targetPath });
    item.once('done', (_event, state) => {
      downloadSettled = true;
      if (state === 'completed') downloadResolve({ filePath: targetPath, filename: path.basename(targetPath) });
      else downloadReject(new Error(`SIF_DOWNLOAD_FAILED:${state || 'unknown'}`));
    });
  };
  win.once('closed', onClosed);
  sifSession.on('will-download', onWillDownload);

  try {
    await win.loadURL(`${SIF_ORIGIN}/reverse?country=${encodeURIComponent(countryCode)}`);
    if (windowClosed) throw new Error('SIF_WINDOW_CLOSED');
    sendSifProgress('working', `正在填写 ${asin} 并反查流量词…`, { countryCode, parentAsin: asin });
    await win.webContents.executeJavaScript(sifAutomationScript(asin), true);
    sendSifProgress('downloading', '反查完成，正在直接下载报表…', { countryCode, parentAsin: asin });
    const downloaded = await Promise.race([
      downloadPromise,
      delay(SIF_DOWNLOAD_TIMEOUT_MS).then(() => { throw new Error('SIF_DOWNLOAD_TIMEOUT'); }),
    ]);
    if (!['.xlsx', '.xls'].includes(path.extname(downloaded.filename).toLowerCase())) {
      throw new Error(`SIF_FORMAT_UNSUPPORTED:${downloaded.filename}`);
    }
    sendSifProgress('importing', `下载完成，正在导入 ${downloaded.filename}…`, { countryCode, parentAsin: asin, filePath: downloaded.filePath });
    const imported = importReports(toolRoot, bridgePath('export_tracker_data.ps1'), path.join(app.getPath('userData'), 'tracker-data-migration.json'), 'strict');
    if (!imported.ok) {
      throw new Error(`SIF 文件已下载，但导入失败：${imported.output}`);
    }
    shouldClose = true;
    sendSifProgress('completed', `今日报表已下载并导入（${countryName}）。`, { countryCode, parentAsin: asin, filePath: downloaded.filePath });
    return { ...imported, filePath: downloaded.filePath, countryCode, parentAsin: asin, output: `SIF ${countryName} 报表已下载并导入。\n${imported.output}` };
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes('AUTH_REQUIRED')) throw new Error(`SIF 尚未登录。请在弹出的 SIF 窗口完成登录后，再点击一次“自动导入今日报表”。`);
    if (message.includes('SIF_SELECTOR_CHANGED')) throw new Error('未找到 SIF 的反查控件或下载按钮，页面可能已改版。');
    if (message.includes('SIF_DOWNLOAD_TIMEOUT')) throw new Error('反查完成后超过 3 分钟仍未检测到下载，请检查 SIF 会员权限或浏览器下载提示。');
    if (message.includes('SIF_DOWNLOAD_FAILED')) throw new Error(`SIF 报表下载失败：${message.split(':').slice(1).join(':') || '未知原因'}`);
    if (message.includes('SIF_FORMAT_UNSUPPORTED')) throw new Error(`SIF 已下载 ${message.split(':').slice(1).join(':') || '文件'}，但当前导入器只支持 XLSX/XLS。文件已保留在“每日源文件”。`);
    if (message.includes('SIF_WINDOW_CLOSED')) throw new Error('SIF 窗口已关闭，自动导入已取消。');
    throw error;
  } finally {
    sifSession.removeListener('will-download', onWillDownload);
    win.removeListener('closed', onClosed);
    if (shouldClose && !win.isDestroyed()) win.close();
  }
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
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
    if (sifWindow && !sifWindow.isDestroyed()) sifWindow.close();
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
  return win;
}

app.whenReady().then(() => {
  ipcMain.handle('tracker:get-data', async () => loadTrackerData());
  ipcMain.handle('tracker:run-import', async (_event, { mode }) => {
    const toolRoot = findToolRoot();
    return importReports(toolRoot, bridgePath('export_tracker_data.ps1'), path.join(app.getPath('userData'), 'tracker-data-migration.json'), mode || 'normal');
  });
  ipcMain.handle('tracker:import-aba-monthly', async (_event, payload = {}) => {
    const toolRoot = findToolRoot();
    let filePath = String(payload.filePath || '').trim();
    if (!filePath) {
      const selection = await dialog.showOpenDialog(mainWindow, {
        title: '选择月 ABA CSV 文件',
        properties: ['openFile'],
        filters: [{ name: 'ABA CSV', extensions: ['csv'] }, { name: '所有文件', extensions: ['*'] }],
      });
      if (selection.canceled || !selection.filePaths?.[0]) return { ok: true, output: '未选择月 ABA 文件，未修改数据。', data: loadTrackerData() };
      filePath = selection.filePaths[0];
    }
    return importAbaMonthlyCsv(toolRoot, bridgePath('export_tracker_data.ps1'), path.join(app.getPath('userData'), 'tracker-data-migration.json'), { ...payload, filePath });
  });
  ipcMain.handle('tracker:start-sif-import', async (_event, payload) => {
    if (activeSifImport) throw new Error('已有 SIF 自动导入任务正在运行，请等待当前任务完成。');
    activeSifImport = runSifImport(payload || {});
    try {
      return await activeSifImport;
    } finally {
      activeSifImport = null;
    }
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
  ipcMain.handle('tracker:delete-model', async (_event, payload) => {
    const toolRoot = findToolRoot();
    const result = deleteModel(toolRoot, bridgePath('export_tracker_data.ps1'), path.join(app.getPath('userData'), 'tracker-data-migration.json'), payload || {});
    const asin = String(payload?.parentAsin || '').trim().toUpperCase();
    if (asin) {
      const configPath = path.join(toolRoot, ICON_CONFIG_NAME);
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config?.products && typeof config.products === 'object') {
          delete config.products[asin];
          fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
        }
      } catch {}
    }
    return { ...result, data: loadTrackerData() };
  });
  ipcMain.handle('tracker:set-model-country', async (_event, payload) => {
    const toolRoot = findToolRoot();
    return setModelCountry(toolRoot, bridgePath('export_tracker_data.ps1'), path.join(app.getPath('userData'), 'tracker-data-migration.json'), payload || {});
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

  mainWindow = createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
