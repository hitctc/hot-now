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
  - `采集链路`：`定时 / 手动采集 -> 拉取 enabled RSS sources -> 抓取 / 规范化内容 -> 规则聚类 -> 生成 JSON/HTML 报告 -> 网页查看`
  - `Twitter 链路`：`后台维护账号列表 -> 手动执行 Twitter 账号采集 -> 推文入库 -> 内容页查看`
  - `Twitter 关键词链路`：`后台维护关键词列表 -> 手动执行固定中文范围的 Twitter 关键词搜索 -> 去重入库 / 建立关键词命中关系 -> 内容页查看`
  - `Hacker News 链路`：`后台维护 query 列表 -> 手动执行 Hacker News 搜索 -> 去重入库 / 合并 query 命中 -> 内容页查看`
  - `B 站链路`：`后台维护 query 列表 -> 手动执行 B 站搜索 -> 去重入库 / 合并 query 命中 -> 内容页查看`
  - `微信公众号 RSS 链路`：`后台批量维护 RSS 链接 -> 手动执行公众号 RSS 采集 -> 去重入库 / 按 RSS 来源筛选 -> 内容页查看`
  - `微博热搜链路`：`固定 AI 关键词 -> 手动执行微博热搜榜匹配 -> 热搜命中入库 -> AI 热点查看`
  - `AI 时间线链路`：`Codex 自动化生成官方发布时间线 Markdown -> 上传公网 feed -> 应用拉取并解析 json ai-timeline-feed -> AI 时间线查看 / feed 后台只读查看`
  - `发信链路`：`定时 / 手动发信 -> 读取最新一份已生成报告 -> SMTP 发邮件`
- 当前数据源：内置 RSS 库已扩展到 `21` 个，覆盖聚合日报、国际官方 AI 博客、国内科技媒体、创投资讯、开发者社区与综合新闻；Twitter 已拆成两类独立来源类型：账号采集配置保存在 `twitter_accounts`，关键词搜索配置保存在 `twitter_search_keywords`；Hacker News 搜索配置保存在 `hackernews_queries`；B 站搜索配置保存在 `bilibili_queries`；微信公众号 RSS 配置保存在 `wechat_rss_sources`；微博热搜榜匹配使用固定 AI 关键词，不提供独立配置表；AI 时间线不再维护应用内官方源白名单和采集规则，只读取 `AI_TIMELINE_FEED_URL` 指向的公网 Markdown feed，解析其中唯一的 `json ai-timeline-feed` 代码块，并按 feed 内的官方证据、官方发布时间、S / A 级重要性和可见状态渲染 `/ai-timeline`。这些扩展链路除 AI 时间线 feed 外都只支持后台手动执行，完整清单和边界见本文第 `9` 节阶段快照和 `README.md`
- 当前采集语义：以 `is_enabled` 为准决定是否参与采集；`is_active` 仅保留兼容，不再作为系统菜单主语义
- 当前技术栈：`Node.js + TypeScript + Fastify + Vue 3 + Vite + Ant Design Vue + Tailwind CSS + Vitest`

当前仓库已经有较完整的实现、配置模板、测试和设计/计划文档，不要把它当成从零开始的脚手架项目处理。

## 3. 关键目录与职责

- `src/main.ts`
  负责启动配置加载、运行锁、Fastify 服务和定时任务，并装配 unified shell、内容筛选工作台、反馈池工作台与来源工作台，是应用入口。
- `src/client/`
  负责 `/settings/*` 系统页的 Vue 3 客户端入口、路由、页面组件、主题和前端 service 封装。
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
  负责页面路由、legacy 服务端渲染 HTML，以及 `/settings/*` 的客户端入口分发和系统页读模型 API。
- `src/wechatResolver/`
  负责本地开发时自动启动的公众号解析 sidecar；当前默认先尝试公开索引，再用“文章页元数据 + 搜狗文章检索”做 fallback，最终把标准 `rss_url` 返回给主应用。
- `tests/`
  负责单元测试与轻量集成测试。
- `config/hot-now.config.json`
  负责非敏感运行配置。
- `deploy/`
  保存生产环境的 `systemd`、`nginx`、sudoers 示例模板，供首次部署或服务器核对时复用。
- `docs/superpowers/`
  保存现阶段的设计文档和实现计划，后续重大变更要一起维护。

## 4. 当前页面与产物约定

当前页面：

