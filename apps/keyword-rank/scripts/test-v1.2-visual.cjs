const path = require('path');
const { _electron: electron } = require('playwright-core');

const projectRoot = path.resolve(__dirname, '..');
const toolRoot = path.join(projectRoot, 'qa', 'bridge-test-tool5');
const executablePath = path.join(projectRoot, 'release', 'win-unpacked', '关键词排名每日跟进.exe');
const screenshotPath = path.join(projectRoot, 'qa', 'implementation-v1.2.0.png');

(async () => {
  const electronApp = await electron.launch({
    executablePath,
    env: { ...process.env, KEYWORD_TOOL_ROOT: toolRoot },
  });
  const consoleErrors = [];
  try {
    const page = await electronApp.firstWindow();
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.waitForSelector('.app-shell', { timeout: 60000 });
    await page.waitForSelector('.busy-overlay', { state: 'detached', timeout: 60000 });

    const titlebar = await page.locator('.window-titlebar').evaluate((element) => {
      const style = getComputedStyle(element);
      const image = element.querySelector('img');
      return {
        height: Math.round(element.getBoundingClientRect().height),
        background: style.backgroundColor,
        title: element.textContent.trim(),
        iconWidth: Math.round(image.getBoundingClientRect().width),
        iconNaturalWidth: image.naturalWidth,
      };
    });
    const productIcons = await page.locator('.model-icon img').evaluateAll((images) => images.map((image) => image.getAttribute('src')));
    const summaryLogo = await page.locator('.summary-logo').getAttribute('src');

    const minimizeButton = page.getByRole('button', { name: '最小化', exact: true });
    const maximizeButton = page.getByRole('button', { name: '最大化或还原', exact: true });
    const closeButton = page.getByRole('button', { name: '关闭', exact: true });
    const windowControlsVisible = await Promise.all([
      minimizeButton.isVisible(), maximizeButton.isVisible(), closeButton.isVisible(),
    ]);
    await maximizeButton.click();
    await page.waitForTimeout(300);
    const maximized = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized());
    await maximizeButton.click();
    await page.waitForTimeout(300);
    const restored = await electronApp.evaluate(({ BrowserWindow }) => !BrowserWindow.getAllWindows()[0].isMaximized());

    await page.getByRole('button', { name: 'SP矩阵', exact: true }).click();
    const spActive = await page.getByRole('button', { name: 'SP矩阵', exact: true }).evaluate((button) => button.classList.contains('active'));
    await page.getByRole('button', { name: '自然矩阵', exact: true }).click();

    await page.screenshot({ path: screenshotPath, fullPage: true });
    const windowState = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return { title: win.getTitle(), minimizable: win.isMinimizable(), maximizable: win.isMaximizable(), closable: win.isClosable() };
    });

    const result = {
      titlebar,
      productIconCount: productIcons.length,
      productIconsRemainGarments: productIcons.every((src) => src && !src.includes('app-shell-icon')),
      summaryLogoRemainsTracker: Boolean(summaryLogo && summaryLogo.includes('01_app-logo')),
      spTabInteraction: spActive,
      windowControlsVisible,
      maximizeRestoreInteraction: maximized && restored,
      windowState,
      consoleErrors,
      screenshotPath,
    };
    console.log(JSON.stringify(result, null, 2));
    if (
      titlebar.height !== 42 ||
      titlebar.background !== 'rgb(23, 59, 100)' ||
      !result.productIconsRemainGarments ||
      !result.summaryLogoRemainsTracker ||
      !spActive ||
      windowControlsVisible.some((visible) => !visible) ||
      !result.maximizeRestoreInteraction ||
      consoleErrors.length
    ) process.exitCode = 1;
  } finally {
    await electronApp.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
