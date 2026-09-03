const electronApi = () => window.keywordTracker;

async function mockData() {
  const response = await fetch('./mock-data.json');
  if (!response.ok) throw new Error('无法加载本地演示数据。');
  return response.json();
}

export const api = {
  getData: () => electronApi()?.getData?.() ?? mockData(),
  runImport: (mode) => {
    if (!electronApi()?.runImport) throw new Error('浏览器预览模式不能执行导入，请在桌面软件中操作。');
    return electronApi().runImport(mode);
  },
  importAbaMonthlyCsv: (payload = {}) => {
    const bridge = electronApi();
    if (typeof bridge?.importAbaMonthlyCsv === 'function') {
      // Browser File objects are consumed by browser-bridge directly.  The
      // Electron preload receives a file path (or opens the native picker).
      if (window.__KEYWORD_TRACKER_SEED__) return bridge.importAbaMonthlyCsv(payload);
      return bridge.importAbaMonthlyCsv({
        year: payload.year,
        month: payload.month,
        countryCode: payload.countryCode,
        filePath: payload.filePath || payload.file?.path || '',
      });
    }
    throw new Error('当前环境不支持月 ABA CSV 导入，请在最新版软件或网页版中操作。');
  },
  startSifImport: (payload) => {
    if (!electronApi()?.startSifImport) throw new Error('浏览器预览模式不能自动打开 SIF，请在桌面软件中操作。');
    return electronApi().startSifImport(payload);
  },
  onSifProgress: (callback) => electronApi()?.onSifProgress?.(callback) || (() => {}),
  setWatch: (payload) => {
    if (!electronApi()?.setWatch) throw new Error('浏览器预览模式不能修改关注词，请在桌面软件中操作。');
    return electronApi().setWatch(payload);
  },
  replaceWatches: (payload) => {
    if (!electronApi()?.replaceWatches) throw new Error('浏览器预览模式不能保存关注词，请在桌面软件中操作。');
    return electronApi().replaceWatches(payload);
  },
  setAnnotation: (payload) => {
    if (!electronApi()?.setAnnotation) throw new Error('浏览器预览模式不能保存单元格标注，请在桌面软件中操作。');
    return electronApi().setAnnotation(payload);
  },
  addModel: (payload) => {
    if (!electronApi()?.addModel) throw new Error('浏览器预览模式不能新增型号，请在桌面软件中操作。');
    return electronApi().addModel(payload);
  },
  deleteModel: (payload) => {
    if (!electronApi()?.deleteModel) throw new Error('浏览器预览模式不能删除型号，请在桌面软件中操作。');
    return electronApi().deleteModel(payload);
  },
  setModelCountry: (payload) => {
    if (!electronApi()?.setModelCountry) throw new Error('浏览器预览模式不能修改产品国家，请在桌面软件中操作。');
    return electronApi().setModelCountry(payload);
  },
  setModelIcon: (payload) => {
    if (!electronApi()?.setModelIcon) throw new Error('浏览器预览模式不能保存产品图标，请在桌面软件中操作。');
    return electronApi().setModelIcon(payload);
  },
  openWorkbook: () => electronApi()?.openWorkbook?.(),
  openSourceFolder: () => electronApi()?.openSourceFolder?.(),
  openToolFolder: () => electronApi()?.openToolFolder?.(),
  minimizeWindow: () => electronApi()?.minimizeWindow?.(),
  toggleMaximizeWindow: () => electronApi()?.toggleMaximizeWindow?.(),
  closeWindow: () => electronApi()?.closeWindow?.(),
};
