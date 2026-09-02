const fs = require('fs');
const path = require('path');
const { _electron: electron } = require('playwright-core');

(async () => {
  const projectRoot = path.resolve(__dirname, '..');
  const toolRoot = path.join(projectRoot, 'qa', 'bridge-test-tool5');
  const configPath = path.join(toolRoot, '产品图标配置.json');
  const app = await electron.launch({
    executablePath: require('electron'),
    args: ['.'],
    cwd: projectRoot,
    env: { ...process.env, KEYWORD_TOOL_ROOT: toolRoot },
  });
  try {
    const window = await app.firstWindow();
    await window.waitForSelector('.app-shell');
    await window.getByRole('button', { name: /更换 LT24M1287/ }).click();
    await window.getByRole('button', { name: '毛衣', exact: true }).click();
    await window.waitForSelector('.icon-picker-modal', { state: 'detached', timeout: 30000 });
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const firstIcon = await window.locator('.model-item').first().locator('.model-icon img').getAttribute('src');
    const result = {
      savedKey: config.products.B0GHNX5JPP,
      firstIconUsesSweater: /sweater/i.test(firstIcon || ''),
      visibleModels: await window.locator('.model-item').count(),
    };
    console.log(JSON.stringify(result, null, 2));
    if (result.savedKey !== 'sweater' || !result.firstIconUsesSweater || result.visibleModels < 6) process.exitCode = 1;
  } finally {
    await app.close();
  }
})();
