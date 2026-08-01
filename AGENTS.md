# HotNow 协作文档

## 1. 文档目标

这份 `AGENTS.md` 是本项目唯一的协作约束入口，优先级高于上层通用约定中那些不够具体的部分。不再单独维护其他项目级协作文档；原有仍有效的通用规则已并入本文。

它解决三件事：

- 让进入仓库的协作者先快速知道项目现在在做什么、怎么跑、主要代码在哪。
- 让后续改动优先沿着现有架构继续推进，而不是随手发散重构。
- 让 `AGENTS.md` 本身随着代码一起演进，不变成过期文档。

## 2. 项目当前定位

- 项目名称：`hot-now`
- 目标：本地单机运行的每日热点应用
- 当前主链路：
  - `采集链路`：`定时 / 手动采集 -> 拉取 enabled RSS sources -> 抓取 / 规范化内容 -> 规则聚类 -> 生成 JSON/HTML 报告 -> 网页查看`
  - `Twitter 链路`：`后台维护账号列表 -> 手动执行 Twitter 账号采集 -> 推文入库 -> 内容页查看`
  - `Twitter 关键词链路`：`后台维护关键词列表 -> 手动执行固定中文范围的 Twitter 关键词搜索 -> 去重入库 / 建立关键词命中关系 -> 内容页查看`
  - `Hacker News 链路`：`后台维护 query 列表 -> 手动执行 Hacker News 搜索 -> 去重入库 / 合并 query 命中 -> 内容页查看`
  - `B 站链路`：`后台维护 query 列表 -> 手动执行 B 站搜索 -> 去重入库 / 合并 query 命中 -> 内容页查看`
  - `微信公众号 RSS 链路`：`后台批量维护 RSS 链接 -> 手动执行公众号 RSS 采集 -> 去重入库 / 按 RSS 来源筛选 -> 内容页查看`
  - `微博热搜链路`：`固定 AI 关键词 -> 手动执行微博热搜榜匹配 -> 热搜命中入库 -> AI 热点查看`
  - `AI 时间线链路`：`Codex 自动化生成官方发布时间线 Markdown -> 上传本地稳定 feed 并暴露公网入口 -> 应用优先读取本地 feed / 必要时用公网 URL 兜底 -> 解析 json ai-timeline-feed -> 提供 API 与 feed 摘要`；Vue 页面当前暂时下架
  - `AI 时间线提醒链路`：`定时读取 AI 时间线 feed -> 筛选新增 S 级官方事件 -> 按 eventKey 去重 -> 飞书主通道 + 邮件备份通道推送`
  - `发信链路`：`手动发信 -> 读取最新一份已生成报告 -> SMTP 发邮件`；每日早报发信默认关闭，SMTP 同时作为 S 级事件邮件备份通道
- 当前数据源：内置 RSS 库已扩展到 `21` 个，覆盖聚合日报、国际官方 AI 博客、国内科技媒体、创投资讯、开发者社区与综合新闻；Twitter 已拆成两类独立来源类型：账号采集配置保存在 `twitter_accounts`，关键词搜索配置保存在 `twitter_search_keywords`；Hacker News 搜索配置保存在 `hackernews_queries`；B 站搜索配置保存在 `bilibili_queries`；微信公众号 RSS 配置保存在 `wechat_rss_sources`；微博热搜榜匹配使用固定 AI 关键词，不提供独立配置表；AI 时间线不再维护应用内官方源白名单和采集规则，服务端优先读取 `AI_TIMELINE_FEED_FILE` 指向的本地 Markdown feed，必要时再用 `AI_TIMELINE_FEED_URL` 指向的公网 Markdown feed 兜底，解析其中唯一的 `json ai-timeline-feed` 代码块并提供 API 与提醒数据。这些扩展链路除 AI 时间线 feed 外都只支持后台手动执行，完整清单和边界见 `README.md`
- 当前采集语义：以 `is_enabled` 为准决定是否参与采集；`is_active` 仅保留兼容，不再作为系统菜单主语义
- 当前技术栈：`Node.js + TypeScript + Fastify + Vue 3 + Vite + Ant Design Vue + Tailwind CSS + Vitest`

