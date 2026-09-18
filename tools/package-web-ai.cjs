// Reproducible consolidated web + extension + Windows connector package.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),app=path.join(root,'apps/keyword-rank');
const arg=process.argv.indexOf('--output');
if(arg<0||!process.argv[arg+1])throw new Error('用法：npm run release:web-ai -- --output <新输出目录>');
const output=path.resolve(process.argv[arg+1]);
if(fs.existsSync(output))throw new Error('输出目录已存在，未覆盖');
const connector=path.join(root,'work',`ai-connector-build-${Date.now()}`);
function run(script,args=[],cwd=root){const r=spawnSync(process.execPath,[script,...args],{cwd,stdio:'inherit',windowsHide:true});if(r.status!==0)throw new Error('构建失败，未完成发行包');}
run(path.join(root,'tools/release-web.cjs'),['--output',output]);
run(path.join(app,'scripts/build-native-relay.cjs'),[],app);
run(path.join(app,'node_modules/electron-builder/cli.js'),['--config','electron/ai/connector-builder.cjs',`--config.directories.output=${connector}`,'--win','--x64','--dir'],app);
fs.cpSync(path.join(connector,'win-unpacked'),path.join(output,'AI本机连接器'),{recursive:true});
const files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else files.push({path:path.relative(output,p).replaceAll('\\','/'),bytes:fs.statSync(p).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')});}}
walk(output);
const revision=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout.trim();
fs.writeFileSync(path.join(output,'AI-PACKAGE-MANIFEST.json'),JSON.stringify({version:'2.1',sourceCommit:revision,createdAt:new Date().toISOString(),files:files.sort((a,b)=>a.path.localeCompare(b.path))},null,2));
console.log(`完整网页版 AI 包：${output}`);
