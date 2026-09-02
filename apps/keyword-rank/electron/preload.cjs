const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('keywordTracker', {
  getData: () => ipcRenderer.invoke('tracker:get-data'),
  runImport: (mode = 'normal') => ipcRenderer.invoke('tracker:run-import', { mode }),
  startSifImport: (payload) => ipcRenderer.invoke('tracker:start-sif-import', payload),
  onSifProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('tracker:sif-progress', listener);
    return () => ipcRenderer.removeListener('tracker:sif-progress', listener);
  },
  setWatch: (payload) => ipcRenderer.invoke('tracker:set-watch', payload),
  replaceWatches: (payload) => ipcRenderer.invoke('tracker:replace-watches', payload),
  setAnnotation: (payload) => ipcRenderer.invoke('tracker:set-annotation', payload),
  addModel: (payload) => ipcRenderer.invoke('tracker:add-model', payload),
  deleteModel: (payload) => ipcRenderer.invoke('tracker:delete-model', payload),
  setModelCountry: (payload) => ipcRenderer.invoke('tracker:set-model-country', payload),
  setModelIcon: (payload) => ipcRenderer.invoke('tracker:set-model-icon', payload),
  openWorkbook: () => ipcRenderer.invoke('tracker:open-workbook'),
  openSourceFolder: () => ipcRenderer.invoke('tracker:open-source-folder'),
  openToolFolder: () => ipcRenderer.invoke('tracker:open-tool-folder'),
  minimizeWindow: () => ipcRenderer.invoke('tracker:window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('tracker:window-toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('tracker:window-close'),
});
