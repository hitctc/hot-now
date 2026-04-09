# hot-now

本地单机运行的科技资讯编辑台。它会按固定周期拉取多个已启用的 RSS 源、抓取原文、做规则聚类、按系统百分制评分排序内容、生成多源汇总的 HTML/JSON 报告；邮件发送与采集解耦，可按每日固定时间或手动触发，对最新一份报告单独发信。统一站点继续由 Fastify 托管路由和登录态，但 `/settings/*` 系统页现在已经切到 `Vue 3 + Vite + Ant Design Vue + Tailwind CSS`。

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
export AUTH_USERNAME="admin"
export AUTH_PASSWORD="replace-with-strong-password"
export SESSION_SECRET="replace-with-long-random-secret"
export LLM_SETTINGS_MASTER_KEY="replace-with-local-master-key"
export HOT_NOW_CLIENT_DEV_ORIGIN="http://127.0.0.1:35173"
```

`LLM_SETTINGS_MASTER_KEY` 现在是可选覆盖项；如果你不单独配置，系统会回退使用 `SESSION_SECRET` 继续加密保存厂商 API key。
`HOT_NOW_CLIENT_DEV_ORIGIN` 也是可选开发辅助项；`npm run dev` 默认会把 Vite dev server 拉到 `http://127.0.0.1:35173`，并按这个地址接入，让 `3030` 页面直接拿到 HMR 和 Vue DevTools。只有你想改成别的开发端口时，才需要显式覆盖它。
本地开发不再要求手工配置 `WECHAT_RESOLVER_BASE_URL`、`WECHAT_RESOLVER_TOKEN`；`npm run dev` 会自动拉起仓库内置的本地公众号解析 sidecar。只有你想覆盖到远端 relay 时，才需要显式配置这两个环境变量。

4. 如果这次改动涉及 unified shell 客户端页面，先构建最新客户端资源：`npm run build:client`
5. 启动开发服务：

- 标准方式：

```bash
npm run dev
```

  这条命令现在会一起拉起 Fastify、Vite dev server 和本地公众号解析 sidecar；继续打开 `http://127.0.0.1:3030/...` 即可直接使用 Vue DevTools，不需要再手动开第二个终端。
  `npm run dev` 现在只读取仓库根目录的 `.env`；后续开发统一把共享配置和每台设备自己的敏感项都收口到这一份文件里。若本地还残留旧的 `.env.local`，脚本会明确提示它已被忽略。默认情况下它会自动回收本地 `3030` 端口，并在未显式配置远端 resolver 时自动启用本地 sidecar。

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

