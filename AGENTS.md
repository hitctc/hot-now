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
- 当前主链路：`定时 / 手动触发 -> 拉取 enabled RSS sources -> 抓取原文 -> 规则聚类 -> 生成 JSON/HTML 报告 -> 网页查看 -> SMTP 发邮件`
- 当前数据源：`https://imjuya.github.io/juya-ai-daily/rss.xml`、`https://openai.com/news/rss.xml`、`https://blog.google/technology/ai/rss/`、`https://techcrunch.com/category/artificial-intelligence/feed/`
- 当前采集语义：以 `is_enabled` 为准决定是否参与采集；`is_active` 仅保留兼容，不再作为系统菜单主语义
- 当前技术栈：`Node.js + TypeScript + Fastify + Vitest`

当前仓库已经有较完整的实现、配置模板、测试和设计/计划文档，不要把它当成从零开始的脚手架项目处理。

## 3. 关键目录与职责

- `src/main.ts`
  负责启动配置加载、运行锁、Fastify 服务和定时任务，是应用入口。
- `src/core/config/`
  负责读取 `config/hot-now.config.json` 和环境变量，组装运行时配置。
- `src/core/source/`
  负责拉取并解析最新 RSS 日报。
- `src/core/fetch/`
  负责抓取原文和正文提取。
- `src/core/topics/`
  负责热点归并、排序和摘要整理。
- `src/core/report/`
  负责生成结构化报告和 HTML 报告。
- `src/core/pipeline/runDailyDigest.ts`
  负责把整条日报流水线串起来。
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
- `/`：统一站点首页（登录后）
- `/articles`：统一站点文章页（登录后）
- `/ai`：统一站点 AI 页（登录后）
- `/settings/view-rules`：统一站点筛选策略页（登录后）
- `/settings/sources`：统一站点数据迭代收集页（登录后，可启用/停用 source，并手动执行一次全量采集）
- `/settings/profile`：统一站点当前登录用户页（登录后）
- 统一站点左侧导航底部支持深色 / 浅色主题切换，偏好写入浏览器本地 `localStorage` 并在刷新后保持
- `unified shell` 页面（`/`、`/articles`、`/ai`、`/settings/*`）已完整接入赛博双主题
- `/history`：历史报告（legacy，当前仍保留）
- `/reports/:date`：指定日期报告（legacy，当前仍保留）
- `/control`：控制台（legacy，当前仍保留）
- legacy `/history`、`/control` 与 `/reports/:date` 的 fallback notice 轻量跟随共享主题资源
- `POST /actions/run`：手动触发一次日报任务（会对所有 enabled sources 执行采集；legacy，当前仍保留）
- 兼容约定：真实应用默认启用 `requireLogin=true` 的 unified shell；auth 开启时 legacy 路由也需要登录；测试或未注入 auth 的场景仍可保持 legacy `/ -> 最新报告` 与 legacy 路由公开行为

当前报告产物目录：

- `data/reports/<YYYY-MM-DD>/report.json`
- `data/reports/<YYYY-MM-DD>/report.html`
- `data/reports/<YYYY-MM-DD>/run-meta.json`

当前仓库允许把示例报告产物提交进版本库，用来直观看到阶段性成果；如果后续重新改回忽略策略，必须同步更新本文档、`README.md` 和 `.gitignore`。

如果你改了页面入口、路由、产物路径或产物格式，必须同步更新本文档和 `README.md`。

## 5. 运行与验证

首次进入仓库先确认依赖状态。当前工作区可能没有安装依赖，不要默认 `node_modules` 已存在。

常用命令：

- 安装依赖：`npm install`
- 开发启动：`npm run dev`
- 本地便捷启动：`npm run dev:local`
- 类型构建：`npm run build`
- 测试：`npm run test`

推荐验证顺序：

1. 只改了局部逻辑时，先跑最相关的单测文件。
2. 改动影响运行时类型或入口时，再跑 `npm run build`。
3. 改动影响任务链路、页面或配置时，最后做一次手动 smoke test。

推荐 smoke test：

1. 准备 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS`、`MAIL_TO`、`BASE_URL`、`AUTH_USERNAME`、`AUTH_PASSWORD`、`SESSION_SECRET`
2. 启动 `npm run dev`
3. 打开 `/login` 并完成登录
4. 进入 `/settings/sources` 或 legacy `/control` 手动触发一次任务
5. 检查是否生成报告目录与 `report.json`、`report.html`、`run-meta.json`
6. 检查 `/`、`/settings/sources`、`/history`、`/reports/:date` 是否正常显示

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

截至 `2026-03-29`，仓库状态可按下面理解：

- 已有设计文档和实现计划
- 已有主体实现与测试文件
- Git 主分支已建立并同步远端
- 当前工作区已完成 unified site 主题阶段的最终验证：
  - `npm run test` 通过，结果为 `20` 个测试文件、`101` 个测试全部通过
  - `npm run build` 通过
  - Playwright MCP 本地验收已跑通：`/login` 登录成功；`/`、`/articles`、`/ai`、`/settings/view-rules`、`/settings/sources`、`/settings/profile`、`/history`、`/control` 访问正常
  - 浅色主题切换后 `data-theme=light` 且 `localStorage['hot-now-theme']='light'`，刷新后保持；切回深色后 `data-theme=dark` 且刷新后保持
- 真实 SMTP 发信已验证通过：最近一次手动采集写回的 `run-meta.json` 显示 `mailStatus: sent`
- 原文抓取过程中出现过一次 `jsdom` 的 `Could not parse CSS stylesheet` 日志噪音，未阻断本轮任务完成；如果后续要收口发布质量，可以继续评估是否需要单独治理
- Task4（single-user login + unified app shell）已落地：新增 `passwords/session` auth helper、登录页与统一壳层菜单路由，且保留 legacy 报告路由兼容
- 真实入口已收紧：`AUTH_USERNAME`、`AUTH_PASSWORD`、`SESSION_SECRET` 现在是必填；auth 开启时 legacy 路由也要求登录，`POST /actions/run` 未登录返回未授权
- 内容页评分已切为系统自动百分制，页面保留收藏 / 点赞 / 点踩，不再提供手工评分表单
- 多源采集后端已完成：`loadEnabledSourceIssues` / `runDailyDigest` 已接入多源并行汇总，单个 feed 失败不会阻断整次日报，只有全部 enabled sources 都失败时才会硬失败
- 系统菜单已收口到多源语义：`/settings/sources` 支持 source 启用/停用、逐 source 最近抓取状态展示和统一站点内手动执行采集；`/settings/view-rules` 支持按字段表单保存权重规则；当前登录用户信息已并到侧边栏底部
- unified shell 已去掉顶部 header，页面信息和账号区都收进左侧侧边栏；主题切换与 localStorage 持久化已落地
- legacy `/history`、`/reports/:date`、`/control` 与 unified shell 共存，且相关测试和文档已同步

如果后续有人补充了更完整的端到端验证、继续扩展 source adapter，或确认上述日志噪音属于需要修复的问题，请同步更新这一节，避免误导下一位协作者。
