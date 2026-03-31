# HotNow 协作文档

## 1. 文档目标

这份 `AGENTS.md` 约束本项目内的协作方式，优先级高于上层通用约定中那些不够具体的部分。

它解决三件事：

- 让进入仓库的协作者先快速知道项目现在在做什么、怎么跑、主要代码在哪。
- 让后续改动优先沿着现有架构继续推进，而不是随手发散重构。
- 让 `AGENTS.md` 本身随着代码一起演进，不变成过期文档。

## 2. 项目当前定位

- 项目名称：`hot-now`
- 目标：本地单机运行的每日热点应用
- 当前主链路：
  - `采集链路`：`定时 / 手动采集 -> 拉取 enabled RSS sources -> 抓取原文 -> 规则聚类 -> 生成 JSON/HTML 报告 -> 网页查看`
  - `发信链路`：`定时 / 手动发信 -> 读取最新一份已生成报告 -> SMTP 发邮件`
- 当前数据源：`https://imjuya.github.io/juya-ai-daily/rss.xml`、`https://openai.com/news/rss.xml`、`https://blog.google/technology/ai/rss/`、`https://36kr.com/feed`、`https://36kr.com/feed-newsflash`、`https://techcrunch.com/category/artificial-intelligence/feed/`、`https://www.ifanr.com/feed`、`https://www.ithome.com/rss/`
- 当前采集语义：以 `is_enabled` 为准决定是否参与采集；`is_active` 仅保留兼容，不再作为系统菜单主语义
- 当前技术栈：`Node.js + TypeScript + Fastify + Vitest`

当前仓库已经有较完整的实现、配置模板、测试和设计/计划文档，不要把它当成从零开始的脚手架项目处理。

## 3. 关键目录与职责

- `src/main.ts`
  负责启动配置加载、运行锁、Fastify 服务和定时任务，并装配反馈工作台与自然语言重算链路，是应用入口。
- `src/core/config/`
  负责读取 `config/hot-now.config.json` 和环境变量，组装运行时配置。
- `src/core/source/`
  负责拉取并解析最新 RSS 日报。
- `src/core/fetch/`
  负责抓取原文和正文提取。
- `src/core/feedback/`
  负责内容收藏 / 点赞 / 点踩，以及反馈池的读写。
- `src/core/llm/`
  负责厂商配置加密存储、provider 适配与自然语言评估调用。
- `src/core/topics/`
  负责热点归并、排序和摘要整理。
- `src/core/strategy/`
  负责正式自然语言策略、草稿池、评估结果和评估运行记录。
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
  负责页面路由和服务端渲染 HTML。
- `tests/`
  负责单元测试与轻量集成测试。
- `config/hot-now.config.json`
  负责非敏感运行配置。
- `docs/superpowers/`
  保存现阶段的设计文档和实现计划，后续重大变更要一起维护。

## 4. 当前页面与产物约定

当前页面：

