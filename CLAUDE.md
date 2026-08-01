# CLAUDE.md

本文件只保留 Claude Code 的专用补充。协作规则见 [AGENTS.md](./AGENTS.md)，当前模块边界见 [docs/开发与模块化规范.md](./docs/开发与模块化规范.md)，启动与部署见 [README.md](./README.md)。

## 项目概述

`hot-now` 是一个本地单机运行的科技资讯编辑台。它按固定周期拉取多个已启用的 RSS 来源，并支持通过手动链路采集 Twitter 账号/关键词搜索、Hacker News、B 站、微信公众号 RSS 和微博热搜等扩展来源。采集结果经过规则聚类、系统百分制评分和排序后，生成多源汇总的 HTML/JSON 报告，并通过 Fastify 统一站点提供服务，设置页面由 Vue 3 客户端壳层接管。

AI 时间线是独立功能：它读取外部 Markdown feed 中的 `json ai-timeline-feed` 数据块，渲染官方事件流，不与 AI 新讯 / AI 热点 的普通内容流混合。S 级 AI 时间线事件由服务端独立轮询 feed，按 `eventKey` 去重后推送飞书主通道和邮件备份通道。

**注意：AI 时间线页面（`/ai-timeline`）和 feed 管理页（`/settings/ai-timeline`）已于 2026-05-17 暂时下架，菜单入口和路由已注释。** 后端 API 和 feed 轮询仍保留运行，恢复时取消 `router.ts` 中的注释即可。

## 技术栈

- **后端**：Node.js、Fastify、TypeScript（ES2022 / NodeNext）、better-sqlite3
- **前端**：Vue 3、Vite、Vue Router、Ant Design Vue、Tailwind CSS
- **构建工具**：Vite 构建客户端，`tsc` 编译服务端，`tsx` 用于开发态 watch
- **测试**：Vitest（双项目配置：node 环境跑服务端测试，jsdom 环境跑客户端测试）

## 常用命令

```bash
# 开发
npm run dev              # 同时拉起 Fastify（3030）、Vite dev server（35173）和本地公众号解析 sidecar
npm run dev:client       # 仅启动 Vite dev server（需要用 Vue DevTools  inspector 定位源码时优先使用）
npm run dev:wechat-resolver  # 仅启动本地公众号解析 sidecar

# 构建
npm run build            # 完整构建：客户端 + 服务端 TypeScript 编译
npm run build:client     # 仅构建客户端生产包
npm run typecheck:client # 对客户端做 vue-tsc 类型检查（不输出文件）

# 测试
npm run test             # 运行全部 Vitest 测试（node + jsdom 双项目）
```

运行单个测试文件：
```bash
npx vitest run tests/content/buildContentPageModel.test.ts
```

数据库维护：
```bash
npm run db:check         # 检查 SQLite 完整性
npm run db:snapshot      # 创建带校验的恢复快照
npm run db:restore -- data/recovery-backups/<timestamp>/hot-now.sqlite
```

## 项目结构

```
src/
  main.ts              # 运行时启动：配置、数据库、锁、调度、监听和退出
  app/
    createRuntimeServerDeps.ts # HTTP 层依赖装配
  server/
    createServer.ts    # Fastify 实例、全局配置、依赖装配和业务路由注册
    routes/            # 按业务域组织的 HTTP 路由
    public/            # Fastify 托管的静态资源
  core/
    db/                # SQLite 全生命周期：openDatabase、runMigrations、seedInitialData、sqliteHealth、snapshots
    pipeline/          # runCollectionCycle：RSS 抓取、文章提取、主题聚类、报告生成
    content/           # 内容查询/构建器：listContentView、buildContentPageModel、buildContentViewSelection、contentRepository
    creative/          # 创作素材、成品文章、图片与发布相关领域逻辑
    source/            # 来源目录管理：listContentSources、loadEnabledSourceIssues、sourceMutationRepository
    topics/            # 主题聚类逻辑
    ratings/           # 评分维度仓库
    report/            # 日报构建器与 HTML 渲染器
    storage/           # 报告与文本文件的文件 IO
    scheduler/         # 基于 node-cron 的调度器启动器
    auth/              # 密码哈希与会话令牌逻辑
    mail/              # SMTP 邮件发送
    llm/               # 厂商配置仓库（DeepSeek、MiniMax、Kimi）
    viewRules/         # 内容筛选规则与反馈池
    feedback/          # 反馈池仓库
    fetch/             # 文章抓取与提取（Mozilla Readability、JSDOM、Cheerio）
    twitter/           # Twitter 账号/关键词采集与仓库
    hackernews/        # Hacker News query 采集与仓库
    bilibili/          # B 站 query 采集与仓库
    wechatRss/         # 微信公众号 RSS 采集与仓库
    weibo/             # 微博热搜榜匹配
    aiTimeline/        # 外部 feed 解析、事件类型与告警轮询
    types/             # 共享的 RuntimeConfig 与应用级类型
  client/              # Vue 3 SPA
    main.ts            # 应用引导：注册 AntD 组件、挂载路由
    router.ts          # 当前启用的内容、创作和系统路由定义与页面元数据
    App.vue            # 根布局包装器
    pages/             # 路由级页面组件（content/*、settings/*）
    components/        # 可复用组件（content/*、settings/*）
    layouts/           # UnifiedShellLayout.vue
    services/          # API 服务模块（contentApi、settingsApi、aiTimelineApi、http）
    composables/       # Vue 组合式函数（useTheme）
    theme/             # 编辑主题设计令牌（editorialTokens.ts）
    styles/            # Tailwind CSS 入口 + AntD 深层覆写（tailwind.css）
  wechatResolver/      # 独立的公众号文章解析 sidecar（运行在独立端口）
tests/               # Vitest 测试，目录结构与 src 对应
config/
  hot-now.config.json  # 运行时配置：端口、采集周期、发信时间、报告目录、外部 feed 地址等
scripts/
  dev.sh               # 开发编排脚本：清理旧端口、启动 sidecar、Vite、Fastify
  deploy-prod.sh       # 生产部署：rsync + systemd restart
  pull-prod-data.sh    # 将生产环境 SQLite 和 reports 拉到本地 data/prod-sync/
```

## Claude Code 专用架构补充

- 服务端使用 `tsconfig.json` 的 NodeNext；客户端使用 `tsconfig.client.json` 的 Bundler，由 Vite 编译 `.vue`。
- 服务端源码 import 使用 `.js` 扩展名以兼容 NodeNext。
- AI 时间线页面 `/ai-timeline` 与 `/settings/ai-timeline` 当前下架；不要恢复菜单、路由或来源页入口，除非同批补齐路由、测试和项目文档。feed、API 与提醒链路仍可维护。
- 本地运行产物、数据库、凭据和 `.deploy.local.env` 不得提交；部署前后按 `AGENTS.md` 运行最相关验证。
- 新模块的长期边界、迁移规则和测试策略不在本文件重复，统一遵循 `docs/开发与模块化规范.md`。
