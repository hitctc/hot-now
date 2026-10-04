# hot-now

本地单机运行的科技资讯编辑台。它会按固定周期拉取多个已启用的 RSS 来源；Twitter 已拆成 `/settings/sources` 里的两条独立手动链路：`账号采集` 和 `关键词搜索`；Hacker News、B 站、微信公众号 RSS 和微博热搜也拆成独立手动链路。扩展来源都不再并入默认定时采集。`AI 时间线` 只读取外部 Markdown feed 的 `json ai-timeline-feed` 数据块，不再在应用内维护官方源白名单、采集规则或本地候选池；相关 API 与 S 级事件提醒继续运行，但页面入口当前暂时下架。普通采集结果会经过规则聚类、系统百分制评分和排序，生成多源汇总的 HTML/JSON 报告。统一站点继续由 Fastify 托管路由和登录态，但 `/settings/*` 系统页现在已经切到 `Vue 3 + Vite + Ant Design Vue + Tailwind CSS`。

## 文档入口

- 核心协作规则：[AGENTS.md](./AGENTS.md)
- 模块与开发规范：[开发与模块化规范](./docs/开发与模块化规范.md)
- Hermes 自动化边界：[Hermes 自动化协作边界](./docs/Hermes自动化协作边界.md)
- 生产发布与回滚：[生产部署手册](./docs/生产部署手册.md)
- 外部创作接口：[创作外部智能体接口](./docs/创作外部智能体接口.md)
- 性能与结构治理历史：[性能优化基线](./docs/性能优化基线.md)

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
export HOT_NOW_DEV_REMOTE_API_ORIGIN="https://now.achuan.cc"
export HOT_NOW_DEV_REMOTE_API_TOKEN="replace-with-remote-creative-api-token"
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
`HOT_NOW_DEV_REMOTE_API_ORIGIN` 用于把本地页面的 `/api/*`、`/actions/*`、登录和登出请求代理到正式站点；`npm run dev` 默认使用 `https://now.achuan.cc`，页面上的保存、发布、图片和其他操作会直接作用于正式数据。代理会转发正式站点的登录 Cookie，但不会挂载或复制远程 SQLite。`HOT_NOW_DEV_REMOTE_API_TOKEN` 仅在正式接口需要 `x-creative-token` 时配置，必须只放在 `.env`，不能提交到仓库。
本地开发不再要求手工配置 `WECHAT_RESOLVER_BASE_URL`、`WECHAT_RESOLVER_TOKEN`；`npm run dev` 会自动拉起仓库内置的本地公众号解析 sidecar。只有你想覆盖到远端 relay 时，才需要显式配置这两个环境变量。

4. 如果这次改动涉及 unified shell 客户端页面，先构建最新客户端资源：`npm run build:client`
5. 启动开发服务：

- 标准方式：

```bash
npm run dev
```

  这条命令现在会一起拉起 Fastify、Vite dev server 和本地公众号解析 sidecar；继续打开 `http://127.0.0.1:3030/...` 即可直接使用 Vue DevTools，不需要再手动开第二个终端。标准入口默认通过 HTTPS 代理正式 API，登录后页面的保存、发布和图片操作都是真实生产操作；启动日志会再次显示该警告。
  `npm run dev` 现在只读取仓库根目录的 `.env`；后续开发统一把共享配置和每台设备自己的敏感项都收口到这一份文件里。若本地还残留旧的 `.env.local`，脚本会明确提示它已被忽略。默认情况下它会先清理本地 `3030` 后端端口、`35173` Vite 调试端口，并在未显式配置远端 resolver 时同步清理和启用本地 sidecar。远程模式会关闭本地采集、发信和时间线调度，避免本地开发进程产生额外副作用。

- 仅启动 Vite 客户端调试时：

```bash
npm run dev:client
```

  需要在浏览器里使用 Vue DevTools 点击组件并定位到源码时，优先用这条命令；当前项目会在 `dev:client` 下自动启用 `vite-plugin-vue-devtools`，生产构建不会注入这个调试工具。