- `/health`：健康检查
- `/feeds/ai-timeline-feed.md`：外部 AI 官方发布时间线 Markdown feed 公开入口；读取 `AI_TIMELINE_FEED_FILE`，如果稳定文件缺失、损坏或 JSON 不可解析，会按 `AI_TIMELINE_FEED_MANIFEST_FILE` 和同目录版本文件回退；该路由只暴露一份指定 Markdown，不要把整个 `/srv/hot-now/shared/data` 暴露给 Nginx
- `/login`：登录页（GET）与登录提交（POST）
- `/logout`：退出登录（POST）
- `/assets/site.css`：统一站点样式
- `/`：统一站点 AI 新讯首页（未登录也可访问，等同 `/ai-new`）
- `/ai-new`：统一站点 AI 新讯页（未登录也可访问）
- `/ai-hot`：统一站点 AI 热点页（未登录也可访问）
- `/ai-timeline`：统一站点 AI 时间线页（未登录也可访问），读取 `/api/ai-timeline`，默认按发布时间倒序展示最近 `7` 天、`S / A` 级、未隐藏的官方重要事件，支持事件类型、公司和标题搜索筛选；事件类型固定为 `要闻`、`模型发布`、`开发生态`、`产品应用`、`行业动态`、`官方前瞻`；官方前瞻允许进入时间线，但必须标注尚未正式发布；卡片优先展示中文重要性摘要，说明这件事为什么重要，并展示官方证据数量和可靠性状态
- `/settings/view-rules`：统一站点内容筛选工作台（登录后，由 `Vue 3 + Ant Design Vue` 驱动；页面会先解释 `AI 新讯 / AI 热点` 当前真实筛选方向，再提供分页面开关控制 `24 小时窗口 / 来源偏置 / AI 关键词 / 热点关键词 / 新鲜度 / 评分排序`，同时保留 `反馈池` 与标记为 `暂未使用` 的 `LLM 设置`）
- `/settings/sources`：统一站点数据迭代收集页（登录后，由 `Vue 3 + Ant Design Vue` 驱动，可启用/停用 source、切换“选中该来源时全量展示”，并支持可视化新增 / 编辑 / 删除自定义 RSS 来源；普通“新增来源”弹窗只支持 RSS，只需要填写 `RSS URL`；RSS 来源保存成功后会立即自动补拉这条来源的首批内容；页面同时提供独立 Twitter 账号分区、独立 Twitter 关键词搜索分区、独立 Hacker News 搜索分区、独立 B 站搜索分区、独立微信公众号 RSS 分区、独立微博热搜榜匹配分区和 `AI 时间线 feed 摘要` 卡片；Twitter、Hacker News 和 B 站分区可新增 / 编辑 / 删除 / 手动采集，并查看最近成功和最近结果状态；微信公众号 RSS 分区支持批量新增 RSS 链接、单条编辑、删除配置和手动采集，不支持在普通 source 库存中配置公众号；微博热搜榜匹配分区只展示固定 AI 关键词、最近抓取 / 最近成功 / 最近结果和手动执行入口，不提供关键词 CRUD；AI 时间线 feed 卡片展示公网 feed、最近 7 天 S / A 事件数和最新事件时间，并提供进入 `/settings/ai-timeline` 的入口，不再提供应用内官方源采集按钮；Twitter 关键词分区额外支持 `采集启用`、`展示启用` 双开关，分类统一映射为中文文案，搜索固定追加 `lang:zh` 并在入库前排除日文假名 / 韩文内容；Hacker News 分区当前固定按最近 7 天、每轮最多 5 个 query、每个 query 最多 10 条结果执行；B 站分区第一版只搜视频，固定每轮最多 5 个 query、每个 query 最多 10 条结果执行；微信公众号 RSS 结果进入 `AI 新讯` 与 `AI 热点`，并在内容页提供二级 RSS 来源筛选；微博热搜榜匹配第一版只匹配热搜榜，不做微博全文搜索，结果固定只进入 `AI 热点`；页面会用“来源库存与统计”合并表展示启停、选中时全量、总条数、今天发布、今天抓取和最近抓取状态，展开单个 source 后展示 `AI 新讯 / AI 热点` 入池、展示、占比统计和来源链接，并按真实调度回显 `下一次采集：18:40（还有 6 分钟）` 这类分钟级文案）
- `/settings/ai-timeline`：统一站点 AI 时间线 feed 查看页（登录后，由 `Vue 3 + Ant Design Vue` 驱动，展示主时间线状态、feed 来源状态、feed 事件池和规则说明；事件池支持按类型、公司、等级、可见状态和最近天数筛选；页面只读，不再支持隐藏、恢复、人工确认或本地修正）
- `/settings/profile`：统一站点当前登录用户页（登录后，由 `Vue 3 + Ant Design Vue` 驱动，展示会话状态、账号摘要和联系邮箱）
- 统一站点左侧导航底部支持深色 / 浅色主题切换，偏好写入浏览器本地 `localStorage` 并在刷新后保持
- `unified shell` 页面（`/`、`/ai-new`、`/ai-hot`、`/settings/*`）已完整切换到借鉴 Canva 的冷感科技聚光双主题
- 内容导航已收口为 AI-first：`/` 与 `/ai-new` 等同 `AI 新讯`，`/ai-hot` 承接 `AI 热点`，`/articles` 已移除
- `AI 时间线` 是官方事件流，不参与 `AI 新讯 / AI 热点` 的 source filter、评分、热点归并或反馈池
- `AI 时间线` 可靠性状态固定为 `single_source`、`multi_source`、`source_degraded`、`manual_verified`；事件证据、发布时间、重要级别、可见状态都来自外部 Markdown feed，历史数据库表只保留迁移兼容，不再作为运行时数据源
- `/`、`/ai-new`、`/ai-hot` 顶部新增共享 source 复选过滤条，支持 `全选 / 全不选`，浏览偏好写入浏览器本地 `localStorage['hot-now-content-sources']`
- 内容页 source 复选过滤条会暴露 `Twitter 账号`、`Twitter 关键词搜索`、`Hacker News`、`B 站搜索`、`微信公众号 RSS` 这些扩展聚合来源；`微博热搜` 只在已有热点内容时出现在 `AI 热点`
- 当内容页来源筛选勾选 `Twitter 账号` 时，工具栏下方会展开二级“账号筛选”；勾选 `Twitter 关键词搜索` 时会展开二级“关键词筛选”；勾选 `微信公众号 RSS` 时会展开二级“公众号 RSS 筛选”。三组都支持多选、默认全选，并分别写入 `localStorage['hot-now-twitter-account-filter']`、`localStorage['hot-now-twitter-keyword-filter']`、`localStorage['hot-now-wechat-rss-filter']`
- `/`、`/ai-new`、`/ai-hot` 同时提供共享排序切换：`按发布时间`、`按评分`，偏好写入浏览器本地 `localStorage['hot-now-content-sort']`
- `/`、`/ai-new`、`/ai-hot` 顶部还提供共享标题搜索框；搜索只匹配标题，按回车或点击按钮才生效，关键词写入浏览器本地 `localStorage['hot-now-content-search']`
- `/`、`/ai-new`、`/ai-hot` 现在通过 Fastify 返回统一客户端入口，再由 `Vue 3 + Vite + Ant Design Vue` 内容页读取 `/api/content/ai-new`、`/api/content/ai-hot` 渲染
- `/`、`/ai-new`、`/ai-hot` 现在还会在顶部工具栏下方显示当前内容筛选策略摘要，方便对照 `/settings/view-rules` 中已保存的开关结果
- `/api/content/ai-new?page=<n>` 与 `/api/content/ai-hot?page=<n>` 现在支持分页，固定 `50` 条 / 页；前端 `AI 新讯 / AI 热点` 页面不再提供上一页 / 下一页按钮，而是在条目上方显示总条数，并在触底时自动追加下一页
- `AI 新讯` 固定按最近 `24` 小时窗口和 `ai_new` 门规则构建结果集；`AI 热点` 固定按 `ai_hot` 门规则与热点形成逻辑构建结果集，不会被额外压成 `24` 小时
- `AI 新讯`、`AI 热点` 与 `AI 时间线` 的条目卡片会在标题左侧显示连续排序序号；触底加载更多时序号按当前已加载列表连续递增
- 内容卡片现在只保留局部 `补充反馈` 面板；反馈词进入反馈池，不会直接修改正式策略或生成草稿
- 如果本地 `data/hot-now.sqlite` 内容库损坏，内容页会降级显示提示，不再直接以 `500` 打断 unified shell
- `/history`：历史报告（legacy，当前仍保留）
- `/reports/:date`：指定日期报告（legacy，当前仍保留）
- `/control`：控制台（legacy，当前仍保留）
- legacy `/history`、`/control` 与 `/reports/:date` 的 fallback notice 轻量跟随共享主题资源
- `POST /actions/collect`：手动触发一次采集任务（会对所有 enabled 普通 RSS sources 执行采集）
- `POST /actions/send-latest-email`：手动发送最新一份已生成报告
- `POST /actions/run`：`/actions/collect` 的兼容别名（legacy，当前仍保留）
- `POST /actions/twitter-accounts/collect`：手动触发一次 Twitter 账号采集（只处理 enabled Twitter accounts，不生成日报产物）
- `POST /actions/twitter-keywords/collect`：手动触发一次 Twitter 关键词搜索（只处理 `is_collect_enabled=1` 的关键词，不生成日报产物）
- `POST /actions/hackernews/collect`：手动触发一次 Hacker News 搜索（只处理 `is_enabled=1` 的 HN query，不生成日报产物）
- `POST /actions/bilibili/collect`：手动触发一次 B 站搜索（只处理 `is_enabled=1` 的 B 站 query，不生成日报产物）
- `POST /actions/wechat-rss/collect`：手动触发一次微信公众号 RSS 采集（只处理 `is_enabled=1` 的公众号 RSS 链接，不生成日报产物）
- `POST /actions/weibo/collect`：手动触发一次微博热搜榜匹配（固定 AI 关键词，只写入 `AI 热点` 候选，不生成日报产物）
- `POST /actions/ai-timeline/collect`：兼容旧入口，当前返回 `410`，AI 时间线只能由外部 Codex 自动化生成并上传 Markdown feed
- `GET /api/settings/ai-timeline`：登录后读取 AI 时间线 feed 查看页聚合读模型，包含主时间线状态、feed 来源状态、筛选选项和 feed 事件池
- `GET /api/settings/ai-timeline/events`：登录后读取 AI 时间线 feed 事件池，支持类型、公司、等级、可见状态、最近天数和分页筛选
- `GET /api/settings/ai-timeline-events`：登录后读取 AI 时间线后台候选事件的兼容旧入口，内部复用新读模型
- `POST /actions/ai-timeline/events/:id/update`：兼容旧入口，当前返回 `410`，feed 事件在应用内只读
- `POST /actions/content/:id/feedback-pool`：保存或覆盖当前内容卡片的反馈池条目
- `POST /actions/view-rules/provider-settings`：按厂商保存或更新 API key
- `POST /actions/view-rules/provider-settings/activation`：单独启用 / 停用某个已保存厂商，系统同一时间只保留一个启用厂商
- `POST /actions/view-rules/provider-settings/delete`：删除指定厂商配置
- `POST /actions/view-rules/content-filters`：按页面保存 `AI 新讯 / AI 热点` 的筛选开关配置
- `POST /actions/sources/create`、`POST /actions/sources/update`、`POST /actions/sources/delete`：新增、编辑、删除自定义 source；当前页面上的普通“新增来源”入口只提交 RSS payload，已有公众号来源暂时只保留库存展示、启停和删除能力
- `POST /actions/twitter-accounts/create`、`POST /actions/twitter-accounts/update`、`POST /actions/twitter-accounts/delete`、`POST /actions/twitter-accounts/toggle`：新增、编辑、删除、启停 Twitter 账号配置；API key 不通过页面录入，只读取环境变量 `TWITTER_API_KEY`
- Twitter 账号状态约定：`最近成功` 表示最近一次请求成功时间，`最近结果` 既可能是失败原因，也可能是“成功但 0 条可入库推文”这类结果提示
- `POST /actions/twitter-keywords/create`、`POST /actions/twitter-keywords/update`、`POST /actions/twitter-keywords/delete`、`POST /actions/twitter-keywords/toggle-collect`、`POST /actions/twitter-keywords/toggle-visible`：新增、编辑、删除、切换关键词的 `采集启用` / `展示启用`；API key 不通过页面录入，只读取环境变量 `TWITTER_API_KEY`
- Twitter 关键词状态约定：`最近成功` 表示最近一次搜索成功时间，`最近结果` 既可能是失败原因，也可能是“成功但 0 条可入库推文”这类结果提示；搜索 query 固定追加 `lang:zh`，并在入库前过滤掉日文假名 / 韩文内容；关闭 `展示启用` 后，只会隐藏该关键词命中的内容，不会删除历史数据
- `POST /actions/hackernews/create`、`POST /actions/hackernews/update`、`POST /actions/hackernews/delete`、`POST /actions/hackernews/toggle`：新增、编辑、删除、切换 HN query 的 `采集启用`
- Hacker News query 状态约定：`最近成功` 表示最近一次搜索成功时间，`最近结果` 既可能是失败原因，也可能是“成功但 0 条可入库候选内容”这类结果提示；第一版不支持单 query 的展示开关，也不支持内容页二级 HN query 筛选
- `POST /actions/bilibili/create`、`POST /actions/bilibili/update`、`POST /actions/bilibili/delete`、`POST /actions/bilibili/toggle`：新增、编辑、删除、切换 B 站 query 的 `采集启用`
- B 站 query 状态约定：`最近成功` 表示最近一次搜索成功时间，`最近结果` 既可能是失败原因，也可能是“成功但 0 条可入库候选视频”这类结果提示；第一版只搜视频，不支持单 query 的展示开关，也不支持内容页二级 B 站 query 筛选
- `POST /actions/wechat-rss/create`、`POST /actions/wechat-rss/update`、`POST /actions/wechat-rss/delete`：批量新增、单条编辑、删除微信公众号 RSS 配置；新增 payload 支持换行或逗号分隔的多个 RSS 链接
- 微信公众号 RSS 状态约定：`最近成功` 表示最近一次 RSS 请求成功时间，`最近结果` 既可能是失败原因，也可能是“成功但 0 条可入库候选内容”这类结果提示；删除 RSS 配置不会删除历史已入库内容
- 微博热搜榜匹配状态约定：`最近成功` 表示最近一次微博热搜榜请求成功时间，`最近结果` 既可能是失败原因，也可能是“成功但没有命中 AI 相关微博热搜”这类结果提示；第一版固定 AI 关键词、不支持后台编辑，也不支持内容页二级微博关键词筛选
- `POST /actions/feedback-pool/:id/delete`、`POST /actions/feedback-pool/clear`：删除单条反馈词、清空全部反馈池
- 兼容约定：真实应用默认启用 `requireLogin=true` 的 unified shell；auth 开启时内容菜单仍允许匿名查看，但系统菜单、legacy 路由和所有写操作都需要登录；测试或未注入 auth 的场景仍可保持 legacy `/ -> 最新报告` 与 legacy 路由公开行为

