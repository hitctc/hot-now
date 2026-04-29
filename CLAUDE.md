# CLAUDE.md

本文件为 Claude Code（claude.ai/code）提供操作本代码仓库的指导。

## 项目概述

`hot-now` 是一个本地单机运行的科技资讯编辑台。它按固定周期拉取多个已启用的 RSS 来源，并支持通过手动链路采集 Twitter 账号/关键词搜索、Hacker News、B 站、微信公众号 RSS 和微博热搜等扩展来源。采集结果经过规则聚类、系统百分制评分和排序后，生成多源汇总的 HTML/JSON 报告，并通过 Fastify 统一站点提供服务，设置页面由 Vue 3 客户端壳层接管。

AI 时间线是独立功能：它读取外部 Markdown feed 中的 `json ai-timeline-feed` 数据块，渲染官方事件流，不与 AI 新讯 / AI 热点 的普通内容流混合。S 级 AI 时间线事件由服务端独立轮询 feed，按 `eventKey` 去重后推送飞书主通道和邮件备份通道。

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
  main.ts              # 应用入口：加载配置、打开数据库、执行迁移、填充种子数据、注册全部路由、启动调度器
  server/
    createServer.ts    # Fastify 实例工厂与所有路由处理器（页面、API、动作、健康检查、feed）
    public/            # Fastify 托管的静态资源
  core/
    db/                # SQLite 全生命周期：openDatabase、runMigrations、seedInitialData、sqliteHealth、snapshots
    pipeline/          # runCollectionCycle：RSS 抓取、文章提取、主题聚类、报告生成
    content/           # 内容查询/构建器：listContentView、buildContentPageModel、buildContentViewSelection、contentRepository
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
    router.ts          # 路由定义与页面元数据（ai-new、ai-hot、ai-timeline、settings/*）
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

## 关键架构决策

### 双层 TypeScript 编译

项目存在两套 TypeScript 编译目标：
- **服务端**：`tsconfig.json` —— `module: NodeNext`，`moduleResolution: NodeNext`，输出到 `dist/server`
- **客户端**：`tsconfig.client.json` —— `module: ESNext`，`moduleResolution: Bundler`，由 Vite 消费

所有源码中的 import 都使用 `.js` 扩展名，以兼容 NodeNext。Vite 负责编译 `.vue` 单文件组件。

### 数据库

使用 `better-sqlite3`。迁移脚本按版本号顺序增量执行，位于 `src/core/db/runMigrations.ts`。应用在启动时通过 `PRAGMA quick_check` 校验数据库完整性；若损坏则抛出包含恢复指引的错误。首次运行时会自动填充内置 RSS 来源和认证引导数据。

### 内容采集流水线

`runCollectionCycle` 负责端到端采集：拉取已启用的 RSS 来源，提取文章，向 SQLite 写入/更新内容项，进行主题聚类，生成日报（JSON + HTML），并保存到本地。它**不**负责发邮件——邮件由独立调度器或手动触发处理。

### 内容页（AI 新讯 / AI 热点）

两个页面均由 `buildContentPageModel` 驱动，内部按以下顺序应用逻辑：
1. 视图规则过滤（来自 `viewRules` 的 `ai_new` 或 `ai_hot` 门规则）
2. 来源种类过滤（用户在内容页勾选的来源，持久化在 `localStorage`）
3. 实体子过滤（Twitter 账号、Twitter 关键词、微信公众号 RSS——也持久化在 `localStorage`）
4. 标题搜索
5. 排序（按发布时间或按评分）
6. 分页（固定 50 条/页）

后端返回 `ContentPageModel`；前端通过共享的 `ContentFeedPageShell` 渲染卡片列表。

### AI 时间线

与普通内容流水线完全解耦。后端读取外部 Markdown 文件（`config.hot-now.config.json` 中的 `aiTimelineFeed.file`），提取第一个 `json ai-timeline-feed` 代码块，解析事件，并通过 `/api/ai-timeline` 提供。事件包含类型、公司、重要性等级、可靠性状态和可见状态。S 级事件触发独立的告警轮询，向飞书 webhook 和邮件发送通知。

### Vue 前端规范

- **页面**负责路由级编排：数据加载、动作协调、弹窗开关和少量状态管理
- **组件**放在 `src/client/components/<domain>/`；设置页组件放在 `src/client/components/settings/<domain>/`
- 同一页面出现多个表格/弹窗/卡片，或模板明显超过约 500 行时，优先抽组件
- 共享的 columns、表单类型、格式化函数和选项列表放到同域 `*Shared.ts` 中
- 展示组件通过 props / emits 协作；API 请求收口在页面、composable 或 service 层，不要让展示组件直接调接口
- 拆组件时必须保留稳定的 `data-*` 测试锚点

### 主题系统

自定义编辑主题基于 CSS 变量实现，变量定义在 `src/client/theme/editorialTokens.ts`。Tailwind 的 base 层根据 `data-theme="light"` / `data-theme="dark"` 切换。`UnifiedShellLayout` 提供共享导航壳层和深浅主题切换按钮。

### 环境变量与配置

`config/hot-now.config.json` 存放非敏感运行时配置。敏感值（SMTP、认证、API key、webhook）通过环境变量提供，由 `scripts/dev.sh` 从 `.env` 加载。开发脚本**只读 `.env**，不再读取 `.env.local`。

关键环境变量：
- `BASE_URL`、`PUBLIC_BASE_URL` —— 对外可点击的站点地址（用于邮件和提醒中的链接）
- `AUTH_USERNAME`、`AUTH_PASSWORD`、`SESSION_SECRET` —— 登录壳层必填
- `AUTH_SESSION_TTL_SECONDS` —— 可选会话有效期（默认 7 天）
- `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`MAIL_TO` —— 邮件投递
- `TWITTER_API_KEY` —— TwitterAPI.io 密钥（Twitter 账号/关键词采集必需）
- `FEISHU_ALERT_WEBHOOK_URL` —— S 级 AI 时间线事件的飞书机器人 webhook
- `LLM_SETTINGS_MASTER_KEY` —— 可选：用于加密保存厂商 API key（未配置时回退到 `SESSION_SECRET`）
- `HOT_NOW_DATABASE_FILE`、`HOT_NOW_REPORT_DATA_DIR` —— 可选生产路径覆盖项
- `AI_TIMELINE_FEED_URL`、`AI_TIMELINE_FEED_FILE`、`AI_TIMELINE_FEED_MANIFEST_FILE` —— 外部 AI 时间线 feed 配置

### 公众号解析 Sidecar

微信公众号文章解析由 `src/wechatResolver/` 中的独立微服务处理。本地开发时，`npm run dev` 会自动在 4040 端口拉起它。生产环境可通过 `WECHAT_RESOLVER_BASE_URL` 和 `WECHAT_RESOLVER_TOKEN` 覆盖到远端 relay。

### 部署

生产部署使用 `scripts/deploy-prod.sh`，它会通过 rsync 将代码同步到 `/srv/hot-now/app`，在服务器上执行 `npm ci && npm run build`，然后重启 `hot-now` systemd 服务。部署脚本**不会**触碰数据目录（`/srv/hot-now/shared/data`）和环境文件（`/srv/hot-now/shared/.env`）。
