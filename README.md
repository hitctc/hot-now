# hot-now

本地单机运行的科技资讯控制台。它会拉取多个已启用的 RSS 源、抓取原文、做规则聚类、按系统百分制评分排序内容、生成多源汇总的 HTML/JSON 报告，并通过 QQ 邮箱 SMTP 发送邮件。

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

QQ 邮箱这里要填的是 SMTP 授权码，不是网页登录密码。

## 页面

- 健康检查：`/health`
- 登录页：`/login`
- 统一站点菜单（登录后访问）：`/`、`/articles`、`/ai`、`/settings/view-rules`、`/settings/sources`、`/settings/profile`
- 内容页统一展示系统自动分数（`0-100`）和解释标签，不再提供手工评分表单
- 统一站点左侧导航底部支持深色 / 浅色主题切换，主题偏好保存在浏览器本地 `localStorage`，刷新后保持
- `unified shell` 页面已完整接入赛博双主题：`/`、`/articles`、`/ai`、`/settings/*`
- Legacy 报告页（当前仍保留）：`/history`、`/reports/:date`、`/control`
- legacy `/history`、`/control` 与 `/reports/:date` 的 fallback notice 轻量跟随共享主题资源
- 手动触发任务：`POST /actions/run`

统一站点默认启用单用户登录壳层，`AUTH_USERNAME`、`AUTH_PASSWORD`、`SESSION_SECRET` 是必填环境变量。`content_sources.is_enabled` 决定哪些 source 参与采集，`/settings/sources` 现在可以直接启用/停用 source，并在统一站点里手动执行一次全量采集。

## 配置

- `config/hot-now.config.json`：服务端口、每日执行时间、热点数量、报告目录、RSS 源、是否允许手动触发
- 环境变量：SMTP 主机、端口、发件人、授权码、收件人、网页基础地址，以及统一站点登录凭据与会话密钥

默认报告目录是 `data/reports/<YYYY-MM-DD>/`，其中会保存：

- `report.json`：包含 `sourceKinds`、`issueUrls`、`sourceFailureCount` 等多源元信息
- `report.html`：展示“多源热点汇总”页面，而不是单一日报文案
- `run-meta.json`

## 验证

- 相关测试：已通过
- 类型构建：已通过
- Playwright MCP 本地验收通过：`/login` 登录成功；`/`、`/articles`、`/ai`、`/settings/view-rules`、`/settings/sources`、`/settings/profile`、`/history`、`/control` 访问正常；浅色主题切换后 `data-theme=light` 且 `localStorage['hot-now-theme']='light'`，刷新后保持；切回深色后 `data-theme=dark` 且刷新后保持