- 本地便捷方式：

```bash
npm run dev:local
```

`dev:local` 用于完全离线的本地数据库开发：它会清除正式 API 代理环境变量，再启动本地数据服务。需要直接操作正式数据时使用 `npm run dev`，不要使用 `dev:local`。

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

## 人工模型任务优先：本轮发布范围

本轮按用户要求发布下述已完成能力，不代表所有共享模型入口均已收口。

- 详情标题、标签、摘要、评论、作者拓展和图片提示词提交异步任务；导语沿用原任务通道。浏览器保存文章＋操作的编号，重开只恢复查询，关闭不取消后台任务，网络故障退避。
- 已接入的共享模型操作按人工短操作、人工长任务、自动任务排序，同级先进先出。成功模型返回及图片生成／上传阶段保存后再让位，不强杀请求；已交付正文只续图片。
- 队列浮层提供单任务取消、等待时间和保留结果只读查看。冷却时显示原因、递减的剩余时间及“约多久后尝试恢复”，不保证届时立即执行；账号／额度相关异常不直接判定为额度耗尽。冷却到期而状态尚未更新时提示等待服务确认恢复；资源被其他任务占用与当前任务已获资源处理中分别说明。让位任务显示已保存进度、优先任务结束后自动续跑；耗时明确包含等待。执行中取消等安全边界；排队不因超过十分钟判为失败，实际模型请求仍使用独立执行超时。
- 文案和图片回写校验文章版本，冲突保留产物、不覆盖人工编辑、不自动合并新稿。检查点不可写时暂停后续模型执行，不静默忽略存储失败。
- 生成按钮旁区分“模型”（消耗模型额度）与“本地”（不调用模型），普通保存、复制、下载不标记。
- 文案、导语和日报提交前持久保存请求编号，响应丢失后复用原活动或终态任务；Hermes 的脱敏收据保留 30 天，过期编号直接拒绝重放，不重新生成。禁用浏览器存储时不保证跨刷新恢复，浏览器时钟大幅偏差也可能导致编号校验失败。
- 日报生成立即返回队列编号，刷新恢复原编号观察，可在队列取消；受理不是生成完成。默认素材日期以首次持久请求编号的时间按北京时间固定，响应丢失后跨零点重放仍使用原日期，不改变发布日期或同日期覆盖规则。正式日报 CLI 只向常驻 Hermes API 提交；维护用 `--dry-run` 不推送但仍可能消耗文本模型额度。旧独立图片 Provider 配置不变，素材创建与旧图片入口未扩展本文案请求合同。
- 用户已确认人工穿插和原任务续跑；取消、版本冲突和恢复完成隔离 HTTP／运行态验收，不宣称生产真实模型现场验收或独立双智能体审查已完成。当前范围、兼容入口与限制见 [收尾验收记录](./docs/人工模型任务收尾验收.md)。

## 页面

