# Amazon Operations

## 关键词排名每日跟进网页版 v2.0

当前正式 React/Vite 源码唯一位于 [`apps/keyword-rank`](apps/keyword-rank)。网页 bridge、settings enhancement、种子数据、SIF 扩展和说明文件分别位于 [`web`](web)。[`outputs`](outputs) 只保存可交付的构建产物；当前 v2.0 入口仍保留在 [`outputs/关键词排名每日跟进网页版-v2.0/index.html`](outputs/关键词排名每日跟进网页版-v2.0/index.html)。

v2.0 在保留看板、自然矩阵、SP 矩阵、ABA 月榜和历史记录的基础上，支持：

- 自有产品与竞品分阶段自动导入（先全部自有产品，再全部竞品）；
- 竞品层级导航、统一详情页和竞品抽屉对比；
- 自然矩阵/SP 矩阵排名悬停竞品对比气泡；
- 父体 ASIN 修改并保留历史、自定义产品图片和双确认删除；
- 月 ABA CSV 导入及去年环比趋势；看板关键词悬停可查看以 ABA CSV 为准的今年/去年双折线对照，并显示各月具体排名。

## 开发与发布

在仓库根目录执行：

```powershell
npm install
npm run dev
npm run build
npm run release:web
```

`npm install` 会安装 `apps/keyword-rank` 的锁定依赖。`npm run release:web` 先执行全新 Vite build，再生成 `outputs/关键词排名每日跟进网页版-v<版本>`，并复制网页 bridge、settings、数据、扩展和说明。为保护已交付的同版本目录，目标已存在时命令会安全退出；明确要替换时使用：

```powershell
npm run release:web -- --force
```

要在不触碰现有 v2.0 目录的情况下验证，可指定新的输出目录：

```powershell
npm run release:web -- --output <新的输出目录>
```

首次使用发布包请先阅读 [`web/docs/使用说明.md`](web/docs/使用说明.md)，并按扩展目录中的 README 加载本地 SIF 桥接扩展。迁移前发布 hash 基线见 [`docs/baselines/v2.0-release.sha256`](docs/baselines/v2.0-release.sha256)。