当前仓库已经有较完整的实现、配置模板、测试和设计/计划文档，不要把它当成从零开始的脚手架项目处理。

## 3. 关键目录与职责

- `src/main.ts`
  负责运行时配置、数据库初始化、运行锁、任务调度、监听和优雅退出；HTTP 依赖装配在 `src/app/createRuntimeServerDeps.ts`。
- `src/client/`
  负责内容、创作和 `/settings/*` 系统页的 Vue 3 客户端入口、路由、页面组件、主题和前端 service 封装。
  `src/client/pages/*` 只保留路由级页面编排；可复用或大块 UI 下沉到 `src/client/components/*`，其中数据来源工作台的分区卡片、表格、弹窗和共享格式化逻辑集中在 `src/client/components/settings/sources/`。
  客户端样式栈固定为 `Vue 3 + Vite + Ant Design Vue + Tailwind CSS`；统一主题源收口到 `src/client/theme/editorialTokens.ts`，`src/client/styles/tailwind.css` 只保留基础样式、主题变量和少量 AntD 深层覆写，不要再长出新的大型 CSS 皮肤文件。
- `src/core/config/`
  负责读取 `config/hot-now.config.json` 和环境变量，组装运行时配置。
- `src/core/source/`
  负责拉取并解析最新 RSS 日报。
- `src/core/fetch/`
  负责抓取原文和正文提取。
- `src/core/feedback/`
  负责内容反馈池相关数据的读写。
- `src/core/llm/`
  负责厂商配置加密存储；当前版本先只保留 LLM 设置入口，不再接入筛选策略链路。
- `src/core/twitter/`
  负责 Twitter 账号配置存储、Twitter 关键词配置存储、TwitterAPI.io 用户最新推文 / advanced search client、账号采集、关键词搜索、命中关系持久化和推文到候选内容的映射；不要把单个 Twitter 账号配置或单个关键词配置塞进 `content_sources`。
- `src/core/hackernews/`
  负责 Hacker News query 配置存储、Algolia search client、HN 搜索采集、命中 query 合并和 HN 条目到候选内容的映射；不要把单个 HN query 塞进 `content_sources`。
- `src/core/bilibili/`
  负责 B 站 query 配置存储、视频搜索 client、B 站搜索采集、命中 query 合并和视频条目到候选内容的映射；不要把单个 B 站 query 塞进 `content_sources`。
- `src/core/wechatRss/`
  负责微信公众号 RSS 链接配置存储、RSS 拉取解析、手动采集、状态回写和公众号 RSS 条目到候选内容的映射；不要把单个公众号 RSS 链接塞进 `content_sources`。
- `src/core/weibo/`
  负责微博热搜榜 client、固定 AI 关键词匹配、微博热搜采集和热搜条目到候选内容的映射；不要给微博热搜榜匹配补一套独立 query 配置表，也不要把单个热搜条目塞进 `content_sources`。
- `src/core/aiTimeline/`
  负责 AI 时间线 feed 类型、Markdown feed 读取、`json ai-timeline-feed` 代码块解析、事件质量门禁、feed 版本回退和时间线列表读取；应用内不再维护官方源白名单、官方源采集、重要性规则分类、事件 upsert、官方证据表或源健康表，也不要把 AI 时间线事件写入 `content_items`。
- `src/core/viewRules/`
  负责 `AI 新讯 / AI 热点` 的页面级筛选规则默认值、开关配置与持久化读写；后续如果继续扩展内容筛选逻辑，优先在这里演进，不要再新开一套平行配置源。
- `src/core/topics/`
  负责热点归并、排序和摘要整理。
- `src/core/strategy/`
  保留历史自然语言策略与评估相关实现；当前版本不再从 `view-rules` 页面装配或触发这条链路。
- `src/core/report/`
  负责生成结构化报告和 HTML 报告。