- 健康检查：`/health`
- 登录页：`/login`
- 统一站点内容菜单（未登录也可访问）：`/`、`/ai-new`、`/ai-hot`
- 统一站点系统菜单（登录后访问）：`/settings/view-rules`、`/settings/sources`、`/settings/profile`
- 内容页统一展示系统自动分数（`0-100`）和解释标签，不再提供手工评分表单
- `/`、`/ai-new`、`/ai-hot` 顶部新增共享来源筛选条，支持 `全选 / 全不选`，浏览偏好保存在浏览器本地 `localStorage`
- `/`、`/ai-new`、`/ai-hot` 现在同时提供共享排序切换：`按发布时间`、`按评分`；排序偏好保存在浏览器本地 `localStorage['hot-now-content-sort']`
- `/`、`/ai-new`、`/ai-hot` 顶部现在还提供共享标题搜索框；搜索只匹配标题，按回车或点击按钮才生效，关键词保存在浏览器本地 `localStorage['hot-now-content-search']`
- `/api/content/ai-new?page=<n>` 与 `/api/content/ai-hot?page=<n>` 现在支持分页，固定 `50` 条 / 页
- `AI 新讯` 固定按最近 `24` 小时窗口和 `ai_new` 门规则构建结果集；`AI 热点` 固定按 `ai_hot` 门规则与热点形成逻辑构建结果集，不会被额外压成 `24` 小时
- `AI 新讯` 与 `AI 热点` 的标准内容卡片会在标题左侧显示连续排序序号；序号跨分页延续，不会在新页重新从 `1` 开始
- 内容页顶部的来源筛选与排序控制会保持悬浮；翻页后会自动回到顶部，长列表滚动时右下角会出现“回到顶部”按钮
- 内容卡片现在只保留局部 `补充反馈` 面板，反馈会先进入反馈池，不会直接改正式策略
- 如果本地 `data/hot-now.sqlite` 内容库损坏，内容页会降级显示错误提示，而不是直接返回 `500`
- 统一站点左侧导航底部支持深色 / 浅色主题切换，主题偏好保存在浏览器本地 `localStorage`，刷新后保持
- `unified shell` 页面已完整切到 `Notion Workspace` 风格的黑白灰双主题：`/`、`/ai-new`、`/ai-hot`、`/settings/*`
- Vue 客户端样式栈现在是 `Vue 3 + Vite + Ant Design Vue + Tailwind CSS`；统一主题源收口到 `src/client/theme/editorialTokens.ts`
- `src/client/styles/tailwind.css` 只保留基础样式、主题变量和少量 AntD 深层覆写，不再新增大型 CSS 皮肤文件
- 统一站点保留左侧品牌块、浅深主题切换和本地 `localStorage` 持久化
- `/settings/*` 现在通过 Fastify 返回统一客户端入口，再由 `Vue 3 + Ant Design Vue` 接管页面渲染
- `/`、`/ai-new`、`/ai-hot` 现在也通过 Fastify 返回统一客户端入口，再由 `Vue 3 + Ant Design Vue` 内容页读取 `/api/content/ai-new`、`/api/content/ai-hot` 渲染
- `/settings/view-rules` 已升级为门槛型策略工作台：只保留 `基础入池门 / AI 新讯入池门 / AI 热点入池门 / 首条精选门` 四道门，每道门只维护 `启用开关 + 自然语言规则文本`，并继续收口 LLM 厂商设置、反馈池、草稿池；全量重算运行中可手动中断，已完成的评估结果会继续保留
- `/settings/sources` 现在会展示即时操作卡、来源统计概览表和 source 库存表，包含总条数、今天发布、今天抓取，以及 `AI 新讯 / AI 热点` 的入池与展示统计；概览区还会显示系统真实下一次自动采集时间，格式为 `18:40（还有 6 分钟）`
- `/settings/sources` 现在支持可视化新增 / 编辑 / 删除自定义来源：RSS 来源只需要填写 `RSS URL`；公众号来源只需要填写 `公众号名称`，文章链接可选但建议一起填写，其余 `kind / 来源名称 / 来源主页 / bridge 细节` 由系统在保存时自动生成；本地开发默认使用仓库内置公众号解析 sidecar，保存成功后会立即自动补拉这条新来源的首批内容
- `/settings/sources` 现在支持逐 source 配置“选中该来源时全量展示”；开启后，该来源不会在内容页首次默认勾选，只有用户显式勾选后才会按全量模式展示
- `/settings/profile` 现在会展示会话状态、用户名、角色和联系邮箱，不再停留在占位页
- 正式自然语言策略现在只认 `base / ai_new / ai_hot / hero` 四个内部 gate scope：
  - `base`：基础入池门
  - `ai_new`：AI 新讯入池门
  - `ai_hot`：AI 热点入池门
  - `hero`：首条精选门
  保存后会立即对当前内容库发起一次全量 LLM 重算，日常采集完成后会对新增内容做增量重算；运行中的全量重算支持手动中断，已跑完的内容会继续生效；`hero` 只参与 `/` 与 `/ai-new` 的精选主卡挑选
- 当前支持的 LLM 厂商是 `DeepSeek`、`MiniMax`、`Kimi`；用户在页面里录入 API key，本地只保存加密后的密文；未显式配置 `LLM_SETTINGS_MASTER_KEY` 时，系统会回退使用 `SESSION_SECRET` 作为本地加密 key
- Legacy 报告页（当前仍保留）：`/history`、`/reports/:date`、`/control`
- legacy `/history`、`/control` 与 `/reports/:date` 的 fallback notice 轻量跟随共享主题资源
- 手动采集：`POST /actions/collect`
- 手动发送最新报告：`POST /actions/send-latest-email`
- 兼容别名：`POST /actions/run`（等价于手动采集）
- 内容反馈写入：`POST /actions/content/:id/feedback-pool`
- LLM / 规则工作台动作：`POST /actions/view-rules/provider-settings`、`POST /actions/view-rules/provider-settings/activation`、`POST /actions/view-rules/provider-settings/delete`、`POST /actions/view-rules/nl-rules`、`POST /actions/view-rules/nl-rules/cancel`
- 反馈池与草稿池动作：`POST /actions/feedback-pool/:id/create-draft`、`POST /actions/feedback-pool/:id/delete`、`POST /actions/feedback-pool/clear`、`POST /actions/strategy-drafts/:id/save`、`POST /actions/strategy-drafts/:id/delete`
- 内容导航已收口为 AI-first：`/` 与 `/ai-new` 等同 `AI 新讯`，`/ai-hot` 承接 `AI 热点`，`/articles` 已移除

统一站点默认启用单用户登录壳层，`AUTH_USERNAME`、`AUTH_PASSWORD`、`SESSION_SECRET` 是必填环境变量。auth 开启后，内容菜单保持公开可读，但系统菜单和所有写操作仍然要求登录；`content_sources.is_enabled` 决定哪些 source 参与采集，`content_sources.show_all_when_selected` 决定该 source 在内容页被显式勾选时是否全量展示；`/settings/sources` 现在可以直接启用/停用 source、切换“选中时全量展示”、新增 / 编辑 / 删除自定义 RSS 或微信公众号桥接来源，其中 RSS 只需要 `RSS URL`，公众号只需要 `公众号名称` 和可选文章链接，其余内部字段会在保存时自动生成；来源保存成功后，系统会自动补拉该来源的首批内容，不需要再手动先跑一次采集；内容页顶部的来源筛选和排序只影响当前浏览结果，不会改 source 启用状态；legacy `/control` 也同步提供采集与发信动作。

