const {execFileSync}=require('node:child_process');
const path=require('node:path');

// Fixed local program. The selected path is data in the child environment, never code.
// Read cached values only: no Save/Refresh/Calculate, macros disabled, links not updated.
const script=String.raw`
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$app=$null; $book=$null
try {
  $app=New-Object -ComObject ket.Application
  $app.Visible=$false
  $app.DisplayAlerts=$false
  $app.AutomationSecurity=3
  $app.AskToUpdateLinks=$false
  $book=$app.Workbooks.Open($env:KEYWORD_AI_REPORT_PATH,0,$true)
  $sheets=@($book.Worksheets | Where-Object { $_.UsedRange.Count -gt 1 -or $_.UsedRange.Text })
  if($sheets.Count -ne 1){throw '请将需要的报表单独保存为只有一个数据工作表的 XLSX 或 CSV'}
  $range=$sheets[0].UsedRange
  $rows=$range.Rows.Count; $cols=$range.Columns.Count
  if($rows -gt 50001 -or $cols -gt 100){throw '最多支持 100 列、50,000 条记录，请拆分文件'}
  $values=$range.Value2
  $matrix=New-Object System.Collections.Generic.List[object]
  for($r=1;$r -le $rows;$r++){
    $line=New-Object object[] $cols
    for($c=1;$c -le $cols;$c++){
      if($rows -eq 1 -and $cols -eq 1){$line[$c-1]=$values}else{$line[$c-1]=$values.GetValue($r,$c)}
    }
    $matrix.Add($line)
  }
  @{ok=$true;matrix=$matrix.ToArray()} | ConvertTo-Json -Depth 5 -Compress
} catch {
  @{ok=$false} | ConvertTo-Json -Compress
} finally {
  if($book){$book.Close($false)}
  if($app){$app.Quit()}
}
`;
function readWithWps(file) {
  const message='此文件无法用标准 Excel 解析器读取。本机 WPS 兼容读取也未成功；请用 WPS 将报表另存为 CSV（UTF-8）后导入，原文件无需删除。';
  if(process.platform!=='win32')throw new Error(message);
  try {
    const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const output=execFileSync(exe,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{
      windowsHide:true,encoding:'utf8',timeout:45000,maxBuffer:64*1024*1024,
      env:{...process.env,KEYWORD_AI_REPORT_PATH:path.resolve(file)},stdio:['ignore','pipe','pipe']
    });
    const result=JSON.parse(output.replace(/^\uFEFF/,''));
    if(!result.ok||!Array.isArray(result.matrix))throw new Error(message);
    return result.matrix;
  } catch {throw new Error(message);}
}
module.exports={readWithWps};