- `src/core/pipeline/runCollectionCycle.ts`
  负责执行“采集 + 聚类 + 生成报告 + 写入存储”的 collection-only 流水线。
- `src/core/pipeline/sendLatestReportEmail.ts`
  负责读取最新报告并单独执行发信。
- `src/core/pipeline/runDailyDigest.ts`
  保留旧的一体化日报流水线实现，新增功能优先复用拆分后的 collection / mail pipeline。
- `src/core/mail/`
  负责 QQ SMTP 邮件发送。
- `src/core/storage/`
  负责报告文件读写和历史日期索引。
- `src/core/scheduler/`
  负责按配置启动每日定时任务。
- `src/server/`
  负责 HTTP 协议适配、页面分发和业务域路由；`createServer.ts` 只做 Fastify 创建、全局配置、依赖装配与路由注册。路由域、核心层和客户端的长期边界以 `docs/开发与模块化规范.md` 为准，历史治理过程见 `docs/性能优化基线.md`。
- `src/wechatResolver/`
  负责本地开发时自动启动的公众号解析 sidecar；当前默认先尝试公开索引，再用“文章页元数据 + 搜狗文章检索”做 fallback，最终把标准 `rss_url` 返回给主应用。
- `tests/`
  负责单元测试与轻量集成测试。
- `config/hot-now.config.json`
  负责非敏感运行配置。
- `deploy/`
  保存生产环境的 `systemd`、`nginx`、sudoers 示例模板，供首次部署或服务器核对时复用。

### TypeScript 与构建约束

- 服务端使用 `tsconfig.json` 的 NodeNext 配置，源码内部导入必须保留 `.js` 扩展名。
- 客户端使用 `tsconfig.client.json` 的 Bundler/Vite 配置，`.vue` 文件由 Vite 处理；不要把服务端的模块解析约束直接套到客户端代码。

## 4. 当前页面与产物约定

当前可访问入口：

- 公开内容：`/`、`/ai-new`、`/ai-hot`；系统页：`/settings/view-rules`、`/settings/sources`、`/settings/wechat-mp`、`/settings/profile`；创作页：`/creative/*`、`/daily-digest`、`/monitor`。
- 运维和兼容入口：`/health`、`/login`、`/logout`、`/history`、`/reports/:date`、`/control`。
- AI 时间线 Markdown feed 公开入口为 `/feeds/ai-timeline-feed.md`；页面路由 `/ai-timeline` 与 `/settings/ai-timeline` 当前暂时下架，API、feed 回退和提醒链路继续运行。
- 运行产物仅保留在 `data/`：报告位于 `data/reports/<YYYY-MM-DD>/`，已验证快照位于 `data/recovery-backups/<timestamp>/`，不得提交 Git。

页面细节、接口契约和配置说明以 `README.md` 为准；模块边界以 `docs/开发与模块化规范.md` 为准。

## 5. 运行与验证

首次进入仓库先确认依赖状态。当前工作区可能没有安装依赖，不要默认 `node_modules` 已存在。

常用命令：

- 安装依赖：`npm install`
- 系统页客户端构建：`npm run build:client`
- 开发启动：`npm run dev`
- 仅启动 Vite 客户端调试：`npm run dev:client`
- 仅启动公众号解析 sidecar：`npm run dev:wechat-resolver`
- 兼容入口：`npm run dev:local`
- 数据库检查：`npm run db:check`
- 生成 verified snapshot：`npm run db:snapshot`
- 从快照恢复主库：`npm run db:restore -- <snapshot-file>`
- 生产部署：`./scripts/deploy-prod.sh`（默认会先读取仓库根 `.deploy.local.env`；如需临时覆盖，再显式传 `HOT_NOW_DEPLOY_*`）
- 生产 Nginx：`deploy/nginx/hot-now.conf` 包含 `80 -> 443` 跳转、`now.achuan.cc` HTTPS 反代，并直接服务 `/client/assets/` 下的 Vite hash 资源，对 JS/CSS 开启 gzip 与长缓存；更新该模板后，服务器侧需要执行 `nginx -t` 并 reload Nginx，避免静态资源继续绕到 Node 进程。
- 拉取生产数据副本：`./scripts/pull-prod-data.sh`（默认从生产服务器拉 `hot-now.sqlite + reports/` 到本地 `data/prod-sync/`）
- 基于生产副本启动本地开发：`./scripts/dev-prod-sync.sh`（固定使用本地 `data/prod-sync/`，不直连服务器 live 数据）
- 类型构建：`npm run build`
- 客户端类型检查：`npm run typecheck:client`
- 测试：`npm run test`