当前报告产物目录：

- `data/reports/<YYYY-MM-DD>/report.json`：包含 `sourceKinds`、`issueUrls`、`sourceFailureCount`、`failedSourceKinds`
- `data/reports/<YYYY-MM-DD>/report.html`：多源热点汇总 HTML 报告
- `data/reports/<YYYY-MM-DD>/run-meta.json`：包含 `mailStatus`；collection-only 任务会写入 `not-sent-by-collection`
- `data/recovery-backups/<YYYYMMDD-HHmmss>/hot-now.sqlite`：已通过完整性校验的 verified snapshot
- `data/recovery-backups/<YYYYMMDD-HHmmss>/manifest.json`：快照时间、源库路径、完整性结果和表计数摘要

当前仓库不再跟踪 `data/` 目录下的任何运行产物；live `data/hot-now.sqlite`、`data/reports/*` 和 `data/recovery-backups/*` 都只保留在本地。跨设备和服务器初始化如需使用快照，统一手动复制 verified snapshot。如果后续重新改回提交策略，必须同步更新本文档、`README.md` 和 `.gitignore`。

如果你改了页面入口、路由、产物路径或产物格式，必须同步更新本文档和 `README.md`。

## 5. 运行与验证

首次进入仓库先确认依赖状态。当前工作区可能没有安装依赖，不要默认 `node_modules` 已存在。

