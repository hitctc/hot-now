# hot-now

本地单机运行的科技资讯编辑台。它会按固定周期拉取多个已启用的 RSS 源、抓取原文、做规则聚类、按系统百分制评分排序内容、生成多源汇总的 HTML/JSON 报告；邮件发送与采集解耦，可按每日固定时间或手动触发，对最新一份报告单独发信。

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
```

4. 启动开发服务：

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

`dev:local` 会先检查本地 `3030` 端口；如果已有旧的开发监听进程占着这个端口，它会先停掉旧进程，再启动新的服务。

QQ 邮箱这里要填的是 SMTP 授权码，不是网页登录密码。

## 页面

- 健康检查：`/health`
- 登录页：`/login`
- 统一站点内容菜单（未登录也可访问）：`/`、`/articles`、`/ai`
- 统一站点系统菜单（登录后访问）：`/settings/view-rules`、`/settings/sources`、`/settings/profile`
- 内容页统一展示系统自动分数（`0-100`）和解释标签，不再提供手工评分表单
- 如果本地 `data/hot-now.sqlite` 内容库损坏，内容页会降级显示错误提示，而不是直接返回 `500`
- 统一站点左侧导航底部支持深色 / 浅色主题切换，主题偏好保存在浏览器本地 `localStorage`，刷新后保持
- `unified shell` 页面已完整接入以浅色为母版的 `Editorial Signal Desk` 双主题：`/`、`/articles`、`/ai`、`/settings/*`
- 统一站点保留左侧品牌块、浅深主题切换和本地 `localStorage` 持久化
- Legacy 报告页（当前仍保留）：`/history`、`/reports/:date`、`/control`
- legacy `/history`、`/control` 与 `/reports/:date` 的 fallback notice 轻量跟随共享主题资源
- 手动采集：`POST /actions/collect`
- 手动发送最新报告：`POST /actions/send-latest-email`
- 兼容别名：`POST /actions/run`（等价于手动采集）
- 内容导航保持统一内容池，但会对匹配导航语义的 source 做优先展示：`36氪` / `36氪快讯` 优先进入热点页，`爱范儿` 优先进入 AI 页，`36氪` / `爱范儿` / `IT之家` 优先进入文章页

统一站点默认启用单用户登录壳层，`AUTH_USERNAME`、`AUTH_PASSWORD`、`SESSION_SECRET` 是必填环境变量。auth 开启后，内容菜单保持公开可读，但系统菜单和所有写操作仍然要求登录；`content_sources.is_enabled` 决定哪些 source 参与采集，`/settings/sources` 现在可以直接启用/停用 source，并分别手动执行一次采集或手动发送最新报告；legacy `/control` 也同步提供这两个动作。

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
- 环境变量：SMTP 主机、端口、发件人、授权码、收件人、网页基础地址，以及统一站点登录凭据与会话密钥

默认配置下：

- 采集任务每 `10` 分钟执行一次
- 发信任务每天 `10:00`（`Asia/Shanghai`）执行一次
- 两个任务都可以在页面中手动触发

默认报告目录是 `data/reports/<YYYY-MM-DD>/`，其中会保存：

- `report.json`：包含 `sourceKinds`、`issueUrls`、`sourceFailureCount` 等多源元信息
- `report.html`：展示“多源热点汇总”页面，而不是单一日报文案
- `run-meta.json`：包含 `mailStatus`；采集链路写入 `not-sent-by-collection`，独立发信成功后才会出现 `sent`

## 验证

- 相关测试：已通过
- 类型构建：已通过
- Playwright MCP 本地验收通过：`/login` 登录成功；`/`、`/articles`、`/ai`、`/settings/view-rules`、`/settings/sources`、`/settings/profile`、`/history`、`/control` 访问正常；浅色主题切换后 `data-theme=light` 且 `localStorage['hot-now-theme']='light'`，刷新后保持；切回深色后 `data-theme=dark` 且刷新后保持
