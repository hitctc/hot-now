# hot-now

本地单机运行的科技资讯编辑台。它会按固定周期拉取多个已启用的 RSS 来源；Twitter 已拆成 `/settings/sources` 里的两条独立手动链路：`账号采集` 和 `关键词搜索`；Hacker News、B 站、微信公众号 RSS 和微博热搜也拆成独立手动链路。扩展来源都不再并入默认定时采集。`AI 时间线` 只读取外部 Markdown feed 的 `json ai-timeline-feed` 数据块，不再在应用内维护官方源白名单、采集规则或本地候选池；相关 API 与 S 级事件提醒继续运行，但页面入口当前暂时下架。普通采集结果会经过规则聚类、系统百分制评分和排序，生成多源汇总的 HTML/JSON 报告。统一站点继续由 Fastify 托管路由和登录态，但 `/settings/*` 系统页现在已经切到 `Vue 3 + Vite + Ant Design Vue + Tailwind CSS`。

## 本地启动

1. 安装依赖：`npm install`
2. 检查配置文件：`config/hot-now.config.json`
3. 准备本地环境变量，推荐直接写到 `.env`

```bash
export SMTP_HOST="smtp.qq.com"
export SMTP_PORT="465"
export SMTP_SECURE="true"
export SMTP_USER="your-qq-mail@qq.com"
export SMTP_PASS="your-qq-smtp-auth-code"
export MAIL_TO="receiver@example.com"
export BASE_URL="http://127.0.0.1:3030"
export PUBLIC_BASE_URL="https://now.achuan.cc"
export AUTH_USERNAME="admin"
export AUTH_PASSWORD="replace-with-strong-password"
export SESSION_SECRET="replace-with-long-random-secret"
export AUTH_SESSION_TTL_SECONDS="604800"
export HOT_NOW_SLOW_REQUEST_MS="500"
export LLM_SETTINGS_MASTER_KEY="replace-with-local-master-key"
export CREATIVE_API_TOKEN="replace-with-creative-api-token"
export HERMES_API_BASE_URL="https://hermes.example.com"
export HERMES_API_TOKEN="replace-with-hermes-api-token"
export TWITTER_API_KEY=""
export HOT_NOW_DATABASE_FILE="/srv/hot-now/shared/data/hot-now.sqlite"
export HOT_NOW_REPORT_DATA_DIR="/srv/hot-now/shared/data/reports"
export AI_TIMELINE_FEED_URL="https://now.achuan.cc/feeds/ai-timeline-feed.md"
export AI_TIMELINE_FEED_FILE="/srv/hot-now/shared/data/feeds/ai-timeline-feed.md"
export AI_TIMELINE_FEED_MANIFEST_FILE="/srv/hot-now/shared/data/feeds/ai-timeline-feed-manifest.json"
export AI_TIMELINE_FEED_MAX_FALLBACK_VERSIONS="10"
export FEISHU_ALERT_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/replace-with-secret"
export HOT_NOW_CLIENT_DEV_ORIGIN="http://127.0.0.1:35173"
```