常用命令：

- 安装依赖：`npm install`
- 系统页客户端构建：`npm run build:client`
- 开发启动：`npm run dev`
- 仅启动 Vite 客户端调试：`npm run dev:client`
- 兼容入口：`npm run dev:local`
- 数据库检查：`npm run db:check`
- 生成 verified snapshot：`npm run db:snapshot`
- 从快照恢复主库：`npm run db:restore -- <snapshot-file>`
- 生产部署：`./scripts/deploy-prod.sh`（默认会先读取仓库根 `.deploy.local.env`；如需临时覆盖，再显式传 `HOT_NOW_DEPLOY_*`）
- 拉取生产数据副本：`./scripts/pull-prod-data.sh`（默认从生产服务器拉 `hot-now.sqlite + reports/` 到本地 `data/prod-sync/`）
- 基于生产副本启动本地开发：`./scripts/dev-prod-sync.sh`（固定使用本地 `data/prod-sync/`，不直连服务器 live 数据）
- 类型构建：`npm run build`
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

1. 只改了局部逻辑时，先跑最相关的单测文件。
2. 改动涉及 `/settings/*` 客户端页面时，先跑最相关的前端单测，再跑 `npm run build:client`。
3. 改动影响运行时类型或入口时，再跑 `npm run build`。
4. 改动影响任务链路、页面或配置时，最后做一次手动 smoke test。

