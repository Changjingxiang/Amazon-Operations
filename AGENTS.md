# Amazon Operations 开发规则

## Source of truth

- 正式 React/Vite 源码唯一位于 `apps/keyword-rank/`；它对应当前正式 v2.0 的真实源码项目。
- 网页专属 bridge 源码位于 `web/browser-bridge/browser-bridge.js`，设置/竞品/ABA 增强源码位于 `web/web-settings/web-settings-enhancements.js`。
- `web/data/`、`web/extensions/` 和 `web/docs/` 是网页发布所需的源数据、扩展和说明文件。
- `outputs/**` 只保存构建后的发布产物，不是源码；禁止把已有输出目录当作开发来源。
- 禁止直接编辑 Vite hash bundle（例如 `outputs/**/assets/index-*.js`）。任何正式修改都必须回到源码并重新构建。
- `work/keyword-rank-source-backup/` 是 legacy 1.8.1 历史快照，不能作为当前开发源码。

## 业务规则

- 自有产品批量导入必须全部完成后，才进入竞品导入；不得交叉或提前结束阶段。
- 自有产品和竞品使用同一套详情页；竞品身份主要由左侧导航层级体现。
- Matrix/Table 是核心界面，不得随意改成卡片布局。
- ABA、排名和导入算法未经明确要求禁止修改。

## UI 规则

- Desktop-first，保持高数据密度。
- 不允许 dropdown 覆盖产品文字。
- 自有产品/竞品切换应尽量保留用户当前上下文。
- UI 修改后必须实际渲染 QA；本次源码归档任务不进行 UI/UX 重新设计。

## 发布规则

- 所有正式修改必须从 `apps/keyword-rank/` 源码重新 build。
- `npm run release:web` 会重新构建 React/Vite，然后从 `web/` 复制 bridge、settings、数据、扩展和说明到 `outputs/`。
- 已存在的发布目录默认不会覆盖；明确要替换同一版本时才使用 `npm run release:web -- --force`。
- 禁止直接修改 `outputs/assets/index-*.js/css` 或手工从仓库外临时目录复制 dist。
- 进行较大范围修改、重构、依赖升级或删除文件前，先创建 commit checkpoint 和唯一 checkpoint tag；不得覆盖、重写或删除既有 checkpoint。