`LLM_SETTINGS_MASTER_KEY` 现在是可选覆盖项；如果你不单独配置，系统会回退使用 `SESSION_SECRET` 继续加密保存厂商 API key。
`CREATIVE_API_TOKEN` 只用于外部智能体调用创作 API；调用方从自己的密钥管理注入，不要读取其他设备的 `.env` 或写入 prompt。`HERMES_API_BASE_URL`、`HERMES_API_TOKEN` 只在使用 Hermes 写作、溯源、图片或监控链路时需要。
`TWITTER_API_KEY` 是 TwitterAPI.io 的敏感密钥，只在需要执行 Twitter 账号采集或 Twitter 关键词搜索时配置；不配置时仍可在后台维护账号和关键词列表，但两类 Twitter 手动采集都会不可用，RSS、微信公众号 RSS、Hacker News、B 站和微博热搜不受影响。
`AUTH_SESSION_TTL_SECONDS` 是可选的登录会话固定有效期，单位为秒；不配置时默认 `604800` 秒，也就是 7 天。当前登录态不是滑动续期，到期后需要重新登录。
`HOT_NOW_SLOW_REQUEST_MS` 是可选的服务端慢请求阈值，单位为毫秒；默认只记录耗时不低于 `500` 毫秒的请求。日志只包含路由模板、状态码、耗时和可用时的响应字节数，不记录查询参数或正文。
`PUBLIC_BASE_URL` 是对外可点击的正式站点地址，飞书提醒和邮件里的报告 / 时间线链接都使用它；不配置时会回退到 `BASE_URL`，用于兼容旧环境。
`HOT_NOW_DATABASE_FILE`、`HOT_NOW_REPORT_DATA_DIR` 是可选生产覆盖项，用来把 SQLite 和报告目录从代码树移到 `/srv/hot-now/shared/data`；本地开发不填时，系统继续按 `config/hot-now.config.json` 里的相对路径运行。
`AI_TIMELINE_FEED_URL`、`AI_TIMELINE_FEED_FILE`、`AI_TIMELINE_FEED_MANIFEST_FILE` 和 `AI_TIMELINE_FEED_MAX_FALLBACK_VERSIONS` 是可选的外部 AI 官方发布时间线 feed 配置；服务端接口优先读取本地稳定文件和回退版本，公网 URL 只作为兜底来源，避免生产接口每次请求都绕公网访问自己。
`FEISHU_ALERT_WEBHOOK_URL` 是 S 级 AI 时间线事件飞书提醒的敏感 webhook，只能放在 `.env` 或生产环境变量里，不要写进仓库；缺失时飞书通道会失败，但邮件备份通道仍会尝试发送。
`HOT_NOW_CLIENT_DEV_ORIGIN` 也是可选开发辅助项；`npm run dev` 默认会把 Vite dev server 拉到 `http://127.0.0.1:35173`，并按这个地址接入，让 `3030` 页面直接拿到 HMR 和 Vue DevTools。只有你想改成别的开发端口时，才需要显式覆盖它。
本地开发不再要求手工配置 `WECHAT_RESOLVER_BASE_URL`、`WECHAT_RESOLVER_TOKEN`；`npm run dev` 会自动拉起仓库内置的本地公众号解析 sidecar。只有你想覆盖到远端 relay 时，才需要显式配置这两个环境变量。

4. 如果这次改动涉及 unified shell 客户端页面，先构建最新客户端资源：`npm run build:client`
5. 启动开发服务：

- 标准方式：

```bash
npm run dev
```

  这条命令现在会一起拉起 Fastify、Vite dev server 和本地公众号解析 sidecar；继续打开 `http://127.0.0.1:3030/...` 即可直接使用 Vue DevTools，不需要再手动开第二个终端。
  `npm run dev` 现在只读取仓库根目录的 `.env`；后续开发统一把共享配置和每台设备自己的敏感项都收口到这一份文件里。若本地还残留旧的 `.env.local`，脚本会明确提示它已被忽略。默认情况下它会先清理本地 `3030` 后端端口、`35173` Vite 调试端口，并在未显式配置远端 resolver 时同步清理和启用本地 sidecar。

- 仅启动 Vite 客户端调试时：

```bash
npm run dev:client
```

  需要在浏览器里使用 Vue DevTools 点击组件并定位到源码时，优先用这条命令；当前项目会在 `dev:client` 下自动启用 `vite-plugin-vue-devtools`，生产构建不会注入这个调试工具。

- 本地便捷方式：

```bash
npm run dev:local
```

`dev:local` 现在只保留为兼容入口，内部会直接转发到 `npm run dev` 并提示后续统一使用 `npm run dev`。

QQ 邮箱这里要填的是 SMTP 授权码，不是网页登录密码。

## 本地数据库可靠性

- `data/` 整个目录现在都作为本地运行产物忽略，不再提交到 git
- `data/hot-now.sqlite` 是运行中的 live 库，只在当前设备本地使用
- 跨设备开发、服务器初始化或坏库恢复，需要手动复制 `data/recovery-backups/<timestamp>/hot-now.sqlite`
- 每份标准快照都应带同目录下的 `manifest.json`
- 新增数据库维护命令：
  - `npm run db:check`
  - `npm run db:snapshot`
  - `npm run db:restore -- data/recovery-backups/<timestamp>/hot-now.sqlite`
