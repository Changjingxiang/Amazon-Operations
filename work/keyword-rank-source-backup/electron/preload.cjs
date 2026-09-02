const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('keywordTracker', {
  getData: () => ipcRenderer.invoke('tracker:get-data'),
  runImport: (mode = 'normal') => ipcRenderer.invoke('tracker:run-import', { mode }),
  setWatch: (payload) => ipcRenderer.invoke('tracker:set-watch', payload),
  replaceWatches: (payload) => ipcRenderer.invoke('tracker:replace-watches', payload),
  setAnnotation: (payload) => ipcRenderer.invoke('tracker:set-annotation', payload),
  addModel: (payload) => ipcRenderer.invoke('tracker:add-model', payload),
  setModelIcon: (payload) => ipcRenderer.invoke('tracker:set-model-icon', payload),
  openWorkbook: () => ipcRenderer.invoke('tracker:open-workbook'),
  openSourceFolder: () => ipcRenderer.invoke('tracker:open-source-folder'),
  openToolFolder: () => ipcRenderer.invoke('tracker:open-tool-folder'),
  minimizeWindow: () => ipcRenderer.invoke('tracker:window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('tracker:window-toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('tracker:window-close'),
});
