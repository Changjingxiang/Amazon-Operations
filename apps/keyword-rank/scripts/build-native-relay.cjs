const {spawnSync}=require('node:child_process');
const path=require('node:path'),fs=require('node:fs');
const app=path.resolve(__dirname,'..');
const compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
if(!fs.existsSync(compiler))throw new Error('构建连接器需要 Windows .NET Framework 4.x C# 编译器');
const result=spawnSync(compiler,['/nologo','/target:exe','/optimize+','/platform:anycpu',`/out:${path.join(app,'build','KeywordRankAINative.exe')}`,path.join(app,'electron','ai','NativeRelay.cs')],{stdio:'inherit',windowsHide:true});
if(result.status!==0)process.exit(result.status||1);