- 应用正常退出时会执行 SQLite `wal_checkpoint(TRUNCATE)`，把已提交写入回刷到主库
- 如果启动时报数据库损坏，先执行 `npm run db:check`，再从最近一份 verified snapshot 恢复

## 页面

- 公开内容：`/`、`/ai-new`、`/ai-hot`。
- 登录系统页：`/settings/view-rules`、`/settings/sources`、`/settings/wechat-mp`、`/settings/profile`。
- 创作工作台：`/creative/source-items`、`/creative/finished-articles`、`/creative/short-source-items`、`/creative/short-finished-articles`、`/daily-digest`、`/monitor`。
- 兼容入口：`/history`、`/reports/:date`、`/control`；健康检查：`/health`。
- AI 时间线 feed：`/feeds/ai-timeline-feed.md`。页面 `/ai-timeline` 与 `/settings/ai-timeline` 当前暂时下架；相关 API 与 S 级提醒链路仍可运行。

模块化、测试和重构规范见 [开发与模块化规范](docs/开发与模块化规范.md)。接口细节以服务端路由和测试为准，避免在本 README 复制完整接口清单。

## 配置

- `config/hot-now.config.json`：服务端口、`collectionSchedule` 采集周期、`mailSchedule` 发信时间、`aiTimelineAlerts` S 级事件提醒周期和通道开关、`manualActions` 手动动作开关、报告目录，以及兼容旧逻辑的 `source.rssUrl`
- 环境变量：SMTP 主机、端口、发件人、授权码、收件人、网页基础地址 `BASE_URL`、用户可点击的正式站点地址 `PUBLIC_BASE_URL`、统一站点登录凭据、会话密钥与可选会话有效期 `AUTH_SESSION_TTL_SECONDS`、慢请求阈值 `HOT_NOW_SLOW_REQUEST_MS`、作为独立覆盖项的 `LLM_SETTINGS_MASTER_KEY`、外部创作智能体 token `CREATIVE_API_TOKEN`、Hermes 对接地址与 token `HERMES_API_BASE_URL` / `HERMES_API_TOKEN`、TwitterAPI.io 账号采集 / 关键词搜索密钥 `TWITTER_API_KEY`、S 级 AI 时间线事件飞书 webhook `FEISHU_ALERT_WEBHOOK_URL`、生产路径覆盖项 `HOT_NOW_DATABASE_FILE` / `HOT_NOW_REPORT_DATA_DIR`，以及用于覆盖本地公众号解析 sidecar 或接入远端 relay 的 `WECHAT_RESOLVER_BASE_URL`、`WECHAT_RESOLVER_TOKEN`

默认配置下：

- 采集任务每 `10` 分钟执行一次
- 每日早报发信任务默认关闭；如需临时发送最新报告，仍可在页面中手动触发
- S 级 AI 时间线事件提醒每 `5` 分钟检查一次 feed，按 `eventKey` 去重后推送飞书主通道和邮件备份通道
- `/settings/sources` 会直接按当前采集调度显示下一次自动采集时间；调度关闭时回显 `未启用定时采集`
- 未配置 `TWITTER_API_KEY` 时，Twitter 账号手动采集和 Twitter 关键词手动采集都会被标记为不可用，但不会阻断普通 RSS、微信公众号 RSS、Hacker News、B 站、微博热搜采集和报告生成
- Hacker News 搜索不依赖额外密钥；只要后台已有启用中的 query，就可以手动执行
- B 站搜索不依赖额外密钥；只要后台已有启用中的 query，就可以手动执行
- 微信公众号 RSS 不依赖额外密钥；只要后台已有链接，就可以手动执行采集
- 微博热搜榜匹配不依赖额外密钥；只要微博公开热搜接口可用，就可以手动执行固定 AI 关键词匹配
- AI 时间线不依赖应用内采集密钥；Codex 自动化负责生成并上传 Markdown feed，应用只读取 feed 并渲染事件

默认报告目录是 `data/reports/<YYYY-MM-DD>/`，其中会保存：

