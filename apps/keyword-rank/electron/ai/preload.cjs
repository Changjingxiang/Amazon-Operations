const {contextBridge,ipcRenderer}=require('electron');
const call=async(channel,payload)=>{const result=await ipcRenderer.invoke('ai:'+channel,payload);if(!result.ok)throw new Error(result.error);return result.data;};
contextBridge.exposeInMainWorld('keywordAI',Object.freeze({
  status:()=>call('status'),settings:()=>call('settings'),test:()=>call('test'),
  pickReport:()=>call('pick-report'),previewReport:payload=>call('preview-report',payload),commitReport:id=>call('commit-report',id),
  reports:()=>call('reports'),prepare:payload=>call('prepare',payload),start:id=>call('start',id),cancel:()=>call('cancel'),
  history:()=>call('history'),preferences:()=>call('preferences'),backup:()=>call('backup'),restore:()=>call('restore'),
}));