- 公开内容：`/`、`/ai-new`、`/ai-hot`。
- 登录系统页：`/settings/view-rules`、`/settings/sources`、`/settings/wechat-mp`、`/settings/profile`。
- 创作工作台：`/creative/source-items`、`/creative/finished-articles`、`/creative/short-source-items`、`/creative/short-finished-articles`、`/daily-digest`、`/monitor`。H5 全局禁止手势缩放：Vue 应用与登录页、404、站点页、报告页等所有 HTML 入口都声明 `maximum-scale=1.0, user-scalable=no`，同时用 `touch-action: pan-x pan-y` 关闭双指缩放，并拦截 `gesturestart` / `gesturechange` / `gestureend` 与多指 `touchmove`（iOS Safari 会忽略 `user-scalable=no`，三者缺一不可）；单指滑动、点击和长按保持原行为。这会使视觉障碍用户无法通过手势放大页面，如需恢复缩放必须同时改回这三层。长短内容的素材与成品表格在移动端不固定左侧 ID/序号列；这些表格和日报表格的右侧操作列在移动端也不固定，桌面端仍保持原有固定列行为。长短内容共用的成品详情弹窗在桌面端和移动端均全宽、全高铺满视口，不留外侧空隙：顶部标题栏与底部操作栏固定不动，只有中间正文区纵向滚动；高度由固定定位包裹层经 flex 拉伸得到，不依赖 `100dvh` 或百分比高度，避免移动端浏览器工具栏与视口差异造成上下露缝或正文无法滚动。窄屏下编辑器工具栏换行而不出现横向滚动条。移动端，底部“保存”左侧提供“关闭”按钮（复用右上角关闭流程），并隐藏“复制格式”和“废弃”按钮；桌面端正常显示“复制格式”和“废弃”，不显示底部“关闭”。成品详情正文编辑器在“同步滚动”旁提供“专注编辑：开/关”偏好，默认开启；关闭后聚焦编辑器不会自动进入专注模式，偏好保存在当前浏览器，刷新后仍生效。移动端（宽度 ≤ 768px）成品详情只保留“人工转写”一栏：AI 草稿栏与内嵌预览栏都隐藏，正文区高度全部给人工编辑，并额外提供“预览”按钮打开独立全屏预览层（不再与编辑争高度）；桌面端三栏布局与原有工具栏按钮（复制原文、复制纯文本、同步滚动、专注编辑、全屏）保持不变，预览按钮仅在移动端出现。
- 短内容以科技数码与 AI 为核心方向，保留综合热搜写作；现役 RSS 是 Juya（`juya-ai-daily`）与 AI HOT（`aihot`），在 Hermes 原 `short_collection` 阶段补充短素材。Juya 从 HotNow 普通内容池交接，AI HOT 从 `aihot-collector` 已入库的长素材只读交接，不重新抓源或刷新原时间；公众号 RSS 仅保留手动/历史兼容能力，不属于这两个现役源。两个源首次分别记录编号基线，之后各自增量入库，自动采集不补投上线前库存；RSS 故障不阻断热搜。长短方向独立交接，同一 RSS 仍可供长文使用。通过原去重与选题门槛后，自动候选先按平台轮转，再每两篇核心候选穿插一篇其他热点；这是软优先顺序，不是固定产量或百分比承诺，不改变投递间隔。新默认短写任务冻结 `editorial_focus=tech-ai-v1`，核心稿围绕实际变化、用户影响与限制选择角度，其他热点不强套科技；复用原评分/写作请求识别领域，不新增模型请求。新短成品标题区域以紫色「AI」、蓝色「科技数码」标签显示领域；其他、未知和旧稿不猜标签，历史成品不补分类。实施与待人工验收项见 [短内容科技数码与 AI 方向开发验收](./docs/短内容科技数码与AI方向开发验收.md)。
- 短内容标题参照素材原标题生成不同的新表达，不照搬或只改标点，保留主体、事件、关键数字、核心吸引点和疑问结构，不设 15 字硬限制；`human-writing` 阶段记录保真分，低于 80 分不回退原标题、不标人工审核，正文质检通过即可进入可推送状态。主写作未生成新标题时由 Hermes 补生成，仍失败则返回技术错误；短内容详情在备选标题上方展示素材原标题，手动“按原标题生成”优先提供“最贴近原标题 / 适度压缩 / 自然口语”候选；模型漏报保真评分、只返回单行标题或只给出部分有效候选时保留已有的有效新标题，不因凑不齐三类而阻断；关联素材原标题缺失时页面明确改用当前选中标题作参照，不禁用按钮；历史成品不批量改写，长文标题逻辑不变。
- 长文成品详情同样支持手动制作三比例代码图片、预览、下载、复制地址、重做及封面候选选择，但不自动插入长文正文，不改变模型生图开关。标签复用 `codeImageKeywords`；新长文在既有发布文案请求中同步生成，漏标签不追加模型调用，旧文可按需手动生成（消耗模型额度）。制图只读已有文案，缺少标签仍能制作，不批量处理历史文章。
- 短内容成品支持代码制图片：服务端使用 SVG + Sharp 和随应用部署、由 fontconfig 注册的 `NotoSansSC-Regular.otf` 生成 `2.5:1`、`1:1`、`3:4` 三张 2 倍像素 PNG，写入 `code_image_cards`、人工正文和封面候选；Hermes 自动短内容成品定向推送成功后通过 token 接口触发（人工短写不隐式新增制图调用），页面也可在单篇详情中制作、重做、下载和复制图片地址。横图和竖图主体按标题、核心判断、导语/摘要、文章生成标签组织；横图导语基础字号为逻辑画布字号 `38`，上移并按底部标签位置自适应缩小；右上角装饰线置于标题上方，避免长标题遮挡。方图只展示标题和标签，不显示中间文案。方图标题、标签字号分别以逻辑画布字号 `120`、`62` 为基准，标题在固定区域内最多四行并按高度自适应，标签最多三枚并可换行，底部与 HotNow 标识留有间距。竖图标题、导语、标签的基础逻辑字号分别为 `66`、`55`、`48`；导语根据剩余高度缩小并在标题与标签之间分配留白，标签最多两行并避开右下标识。横图和竖图导语采用更深的紫灰色和略粗的字重，减少缩小显示时的灰字发虚；代码图片选作公众号封面时，2 MB 内的 PNG 原样上传，正文中的同图仍单独按 PNG 上传，不复用封面素材 URL。旧版图片不批量重制；单篇补做时只更新过期的比例，保留其他比例。缺少核心判断时读取素材 `summary`；标签优先读取成品字段 `codeImageKeywords`，再读取素材 `tags`，缺失时不伪造标签，也不生成空内容占位文案。短内容详情弹窗在「备选标题」下方展示代码图片标签，没有标签时保留区域并说明原因。标签由 Hermes 写作时自动产出，模型漏给时 Hermes 会单独补一次；页面也可点“生成标签 / 重新生成标签”代理 Hermes 重新生成，采用覆盖语义（已有标签时先确认），覆盖后已有代码图片会标记为 `stale`。
- 短内容成品的 `status` 会在入库时归一化为平台成品状态：`ready → ready_for_publish`、`draft` / `needs_rewrite → needs_review`。短内容质检通过后不需要额外的“标记可推送”步骤，可直接推送公众号草稿箱；长文状态不参与映射，仍走自己的门禁流程。文章与日报推送到公众号草稿箱时，微信草稿的作者字段固定为「阿川」，摘要字段固定为「求点赞、求关注、求转发，要是给个一键三连就更棒了」，默认开启留言且不限于粉丝；无需在公众号后台手动填写摘要或开启留言（账号需具备留言权限）。长文和短内容的推送进度浮窗贴齐视口右下角；成功后收起步骤、显示 5 秒倒计时自动关闭，仍可手动关闭或取消自动关闭；失败时保留详情且不自动关闭。
- 短内容素材页“自定义写作”将输入保存为短内容素材，按统一事实复盘与判断策略进入 Hermes 短内容人工队列，生成的成品只出现在短内容成品列表；核心观点作为写作方向参考，不承诺跳过质检或锁定终稿。长文素材页“自定义写作”仍走长文队列，已误生成的历史长文成品不自动迁移。
- 短内容素材表格的人工“写短内容”请求和自动短内容候选都会逐篇进入 Hermes 全局文章队列，并在页面右侧队列浮层展示素材或标题、写作策略、写作/回推阶段；已完成、失败和阻断任务会按北京时间 `00:00–23:59` 分组保留历史，长文和短内容成品表格的日期带同时显示按北京时间全量统计的当天成品文章数、采集素材数和成功推送草稿箱篇数，不受分页影响；文章按成品创建时间、素材按采集时间、推送按成功时间分别统计，同篇同日重复推送只算 1 篇，长短内容分别统计；日期带推送篇数只计入明确标为文章的成功记录，旧日志因无法区分日报而不计；逐篇推送次数和历史排除明确的日报记录，但未分类旧记录沿用原统计，不改写历史数据；成品 ID 可直接打开只读详情抽屉；有明确关联的当前任务、排队项与写作记录同时显示可点击的“素材 #平台编号”。自动短内容以外部标识映射平台素材，历史成品补回关联，缺失或歧义不猜编号。单栏只读正文居中、最大宽度 414px，窄屏不超过容器宽度；图片不超过正文宽度及 70% 视口高度，保持比例、不裁切，不影响编辑布局。共用详情弹窗的顶部标题栏与底部操作栏使用背景和区块阴影区分中间内容，底栏不再显示上边框分隔线。长文、短内容列表及队列的成品入口点击后立即打开加载提示，读取成功再显示完整详情；失败明确提示，关闭或切换后旧响应不重新打开或覆盖弹窗。队列浮层的展开／折叠状态保存在浏览器本地，页面刷新后沿用上次选择，首次打开默认折叠。人工任务使用高优先级，自动任务使用普通优先级并继续受 `short_write` 阶段门禁控制，`auto` 新任务使用 `brief-v1` 统一策略，建议120–600字、1–4处重点加粗，不额外增加硬性字数门禁；评论/作者拓展在实际交付稿确定后生成，正文上下文上限3000字符，图片提示词1条，不改变实际生图权限。显式 `tuwen/duanwen` 和无新策略标记的已受理任务保持旧规格兼容，不批量改历史。短成品表不再按form分类，分别展示生成时质检分与关联素材趋势；空白人工新建无需生成规格。新短任务技术失败沿用既有一次恢复预算，内容不合格仍最多重写2次后停止，人工审核稿交付规则保持；已落稿回推失败复用成功调用和本地编号，不重写或重复制图。长文保留独立八阶段、证据门禁与原图片闭环，共用模型调用、审改、队列和资产工具。
- 长文素材库手动写作只生成封面与正文图片提示词，不随文章自动调用 Luna 生图；成品详情的逐图手动 Luna 按钮仍可按需使用。自动长文仍由 Hermes 按图片阶段开关决定是否完成 Luna 配图闭环。
- 长文写作时导语若为空或短于 20 字，Hermes 重试一次后才从正文提取有效片段；正文也不足时明确失败，不保存单字导语。短内容在终稿质检和审改后自动生成独立导语，模型失败时从终稿正文提取有效片段，本地成品保存后随成品推送到 HotNow。长短内容详情里的“生成新导语”会立即进入 Hermes 现有高优先级写作队列（同篇未完成任务去重、重启可恢复），页面短轮询显示结果，不再占用一个长 HTTP 请求等待 Luna；Hermes 完成后经鉴权回调由 HotNow 唯一入库，回调必须携带生成时的文章版本；生成期间人工编辑时停止回写并保留结果，不重读新版本合并，关闭页面也不丢生成结果。页面仍负责把新导语同步到正文，已入库但正文同步冲突时会单独提示；历史成品不会批量改写。
- 成品正文编辑保存按“AI 草稿 / 人工撰写（发布内容）”分别落盘；自动保存不刷新详情弹窗，手动保存才刷新列表和详情。图片任务与正文编辑并发时，服务端会保留已经落库的封面和正文图片槽位，并清理成功图片对应的 `[IMAGEn]` / `[IMAGEn_DESC:...]` 占位协议；异步图片回写携带文章版本，版本冲突时必须基于最新正文重试，不能用旧快照覆盖用户编辑。
- 代码图片接口为 `/api/creative/finished-articles/:id/code-images`（Hermes token）和 `/actions/creative/finished-articles/:id/code-images`（页面 session）；图片文件沿用 `/api/creative/images/<date>/<uuid>.png`。标题、核心判断、导语、摘要、代码图片标签或选中标题变化会标记代码图片过期，普通正文段落变化不会触发重做。
- `/monitor` 将“长内容计划”和“短内容节奏”分块。短内容目标为采集保持 60 分钟、单篇投递间隔 7.5 分钟（可调整，支持小数），每次最多一篇；已有自动短内容排队或执行中不追加，错过不补投，人工写作不受影响。新批次替换未投递的旧候选，不补历史。分钟调度及资源等待可能延后实际开写，不保证每小时八篇完成。新 Hermes 生效后保存单篇间隔才启用逐篇模式；尚未更新时页面禁止保存小数并保留旧规则，实际切换与浏览器验收见 [收尾验收记录](./docs/人工模型任务收尾验收.md)。长内容区展示 Hermes 当前周期槽位（当前生产配置为 2 个）、空位、逐篇状态/失败原因、最近执行结果和成品入口；五分钟轮询只读取状态。每轮自动长文槽位由 Hermes 维护，定时或“立即执行本轮计划”只执行触发瞬间快照，HotNow 不创建本地队列或重试。
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

