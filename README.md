# hot-now

本地单机运行的每日热点应用。它会拉取 `juya-ai-daily` RSS、抓取原文、做规则聚类、生成 HTML/JSON 报告，并通过 QQ 邮箱 SMTP 发送邮件。

## 本地启动

1. 安装依赖：`npm install`
2. 检查配置文件：`config/hot-now.config.json`
3. 通过环境变量提供 SMTP 和页面地址

```bash
export SMTP_HOST="smtp.qq.com"
export SMTP_PORT="465"
export SMTP_SECURE="true"
export SMTP_USER="your-qq-mail@qq.com"
export SMTP_PASS="your-qq-smtp-auth-code"
export MAIL_TO="receiver@example.com"
export BASE_URL="http://127.0.0.1:3010"
```

4. 启动开发服务：`npm run dev`

QQ 邮箱这里要填的是 SMTP 授权码，不是网页登录密码。

## 页面

- 最新报告：`/`
- 历史报告：`/history`
- 控制台：`/control`

控制台支持查看当前计划时间、收件邮箱和手动触发一次任务。

## 配置

- `config/hot-now.config.json`：服务端口、每日执行时间、热点数量、报告目录、RSS 源、是否允许手动触发
- 环境变量：SMTP 主机、端口、发件人、授权码、收件人、网页基础地址

默认报告目录是 `data/reports/<YYYY-MM-DD>/`，其中会保存：

- `report.json`
- `report.html`
- `run-meta.json`

## 验证

- 运行测试：`npm run test`
- 类型构建：`npm run build`
