<p align="center">
  <img src="./assets/readme/hero.svg" alt="Amazon Operations 关键词排名每日跟进工作台" width="100%" />
</p>

# Amazon Operations

> 关键词排名每日跟进 v2.1：把自然排名、SP、ABA 与竞品变化，整理成一张可追踪的运营工作台。

<p align="center">
  <a href="web/docs/使用说明.md">网页版使用说明</a> ·
  <a href="apps/keyword-rank/README.md">正式源码</a> ·
  <a href="web/extensions/sif-batch-reverse-downloader/README.md">SIF 扩展</a> ·
  <a href="web/README.md">网页发布源</a>
</p>

## 先看它能做什么

- **每日跟进**：在看板、自然矩阵、SP 矩阵和历史记录中查看排名变化。
- **对比决策**：按日期并列自然/SP 排名，区分“自然领先”和“SP 领先”，直接定位详情。
- **竞品洞察**：自有产品与竞品使用同一套详情页；关键词和排名单元格支持竞品对比气泡与抽屉对比。
- **趋势沉淀**：导入月 ABA CSV，查看今年/去年排名和月份趋势；关注词、产品图标与标注会随本地数据保存。
- **本地优先**：网页版数据保存在当前浏览器 IndexedDB，桌面版使用本地存储与文件桥接，不依赖云端账号。

## 一条工作流

| 输入 | 本地处理 | 最终视图 |
| --- | --- | --- |
| SIF 流量词报表 / 本地 Excel | 浏览器 bridge 或 Electron bridge 校验父体 ASIN 并归档 | 看板、自然矩阵、SP 矩阵、历史记录 |
| 月度 ABA CSV | 按国家、年份、月份写入本地 ABA 数据 | ABA 月榜与今年/去年趋势 |
| 自有产品 + 竞品配置 | 严格先完成全部自有产品，再处理全部竞品 | 层级导航、统一详情页、竞品对比 |

## 主要能力

### 排名与对比

- 看板顶部展示自然/SP 对比总览：共同上榜、领先关系、第一页关键词数、排名页分布和差值分布。
- 对比矩阵按“自然领先”和“SP 领先”分区；每个日期并列显示自然排名、SP 排名，并以 ①/②/③ 标记所在页。
- 看板、自然矩阵和 SP 矩阵可查看同关键词、同日期的竞品排名、标注、周 ABA、周搜索量与流量排名。
- 支持日期筛选、关注词排序、列宽调整和父体 ASIN 修改；修改 ASIN 会保留历史、关注词、标注与产品图标。

### 产品与数据管理

- 产品管理覆盖美国、德国、英国、日本、加拿大、法国、西班牙、意大利 8 个站点。
- 产品支持内置服装图标和自定义图片；删除产品或竞品前需要二次确认，只清理浏览器中的本地记录。
- 网页版工具文件夹支持导出/导入 JSON 备份、下载随包原始 Excel 和恢复初始数据。

### 导入与自动化

- SIF 扩展可按产品国家打开反查页、下载流量词报表，并将内容回传网页版自动导入。
- 批量导入严格按“全部自有产品 → 全部竞品”执行，不交叉、不提前结束。
- 本地 Excel 导入仍可手动使用；SIF 扩展另支持单独输入最多 15 个 ASIN 批量下载。

## 快速开始

### 使用网页版发布包

适合拿到已生成发布目录的使用者：

1. **完整解压**发布包，不要直接在压缩包内打开文件。
2. 双击 `打开网页版.cmd`，或直接打开 `index.html`；推荐最新版 Chrome 或 Edge。
3. 需要一键 SIF 导入时，按 [SIF 扩展说明](web/extensions/sif-batch-reverse-downloader/README.md) 加载本地扩展，并在同一浏览器中登录 SIF。
4. 首次打开先到“设置 → 产品管理”检查产品、父体 ASIN 和国家，再从 1 个产品开始验证权限与下载设置。
5. 在“工具文件夹”导出 JSON 备份。隐私模式、清理站点数据或更换浏览器可能清除网页版本地数据。

### 从源码运行桌面版

```powershell
git clone https://github.com/Changjingxiang/Amazon-Operations.git
cd Amazon-Operations
npm install
npm run dev
```

`npm install` 会安装 `apps/keyword-rank` 的锁定依赖；`npm run dev` 启动 React/Vite 开发服务和 Electron 桌面壳。

## 构建、发布与验证

```powershell
# React/Vite 生产构建
npm run build

# Windows x64 portable 桌面包
npm run dist:win

# 重新构建并生成网页版发布目录
npm run release:web

# 对指定发布目录做浏览器 smoke check
npm run verify:web -- --dir "outputs/关键词排名每日跟进网页版-v2.1"
```

`npm run release:web` 始终从 `apps/keyword-rank` 和 `web/` 重新构建，并生成 `outputs/关键词排名每日跟进网页版-v<版本>`。目标目录已存在时命令会安全退出；确认要替换同一版本时才使用：

```powershell
npm run release:web -- --force
```

## 数据边界与已知限制

- `apps/keyword-rank/` 是正式 React/Vite + Electron 源码；`web/` 保存浏览器 bridge、设置增强、种子数据、扩展和说明；`outputs/` 仅是生成产物，禁止手工编辑其中的 hash bundle。
- 网页版写入当前浏览器 IndexedDB，不会直接写回桌面文件夹；跨电脑或跨浏览器迁移请使用 JSON 备份。
- SIF 自动导入依赖同一浏览器的登录状态和下载权限；扩展仍会把文件保存在 Downloads 作为备份，不读取或修改 SIF 账号内容。
- 旧版受保护的 `asinKeywords_*.xlsx` 无法由普通浏览器直接解析；随包初始数据已包含既有历史。

## 项目结构

```text
.
├─ apps/keyword-rank/                 # 正式 React/Vite + Electron 源码
│  ├─ src/                            # 页面、组件与数据逻辑
│  ├─ electron/                       # 桌面 IPC、本地存储与工作簿桥接
│  └─ bridge/                         # SIF / Excel 本地桥接脚本
├─ web/                               # 独立网页版发布所需源文件
│  ├─ browser-bridge/                 # IndexedDB 与 SIF 浏览器桥接
│  ├─ web-settings/                   # 产品、竞品、ABA 与矩阵增强
│  ├─ data/                            # 初始数据与随包 Excel
│  ├─ extensions/                     # SIF Manifest V3 扩展
│  └─ docs/                            # 面向使用者的说明与 SOP
├─ tools/                             # release:web / verify:web
├─ assets/readme/hero.svg             # README 项目原生 Hero
└─ package.json
```

## 文档入口

- [网页版使用说明](web/docs/使用说明.md)：打开方式、IndexedDB 备份、产品/竞品、每日导入和月 ABA。
- [网页版使用 SOP](web/docs/关键词排名每日跟进网页版-使用SOP.md)：按日常操作顺序整理的流程。
- [SIF 扩展 README](web/extensions/sif-batch-reverse-downloader/README.md)：安装、权限、批量下载与常见故障。
- [桌面源码 README](apps/keyword-rank/README.md)：React/Vite、Electron、开发脚本和目录说明。
- [SIF 自动导入说明](apps/keyword-rank/SIF自动导入说明.md)：桌面版与网页版共用的导入约束。