推荐 smoke test：

1. 准备 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS`、`MAIL_TO`、`BASE_URL`、`AUTH_USERNAME`、`AUTH_PASSWORD`、`SESSION_SECRET`；如需让厂商 API key 使用独立加密密钥，再额外准备 `LLM_SETTINGS_MASTER_KEY`；如需验证 Twitter 账号真实采集或 Twitter 关键词搜索，再额外准备 `TWITTER_API_KEY`
2. 启动 `npm run dev`
3. 打开 `/login` 并完成登录
4. 如需验证内容筛选工作台，先进入 `/settings/view-rules` 检查 `AI 新讯 / AI 热点` 的筛选总览与开关保存，再检查 `反馈池` 的复制 / 删除 / 清空是否正常；`LLM 设置` 当前只保留配置入口，不会触发策略或重算
5. 进入 `/settings/sources` 或 legacy `/control`，先手动执行一次普通 RSS 采集；如果已配置 `TWITTER_API_KEY`，再到 `/settings/sources` 的 Twitter 分区单独执行一次 Twitter 账号采集，并确认账号“最近成功 / 最近结果”回写；如需验证关键词搜索，再新增一个已启用且可展示的 Twitter 关键词，执行一次“手动采集 Twitter 关键词”，确认关键词“最近成功 / 最近结果”回写，并到 `/ai-new`、`/ai-hot` 检查结果可见性；如需验证 Hacker News 搜索，再新增一个已启用的 HN query，执行一次“手动采集 Hacker News”，确认 query“最近成功 / 最近结果”回写，并到 `/ai-new`、`/ai-hot` 检查结果可见性；如需验证 B 站搜索，再新增一个已启用的 B 站 query，执行一次“手动采集 B 站搜索”，确认 query“最近成功 / 最近结果”回写，并到 `/ai-new`、`/ai-hot` 检查结果可见性；如需验证微信公众号 RSS，再批量新增 RSS 链接，执行一次“手动采集公众号 RSS”，确认 RSS 行“最近成功 / 最近结果”回写，并到 `/ai-new`、`/ai-hot` 检查父级 `微信公众号 RSS` 与二级 RSS 筛选；如需验证微博热搜榜匹配，直接点击“手动匹配微博热搜榜”，确认“最近抓取 / 最近成功 / 最近结果”已回写，并到 `/ai-hot` 检查结果可见性、确认它不会进入 `/ai-new`；如需验证 AI 时间线，先确认 `AI_TIMELINE_FEED_URL` 或默认 `https://now.achuan.cc/feeds/ai-timeline-feed.md` 可访问且包含 `json ai-timeline-feed`，再到 `/settings/sources` 检查 feed 摘要卡片和入口，到 `/settings/ai-timeline` 检查只读 feed 状态与事件池，最后到 `/ai-timeline` 检查最近 7 天 S / A 级事件列表、官方来源链接、官方证据数量、可靠性状态、官方前瞻标注和中文重要性摘要；需要验证发信时，再单独触发一次“发送最新报告”
6. 检查是否生成报告目录与 `report.json`、`report.html`、`run-meta.json`
7. 检查 `/`、`/ai-new`、`/ai-hot`、`/ai-timeline`、`/settings/view-rules`、`/settings/sources`、`/settings/ai-timeline`、`/history`、`/reports/:date` 是否正常显示，并验证内容页 source 过滤条、共享排序切换、共享标题搜索、内容页策略摘要、内容卡片反馈面板、反馈池、AI 时间线筛选、AI 时间线 feed 事件池、feed 来源状态和 LLM 设置占位文案

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
- `TWITTER_API_KEY`（可选 TwitterAPI.io 密钥；在 Twitter 账号采集和 Twitter 关键词搜索时需要，缺失时不阻断普通 RSS、微信公众号 RSS、Hacker News、B 站或微博热搜采集）
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
- 删除、清空、覆盖、重置等不可逆或高风险操作，默认必须提供显式二次确认；除非用户明确要求并说明可跳过，否则不要直接把危险动作绑定成一次点击立即生效。
- Git 提交信息默认使用 `英文类型：中文正文`，包含碎片提交、临时提交和最终交付提交；除非用户明确要求其他语言或其他格式，否则不要改成纯英文、纯中文或其他提交标题格式。
- `docs/superpowers/specs/` 和 `docs/superpowers/plans/` 下新生成的文档文件名必须使用简体中文标题；允许保留日期前缀和必要技术缩写（如 `API`、`LLM`、`UI`），但不要再使用纯英文 slug，也不要在文件名里额外写项目名 `HotNow`。
- `docs/superpowers/` 下经用户确认后生成的正式协作文档（包括 specs、plans、复盘和交付说明等）视为可交付文档产物；完成文档自检后应当单独创建本地 git commit，不要因为它不是代码改动而跳过提交。
- 默认直接在 `main` 分支开发，不单独开功能分支或 worktree；只有用户明确要求隔离开发、走分支 / PR 流程，或有其他特殊说明时，才切到非 `main` 分支工作。
- 完成代码改动或正式文档产物，并达到一次“最小可验证改动”后，默认创建本地 git commit；这里的“最小可验证改动”至少要求本轮最相关测试、构建或文档自检已经完成，不把未确认分析、草稿、半成品实验或明显中间态代码直接提交。
- 如果代码改动已经完成、最小可验证改动也已达成且提交边界清晰，默认在同一轮工作内立刻完成本地 commit；不要把本应提交的改动拖到下一轮需求再一起补交。
- 如果因为工作区混有无关脏改、提交边界不清或验证未完成而暂时不能提交，必须在回复里明确说明原因；不要在已完成最小可验证改动后静默跳过本地 commit。
- 如果本轮改动已经通过最相关验证、提交边界清晰、工作区没有混入无关脏改，且用户没有明确要求暂停同步，则默认继续将当前分支推送到远程；本项目默认直接在 `main` 工作，因此 push 前必须先确认这几个条件都成立。
- 以下情况禁止自动 push：相关验证未通过；工作区混有未整理的无关修改；只完成了分析 / 设计 / 计划而没有形成可交付代码；改动包含 live 数据库、凭据、临时恢复文件或其他不应入库的本地产物；当前提交边界仍不清楚。
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