`npm run dev` 现在是唯一主开发入口：启动前会准备最新 client bundle，并同时拉起 Fastify、Vite dev server 和本地公众号解析 sidecar。脚本现在只读取根目录 `.env`；`.env.local` 已不再参与启动加载，若仓库里还残留旧文件，脚本会明确提示它已被忽略。后续开发统一把共享配置和每台设备自己的敏感项都维护在 `.env`。未显式配置 `WECHAT_RESOLVER_BASE_URL` / `WECHAT_RESOLVER_TOKEN` 时，`npm run dev` 会自动注入本地默认值并启动 sidecar；只有想改接远端 relay 时才需要覆盖这两个环境变量。`HOT_NOW_CLIENT_DEV_ORIGIN` 未显式配置时，默认使用 `http://127.0.0.1:35173`，避免和常见本地前端服务抢占 `5173`。每次执行 `npm run dev` 都会先清理后端端口、Vite 调试端口和自动 sidecar 端口，再启动新进程，不复用旧的 Vite dev server。`npm run dev:local` 已退回兼容入口，只负责转发到 `npm run dev` 并提示后续统一使用 `dev`。当前 `3030` 页面会优先尝试接入 `HOT_NOW_CLIENT_DEV_ORIGIN` 指向的 Vite dev server，成功时可直接使用 Vue DevTools，失败时自动回退到 `dist/client` 构建产物；`npm run dev:client` 仍保留给只调前端时单独使用。

SQLite 可靠性约定：

1. `data/` 整个目录都是本地运行产物目录，不再纳入 git。
2. `data/hot-now.sqlite` 是运行中的 live 库，只给当前设备本地运行使用，不再直接跨设备同步或常规提交。
3. 跨设备开发、服务器初始化和坏库恢复，统一手动复制 `data/recovery-backups/<timestamp>/hot-now.sqlite + manifest.json`。
4. `.sqlite-wal` 与 `.sqlite-shm` 继续保持忽略，不纳入 git。
5. 启动报损坏时，先跑 `npm run db:check`，再用 `npm run db:restore -- <snapshot-file>` 恢复。
6. 如果本地开发要对照生产数据，优先运行 `./scripts/pull-prod-data.sh` 把生产库和报告拉到 `data/prod-sync/`，不要让开发环境直接读服务器上的 live 数据目录。
7. 如果只是想基于这份副本排查或开发，优先运行 `./scripts/dev-prod-sync.sh`，不要每次手写 `HOT_NOW_DATABASE_FILE` 和 `HOT_NOW_REPORT_DATA_DIR`。

推荐验证顺序：

1. 只改了局部逻辑时，先跑最相关的单测文件（`npx vitest run tests/<path>.test.ts`）。
2. 改动涉及 `/settings/*` 客户端页面时，先跑最相关的前端单测，再跑 `npm run build:client`。
3. 改动影响运行时类型或入口时，再跑 `npm run build`。
4. 改动影响任务链路、页面或配置时，最后做一次手动 smoke test。

推荐 smoke test：

