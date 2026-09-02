const fs = require('fs'); const vm = require('vm');
const base='C:/Users/Admin/Documents/Codex/2026-08-28/w-2/outputs/关键词排名每日跟进网页版-v1.8.2';
const window={}; const document={baseURI:'file:///C:/placeholder/index.html',createElement(){return {style:{},addEventListener(){},click(){},remove(){}}},body:{appendChild(){}}};
const context={window,document,console,setTimeout,clearTimeout,URL,Blob,FileReader:function(){},structuredClone,Date,Math,JSON,Promise}; vm.createContext(context);
vm.runInContext(fs.readFileSync(base+'/data/initial-data.js','utf8'),context,{filename:'initial-data.js'});
vm.runInContext(fs.readFileSync(base+'/browser-bridge.js','utf8'),context,{filename:'browser-bridge.js'});
window.keywordTracker.getData().then(data=>{ console.log(JSON.stringify({models:data.models.length,years:data.models.map(m=>({name:m.modelName,latest:m.latestDate,selectedYear:m.selectedYear,dates:m.dates.length,rows:m.matrixRows.length,naturalAnnotationArrays:m.matrixRows.filter(r=>Array.isArray(r.naturalAnnotations)).length,spAnnotationArrays:m.matrixRows.filter(r=>Array.isArray(r.spAnnotations)).length,abaComparisonRows:m.abaRows.filter(r=>Array.isArray(r.abaPreviousTrend)&&r.abaPreviousTrend.length).length,comparisonPoints:m.abaRows.reduce((n,r)=>n+(r.abaPreviousTrend?.length||0),0)}))})); }).catch(e=>{console.error(e); process.exitCode=1});