- `report.json`：包含 `sourceKinds`、`issueUrls`、`sourceFailureCount` 等多源元信息
- `report.html`：展示“多源热点汇总”页面，而不是单一日报文案
- `run-meta.json`：包含 `mailStatus`；采集链路写入 `not-sent-by-collection`，独立发信成功后才会出现 `sent`

这些报告产物只保留在本地 `data/` 目录，不再作为 git 产物提交。

默认恢复快照目录是 `data/recovery-backups/<YYYYMMDD-HHmmss>/`，其中会保存：

- `hot-now.sqlite`：已通过完整性校验的 verified snapshot
- `manifest.json`：快照时间、源库路径、完整性结果和表计数摘要

这些恢复快照同样默认只保留在本地 `data/` 目录；如需跨设备使用，手动复制快照文件即可。

## 单机生产部署

第一版生产部署约定固定为：

- 代码目录：`/srv/hot-now/app`
- 数据目录：`/srv/hot-now/shared/data`
- 生产环境变量：`/srv/hot-now/shared/.env`
- 发布方式：本地 `npm run build` 后用 `rsync` 上传源码和 `dist`，服务器安装 production 依赖后由 `systemd` 重启

生产环境至少需要补齐这两个路径覆盖项：

```bash
HOT_NOW_DATABASE_FILE=/srv/hot-now/shared/data/hot-now.sqlite
HOT_NOW_REPORT_DATA_DIR=/srv/hot-now/shared/data/reports
PUBLIC_BASE_URL=https://now.achuan.cc
AI_TIMELINE_FEED_FILE=/srv/hot-now/shared/data/feeds/ai-timeline-feed.md
AI_TIMELINE_FEED_MANIFEST_FILE=/srv/hot-now/shared/data/feeds/ai-timeline-feed-manifest.json
AI_TIMELINE_FEED_MAX_FALLBACK_VERSIONS=10
```

仓库内已经提供第一版部署模板：

- `scripts/deploy-prod.sh`
- `scripts/pull-prod-data.sh`
- `.deploy.local.env.example`
- `deploy/systemd/hot-now.service`
- `deploy/nginx/hot-now.conf`
- `deploy/sudoers/hot-now-systemctl`

如果需要按这次真实踩坑顺序逐步复现，详细操作记录见：

- `docs/生产部署手册.md`

### 首次部署准备

1. 在服务器安装 `Node`、`npm`、`nginx`、`rsync` 和项目构建依赖
2. 创建目录：
   - `/srv/hot-now/app`
   - `/srv/hot-now/shared/data`
   - `/srv/hot-now/shared/.env`
3. 手工维护生产 `.env`，不要通过发布脚本覆盖
4. 安装 `deploy/systemd/hot-now.service`
5. 安装 `deploy/nginx/hot-now.conf`
6. 安装 `deploy/sudoers/hot-now-systemctl`，让部署用户只对 `hot-now` 的 restart/status 拥有免密 sudo
7. 确认云侧安全组和本机防火墙都放行 `80/443`

### 日常发布

建议先在仓库根目录准备一个**本地不入库**的部署配置文件：

```bash
cp .deploy.local.env.example .deploy.local.env
```

然后把你的真实目标写进 `.deploy.local.env`。脚本会自动读取这个被 `.gitignore` 忽略的文件，这样日常发布就能收口成真正的一条命令：

```bash
./scripts/deploy-prod.sh
```

如果临时想改目标，命令前显式传入 `HOT_NOW_DEPLOY_*` 仍然会覆盖本地文件。

这条脚本会：

- 本地先执行 `npm run build`，再同步代码和 `dist` 到 `/srv/hot-now/app`
- 明确排除 `.git`、`node_modules`、`data`、`.env`
- 在服务器执行 `npm ci --prefer-offline --production`
- 通过免密 `sudo -n systemctl` 重启并检查 `hot-now` 服务
- 最后调用 `http://127.0.0.1:3030/health` 做健康检查

`deploy/nginx/hot-now.conf` 包含 `80 -> 443` 跳转、`now.achuan.cc` HTTPS 反代，以及 `/client/assets/` 下 Vite hash 资源的 Nginx 直出、gzip 与长缓存；安装或更新该模板后需要在服务器执行 `nginx -t` 和 reload，避免静态资源请求继续绕到 Node 进程后被业务接口阻塞。