- `scripts/deploy-prod.sh`（`--check-hermes` 做只读预检；`--wait-hermes` 在停服务前等待活动任务自然结束，鉴权均由生产服务管理器注入）
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

发布时需要保护 Hermes 活动任务，可使用 `./scripts/deploy-prod.sh --wait-hermes`。检查在停服务前执行；未知/失败立即停止，连续忙碌最多等待50分钟，不取消任务。该选项不重启 Hermes，普通命令不变；详细边界见部署手册。

文章与素材详情在首次打开时下载。下载失败可关闭，或确认未保存内容后重新加载页面再打开；不会自动重放业务操作。文章关闭前提交当前最新版，保存失败时保留弹窗和稿件供重试。

如果临时想改目标，命令前显式传入 `HOT_NOW_DEPLOY_*` 仍然会覆盖本地文件。

这条脚本会：

- 本地先执行 `npm run build`，再同步代码和 `dist` 到 `/srv/hot-now/app`
- 明确排除 `.git`、`node_modules`、`data`、`.env`
- 覆盖代码前检查生产数据库并生成完整快照；快照验证成功后，自动保留最近 `5` 份，并对最近 `14` 天的更早快照按自然日保留当天最后一份
- 自动保留策略只处理 `pre-deploy-*.sqlite`，不会删除专项备份、人工备份或未知命名文件
- 在服务器执行 `npm ci --prefer-offline --production`
- 通过免密 `sudo -n systemctl` 重启并检查 `hot-now` 服务
- 最后调用 `http://127.0.0.1:3030/health` 做健康检查