当前内置 RSS 源包括：

- `Juya AI Daily`：`https://imjuya.github.io/juya-ai-daily/rss.xml`
- `OpenAI`：`https://openai.com/news/rss.xml`
- `Google AI`：`https://blog.google/technology/ai/rss/`
- `36氪`：`https://36kr.com/feed`
- `36氪快讯`：`https://36kr.com/feed-newsflash`
- `TechCrunch AI`：`https://techcrunch.com/category/artificial-intelligence/feed/`
- `爱范儿`：`https://www.ifanr.com/feed`
- `IT之家`：`https://www.ithome.com/rss/`
- `知乎每日精选`：`https://www.zhihu.com/rss`
- `少数派`：`https://sspai.com/feed`
- `站长之家`：`https://app.chinaz.com/?app=rss`
- `虎嗅网`：`https://www.huxiu.com/rss/0.xml`
- `数字尾巴`：`https://www.dgtle.com/rss/dgtle.xml`
- `Cnblogs`：`https://feed.cnblogs.com/blog/sitehome/rss`
- `V2EX`：`https://www.v2ex.com/feed/tab/tech.xml`
- `创业邦`：`https://www.cyzone.cn/rss/`
- `极客公园`：`https://www.geekpark.net/rss`
- `小众软件`：`https://feeds.appinn.com/appinns/`
- `维基百科`：`https://feedx.net/rss/wikiindex.xml`
- `光明日报`：`https://feedx.net/rss/guangmingribao.xml`
- `月光博客`：`https://www.williamlong.info/rss.xml`

## 配置

- `config/hot-now.config.json`：服务端口、`collectionSchedule` 采集周期、`mailSchedule` 发信时间、`manualActions` 手动动作开关、报告目录，以及兼容旧逻辑的 `source.rssUrl`
- 环境变量：SMTP 主机、端口、发件人、授权码、收件人、网页基础地址、统一站点登录凭据与会话密钥、作为独立覆盖项的 `LLM_SETTINGS_MASTER_KEY`，以及用于覆盖本地公众号解析 sidecar 或接入远端 relay 的 `WECHAT_RESOLVER_BASE_URL`、`WECHAT_RESOLVER_TOKEN`

默认配置下：

- 采集任务每 `10` 分钟执行一次
- 发信任务每天 `10:00`（`Asia/Shanghai`）执行一次
- 两个任务都可以在页面中手动触发
- `/settings/sources` 会直接按当前采集调度显示下一次自动采集时间；调度关闭时回显 `未启用定时采集`

默认报告目录是 `data/reports/<YYYY-MM-DD>/`，其中会保存：

- `report.json`：包含 `sourceKinds`、`issueUrls`、`sourceFailureCount` 等多源元信息
- `report.html`：展示“多源热点汇总”页面，而不是单一日报文案
- `run-meta.json`：包含 `mailStatus`；采集链路写入 `not-sent-by-collection`，独立发信成功后才会出现 `sent`

这些报告产物只保留在本地 `data/` 目录，不再作为 git 产物提交。

默认恢复快照目录是 `data/recovery-backups/<YYYYMMDD-HHmmss>/`，其中会保存：

- `hot-now.sqlite`：已通过完整性校验的 verified snapshot
- `manifest.json`：快照时间、源库路径、完整性结果和表计数摘要

这些恢复快照同样默认只保留在本地 `data/` 目录；如需跨设备使用，手动复制快照文件即可。

## 验证

- 相关测试：已通过
- 类型构建：已通过
- 系统页客户端构建：已通过
- Playwright MCP 本地验收通过：`/login` 登录成功；`/`、`/settings/view-rules`、`/settings/sources`、`/settings/profile`、`/history`、`/control` 访问正常；浅色主题切换后 `data-theme=light` 且 `localStorage['hot-now-theme']='light'`，刷新后保持；切回深色后 `data-theme=dark` 且刷新后保持；内容页来源筛选写入 `localStorage['hot-now-content-sources']`、排序偏好写入 `localStorage['hot-now-content-sort']`、标题搜索词写入 `localStorage['hot-now-content-search']` 后刷新仍保留
- 如果要手动验证新的自然语言策略链路，直接在 `/settings/view-rules` 先为目标厂商保存 API key，再单独启用该厂商并保存正式规则即可；如需把厂商配置和会话密钥分开管理，再额外配置 `LLM_SETTINGS_MASTER_KEY`；然后到内容页验证反馈面板、反馈池和草稿池的联动
