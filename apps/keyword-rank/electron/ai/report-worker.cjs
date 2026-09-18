const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs');
const XLSX=require('xlsx');
try {
  const bytes=fs.readFileSync(workerData.file);
  if(bytes.length>20*1024*1024)throw new Error('文件超过 20 MB，请拆分报表');
  const book=XLSX.read(bytes,{type:'buffer',raw:true,dense:true,cellFormula:false,cellHTML:false,cellStyles:false,sheetRows:50002});
  const names=book.SheetNames.filter(n=>book.Sheets[n]?.['!ref']);
  if(names.length!==1)throw new Error('请将需要的报表单独保存为只有一个数据工作表的 XLSX 或 CSV');
  const sheet=book.Sheets[names[0]],range=XLSX.utils.decode_range(sheet['!ref']);
  if(range.e.c>99||range.e.r>50000)throw new Error('最多支持 100 列、50,000 条记录，请拆分文件');
  const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true});
  const headers=(matrix.shift()||[]).map(h=>String(h).trim());
  if(!headers.length||headers.some(h=>!h)||new Set(headers).size!==headers.length)throw new Error('首行必须是完整且不重复的列名，请移除标题行或空列');
  const table=matrix.map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]??''])));
  parentPort.postMessage({ok:true,headers,table});
}catch(error){parentPort.postMessage({ok:false,error:error.message});}