- `/health`：健康检查
- `/login`：登录页（GET）与登录提交（POST）
- `/logout`：退出登录（POST）
- `/assets/site.css`：统一站点样式
- `/`：统一站点首页（未登录也可访问）
- `/articles`：统一站点文章页（未登录也可访问）
- `/ai`：统一站点 AI 页（未登录也可访问）
- `/settings/view-rules`：统一站点筛选策略工作台（登录后，支持数值权重、LLM 设置、正式自然语言策略、反馈池、草稿池）
- `/settings/sources`：统一站点数据迭代收集页（登录后，可启用/停用 source，并分别手动执行采集 / 手动发送最新报告；source 卡片上方会展示总条数、今天发布、今天抓取，以及 Hot / Articles / AI 入池与展示统计）
- `/settings/profile`：统一站点当前登录用户页（登录后）
- 统一站点左侧导航底部支持深色 / 浅色主题切换，偏好写入浏览器本地 `localStorage` 并在刷新后保持
- `unified shell` 页面（`/`、`/articles`、`/ai`、`/settings/*`）已完整切换到 `Editorial Signal Desk` 双主题
- 内容导航保持统一内容池，但会给匹配导航语义的内置 source 显式加权：`36氪` / `36氪快讯` 优先进入 `/` 热点页，`爱范儿` 优先进入 `/ai`，`36氪` / `爱范儿` / `IT之家` 优先进入 `/articles`
- `/`、`/articles`、`/ai` 顶部新增共享 source 复选过滤条，支持 `全选 / 全不选`，浏览偏好写入浏览器本地 `localStorage['hot-now-content-sources']`
- 内容卡片保留 `收藏 / 点赞 / 点踩`，并新增局部 `补充反馈` 面板；点赞 / 点踩后自动展开，反馈进入反馈池，不会直接修改正式策略
- 如果本地 `data/hot-now.sqlite` 内容库损坏，内容页会降级显示提示，不再直接以 `500` 打断 unified shell
- `/history`：历史报告（legacy，当前仍保留）
- `/reports/:date`：指定日期报告（legacy，当前仍保留）
- `/control`：控制台（legacy，当前仍保留）
- legacy `/history`、`/control` 与 `/reports/:date` 的 fallback notice 轻量跟随共享主题资源
- `POST /actions/collect`：手动触发一次采集任务（会对所有 enabled sources 执行采集）
- `POST /actions/send-latest-email`：手动发送最新一份已生成报告
- `POST /actions/run`：`/actions/collect` 的兼容别名（legacy，当前仍保留）
- `POST /actions/content/:id/feedback-pool`：保存或覆盖当前内容卡片的反馈池条目
- `POST /actions/view-rules/provider-settings`、`POST /actions/view-rules/provider-settings/delete`：保存 / 删除单活 LLM 厂商配置
- `POST /actions/view-rules/nl-rules`：保存 `global / hot / articles / ai` 正式自然语言策略，并立即触发当前内容库全量重算
- `POST /actions/feedback-pool/:id/create-draft`、`POST /actions/feedback-pool/:id/delete`、`POST /actions/feedback-pool/clear`：反馈池转草稿、删单条、清空全部
- `POST /actions/strategy-drafts/:id/save`、`POST /actions/strategy-drafts/:id/delete`：草稿池保存与删除
- 兼容约定：真实应用默认启用 `requireLogin=true` 的 unified shell；auth 开启时内容菜单仍允许匿名查看，但系统菜单、legacy 路由和所有写操作都需要登录；测试或未注入 auth 的场景仍可保持 legacy `/ -> 最新报告` 与 legacy 路由公开行为

当前报告产物目录：

- `data/reports/<YYYY-MM-DD>/report.json`：包含 `sourceKinds`、`issueUrls`、`sourceFailureCount`、`failedSourceKinds`
- `data/reports/<YYYY-MM-DD>/report.html`：多源热点汇总 HTML 报告
- `data/reports/<YYYY-MM-DD>/run-meta.json`：包含 `mailStatus`；collection-only 任务会写入 `not-sent-by-collection`
- `data/recovery-backups/<YYYYMMDD-HHmmss>/hot-now.sqlite`：已通过完整性校验的 verified snapshot
- `data/recovery-backups/<YYYYMMDD-HHmmss>/manifest.json`：快照时间、源库路径、完整性结果和表计数摘要

当前仓库允许把示例报告产物提交进版本库，用来直观看到阶段性成果；live `data/hot-now.sqlite` 不再作为常规 git 产物提交，跨设备和服务器初始化统一使用 verified snapshot。如果后续重新改回忽略策略，必须同步更新本文档、`README.md` 和 `.gitignore`。

如果你改了页面入口、路由、产物路径或产物格式，必须同步更新本文档和 `README.md`。

## 5. 运行与验证

首次进入仓库先确认依赖状态。当前工作区可能没有安装依赖，不要默认 `node_modules` 已存在。

常用命令：

- 安装依赖：`npm install`
- 开发启动：`npm run dev`
- 本地便捷启动：`npm run dev:local`
- 数据库检查：`npm run db:check`
- 生成 verified snapshot：`npm run db:snapshot`
- 从快照恢复主库：`npm run db:restore -- <snapshot-file>`
- 类型构建：`npm run build`
- 测试：`npm run test`

