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