1. 准备 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS`、`MAIL_TO`、`BASE_URL`、`AUTH_USERNAME`、`AUTH_PASSWORD`、`SESSION_SECRET`；如需让厂商 API key 使用独立加密密钥，再额外准备 `LLM_SETTINGS_MASTER_KEY`；如需验证 Twitter 账号真实采集或 Twitter 关键词搜索，再额外准备 `TWITTER_API_KEY`
2. 启动 `npm run dev`
3. 打开 `/login` 并完成登录
4. 如需验证内容筛选工作台，先进入 `/settings/view-rules` 检查 `AI 新讯 / AI 热点` 的筛选总览与开关保存，再检查 `反馈池` 的复制 / 删除 / 清空是否正常；`LLM 设置` 当前只保留配置入口，不会触发策略或重算
5. 进入 `/settings/sources` 或 legacy `/control`，先手动执行一次普通 RSS 采集；如果已配置 `TWITTER_API_KEY`，再到 `/settings/sources` 的 Twitter 分区单独执行一次 Twitter 账号采集，并确认账号“最近成功 / 最近结果”回写；如需验证关键词搜索、Hacker News、B站、微信公众号 RSS 或微博热搜，分别使用该页对应手动入口并在 `/ai-new`、`/ai-hot` 检查结果可见性。AI 时间线页面当前下架，只验证 `AI_TIMELINE_FEED_URL` 或默认 `https://now.achuan.cc/feeds/ai-timeline-feed.md` 可访问且包含 `json ai-timeline-feed`，以及相关 API 返回有效数据；需要验证发信时，再单独触发一次“发送最新报告”
6. 检查是否生成报告目录与 `report.json`、`report.html`、`run-meta.json`
7. 检查 `/`、`/ai-new`、`/ai-hot`、`/settings/view-rules`、`/settings/sources`、`/settings/wechat-mp`、`/settings/profile`、`/history`、`/reports/:date` 是否正常显示，并验证内容页 source 过滤条、共享排序切换、共享标题搜索、内容页策略摘要、内容卡片反馈面板、反馈池和 LLM 设置占位文案

## 6. 配置与安全约束

- 非敏感配置放在 `config/hot-now.config.json`
- 敏感信息必须通过环境变量提供，尤其是 QQ SMTP 授权码和飞书机器人 webhook
- 不要把 `.env`、授权码、邮箱密码、cookies 或外部账号信息提交进仓库
- 除非需求明确变化，否则不要新增外部 telemetry、analytics 或额外网络上报

当前关键环境变量：

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_TO`
- `BASE_URL`
- `PUBLIC_BASE_URL`（可选对外正式站点地址；飞书提醒和邮件里的用户可点击链接优先使用它，缺失时回退 `BASE_URL`）
- `AUTH_USERNAME`
- `AUTH_PASSWORD`
- `SESSION_SECRET`
- `AUTH_SESSION_TTL_SECONDS`（可选登录会话固定有效期，单位秒；默认 `604800`，即 7 天，不做滑动续期）
- `LLM_SETTINGS_MASTER_KEY`
- `TWITTER_API_KEY`（可选 TwitterAPI.io 密钥；在 Twitter 账号采集和 Twitter 关键词搜索时需要，缺失时不阻断普通 RSS、微信公众号 RSS、Hacker News、B 站或微博热搜采集）
- `FEISHU_ALERT_WEBHOOK_URL`（可选 S 级 AI 时间线事件飞书提醒 webhook；缺失时飞书通道失败但邮件备份仍会尝试发送）
- `HOT_NOW_DATABASE_FILE`（可选生产覆盖项；显式指定生产 SQLite 文件路径，例如 `/srv/hot-now/shared/data/hot-now.sqlite`）
- `HOT_NOW_REPORT_DATA_DIR`（可选生产覆盖项；显式指定生产报告目录，例如 `/srv/hot-now/shared/data/reports`）
- `AI_TIMELINE_FEED_FILE`（可选外部 AI 官方发布时间线 feed 稳定文件路径，生产推荐 `/srv/hot-now/shared/data/feeds/ai-timeline-feed.md`）
- `AI_TIMELINE_FEED_MANIFEST_FILE`（可选外部 AI 官方发布时间线 feed manifest 路径，生产推荐 `/srv/hot-now/shared/data/feeds/ai-timeline-feed-manifest.json`）
- `AI_TIMELINE_FEED_MAX_FALLBACK_VERSIONS`（可选回退版本数量，默认 `10`）
- `HOT_NOW_CLIENT_DEV_ORIGIN`
- `WECHAT_RESOLVER_BASE_URL`（可选覆盖项；本地开发默认由 `npm run dev` 自动注入 `http://127.0.0.1:4040`）
- `WECHAT_RESOLVER_TOKEN`（可选覆盖项；本地开发默认由 `npm run dev` 自动注入本地 sidecar token）

