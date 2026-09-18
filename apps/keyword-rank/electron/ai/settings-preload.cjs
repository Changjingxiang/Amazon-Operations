const {contextBridge,ipcRenderer}=require('electron');
const call=async(channel,payload)=>{const result=await ipcRenderer.invoke('ai:'+channel,payload);if(!result.ok)throw new Error(result.error);return result.data;};
contextBridge.exposeInMainWorld('aiSettings',{status:()=>call('config-status'),save:payload=>call('config-save',payload),clear:()=>call('config-clear')});
