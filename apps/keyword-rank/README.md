# 关键词排名每日跟进（正式源码）

这是 Amazon Operations 当前 v2.0 的 React/Vite + Electron 正式源码目录。

- `src/`：React 页面、矩阵/ABA/Dashboard/历史记录和交互组件。
- `electron/`、`bridge/`：桌面版 IPC、本地数据存储和 Excel/SIF 桥接。
- `public/`：开发预览数据和 favicon。
- `build/icon.ico`：Electron 打包所需的源图标。
- `scripts/`：开发数据导出、图标和视觉 QA 工具。

`dist/`、`release/`、`qa/` 和 `node_modules/` 都是本地生成目录，不纳入 Git。网页版的竞品、ASIN、月 ABA 和批量 SIF 增强由仓库根目录 `web/` 中的独立脚本在发布时注入；不要把 `outputs/` 内的 hash bundle 当作源码。

版本规范为 `2.0.0`。在仓库根目录运行 `npm run dev`、`npm run build` 或 `npm run release:web` 即可调用本项目脚本。
