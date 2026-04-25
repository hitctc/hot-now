# hot-now

本地单机运行的科技资讯编辑台。它会按固定周期拉取多个已启用的 RSS 来源；Twitter 已拆成 `/settings/sources` 里的两条独立手动链路：`账号采集` 和 `关键词搜索`；Hacker News、B 站、微信公众号 RSS 和微博热搜也拆成独立手动链路。扩展来源都不再并入默认定时采集。`AI 时间线` 是独立官方事件流，只采集官方白名单来源，写入 `ai_timeline_events`，不混入普通新闻流；主时间线默认只展示最近 7 天的 S / A 级重要官方事件，并用中文说明“为什么重要”。普通采集结果会经过规则聚类、系统百分制评分和排序，生成多源汇总的 HTML/JSON 报告。邮件发送与采集解耦，可按每日固定时间或手动触发，对最新一份报告单独发信。统一站点继续由 Fastify 托管路由和登录态，但 `/settings/*` 系统页现在已经切到 `Vue 3 + Vite + Ant Design Vue + Tailwind CSS`。

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
export TWITTER_API_KEY=""
export HOT_NOW_DATABASE_FILE="/srv/hot-now/shared/data/hot-now.sqlite"
export HOT_NOW_REPORT_DATA_DIR="/srv/hot-now/shared/data/reports"
export HOT_NOW_CLIENT_DEV_ORIGIN="http://127.0.0.1:35173"
```

`LLM_SETTINGS_MASTER_KEY` 现在是可选覆盖项；如果你不单独配置，系统会回退使用 `SESSION_SECRET` 继续加密保存厂商 API key。
`TWITTER_API_KEY` 是 TwitterAPI.io 的敏感密钥，只在需要执行 Twitter 账号采集或 Twitter 关键词搜索时配置；不配置时仍可在后台维护账号和关键词列表，但两类 Twitter 手动采集都会不可用，RSS、微信公众号 RSS、Hacker News、B 站和微博热搜不受影响。
`HOT_NOW_DATABASE_FILE`、`HOT_NOW_REPORT_DATA_DIR` 是可选生产覆盖项，用来把 SQLite 和报告目录从代码树移到 `/srv/hot-now/shared/data`；本地开发不填时，系统继续按 `config/hot-now.config.json` 里的相对路径运行。
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

- 健康检查：`/health`
- 登录页：`/login`
- 统一站点内容菜单（未登录也可访问）：`/`、`/ai-new`、`/ai-hot`、`/ai-timeline`
- 统一站点系统菜单（登录后访问）：`/settings/view-rules`、`/settings/sources`、`/settings/profile`
- 内容页统一展示系统自动分数（`0-100`）和解释标签，不再提供手工评分表单
- `/`、`/ai-new`、`/ai-hot` 顶部新增共享来源筛选条，支持 `全选 / 全不选`，浏览偏好保存在浏览器本地 `localStorage['hot-now-content-sources']`
- 来源筛选会暴露 `Twitter 账号`、`Twitter 关键词搜索`、`Hacker News`、`B 站搜索`、`微信公众号 RSS` 这些扩展聚合来源；`微博热搜` 只在已有热点内容时出现在 `AI 热点`
- 当来源筛选勾选 `Twitter 账号` 时，工具栏下方会展开二级“账号筛选”；勾选 `Twitter 关键词搜索` 时会展开二级“关键词筛选”；勾选 `微信公众号 RSS` 时会展开二级“公众号 RSS 筛选”。三组都支持多选、默认全选，并分别保存在 `localStorage['hot-now-twitter-account-filter']`、`localStorage['hot-now-twitter-keyword-filter']`、`localStorage['hot-now-wechat-rss-filter']`
- `/`、`/ai-new`、`/ai-hot` 现在同时提供共享排序切换：`按发布时间`、`按评分`；排序偏好保存在浏览器本地 `localStorage['hot-now-content-sort']`
- `/`、`/ai-new`、`/ai-hot` 顶部现在还提供共享标题搜索框；搜索只匹配标题，按回车或点击按钮才生效，关键词保存在浏览器本地 `localStorage['hot-now-content-search']`
- `/api/content/ai-new?page=<n>` 与 `/api/content/ai-hot?page=<n>` 现在支持分页，固定 `50` 条 / 页；前端内容页改为触底自动加载下一页，并在条目上方显示总条数和已加载条数
- `AI 新讯` 固定按最近 `24` 小时窗口和 `ai_new` 门规则构建结果集；`AI 热点` 固定按 `ai_hot` 门规则与热点形成逻辑构建结果集，不会被额外压成 `24` 小时
- `/ai-timeline` 是独立官方事件流，固定读取 `/api/ai-timeline`；当前使用代码内置官方多源白名单，支持 RSS、官方页面、官方 Release notes 和 Hugging Face 官方组织模型列表，支持事件类型、公司和标题搜索筛选，每条事件必须保留官方来源链接
- `/ai-timeline` 主列表默认只展示最近 `7` 天、`S / A` 级、未隐藏的官方重要事件；官方前瞻会进入时间线，但会标注“尚未正式发布”
- `AI 时间线` 卡片优先展示中文重要性摘要，用人话说明这件事为什么重要；如后台做了人工修正，前台优先使用人工标题、摘要和重要级别
- `AI 时间线` 的事件类型固定为 `要闻`、`模型发布`、`开发生态`、`产品应用`、`行业动态`、`官方前瞻`
- `AI 时间线` 不收媒体报道、二手解读、爆料或无官方链接的传闻，也不参与 `AI 新讯 / AI 热点` 的评分、热点归并、source filter 和反馈池
- `AI 新讯`、`AI 热点` 与 `AI 时间线` 的条目卡片会在标题左侧显示连续排序序号；触底加载更多时序号按当前已加载列表连续递增
- 内容页顶部的来源筛选与排序控制会保持悬浮；筛选、排序或搜索重置后会自动回到顶部，长列表滚动时右下角会出现“回到顶部”按钮
- 内容卡片现在只保留局部 `补充反馈` 面板，反馈词会先进入反馈池，不会直接改正式策略或生成草稿
- 如果本地 `data/hot-now.sqlite` 内容库损坏，内容页会降级显示错误提示，而不是直接返回 `500`
- 统一站点左侧导航底部支持深色 / 浅色主题切换，主题偏好保存在浏览器本地 `localStorage`，刷新后保持
- `unified shell` 页面已完整切到借鉴 Canva 的冷感科技聚光双主题：`/`、`/ai-new`、`/ai-hot`、`/settings/*`
- Vue 客户端样式栈现在是 `Vue 3 + Vite + Ant Design Vue + Tailwind CSS`；统一主题源收口到 `src/client/theme/editorialTokens.ts`
- `src/client/styles/tailwind.css` 只保留基础样式、主题变量和少量 AntD 深层覆写，不再新增大型 CSS 皮肤文件
- 统一站点保留左侧品牌块、浅深主题切换和本地 `localStorage` 持久化
- `/settings/*` 现在通过 Fastify 返回统一客户端入口，再由 `Vue 3 + Ant Design Vue` 接管页面渲染
- `/`、`/ai-new`、`/ai-hot` 现在也通过 Fastify 返回统一客户端入口，再由 `Vue 3 + Ant Design Vue` 内容页读取 `/api/content/ai-new`、`/api/content/ai-hot` 渲染
- `/settings/view-rules` 现在是内容筛选工作台：页面会解释并控制 `AI 新讯 / AI 热点` 的真实筛选开关，同时保留 `反馈池` 与标记为 `暂未使用` 的 `LLM 设置`
- `/settings/sources` 现在会展示即时操作卡和“来源库存与统计”合并表，主表包含启停、选中时全量、总条数、今天发布、今天抓取、最近抓取时间与状态；展开单个 source 后可查看 `AI 新讯 / AI 热点` 的入池、展示、占比统计和来源链接；概览区还会显示系统真实下一次自动采集时间，格式为 `18:40（还有 6 分钟）`
- `/settings/sources` 的普通“新增来源”弹窗现在只支持 RSS 来源，只需要填写 `RSS URL`；自定义 RSS 来源仍可编辑 / 删除；微信公众号 RSS 已迁移到单独分区，支持批量新增 RSS 链接、单条编辑、删除配置和手动采集
- `/settings/sources` 现在还包含独立的 Twitter 账号分区，可新增 / 编辑 / 删除 / 启停账号，并单独执行 Twitter 手动采集；字段包含 username、展示名称、分类、优先级、是否采集回复和备注；账号配置保存在独立 `twitter_accounts` 表，不混入普通 source 库存表
- `/settings/sources` 现在也包含独立的 Twitter 关键词搜索分区，可新增 / 编辑 / 删除关键词，分别控制 `采集启用` 和 `展示启用`，并手动执行关键词搜索；字段包含关键词、分类、优先级、备注，分类会统一映射成中文展示；关键词搜索固定使用中文语言约束并过滤掉日文 / 韩文结果；关键词配置保存在独立 `twitter_search_keywords` 表，不混入普通 source 库存表
- `/settings/sources` 现在还包含独立的 Hacker News 搜索分区，可新增 / 编辑 / 删除 query，控制 `采集启用`，并手动执行 HN 搜索；字段包含 query、优先级、备注；第一版固定按最近 7 天、每轮最多 5 个 query、每个 query 最多 10 条结果执行，不做 HN newest 流，也不混入普通 source 库存表
- `/settings/sources` 现在还包含独立的 B 站搜索分区，可新增 / 编辑 / 删除 query，控制 `采集启用`，并手动执行 B 站搜索；字段包含 query、优先级、备注；第一版只搜视频，固定每轮最多 5 个 query、每个 query 最多 10 条结果执行，结果进入 `AI 新讯` 与 `AI 热点`，也不混入普通 source 库存表
- `/settings/sources` 现在还包含独立的微信公众号 RSS 分区，可批量新增 / 单条编辑 / 删除 RSS 链接，并手动执行公众号 RSS 采集；配置保存在独立 `wechat_rss_sources` 表，结果进入 `AI 新讯` 与 `AI 热点`，也不混入普通 source 库存表
- `/settings/sources` 现在还包含独立的微博热搜榜匹配分区：固定 AI 关键词、只支持手动执行，不提供关键词 CRUD；第一版只匹配微博热搜榜，不做微博全文搜索，结果只进入 `AI 热点`，也不混入普通 source 库存表
- `/settings/sources` 现在还包含 `AI 时间线官方源` 手动采集卡片：只采集官方白名单来源，结果进入 `AI 时间线`，不进入 `AI 新讯 / AI 热点`，也不混入普通 source 库存表；卡片会展示后台候选事件，可隐藏误入内容、恢复展示，也可人工修正标题、中文摘要和重要级别
- `/settings/sources` 现在支持逐 source 配置“选中该来源时全量展示”；开启后，该来源不会在内容页首次默认勾选，只有用户显式勾选后才会按全量模式展示
- `/settings/profile` 现在会展示会话状态、用户名、角色和联系邮箱，不再停留在占位页
- 当前支持的 LLM 厂商是 `DeepSeek`、`MiniMax`、`Kimi`；用户在页面里录入 API key，本地只保存加密后的密文；未显式配置 `LLM_SETTINGS_MASTER_KEY` 时，系统会回退使用 `SESSION_SECRET` 作为本地加密 key；当前版本先只保留这些配置入口，不再驱动内容筛选或采集后的自动评估
- Legacy 报告页（当前仍保留）：`/history`、`/reports/:date`、`/control`
- legacy `/history`、`/control` 与 `/reports/:date` 的 fallback notice 轻量跟随共享主题资源
- 手动采集：`POST /actions/collect`
- Twitter 账号手动采集：`POST /actions/twitter-accounts/collect`
- Twitter 关键词手动采集：`POST /actions/twitter-keywords/collect`
- Hacker News 手动采集：`POST /actions/hackernews/collect`
- B 站手动采集：`POST /actions/bilibili/collect`
- 微信公众号 RSS 手动采集：`POST /actions/wechat-rss/collect`
- 微博热搜榜匹配：`POST /actions/weibo/collect`
- AI 时间线官方源采集：`POST /actions/ai-timeline/collect`
- 手动发送最新报告：`POST /actions/send-latest-email`
- 兼容别名：`POST /actions/run`（等价于手动采集）
- 内容反馈写入：`POST /actions/content/:id/feedback-pool`
- LLM 设置动作：`POST /actions/view-rules/provider-settings`、`POST /actions/view-rules/provider-settings/activation`、`POST /actions/view-rules/provider-settings/delete`
- 内容筛选动作：`POST /actions/view-rules/content-filters`
- 反馈池动作：`POST /actions/feedback-pool/:id/delete`、`POST /actions/feedback-pool/clear`
- Twitter 账号动作：`POST /actions/twitter-accounts/create`、`POST /actions/twitter-accounts/update`、`POST /actions/twitter-accounts/delete`、`POST /actions/twitter-accounts/toggle`、`POST /actions/twitter-accounts/collect`
- Twitter 关键词动作：`POST /actions/twitter-keywords/create`、`POST /actions/twitter-keywords/update`、`POST /actions/twitter-keywords/delete`、`POST /actions/twitter-keywords/toggle-collect`、`POST /actions/twitter-keywords/toggle-visible`、`POST /actions/twitter-keywords/collect`
- Hacker News query 动作：`POST /actions/hackernews/create`、`POST /actions/hackernews/update`、`POST /actions/hackernews/delete`、`POST /actions/hackernews/toggle`、`POST /actions/hackernews/collect`
- B 站 query 动作：`POST /actions/bilibili/create`、`POST /actions/bilibili/update`、`POST /actions/bilibili/delete`、`POST /actions/bilibili/toggle`、`POST /actions/bilibili/collect`
- 微信公众号 RSS 动作：`POST /actions/wechat-rss/create`、`POST /actions/wechat-rss/update`、`POST /actions/wechat-rss/delete`、`POST /actions/wechat-rss/collect`
- 微博热搜榜匹配动作：`POST /actions/weibo/collect`
- AI 时间线动作：`POST /actions/ai-timeline/collect`、`GET /api/settings/ai-timeline-events`、`POST /actions/ai-timeline/events/:id/update`
- 内容导航已收口为 AI-first：`/` 与 `/ai-new` 等同 `AI 新讯`，`/ai-hot` 承接 `AI 热点`，`/articles` 已移除

统一站点默认启用单用户登录壳层，`AUTH_USERNAME`、`AUTH_PASSWORD`、`SESSION_SECRET` 是必填环境变量。auth 开启后，内容菜单保持公开可读，但系统菜单和所有写操作仍然要求登录；`content_sources.is_enabled` 决定哪些普通 RSS source 参与定时 / 手动采集，`content_sources.show_all_when_selected` 决定该 source 在内容页被显式勾选时是否全量展示；Twitter 账号由独立 `twitter_accounts.is_enabled` 控制是否参与 Twitter 手动采集，Twitter 关键词由独立 `twitter_search_keywords.is_collect_enabled` 控制是否参与关键词搜索、由 `twitter_search_keywords.is_visible` 控制该关键词命中的内容是否继续进入内容页，关键词搜索固定追加 `lang:zh` 并在入库前排除日文假名 / 韩文内容，真实拉取都依赖环境变量 `TWITTER_API_KEY`；Hacker News query 由独立 `hackernews_queries.is_enabled` 控制是否参与 HN 手动搜索，当前不额外区分“展示启用”；B 站 query 由独立 `bilibili_queries.is_enabled` 控制是否参与 B 站手动搜索，第一版只搜视频且不额外区分“展示启用”；微信公众号 RSS 配置由独立 `wechat_rss_sources.is_enabled` 控制是否参与公众号 RSS 手动采集，当前支持批量新增链接、单条编辑和删除配置；微博热搜榜匹配没有单独配置表，只保留固定 AI 关键词和手动执行入口；AI 时间线官方源白名单写在 `src/core/aiTimeline/officialAiTimelineSources.ts`，当前覆盖 OpenAI News、Google AI Blog、Gemini API Release Notes、Claude Platform Release Notes、Claude Code Changelog、Anthropic News、Google DeepMind News、Mistral Docs Changelog、Mistral News、Azure OpenAI What's New、Qwen Blog、Kimi 开放平台更新记录、MiniMax API Release Notes、BigModel 新品发布，以及 Qwen / DeepSeek / Meta Llama / Mistral / ByteDance Seed 的 Hugging Face 官方组织模型列表和 GitHub releases Atom；采集结果写入独立 `ai_timeline_events` 表，不写入 `content_items`，并记录重要级别、发布状态、中文重要性摘要、可见状态和识别到的实体；主时间线默认只展示最近 `7` 天、`S / A` 级、未隐藏的重要事件，后台候选列表可查看隐藏、低级别和 7 天外事件，并支持人工隐藏、恢复展示、修正标题、中文摘要和重要级别；为满足 `content_items.source_id` 外键，系统会维护隐藏聚合 source `twitter_accounts`、`twitter_keyword_search`、`hackernews_search`、`bilibili_search`、`wechat_rss` 和 `weibo_trending`，它们都不承载配置，也不会出现在普通 source 库存表中；内容页来源筛选会暴露这些聚合 source，其中两个 Twitter 聚合 source 和微信公众号 RSS 聚合 source 会展开二级多选，HN 和 B 站第一版暂不提供内容页二级 query 筛选，微博热搜榜匹配则只进入 `AI 热点`、不进入 `AI 新讯`；`/settings/sources` 现在可以直接启用/停用 source、切换“选中时全量展示”、新增 / 编辑 / 删除自定义 RSS 来源，也可以单独维护 Twitter 账号列表、Twitter 关键词列表、Hacker News query 列表、B 站 query 列表、微信公众号 RSS 链接列表，执行微博热搜榜匹配，或手动采集和校正 AI 时间线官方事件；普通“新增来源”弹窗不再提供公众号入口，公众号 RSS 统一从独立分区维护；来源保存成功后，系统会自动补拉该来源的首批内容，不需要再手动先跑一次采集；内容页顶部的来源筛选和排序只影响当前浏览结果，不会改 source 启用状态；legacy `/control` 继续提供普通 RSS 采集与发信动作。

### Vue 开发规范

- 页面文件负责路由级编排：数据加载、动作协调、弹窗开关和少量状态管理；表格、分区卡片、弹窗和重复表单应拆到 `src/client/components/<domain>/`。
- `/settings/*` 的业务组件放在 `src/client/components/settings/<domain>/`；例如数据来源页的分区卡片和弹窗集中在 `src/client/components/settings/sources/`。
- 同一页面出现多个表格 / 弹窗 / 卡片，或模板明显超过 500 行时，优先抽组件；共享 columns、表单类型、格式化函数和选项列表放到同域 `*Shared.ts`。
- 组件通过 props / emits 协作，后端请求继续收口在页面控制器、composable 或 service 层；不要让展示组件直接调用 API。
- 拆组件时必须保留稳定的 `data-*` 测试锚点，避免因为结构整理导致现有页面测试和端到端验证失效。

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
- 环境变量：SMTP 主机、端口、发件人、授权码、收件人、网页基础地址、统一站点登录凭据与会话密钥、作为独立覆盖项的 `LLM_SETTINGS_MASTER_KEY`、TwitterAPI.io 账号采集 / 关键词搜索密钥 `TWITTER_API_KEY`、生产路径覆盖项 `HOT_NOW_DATABASE_FILE` / `HOT_NOW_REPORT_DATA_DIR`，以及用于覆盖本地公众号解析 sidecar 或接入远端 relay 的 `WECHAT_RESOLVER_BASE_URL`、`WECHAT_RESOLVER_TOKEN`

默认配置下：

- 采集任务每 `10` 分钟执行一次
- 发信任务每天 `10:00`（`Asia/Shanghai`）执行一次
- 两个任务都可以在页面中手动触发
- `/settings/sources` 会直接按当前采集调度显示下一次自动采集时间；调度关闭时回显 `未启用定时采集`
- 未配置 `TWITTER_API_KEY` 时，Twitter 账号手动采集和 Twitter 关键词手动采集都会被标记为不可用，但不会阻断普通 RSS、微信公众号 RSS、Hacker News、B 站、微博热搜采集和报告生成
- Hacker News 搜索不依赖额外密钥；只要后台已有启用中的 query，就可以手动执行
- B 站搜索不依赖额外密钥；只要后台已有启用中的 query，就可以手动执行
- 微信公众号 RSS 不依赖额外密钥；只要后台已有链接，就可以手动执行采集
- 微博热搜榜匹配不依赖额外密钥；只要微博公开热搜接口可用，就可以手动执行固定 AI 关键词匹配
- AI 时间线官方源采集不依赖额外密钥；只要官方白名单来源可访问，就可以手动采集候选事件

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
- 发布方式：本地 `rsync` 上传源码，服务器本机构建，再由 `systemd` 重启

生产环境至少需要补齐这两个路径覆盖项：

```bash
HOT_NOW_DATABASE_FILE=/srv/hot-now/shared/data/hot-now.sqlite
HOT_NOW_REPORT_DATA_DIR=/srv/hot-now/shared/data/reports
```

仓库内已经提供第一版部署模板：

- `scripts/deploy-prod.sh`
- `scripts/pull-prod-data.sh`
- `.deploy.local.env.example`
- `deploy/systemd/hot-now.service`
- `deploy/nginx/hot-now.conf`
- `deploy/sudoers/hot-now-systemctl`

如果需要按这次真实踩坑顺序逐步复现，详细操作记录见：

- `docs/production-deploy-runbook.md`

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

- 只同步代码到 `/srv/hot-now/app`
- 明确排除 `.git`、`node_modules`、`dist`、`data`、`.env`
- 在服务器执行 `npm ci` 和 `npm run build`
- 通过免密 `sudo -n systemctl` 重启并检查 `hot-now` 服务
- 最后调用 `http://127.0.0.1:3030/health` 做健康检查

部署脚本不会触碰：

- `/srv/hot-now/shared/data`
- `/srv/hot-now/shared/.env`

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
- 如果要手动验证 AI 时间线，直接在 `/settings/sources` 点击“手动采集官方事件”；当前只采集 `officialAiTimelineSources` 里的官方白名单来源，成功后先检查后台候选事件是否出现，可尝试隐藏 / 恢复展示 / 修正标题和中文摘要，再到 `/ai-timeline` 检查最近 7 天 S / A 级事件列表、事件类型筛选、公司筛选、标题搜索、官方来源链接、官方前瞻标注和中文重要性摘要，同时确认这些事件不会出现在 `/ai-new` 或 `/ai-hot` 的普通内容流里。OpenAI API changelog、ChatGPT Release Notes 和 xAI News 暂未接入，原因是服务器侧静态请求会被 Cloudflare challenge 阻断；腾讯 / 百度 / 小米暂放第二批，先确认稳定官方入口和可抽取发布时间后再接。