`npm run dev:local` 现在会在启动前检查本地 `3030` 端口；如果已有旧的监听进程占着这个端口，会先停止旧进程，再启动新的本地开发服务。`npm run dev` 保持原样，不会主动杀进程。

SQLite 可靠性约定：

1. `data/hot-now.sqlite` 是运行中的 live 库，只给当前设备本地运行使用，不再直接跨设备同步或常规提交。
2. 跨设备开发、服务器初始化和坏库恢复，统一使用 `data/recovery-backups/<timestamp>/hot-now.sqlite + manifest.json`。
3. `.sqlite-wal` 与 `.sqlite-shm` 继续保持忽略，不纳入 git。
4. 启动报损坏时，先跑 `npm run db:check`，再用 `npm run db:restore -- <snapshot-file>` 恢复。

推荐验证顺序：

1. 只改了局部逻辑时，先跑最相关的单测文件。
2. 改动影响运行时类型或入口时，再跑 `npm run build`。
3. 改动影响任务链路、页面或配置时，最后做一次手动 smoke test。

推荐 smoke test：

1. 准备 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS`、`MAIL_TO`、`BASE_URL`、`AUTH_USERNAME`、`AUTH_PASSWORD`、`SESSION_SECRET`；如需验证自然语言匹配，再额外准备 `LLM_SETTINGS_MASTER_KEY`
2. 启动 `npm run dev`
3. 打开 `/login` 并完成登录
4. 如需验证自然语言链路，先进入 `/settings/view-rules` 保存厂商设置和正式规则，确认页面出现最新重算结果
5. 进入 `/settings/sources` 或 legacy `/control`，先手动执行一次采集；需要验证发信时，再单独触发一次“发送最新报告”
6. 检查是否生成报告目录与 `report.json`、`report.html`、`run-meta.json`
7. 检查 `/`、`/articles`、`/ai`、`/settings/view-rules`、`/settings/sources`、`/history`、`/reports/:date` 是否正常显示，并验证内容页 source 过滤条、内容卡片反馈面板、反馈池、草稿池和正式规则编辑区

## 6. 配置与安全约束

- 非敏感配置放在 `config/hot-now.config.json`
- 敏感信息必须通过环境变量提供，尤其是 QQ SMTP 授权码
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
- `AUTH_USERNAME`
- `AUTH_PASSWORD`
- `SESSION_SECRET`
- `LLM_SETTINGS_MASTER_KEY`

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
- Git 提交信息统一使用中文，包含碎片提交、临时提交和最终交付提交；除非用户明确要求其他语言，否则不要再写英文提交标题或正文。
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

截至 `2026-03-31`，仓库状态可按下面理解：

- 已有设计文档和实现计划
- 已有主体实现与测试文件
- Git 主分支已建立并同步远端
- 当前工作区已完成 unified site 与多源采集阶段的最终验证：
  - `npm run test` 通过，结果为 `35` 个测试文件、`186` 个测试全部通过
  - `npm run build` 通过
  - Playwright MCP 本地验收已跑通：`/login` 登录成功；`/`、`/articles`、`/ai`、`/settings/view-rules`、`/settings/sources`、`/settings/profile`、`/history`、`/control` 访问正常
  - 浅色主题切换后 `data-theme=light` 且 `localStorage['hot-now-theme']='light'`，刷新后保持；切回深色后 `data-theme=dark` 且刷新后保持
- 真实 SMTP 发信已验证通过；当前采集链路与发信链路已拆开，采集只生成报告，发信单独读取最新报告
- 原文抓取过程中出现过一次 `jsdom` 的 `Could not parse CSS stylesheet` 日志噪音，未阻断本轮任务完成；如果后续要收口发布质量，可以继续评估是否需要单独治理
- Task4（single-user login + unified app shell）已落地：新增 `passwords/session` auth helper、登录页与统一壳层菜单路由，且保留 legacy 报告路由兼容
- 真实入口已收口为“内容公开、系统受保护”：`AUTH_USERNAME`、`AUTH_PASSWORD`、`SESSION_SECRET` 现在是必填；auth 开启时 `/`、`/articles`、`/ai` 允许匿名查看，但 `/settings/*`、legacy 路由和 `POST /actions/collect`、`POST /actions/send-latest-email`、`POST /actions/run` 都要求登录
- 内容页评分已切为系统自动百分制，页面保留收藏 / 点赞 / 点踩，不再提供手工评分表单
- 多源采集后端已完成：`loadEnabledSourceIssues` / `runDailyDigest` 已接入多源并行汇总，单个 feed 失败不会阻断整次日报，只有全部 enabled sources 都失败时才会硬失败
- 内置 RSS 源已扩展到 8 个，覆盖聚合日报、国际官方 AI 博客、国内热点资讯 / 快讯与科技媒体；新增国内源默认作为 built-in source 写入 `content_sources`
- 采集和发信已拆成两个独立功能：默认配置下采集每 `10` 分钟执行一次，发信每天 `10:00` 执行一次；两者都支持手动触发，并共用同一把运行锁
- 系统菜单已收口到多源语义：`/settings/sources` 支持 source 启用/停用、逐 source 最近抓取状态展示，以及统一站点内手动执行采集 / 手动发送最新报告；`/settings/view-rules` 现在是完整策略工作台，支持按字段表单保存权重规则、LLM 厂商配置、正式自然语言策略、反馈池和草稿池；当前登录用户信息已并到侧边栏底部
- `/settings/sources` 现在会基于共享内容选择器实时展示 source 工作台总览表，口径包含总条数、今天发布、今天抓取，以及 Hot / Articles / AI 的入池与展示统计
- unified shell 已去掉顶部 header，页面信息和账号区都收进左侧侧边栏；视觉母版已从赛博控制台切换为浅色纸感的 `Editorial Signal Desk`，主题切换与 localStorage 持久化已落地
- unified shell 内容页已切到“首页主卡 + 标准卡”的混合卡片体系；系统页卡片则统一收口为 workbench / inventory panel 语义
- 内容页顶部现在会渲染共享 source 过滤条，勾选结果通过 `localStorage + x-hot-now-source-filter` header 驱动服务端重渲染，只影响当前浏览结果，不参与系统页统计口径
- 内容页现在会把当前反馈池条目回填到局部反馈面板，内容交互形成 `点赞/点踩 -> 反馈池 -> 草稿池 -> 正式自然语言策略 -> 全量 / 增量重算` 的闭环
- 正式自然语言策略保存后会立即触发当前内容库全量重算；采集链路在落库后会自动触发增量自然语言评估
- 内容页现在对本地内容库损坏做了降级兜底：检测到 `SQLITE_CORRUPT` / `SQLITE_NOTADB` 时继续渲染统一站点，并提示修复或重建 `data/hot-now.sqlite`
- 启动入口现在会对 `data/hot-now.sqlite` 做 SQLite 健康检查；如果主库损坏，会提示最近的 verified snapshot 和 `npm run db:restore -- <snapshot-file>` 恢复命令
- graceful shutdown 现在会执行真实的 `wal_checkpoint(TRUNCATE)`，减少把 live 库直接当普通文件同步时产生坏快照的风险
- 已新增 `npm run db:check`、`npm run db:snapshot`、`npm run db:restore -- <snapshot-file>`，并把 verified snapshot 目录收口为 `data/recovery-backups/<timestamp>/`
- live `data/hot-now.sqlite` 已收口为运行时文件，不再作为常规 git 产物；跨设备和服务器只流转 verified snapshot
- 自然语言匹配目前走预计算模式，只支持单活厂商；已接入 `DeepSeek`、`MiniMax`、`Kimi`，API key 通过页面录入并用 `LLM_SETTINGS_MASTER_KEY` 加密后落库
- 报告层已切到多源语义：`report.json` / `report.html` / 邮件正文会保留 `sourceKinds`、`issueUrls`、失败 source 数量等信息，不再把输出描述成单一日报
- legacy `/history`、`/reports/:date`、`/control` 与 unified shell 共存，且相关测试和文档已同步

如果后续有人补充了更完整的端到端验证、继续扩展 source adapter，或确认上述日志噪音属于需要修复的问题，请同步更新这一节，避免误导下一位协作者。
