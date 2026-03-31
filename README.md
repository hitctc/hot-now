# hot-now

本地单机运行的科技资讯编辑台。它会按固定周期拉取多个已启用的 RSS 源、抓取原文、做规则聚类、按系统百分制评分排序内容、生成多源汇总的 HTML/JSON 报告；邮件发送与采集解耦，可按每日固定时间或手动触发，对最新一份报告单独发信。统一站点继续由 Fastify 托管路由和登录态，但 `/settings/*` 系统页现在已经切到 `Vue 3 + Vite + Ant Design Vue`。

## 本地启动

1. 安装依赖：`npm install`
2. 检查配置文件：`config/hot-now.config.json`
3. 准备本地环境变量，推荐直接写到 `.env.local`

```bash
export SMTP_HOST="smtp.qq.com"
export SMTP_PORT="465"
export SMTP_SECURE="true"
export SMTP_USER="your-qq-mail@qq.com"
export SMTP_PASS="your-qq-smtp-auth-code"
export MAIL_TO="receiver@example.com"
export BASE_URL="http://127.0.0.1:3030"
export AUTH_USERNAME="admin"
export AUTH_PASSWORD="replace-with-strong-password"
export SESSION_SECRET="replace-with-long-random-secret"
export LLM_SETTINGS_MASTER_KEY="replace-with-local-master-key"
```

4. 如果这次改动涉及 unified shell 客户端页面，先构建最新客户端资源：`npm run build:client`
5. 启动开发服务：

- 标准方式：

```bash
set -a
source .env.local
set +a
npm run dev
```

- 本地便捷方式：

```bash
npm run dev:local
```

`dev` 和 `dev:local` 现在都会先准备最新的 client bundle，再启动 Fastify。`dev:local` 还会额外检查本地 `3030` 端口；如果已有旧的开发监听进程占着这个端口，它会先停掉旧进程，再启动新的服务。

QQ 邮箱这里要填的是 SMTP 授权码，不是网页登录密码。

## 本地数据库可靠性

- `data/hot-now.sqlite` 是运行中的 live 库，不再作为常规 git 产物提交
- 跨设备开发、服务器初始化或坏库恢复，只使用 `data/recovery-backups/<timestamp>/hot-now.sqlite`
- 每份标准快照都应带同目录下的 `manifest.json`
- 新增数据库维护命令：
  - `npm run db:check`
  - `npm run db:snapshot`
  - `npm run db:restore -- data/recovery-backups/<timestamp>/hot-now.sqlite`
- 应用正常退出时会执行 SQLite `wal_checkpoint(TRUNCATE)`，把已提交写入回刷到主库
- 如果启动时报数据库损坏，先执行 `npm run db:check`，再从最近一份 verified snapshot 恢复

## 页面

- 健康检查：`/health`
- 登录页：`/login`
- 统一站点内容菜单（未登录也可访问）：`/`、`/articles`、`/ai`
- 统一站点系统菜单（登录后访问）：`/settings/view-rules`、`/settings/sources`、`/settings/profile`
- 内容页统一展示系统自动分数（`0-100`）和解释标签，不再提供手工评分表单
- `/`、`/articles`、`/ai` 顶部新增共享来源筛选条，支持 `全选 / 全不选`，浏览偏好保存在浏览器本地 `localStorage`
- 内容卡片保留 `收藏 / 点赞 / 点踩`，并新增局部 `补充反馈` 面板；点赞 / 点踩后会自动展开反馈面板，反馈会先进入反馈池，不会直接改正式策略
- 如果本地 `data/hot-now.sqlite` 内容库损坏，内容页会降级显示错误提示，而不是直接返回 `500`
- 统一站点左侧导航底部支持深色 / 浅色主题切换，主题偏好保存在浏览器本地 `localStorage`，刷新后保持
- `unified shell` 页面已完整接入以浅色为母版的 `Editorial Signal Desk` 双主题：`/`、`/articles`、`/ai`、`/settings/*`
- 统一站点保留左侧品牌块、浅深主题切换和本地 `localStorage` 持久化
- `/settings/*` 现在通过 Fastify 返回统一客户端入口，再由 `Vue 3 + Ant Design Vue` 接管页面渲染
- `/settings/view-rules` 已升级为策略工作台：数值权重、LLM 厂商设置、正式自然语言策略、反馈池、草稿池都收进同一页
- `/settings/sources` 现在会展示即时操作卡、来源统计概览表和 source 库存表，包含总条数、今天发布、今天抓取，以及 Hot / Articles / AI 的入池与展示统计
- `/settings/profile` 现在会展示会话状态、用户名、角色和联系邮箱，不再停留在占位页
- 正式自然语言策略支持 `global / hot / articles / ai` 四个 scope；保存后会立即对当前内容库发起一次全量 LLM 重算，日常采集完成后会对新增内容做增量重算
- 当前支持的 LLM 厂商是 `DeepSeek`、`MiniMax`、`Kimi`；用户在页面里录入 API key，本地只保存加密后的密文；未配置 `LLM_SETTINGS_MASTER_KEY` 时页面仍可保存规则文本，但不会启用自然语言匹配
- Legacy 报告页（当前仍保留）：`/history`、`/reports/:date`、`/control`
- legacy `/history`、`/control` 与 `/reports/:date` 的 fallback notice 轻量跟随共享主题资源
- 手动采集：`POST /actions/collect`
- 手动发送最新报告：`POST /actions/send-latest-email`
- 兼容别名：`POST /actions/run`（等价于手动采集）
- 内容反馈写入：`POST /actions/content/:id/feedback-pool`
- LLM / 规则工作台动作：`POST /actions/view-rules/provider-settings`、`POST /actions/view-rules/provider-settings/delete`、`POST /actions/view-rules/nl-rules`
- 反馈池与草稿池动作：`POST /actions/feedback-pool/:id/create-draft`、`POST /actions/feedback-pool/:id/delete`、`POST /actions/feedback-pool/clear`、`POST /actions/strategy-drafts/:id/save`、`POST /actions/strategy-drafts/:id/delete`
- 内容导航保持统一内容池，但会对匹配导航语义的 source 做优先展示：`36氪` / `36氪快讯` 优先进入热点页，`爱范儿` 优先进入 AI 页，`36氪` / `爱范儿` / `IT之家` 优先进入文章页

