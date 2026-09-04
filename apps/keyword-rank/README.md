# 关键词排名每日跟进 · 正式源码

这是 Amazon Operations v2.1 的 React/Vite + Electron 正式源码。这里维护产品页面、排名矩阵、ABA 月榜、历史记录和桌面壳；网页版发布所需的 bridge、竞品/ABA 增强和 SIF 扩展位于仓库根目录的 [`web`](../../web)。

## 源码范围

| 目录 | 负责内容 |
| --- | --- |
| `src/` | React 页面、Dashboard、自然/SP/对比矩阵、ABA、历史记录与交互组件 |
| `electron/` | 桌面 IPC、本地数据存储、Excel 读写和窗口入口 |
| `bridge/` | SIF / Excel 本地桥接脚本 |
| `public/` | 开发预览数据、缓存和 favicon |
| `scripts/` | 开发数据导出、图标生成与视觉 QA 工具 |
| `build/` | Electron 图标源图与打包图标 |

核心页面保持高密度的矩阵/表格布局。排名、ABA 和导入算法属于正式业务逻辑，修改前请先确认对应需求与回归范围。

## 本地开发

从仓库根目录运行（推荐）：

```powershell
npm install
npm run dev
```

也可以直接进入本目录：

```powershell
cd apps/keyword-rank
npm install
npm run dev
```

开发服务启动 Vite，并打开 Electron 桌面壳。生产构建与 Windows x64 portable 打包：

```powershell
npm run build
npm run dist:win
```

从根目录执行 `npm run build`、`npm run dist:win` 和 `npm run release:web` 时，会自动调用本项目对应脚本。

## 生成目录与源码边界

- `dist/`：Vite 构建产物。
- `release/`：Electron portable 发布产物。
- `qa/`：视觉 QA 或本地验证产物。
- `node_modules/`：本机依赖。

以上目录均为本地生成内容，不是开发来源。正式修改必须回到 `src/`、`electron/`、`bridge/` 或对应脚本，再重新构建；不要直接编辑仓库 `outputs/` 中带 hash 的 bundle。

## 与网页版的关系

网页版发布时，根目录 `web/` 中的以下源文件会与本项目的 Vite build 重新组装：

- `web/browser-bridge/browser-bridge.js`：浏览器 IndexedDB 与 SIF bridge；
- `web/web-settings/web-settings-enhancements.js`：产品、竞品、父体 ASIN、月 ABA 和矩阵对比增强；
- `web/data/`：初始数据与随包 Excel；
- `web/extensions/`：本地 Manifest V3 SIF 扩展；
- `web/docs/`：面向使用者的说明和 SOP。

完整发布流程见根目录 [README](../../README.md) 和 [`web/README.md`](../../web/README.md)。

## 相关文档

- [SIF 自动导入说明](SIF自动导入说明.md)：桌面版与网页版共用的导入约束。
- [视觉 QA 说明](design-qa.md)：渲染、五个主视图、桥接方法和页面错误检查。
- [网页版使用说明](../../web/docs/使用说明.md)：浏览器版打开、备份、导入和数据边界。

当前源码版本：`2.1.0`。