部署脚本专用环境变量：

- `HOT_NOW_DEPLOY_HOST`
- `HOT_NOW_DEPLOY_USER`
- `HOT_NOW_DEPLOY_APP_DIR`（可选，默认 `/srv/hot-now/app`）
- `HOT_NOW_DEPLOY_SERVICE`（可选，默认 `hot-now`）
- `HOT_NOW_DEPLOY_HEALTH_URL`（可选，默认 `http://127.0.0.1:3030/health`）

日常开发机推荐在仓库根目录维护一个本地私有的 `.deploy.local.env`，让 `scripts/deploy-prod.sh` 直接读取默认发布目标；仓库里只保留 `.deploy.local.env.example` 模板，真实 `.deploy.local.env` 必须继续忽略，不提交进仓库。

拉取生产数据副本脚本可选覆盖项：

- `HOT_NOW_PULL_REMOTE_DATA_DIR`（可选，默认 `/srv/hot-now/shared/data`）
- `HOT_NOW_PULL_LOCAL_DIR`（可选，默认 `<repo>/data/prod-sync`）

单机生产部署默认要求部署用户具备最小范围的免密 sudo，只放开：

- `/usr/bin/systemctl restart hot-now`
- `/usr/bin/systemctl status hot-now --no-pager`

不要把部署用户配置成全局免密 sudo；优先复用 `deploy/sudoers/hot-now-systemctl` 模板。

如果新增、删除或重命名环境变量，必须同步更新：

- `AGENTS.md`
- `README.md`
- `.env.example`
- 相关测试

## 7. 代码改动约束