统一站点默认启用单用户登录壳层，`AUTH_USERNAME`、`AUTH_PASSWORD`、`SESSION_SECRET` 是必填环境变量。auth 开启后，内容菜单保持公开可读，但系统菜单和所有写操作仍然要求登录；`content_sources.is_enabled` 决定哪些 source 参与采集，`/settings/sources` 现在可以直接启用/停用 source，并分别手动执行一次采集或手动发送最新报告；内容页顶部的来源筛选只影响当前浏览结果，不会改 source 启用状态；legacy `/control` 也同步提供采集与发信动作。

当前内置 RSS 源包括：

- `Juya AI Daily`：`https://imjuya.github.io/juya-ai-daily/rss.xml`
- `OpenAI`：`https://openai.com/news/rss.xml`
- `Google AI`：`https://blog.google/technology/ai/rss/`
- `36氪`：`https://36kr.com/feed`
- `36氪快讯`：`https://36kr.com/feed-newsflash`
- `TechCrunch AI`：`https://techcrunch.com/category/artificial-intelligence/feed/`
- `爱范儿`：`https://www.ifanr.com/feed`
- `IT之家`：`https://www.ithome.com/rss/`

## 配置

- `config/hot-now.config.json`：服务端口、`collectionSchedule` 采集周期、`mailSchedule` 发信时间、`manualActions` 手动动作开关、报告目录，以及兼容旧逻辑的 `source.rssUrl`
- 环境变量：SMTP 主机、端口、发件人、授权码、收件人、网页基础地址、统一站点登录凭据与会话密钥，以及可选的 `LLM_SETTINGS_MASTER_KEY`

默认配置下：

- 采集任务每 `10` 分钟执行一次
- 发信任务每天 `10:00`（`Asia/Shanghai`）执行一次
- 两个任务都可以在页面中手动触发

默认报告目录是 `data/reports/<YYYY-MM-DD>/`，其中会保存：

- `report.json`：包含 `sourceKinds`、`issueUrls`、`sourceFailureCount` 等多源元信息
- `report.html`：展示“多源热点汇总”页面，而不是单一日报文案
- `run-meta.json`：包含 `mailStatus`；采集链路写入 `not-sent-by-collection`，独立发信成功后才会出现 `sent`

默认恢复快照目录是 `data/recovery-backups/<YYYYMMDD-HHmmss>/`，其中会保存：

- `hot-now.sqlite`：已通过完整性校验的 verified snapshot
- `manifest.json`：快照时间、源库路径、完整性结果和表计数摘要

## 验证

- 相关测试：已通过
- 类型构建：已通过
- 系统页客户端构建：已通过
- Playwright MCP 本地验收通过：`/login` 登录成功；`/`、`/articles`、`/ai`、`/settings/view-rules`、`/settings/sources`、`/settings/profile`、`/history`、`/control` 访问正常；浅色主题切换后 `data-theme=light` 且 `localStorage['hot-now-theme']='light'`，刷新后保持；切回深色后 `data-theme=dark` 且刷新后保持；内容页来源筛选写入 `localStorage['hot-now-content-sources']` 后刷新仍保留
- 如果要手动验证新的自然语言策略链路，先配置 `LLM_SETTINGS_MASTER_KEY`，再在 `/settings/view-rules` 保存厂商设置和正式规则，确认页面出现最新重算结果；然后到内容页验证反馈面板、反馈池和草稿池的联动