历史生产配置如果仍为 HTTP/1.1，可在代码部署后执行一次：

```bash
sudo bash /srv/hot-now/app/scripts/enable-nginx-http2.sh
```

脚本只修改 HotNow 的两个 TLS `listen` 指令，会先备份原配置、执行 `nginx -t`，验证通过才 reload；验证或 reload 失败时自动恢复备份。

部署脚本不会触碰：

- `/srv/hot-now/shared/data`
- `/srv/hot-now/shared/.env`

外部 AI 官方发布时间线 feed 推荐目录：

- `/srv/hot-now/shared/data/feeds`
- 稳定文件：`ai-timeline-feed.md`
- manifest：`ai-timeline-feed-manifest.json`
- 版本文件：`ai-timeline-feed-<YYYYMMDDTHHmmssZ>.md`

生成自动化应先上传版本文件，再更新稳定文件和 manifest。公网读取统一走应用路由 `https://now.achuan.cc/feeds/ai-timeline-feed.md`，不要把整个 `/srv/hot-now/shared/data` 直接暴露给 Nginx。

部署前需要先安装 sudoers 规则，推荐用 `visudo` 落成独立文件：

```bash
sudo cp deploy/sudoers/hot-now-systemctl /etc/sudoers.d/hot-now-systemctl
sudo chmod 440 /etc/sudoers.d/hot-now-systemctl
sudo visudo -cf /etc/sudoers.d/hot-now-systemctl
```

这条规则只放开两条命令：

- `/usr/bin/systemctl restart hot-now`
- `/usr/bin/systemctl status hot-now --no-pager`

不要把 `tctc` 配成全局免密 sudo。

### 拉取生产数据副本到本地

如果本地开发需要对照生产数据，优先拉一份单独副本，不要让开发环境直接读服务器上的 live 数据。

默认命令：

```bash
./scripts/pull-prod-data.sh
```

这条脚本会：

- 复用 `.deploy.local.env` 里的 `HOT_NOW_DEPLOY_HOST` 和 `HOT_NOW_DEPLOY_USER`
- 从 `/srv/hot-now/shared/data` 拉取 `hot-now.sqlite`
- 用 `rsync` 拉取 `reports/`
- 把内容写到本地 `data/prod-sync/`

这条脚本不会做的事：

- 不会修改服务器上的任何文件
- 不会覆盖你当前本地开发正在使用的 `data/` 根目录
- 不会自动改你的本地 `.env`

如果你想直接基于这份副本启动本地开发，不用再手写环境变量，推荐：

```bash
./scripts/dev-prod-sync.sh
```

这条脚本会：

- 固定读取 `data/prod-sync/hot-now.sqlite`
- 固定读取 `data/prod-sync/reports`
- 自动导出 `HOT_NOW_DATABASE_FILE` 和 `HOT_NOW_REPORT_DATA_DIR`
- 然后执行 `npm run dev`

如果 `data/prod-sync/` 里还没有最新副本，脚本会直接提示你先执行 `./scripts/pull-prod-data.sh`。

### 本地 SFTP 浏览模板

如果你想在 VS Code 里浏览服务器上的 `/srv` 目录，仓库里提供一个可共享模板：

- `.vscode/sftp.example.json`

建议做法：

1. 复制模板到你本地自己的 `.vscode/sftp.json`
2. 按你的服务器地址、SSH 用户和私钥路径填写
3. 只把模板提交进仓库，不把真实 `.vscode/sftp.json` 提交进仓库

这样可以保留项目级参考配置，同时避免把机器绑定的私钥路径和个人连接信息写进版本库。

## 验证