- 优先做小而清晰的改动，不要因为“顺手”重排整个项目结构。
- 保持当前单进程、文件归档、规则聚类的主架构，除非需求明确要求架构升级。
- 新增逻辑优先复用现有的依赖注入方式，特别是 `runDailyDigest` 和 `createServer` 的测试注入模式。
- 改动行为时，优先补最相关测试，不要只改实现不补门禁。
- Vue 客户端按“页面编排、组件呈现、composable 承载可复用状态、service 只做接口”的边界拆分；页面文件只保留路由级数据加载、动作编排和少量页面状态，不把表格、弹窗、分区卡片和重复表单都揉在一个 `.vue` 里。
- `/settings/*` 这类系统页的业务组件放在 `src/client/components/settings/<domain>/`，内容页组件放在 `src/client/components/content/`；同一页面内多个卡片、表格、弹窗或 500 行以上的模板，应优先拆成具名组件。
- 复杂页面的共享 UI 常量、表单状态类型、格式化函数和选项列表放到同域 `*Shared.ts` 或 composable 中；组件之间通过明确 props / emits 协作，不让子组件直接调用后端 service。
- 新增组件必须保留清晰的 `data-*` 测试锚点；从大页面拆组件时，优先保持用户可见行为和测试选择器稳定，避免“组件化”顺手改交互。
- 新增业务模块尽量控制在 `500～600` 行以内；Vue 页面或复杂组件超过 `800` 行时必须检查是否职责混杂；`src/server/createServer.ts` 只保留服务装配，结构治理目标控制在约 `1000` 行以内。行数是预警线而不是硬指标，不要为了压行数拆出无法独立命名和验证的碎片文件。
- 性能改动必须先记录基线，再用相同数据和相同请求做前后对比；优先消除无效查询、大字段传输和重复请求，不用长期缓存掩盖慢查询。服务端通过 `HOT_NOW_SLOW_REQUEST_MS` 控制慢请求阈值，性能日志禁止记录查询参数、正文、Cookie 或密钥。
- 删除、清空、覆盖、重置等不可逆或高风险操作，默认必须提供显式二次确认；除非用户明确要求并说明可跳过，否则不要直接把危险动作绑定成一次点击立即生效。
- Git 提交信息默认使用 `英文类型：中文正文`，包含碎片提交、临时提交和最终交付提交；除非用户明确要求其他语言或其他格式，否则不要改成纯英文、纯中文或其他提交标题格式。
- 默认直接在 `main` 分支开发，不单独开功能分支或 worktree；只有用户明确要求隔离开发、走分支 / PR 流程，或有其他特殊说明时，才切到非 `main` 分支工作。
- 完成代码改动或正式文档产物，并达到一次“最小可验证改动”后，默认创建本地 git commit；这里的“最小可验证改动”至少要求本轮最相关测试、构建或文档自检已经完成，不把未确认分析、草稿、半成品实验或明显中间态代码直接提交。
- 如果代码改动已经完成、最小可验证改动也已达成且提交边界清晰，默认在同一轮工作内立刻完成本地 commit；不要把本应提交的改动拖到下一轮需求再一起补交。
- 如果因为工作区混有无关脏改、提交边界不清或验证未完成而暂时不能提交，必须在回复里明确说明原因；不要在已完成最小可验证改动后静默跳过本地 commit。
- 如果本轮改动已经通过最相关验证、提交边界清晰、工作区没有混入无关脏改，且用户没有明确要求暂停同步，则默认继续将当前分支推送到远程；本项目默认直接在 `main` 工作，因此 push 前必须先确认这几个条件都成立。
- 以下情况禁止自动 push：相关验证未通过；工作区混有未整理的无关修改；只完成了分析 / 设计 / 计划而没有形成可交付代码；改动包含 live 数据库、凭据、临时恢复文件或其他不应入库的本地产物；当前提交边界仍不清楚。
- 代码开发完成并部署到服务器后，如果改动无异常、无未处理事项，应自动执行 ship commit push 流程（触发 ship skill 统一提交规范），不需要等待用户明确要求；只有用户明确说"先不提交"或存在未解决的验证失败时，才跳过提交推送。
- 对外可见行为变化时，更新文档，不要让 README 和 AGENTS 落后于代码。

## 8. AGENTS.md 维护规则

后续代码更新过程中，满足以下任一条件时，必须在同一轮改动里同步更新 `AGENTS.md`：

- 项目目标、范围、主链路发生变化
- 入口文件、核心模块职责或目录结构发生变化
- 页面路由、控制台能力或报告产物格式发生变化
- 配置项、环境变量、启动命令或验证命令发生变化
- 当前阶段判断发生明显变化，例如从“待验证”进入“可交付”
- 新增了后续协作者必须知道的限制、风险或操作前提

如果只是纯实现细节调整，且不影响协作方式、运行方式、验证方式或系统边界，可以不改 `AGENTS.md`。

## 9. 当前阶段快照

- 结构治理已完成服务端业务域收口、核心 repository 读写边界、`main.ts` 启动装配，以及来源工作台表单生命周期拆分；不再为了行数继续机械拆分。
- 数据库历史迁移保持兼容：`001`–`013` 使用独立文件，`014`–`047` 保留现有实现，下一次真实迁移从 `048` 起独立归档。
- AI 时间线 feed 与提醒链路仍运行，但 Vue 页面路由暂时下架；恢复必须同步代码、测试、`README.md`、`docs/开发与模块化规范.md` 与本文。
- 测试通过情况以本次实际执行的命令和 CI 结果为准，不在本文件维护会过期的测试数量。
- 大文件治理的历史过程、基线和部署记录见 `docs/性能优化基线.md`；公众号写作管线以 Hermes PRD 为准。
