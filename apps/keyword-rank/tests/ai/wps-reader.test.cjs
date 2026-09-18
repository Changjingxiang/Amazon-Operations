const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../electron/ai/wps-reader.cjs'),'utf8');
function reader(run){const module={exports:{}};vm.runInNewContext(source,{module,Buffer,process:{platform:'win32',env:{SystemRoot:'C:\\Windows'}},require:name=>name==='node:child_process'?{execFileSync:run}:require(name)});return module.exports.readWithWps;}
test('WPS reader passes paths as data, disables macros and links, reads without saving',()=>{
  const file='report $(malicious) "quoted".xlsx';
  const read=reader((exe,args,options)=>{
    const program=Buffer.from(args.at(-1),'base64').toString('utf16le');
    assert(!program.includes(file));assert.equal(options.env.KEYWORD_AI_REPORT_PATH,path.resolve(file));
    assert(program.includes('AutomationSecurity=3'));assert(program.includes('Open($env:KEYWORD_AI_REPORT_PATH,0,$true)'));
    assert(program.includes('$book.Close($false)'));assert(!/\.Save|\.Refresh|\.Calculate/.test(program));
    assert.equal(options.timeout,45000);assert(options.windowsHide);
    return JSON.stringify({ok:true,matrix:[['关键词'],['coat']]});
  });assert.equal(read(file)[1][0],'coat');
});
test('WPS timeout/errors return actionable text without process output or private paths',()=>{
  const read=reader(()=>{throw new Error('private path and raw file content');});
  assert.throws(()=>read('report.xlsx'),e=>e.message.includes('另存为 CSV')&&!e.message.includes('private'));
});