`deploy/nginx/hot-now.conf` 包含 `80 -> 443` 跳转、`now.achuan.cc` HTTPS 反代，以及 `/client/assets/` 下 Vite hash 资源的 Nginx 直出、gzip 与长缓存；安装或更新该模板后需要在服务器执行 `nginx -t` 和 reload，避免静态资源请求继续绕到 Node 进程后被业务接口阻塞。

历史生产配置如果仍为 HTTP/1.1，可在代码部署后执行一次：

```bash
sudo bash /srv/hot-now/app/scripts/enable-nginx-http2.sh
```

脚本只修改 HotNow 的两个 TLS `listen` 指令，会先备份原配置、执行 `nginx -t`，验证通过才 reload；验证或 reload 失败时自动恢复备份。

部署脚本不会用本地文件覆盖生产 live 数据库、报告或 `/srv/hot-now/shared/.env`。部署预检会在共享数据目录创建恢复快照，并按保留策略清理旧的 `pre-deploy-*.sqlite`；因此“保护共享数据”不代表共享目录完全没有写入。

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
- 然后执行 `npm run dev:local`，明确只使用这份本地副本，不访问正式 API

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

- 自动验证入口：`npm run test`、`npm run typecheck:client`、`npm run build`；通过状态以本轮实际输出为准，不用历史结果代替当前验证。
- 人工模型任务生产验收与待用户操作清单见 [收尾验收记录](./docs/人工模型任务收尾验收.md)；浏览器无法操作时遵循 [协作规则](./AGENTS.md)，不频繁重试。
- 基础页面手动验收：检查登录和受保护页回跳、浅色／深色主题切换及刷新保持、内容页来源／二级来源／排序／搜索偏好的刷新恢复。无可用浏览器能力时保留待验收，不宣称通过。
- 如果要手动验证 `/settings/view-rules`，先检查 `AI 新讯 / AI 热点` 筛选总览与开关保存，再检查反馈池的复制 / 删除 / 清空，以及 LLM 设置的保存 / 启用 / 删除是否正常；如需把厂商配置和会话密钥分开管理，再额外配置 `LLM_SETTINGS_MASTER_KEY`
- 如果要手动验证 Twitter 账号采集，先在 `.env` 配置 `TWITTER_API_KEY`，再到 `/settings/sources` 新增并启用账号，点击“手动采集 Twitter 账号”后确认账号“最近成功 / 最近结果”被回写；如果内容页仍无结果，优先检查“最近结果”里是否出现“本次抓取成功，但没有可入库的新推文。”这类提示；不配置 key 时应只显示不可用提示，普通 RSS 和微信公众号 RSS 采集仍可继续
- 如果要手动验证 Twitter 关键词搜索，先在 `/settings/sources` 新增并启用关键词，确认 `采集启用` 与 `展示启用` 都打开，再点击“手动采集 Twitter 关键词”；当前第一版会限制为“最多处理 5 个已启用关键词、每个关键词最多取前 10 条中文结果”，成功后优先检查关键词“最近成功 / 最近结果”是否回写，再到 `/ai-new`、`/ai-hot` 确认结果是否可见；如果只想停采但保留历史展示，关闭 `采集启用`；如果只想让该关键词命中的内容从内容页消失，关闭 `展示启用`
- 如果要手动验证 Hacker News 搜索，先在 `/settings/sources` 新增并启用至少一个 query，再点击“手动采集 Hacker News”；当前第一版固定按最近 7 天、最多处理 5 个已启用 query、每个 query 最多取前 10 条结果，成功后优先检查 query 的“最近成功 / 最近结果”是否回写，再到 `/ai-new`、`/ai-hot` 确认内容是否已入库并可见
- 如果要手动验证 B 站搜索，先在 `/settings/sources` 新增并启用至少一个 query，再点击“手动采集 B 站搜索”；当前第一版固定为“最多处理 5 个已启用 query、每个 query 最多取前 10 条视频结果”，成功后优先检查 query 的“最近成功 / 最近结果”是否回写，再到 `/ai-new`、`/ai-hot` 确认视频内容是否已入库并可见
- 如果要手动验证微信公众号 RSS，先在 `/settings/sources` 的“微信公众号 RSS”分区批量新增一个或多个 RSS 链接，再点击“手动采集公众号 RSS”；成功后优先检查 RSS 行的“最近成功 / 最近结果”是否回写，再到 `/ai-new`、`/ai-hot` 勾选 `微信公众号 RSS`，并用二级“公众号 RSS 筛选”确认单个 RSS 的内容可筛选
- 如果要手动验证微博热搜榜匹配，直接在 `/settings/sources` 点击“手动匹配微博热搜榜”；当前第一版固定按内置 AI 关键词匹配微博热搜榜，不提供关键词 CRUD，也不做微博全文搜索，成功后优先检查“最近抓取 / 最近成功 / 最近结果”是否回写，再到 `/ai-hot` 确认命中的微博热搜内容是否已入库并可见，同时确认它不会出现在 `/ai-new`
- 如果要手动验证 AI 时间线，先确认 `https://now.achuan.cc/feeds/ai-timeline-feed.md` 可访问且包含 `json ai-timeline-feed` 代码块，再打开 `/api/ai-timeline` 检查 JSON 是否能解析出事件；页面 `/ai-timeline` 与 `/settings/ai-timeline` 当前暂时下架，不作为验收入口。
