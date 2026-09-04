# 网页版发布源

这里保存独立网页版 v2.1 所需的非 Vite 源文件。发布时，根目录脚本会先从 [`apps/keyword-rank`](../apps/keyword-rank) 重新构建 React/Vite，再把本目录内容组装到 `outputs/` 下的发布目录。

## 发布输入

| 路径 | 作用 | 发布包位置 |
| --- | --- | --- |
| `browser-bridge/browser-bridge.js` | IndexedDB 数据层、SIF 任务桥接和本地文件交互 | `browser-bridge.js` |
| `web-settings/web-settings-enhancements.js` | 产品/竞品、父体 ASIN、月 ABA 和矩阵对比增强 | `web-settings-enhancements.js` |
| `data/initial-data.js` | 随包初始配置、排名和历史数据 | `data/initial-data.js` |
| `data/关键词排名每日跟进表.xlsx` | 可下载的原始跟进表 | `data/关键词排名每日跟进表.xlsx` |
| `extensions/sif-batch-reverse-downloader/` | 本地 Chrome/Edge Manifest V3 SIF 扩展 | `sif-batch-reverse-downloader/` |
| `docs/` | 面向使用者的说明、SOP 与迁移提示 | `docs/` |

## 发布流程

从仓库根目录执行：

```powershell
npm install
npm run release:web
```

`release:web` 会执行全新 Vite build，复制 bridge、设置增强、种子数据、随包 Excel、SIF 扩展和说明文件，随后生成 `index.html`、`打开网页版.cmd` 与 `BUILD-MANIFEST.json`。

默认输出为 `outputs/关键词排名每日跟进网页版-v<版本>`。目标目录已存在时不会覆盖；确认要替换同一版本时才使用：

```powershell
npm run release:web -- --force
```

也可以使用一个新的输出目录进行验证：

```powershell
npm run release:web -- --output "outputs/temporary-web-release"
npm run verify:web -- --dir "outputs/temporary-web-release"
```

## 运行时组成

发布后的 `index.html` 按以下顺序加载依赖：

```text
xlsx vendor → initial-data.js → browser-bridge.js → Vite bundle → web-settings-enhancements.js
```

打开发布目录中的 `打开网页版.cmd` 或 `index.html` 即可运行，推荐最新版 Chrome 或 Edge。网页版数据保存于当前浏览器 IndexedDB；首次使用和迁移前请阅读 [`docs/使用说明.md`](docs/使用说明.md)，并按扩展 README 加载 SIF 扩展。

## 源码边界

- 本目录和 `apps/keyword-rank/` 是发布输入；`outputs/` 只保存生成产物。
- 不要直接编辑 `outputs/**/assets/index-*.js` 或 `index-*.css`。正式修改应回到 React/Vite 源码、bridge、设置增强或扩展源文件，再重新发布。
- bridge 在 React bundle 运行前准备本地数据接口，设置增强在 bundle 加载后补充产品、竞品、ABA 与矩阵能力；扩展负责 SIF 页面自动下载和报表回传。

## 相关入口

- [网页版使用说明](docs/使用说明.md)：打开方式、IndexedDB 备份、产品/竞品、每日导入和月 ABA。
- [网页版使用 SOP](docs/关键词排名每日跟进网页版-使用SOP.md)：按日常操作顺序整理的流程。
- [SIF 扩展 README](extensions/sif-batch-reverse-downloader/README.md)：安装、权限、批量下载与常见故障。
- [根目录 README](../README.md)：项目定位、桌面版开发和完整发布命令。
