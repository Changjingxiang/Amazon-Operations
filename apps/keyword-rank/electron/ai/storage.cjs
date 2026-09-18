const fs=require('node:fs');
const path=require('node:path');
function read(file,fallback){if(!fs.existsSync(file))return fallback;try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw new Error('本地数据文件损坏，已停止写入；请保留文件并恢复备份。');}}
function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temporary=file+'.new';const fd=fs.openSync(temporary,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}if(fs.existsSync(file))fs.copyFileSync(file,file+'.bak');fs.renameSync(temporary,file);}
module.exports={read,write};