截至 `2026-04-24`，仓库状态可按下面理解：

- 已有设计文档和实现计划
- 已有主体实现与测试文件
- Git 主分支已建立并同步远端
- 当前工作区已完成 unified site 与多源采集阶段的最终验证：
  - `npm run test` 通过，结果为 `91` 个测试文件、`500` 个测试全部通过
  - `npm run build` 通过
  - Playwright MCP 本地验收已跑通：`/login` 登录成功；`/`、`/settings/view-rules`、`/settings/sources`、`/settings/profile`、`/history`、`/control` 访问正常
  - 浅色主题切换后 `data-theme=light` 且 `localStorage['hot-now-theme']='light'`，刷新后保持；切回深色后 `data-theme=dark` 且刷新后保持
  - 内容页来源筛选写入 `localStorage['hot-now-content-sources']`，Twitter 二级筛选写入 `localStorage['hot-now-twitter-account-filter']` / `localStorage['hot-now-twitter-keyword-filter']`，微信公众号 RSS 二级筛选写入 `localStorage['hot-now-wechat-rss-filter']`
- 真实 SMTP 发信已验证通过；当前采集链路与发信链路已拆开，采集只生成报告，发信单独读取最新报告
- 原文抓取过程中出现过一次 `jsdom` 的 `Could not parse CSS stylesheet` 日志噪音，未阻断本轮任务完成；如果后续要收口发布质量，可以继续评估是否需要单独治理
- Task4（single-user login + unified app shell）已落地：新增 `passwords/session` auth helper、登录页与统一壳层菜单路由，且保留 legacy 报告路由兼容
- 真实入口已收口为“内容公开、系统受保护”：`AUTH_USERNAME`、`AUTH_PASSWORD`、`SESSION_SECRET` 现在是必填；auth 开启时 `/`、`/ai-new`、`/ai-hot` 允许匿名查看，但 `/settings/*`、legacy 路由和 `POST /actions/collect`、`POST /actions/send-latest-email`、`POST /actions/run` 都要求登录
- 内容页评分已切为系统自动百分制，页面只保留 `补充反馈` 面板，不再提供收藏 / 点赞 / 点踩或手工评分表单
- 多源采集后端已完成：`loadEnabledSourceIssues` / `runDailyDigest` 已接入多源并行汇总，单个 feed 失败不会阻断整次日报，只有全部 enabled sources 都失败时才会硬失败
- 内置 RSS 源已扩展到 21 个，覆盖聚合日报、国际官方 AI 博客、国内热点资讯 / 快讯、科技媒体、开发者社区、创投资讯与综合新闻；新增内置源会作为 built-in source 写入 `content_sources`
- Twitter 账号采集第一阶段已落地：账号配置独立存入 `twitter_accounts`，支持分类、优先级、是否采集回复、启停、最近成功和最近结果状态；推文采集通过 TwitterAPI.io `GET /twitter/user/last_tweets`，缺少 `TWITTER_API_KEY` 时只标记 Twitter 账号采集不可用，不影响普通 RSS 和微信公众号 RSS 采集
- Twitter 关键词搜索第一阶段已落地：关键词配置独立存入 `twitter_search_keywords`，支持分类、优先级、`采集启用`、`展示启用`、最近成功和最近结果状态；搜索通过 TwitterAPI.io `GET /twitter/tweet/advanced_search`，当前只支持后台手动执行，query 固定追加 `lang:zh` 并在入库前排除日文假名 / 韩文内容，同时固定做 `5 × 10` 的成本限制：每次最多处理 5 个已启用关键词、每个关键词最多取前 10 条中文结果
- Hacker News 搜索第一阶段已落地：query 配置独立存入 `hackernews_queries`，支持优先级、`采集启用`、最近成功和最近结果状态；搜索通过 Algolia `https://hn.algolia.com/api/v1/search`，当前只支持后台手动执行，并固定做“最近 7 天、每次最多处理 5 个已启用 query、每个 query 最多取前 10 条结果”的成本限制
- B 站搜索第一阶段已落地：query 配置独立存入 `bilibili_queries`，支持优先级、`采集启用`、最近成功和最近结果状态；搜索通过 B 站公开搜索接口 `GET https://api.bilibili.com/x/web-interface/search/type`，当前只支持后台手动执行，并固定做 `5 × 10` 的成本限制：每次最多处理 5 个已启用 query、每个 query 最多取前 10 条视频结果；第一版只搜视频，结果同时进入 `AI 新讯` 与 `AI 热点`
- 微信公众号 RSS 第一阶段已落地：RSS 链接配置独立存入 `wechat_rss_sources`，支持批量新增、单条编辑、删除、最近成功和最近结果状态；当前只支持后台手动执行，RSS 条目写入 `content_items` 后同时进入 `AI 新讯` 与 `AI 热点`，内容页支持 `微信公众号 RSS` 父级筛选和单个 RSS 二级筛选
- 微博热搜榜匹配第一阶段已落地：不维护独立配置表，固定 AI 关键词直接匹配微博公开热搜接口 `GET https://weibo.com/ajax/side/hotSearch` 的 `realtime` 结果；当前只支持后台手动执行，不做微博全文搜索，命中内容只进入 `AI 热点`
- AI 时间线已切换为外部 Markdown feed 驱动：Codex 自动化负责联网查找官方事件、验证官方来源和官方发布时间、筛选 S / A 级事件并上传 `ai-timeline-feed.md`；应用侧只读取 `AI_TIMELINE_FEED_URL`，解析唯一 `json ai-timeline-feed` 代码块并渲染 `/ai-timeline`、`/settings/sources` 的 feed 摘要和 `/settings/ai-timeline` 的只读事件池。应用内不再维护官方源白名单、官方源采集、重要性规则、事件证据表、源健康表或人工修正流程；历史 `ai_timeline_*` 表只保留迁移兼容，当前运行时不再读取。
- Twitter / Hacker News / B 站 / 微信公众号 RSS / 微博热搜匹配内容统一写入现有 `content_items`，并在 `content_items.metadata_json` 保存 metrics、author、collector 和 matchedQueries 信息；为满足 `content_items.source_id` 外键，会维护六个隐藏的内部聚合 source：`twitter_accounts`、`twitter_keyword_search`、`hackernews_search`、`bilibili_search`、`wechat_rss` 和 `weibo_trending`，它们都不承载实际配置，也不会出现在 `/settings/sources` 的普通 source 库存表中；这些聚合 source 会作为内容页来源筛选项暴露，Twitter 账号、Twitter 关键词和微信公众号 RSS 额外支持二级筛选，关键词聚合 source 的内容是否展示还受关键词 `is_visible` 命中关系控制，Hacker News 和 B 站聚合 source 当前都不提供内容页二级 query 筛选，微博热搜聚合 source 只用于 `AI 热点`
- 采集和发信已拆成两个独立功能：默认配置下采集每 `10` 分钟执行一次，发信每天 `10:00` 执行一次；两者都支持手动触发，并共用同一把运行锁
- 系统菜单已收口到多源语义：`/settings/sources` 支持 source 启用/停用、source 级“选中时全量展示”策略、逐 source 最近抓取状态展示，以及统一站点内手动执行普通 RSS 采集、手动发送最新报告；当前普通“新增来源”入口只支持可视化新增 / 编辑 / 删除自定义 RSS 来源，RSS 只要求录入 `RSS URL`；公众号 RSS 现在由单独“微信公众号 RSS”分区维护，支持批量新增链接、单条编辑、删除配置和手动采集；页面还支持独立维护 Twitter 账号列表并单独执行 Twitter 手动采集、独立维护 Twitter 关键词列表并单独执行 Twitter 关键词搜索、独立维护 Hacker News query 列表并单独执行 Hacker News 搜索、独立维护 B 站 query 列表并单独执行 B 站搜索，也支持独立执行微博热搜榜匹配；这些扩展入口都不会混入普通 source 库存表；AI 时间线 feed 摘要、只读事件池和规则说明已独立到 `/settings/ai-timeline`；RSS 来源保存成功后会立即自动补拉这条来源的首批内容；本地开发默认仍会启动仓库内置公众号解析 sidecar，后续如需 IP 隔离再切远端 relay；`/settings/view-rules` 现在会解释并控制 `AI 新讯 / AI 热点` 的真实筛选开关，同时保留 `反馈池` 与 `LLM 设置（暂未使用）`；当前登录用户信息已并到侧边栏底部
- 本地开发入口已收口到 `npm run dev`：脚本会自动拉起 Fastify、Vite dev server 和公众号解析 sidecar；`npm run dev:local` 只保留兼容转发，不再作为主调试入口
- `/settings/sources` 现在会基于共享内容选择器实时展示“来源库存与统计”合并表，主表口径包含启停、选中时全量、总条数、今天发布、今天抓取和最近抓取状态；展开行展示 `AI 新讯 / AI 热点` 的入池、展示、占比统计和来源链接
- `/settings/sources` 现在还会根据真实采集调度展示下一次自动采集时间；前端只做分钟级剩余时间回显，不自己推算调度边界
- unified shell 已去掉顶部 header，页面信息和账号区都收进左侧侧边栏；视觉母版已切到借鉴 Canva 的冷感科技聚光双主题，主题切换与 localStorage 持久化已落地
- `/settings/*` 现在统一走 Fastify 返回的客户端入口，由 `src/client/` 下的 `Vue 3 + Vite + Ant Design Vue` 页面接管，不再继续叠加新的服务端拼表单 HTML
- `/`、`/ai-new`、`/ai-hot` 现在也统一走 Fastify 返回的客户端入口，由 `src/client/pages/content/` 下的 Vue 页面读取内容 API 渲染；`/articles` 已移除
- unified shell 内容页已切到“聚光舞台 + 指挥台 + 卡片流”的层级；系统页、legacy 页面和登录页也统一收口到同一套冷感科技玻璃面板语义
- 内容页顶部现在会渲染共享 source 过滤条与共享排序切换；勾选结果通过 `localStorage['hot-now-content-sources'] + x-hot-now-source-filter` header 驱动内容 API 过滤，Twitter 与微信公众号 RSS 的二级筛选分别通过对应 localStorage 和 header 驱动，排序偏好通过 `localStorage['hot-now-content-sort'] + x-hot-now-content-sort` header 驱动内容 API 排序，只影响当前浏览结果，不参与系统页统计口径
- 当来源筛选命中 `twitter_accounts` 或 `twitter_keyword_search` 时，内容页还会额外通过 `localStorage['hot-now-twitter-account-filter'] + x-hot-now-twitter-account-filter`、`localStorage['hot-now-twitter-keyword-filter'] + x-hot-now-twitter-keyword-filter` 驱动二级账号 / 关键词过滤；如果第一层未选中对应 Twitter 聚合来源，后端会忽略对应二级筛选参数
- 内容页顶部现在还会渲染共享标题搜索框；生效关键词通过 `localStorage['hot-now-content-search'] + x-hot-now-content-search` header 驱动内容 API 做标题过滤，再进入分页切片
- 内容页 API 仍支持 `page` query 分页；前端浏览改为触底自动加载下一页，筛选、排序或搜索变化后会自动回到第一页重新累计列表
- 开启“选中时全量展示”的 source 在内容页首次进入时默认不勾选；只有用户显式勾选后，该 source 才会免受普通 view limit 截断
- 内容页现在会把当前反馈池条目回填到局部反馈面板，内容交互形成 `补充反馈 -> 反馈池` 的轻量闭环
- `/settings/view-rules` 不再提供正式自然语言策略、草稿池或重算入口；当前内容页筛选改由 `view_rule_configs` 中的页面级开关控制，`LLM 设置` 当前仍只保留配置，不参与内容页筛选和采集后的自动评估
- 内容页现在对本地内容库损坏做了降级兜底：检测到 `SQLITE_CORRUPT` / `SQLITE_NOTADB` 时继续渲染统一站点，并提示修复或重建 `data/hot-now.sqlite`
- 启动入口现在会对 `data/hot-now.sqlite` 做 SQLite 健康检查；如果主库损坏，会提示最近的 verified snapshot 和 `npm run db:restore -- <snapshot-file>` 恢复命令
- graceful shutdown 现在会执行真实的 `wal_checkpoint(TRUNCATE)`，减少把 live 库直接当普通文件同步时产生坏快照的风险
- 已新增 `npm run db:check`、`npm run db:snapshot`、`npm run db:restore -- <snapshot-file>`，并把 verified snapshot 目录收口为 `data/recovery-backups/<timestamp>/`
- `data/` 目录下的 live 库、报告产物和 verified snapshot 都已收口为本地运行文件，不再作为常规 git 产物；跨设备和服务器如需使用快照，改为手动复制 verified snapshot
- 已接入 `DeepSeek`、`MiniMax`、`Kimi` 三个厂商配置项；每个厂商会分别保存自己的 API key，但同一时间只允许一个启用厂商；API key 通过页面录入后会优先使用 `LLM_SETTINGS_MASTER_KEY` 加密落库；当前版本先只保留配置入口，不参与内容筛选
- 报告层已切到多源语义：`report.json` / `report.html` / 邮件正文会保留 `sourceKinds`、`issueUrls`、失败 source 数量等信息，不再把输出描述成单一日报
- legacy `/history`、`/reports/:date`、`/control` 与 unified shell 共存，且相关测试和文档已同步

如果后续有人补充了更完整的端到端验证、继续扩展 source adapter，或确认上述日志噪音属于需要修复的问题，请同步更新这一节，避免误导下一位协作者。
