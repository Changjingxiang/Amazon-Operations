const state=document.getElementById('state'),connect=document.getElementById('connect'),disconnect=document.getElementById('disconnect');
async function request(action){const response=await chrome.runtime.sendMessage({action});if(!response.ok)throw new Error(response.error);return response.data;}
async function refresh(){try{const s=await request('status');state.textContent=s.connected?'已连接。回到网页点击“AI 分析”。':s.connecting?'正在连接，请查看本机确认窗口。':'尚未连接。';connect.disabled=s.connected||s.connecting;disconnect.disabled=!s.connected&&!s.connecting;}catch(e){state.textContent=e.message;}}
connect.onclick=async()=>{connect.disabled=true;try{await request('connect');await refresh();}catch(e){state.textContent=e.message;connect.disabled=false;}};
disconnect.onclick=async()=>{await request('disconnect');await refresh();};
refresh();