- 相关测试：已通过
- 类型构建：已通过
- 系统页客户端构建：已通过
- Playwright MCP 本地验收通过：`/login` 登录成功；`/`、`/settings/view-rules`、`/settings/sources`、`/settings/profile`、`/history`、`/control` 访问正常；浅色主题切换后 `data-theme=light` 且 `localStorage['hot-now-theme']='light'`，刷新后保持；切回深色后 `data-theme=dark` 且刷新后保持；内容页来源筛选写入 `localStorage['hot-now-content-sources']`、Twitter 二级筛选写入 `localStorage['hot-now-twitter-account-filter']` / `localStorage['hot-now-twitter-keyword-filter']`、微信公众号 RSS 二级筛选写入 `localStorage['hot-now-wechat-rss-filter']`、排序偏好写入 `localStorage['hot-now-content-sort']`、标题搜索词写入 `localStorage['hot-now-content-search']` 后刷新仍保留
- 如果要手动验证 `/settings/view-rules`，先检查 `AI 新讯 / AI 热点` 筛选总览与开关保存，再检查反馈池的复制 / 删除 / 清空，以及 LLM 设置的保存 / 启用 / 删除是否正常；如需把厂商配置和会话密钥分开管理，再额外配置 `LLM_SETTINGS_MASTER_KEY`
- 如果要手动验证 Twitter 账号采集，先在 `.env` 配置 `TWITTER_API_KEY`，再到 `/settings/sources` 新增并启用账号，点击“手动采集 Twitter 账号”后确认账号“最近成功 / 最近结果”被回写；如果内容页仍无结果，优先检查“最近结果”里是否出现“本次抓取成功，但没有可入库的新推文。”这类提示；不配置 key 时应只显示不可用提示，普通 RSS 和微信公众号 RSS 采集仍可继续
- 如果要手动验证 Twitter 关键词搜索，先在 `/settings/sources` 新增并启用关键词，确认 `采集启用` 与 `展示启用` 都打开，再点击“手动采集 Twitter 关键词”；当前第一版会限制为“最多处理 5 个已启用关键词、每个关键词最多取前 10 条中文结果”，成功后优先检查关键词“最近成功 / 最近结果”是否回写，再到 `/ai-new`、`/ai-hot` 确认结果是否可见；如果只想停采但保留历史展示，关闭 `采集启用`；如果只想让该关键词命中的内容从内容页消失，关闭 `展示启用`
- 如果要手动验证 Hacker News 搜索，先在 `/settings/sources` 新增并启用至少一个 query，再点击“手动采集 Hacker News”；当前第一版固定按最近 7 天、最多处理 5 个已启用 query、每个 query 最多取前 10 条结果，成功后优先检查 query 的“最近成功 / 最近结果”是否回写，再到 `/ai-new`、`/ai-hot` 确认内容是否已入库并可见
- 如果要手动验证 B 站搜索，先在 `/settings/sources` 新增并启用至少一个 query，再点击“手动采集 B 站搜索”；当前第一版固定为“最多处理 5 个已启用 query、每个 query 最多取前 10 条视频结果”，成功后优先检查 query 的“最近成功 / 最近结果”是否回写，再到 `/ai-new`、`/ai-hot` 确认视频内容是否已入库并可见
- 如果要手动验证微信公众号 RSS，先在 `/settings/sources` 的“微信公众号 RSS”分区批量新增一个或多个 RSS 链接，再点击“手动采集公众号 RSS”；成功后优先检查 RSS 行的“最近成功 / 最近结果”是否回写，再到 `/ai-new`、`/ai-hot` 勾选 `微信公众号 RSS`，并用二级“公众号 RSS 筛选”确认单个 RSS 的内容可筛选
- 如果要手动验证微博热搜榜匹配，直接在 `/settings/sources` 点击“手动匹配微博热搜榜”；当前第一版固定按内置 AI 关键词匹配微博热搜榜，不提供关键词 CRUD，也不做微博全文搜索，成功后优先检查“最近抓取 / 最近成功 / 最近结果”是否回写，再到 `/ai-hot` 确认命中的微博热搜内容是否已入库并可见，同时确认它不会出现在 `/ai-new`
- 如果要手动验证 AI 时间线，先确认 `https://now.achuan.cc/feeds/ai-timeline-feed.md` 可访问且包含 `json ai-timeline-feed` 代码块，再打开 `/api/ai-timeline` 检查 JSON 是否能解析出事件；页面 `/ai-timeline` 与 `/settings/ai-timeline` 当前暂时下架，不作为验收入口。
