# yupi-hot-monitor 数据采集源码调研

调研对象：`https://github.com/liyupi/yupi-hot-monitor`

源码快照：`cd48b0885bfa8ae9c8043cf78ef6cfd045530bdb`

调研日期：2026-04-23

## 结论

`yupi-hot-monitor` 的采集不是一套 RSS source inventory，而是一套“按关键词主动搜索”的热点监控链路。

它的核心形态是：

1. 读取用户配置的 active keywords。
2. 对每个 keyword 同时请求 Twitter、Bing、Hacker News、搜狗、B 站、微博热搜。
3. 把不同来源统一成 `SearchResult`。
4. URL 去重、新鲜度过滤、按来源优先级排序。
5. 再经过 AI 真实性、相关性和重要性判断。
6. 保存到 `Hotspot` 表，并通过 WebSocket / 邮件通知。

对 hot-now 的启发是：这些采集器不能简单塞进现有 `rss_url -> feedXml -> SourceAdapter` 模型。它们更适合新增一条 `search/api collector` 采集通道，再把结果转换成当前 `content_items` 可消费的内容。

## 相关源码入口

服务端在线采集：

- `server/src/services/search.ts`
  - Bing / Google / DuckDuckGo HTML 采集
  - Hacker News Algolia API
  - URL 去重
- `server/src/services/chinaSearch.ts`
  - 搜狗 HTML 采集
  - B 站公开 API
  - 微博热搜公开 JSON API
  - B 站账号检测和账号最新视频抓取
- `server/src/services/twitter.ts`
  - `twitterapi.io` 高级搜索、趋势和用户推文
  - Twitter 本地质量过滤
- `server/src/jobs/hotspotChecker.ts`
  - 关键词循环、并行采集、去重、新鲜度过滤、来源优先级、AI 过滤、入库和通知
- `server/src/types.ts`
  - `SearchResult` 统一结果结构
- `server/prisma/schema.prisma`
  - `Keyword` / `Hotspot` / `Notification` / `Setting` 数据模型

技能包脚本采集：

- `skills/hot-monitor/scripts/search_web.py`
  - Bing / Google / DuckDuckGo / HackerNews 的独立脚本版
- `skills/hot-monitor/scripts/search_china.py`
  - 搜狗 / B 站 / 微博的独立脚本版
- `skills/hot-monitor/scripts/search_twitter.py`
  - TwitterAPI.io 的独立脚本版
- `skills/hot-monitor/references/search-sources.md`
  - 项目作者整理的数据源端点、频率限制和注意事项

## 统一数据结构

服务端把所有来源转换成 `SearchResult`：

```ts
type SearchResult = {
  title: string;
  content: string;
  url: string;
  source: "twitter" | "bing" | "google" | "duckduckgo" | "hackernews" | "sogou" | "bilibili" | "weibo";
  sourceId?: string;
  publishedAt?: Date;
  viewCount?: number;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  quoteCount?: number;
  score?: number;
  commentCount?: number;
  danmakuCount?: number;
  author?: {
    name: string;
    username?: string;
    avatar?: string;
    followers?: number;
    verified?: boolean;
  };
};
```

这个结构比 hot-now 当前 `CandidateItem` 更丰富。hot-now 当前只保留：

```ts
type CandidateItem = {
  rank: number;
  category: string;
  title: string;
  sourceUrl: string;
  sourceName: string;
  externalId: string;
  publishedAt?: string;
  summary?: string;
};
```

下一步接入时可以先降级映射，保证主链路跑通：

| yupi `SearchResult` | hot-now `CandidateItem` | 说明 |
|---|---|---|
| `title` | `title` | 直接使用，B 站需去掉 `<em>` 高亮标签 |
| `url` | `sourceUrl` | 作为去重和内容抓取入口 |
| `source` | `sourceName` / `category` | 可映射为来源名和类别 |
| `sourceId` | `externalId` | 没有时使用 URL hash |
| `publishedAt` | `publishedAt` | 转成 ISO string |
| `content` | `summary` | 搜索摘要或内容摘要 |
| `viewCount` 等互动指标 | 暂无字段 | 初期可写入 summary 或后续新增 `metadata_json` |

## 数据源拆解

### Axios + Cheerio

这里不是一个单独数据源，而是网页搜索爬取方式。项目里用于 Bing、Google、DuckDuckGo、搜狗。

公共策略：

- 使用 `axios.get` 请求 HTML。
- 使用 `cheerio.load(response.data)` 解析页面。
- 随机选择 User-Agent。
- 每个来源有独立 `RateLimiter`，用最小请求间隔控制频率。
- 异常时返回空数组，不抛出到总采集任务。

#### Bing

源码：`server/src/services/search.ts`

- URL：`https://www.bing.com/search`
- 参数：
  - `q`: 查询词
  - `count`: `20`
- Headers：
  - 随机 `User-Agent`
  - `Accept`
  - `Accept-Language: en-US,en;q=0.5`
  - `Accept-Encoding: gzip, deflate, br`
- 解析：
  - 结果容器：`li.b_algo`
  - 标题和链接：`h2 a`
  - 摘要：`.b_caption p`
- 过滤：
  - title 存在
  - url 存在
  - url 以 `http` 开头
- 频率：
  - 5 秒间隔

#### Google

源码有实现，但当前主调度没有启用 Google。

- URL：`https://www.google.com/search`
- 参数：
  - `q`
  - `num: 20`
  - `hl: en`
- 解析：
  - 结果容器：`div.g`
  - 标题：第一个 `h3`
  - 链接：第一个 `a`
  - 摘要：`.VwiC3b`
- 频率：
  - 10 秒间隔
- 风险：
  - 反爬最强，源码作者也把它排除在服务端主聚合之外。

#### DuckDuckGo

源码有实现，但当前服务端 `searchAll` 没有启用，技能包脚本默认支持。

- URL：`https://html.duckduckgo.com/html/`
- 参数：
  - `q`
- 解析：
  - 结果容器：`.result`
  - 标题和原始链接：`.result__title a`
  - 摘要：`.result__snippet`
- URL 处理：
  - 如果链接包含 `uddg=`，从 query string 中解码真实 URL。
- 频率：
  - 3 秒间隔

### HackerNews API

源码：`server/src/services/search.ts`

- URL：`https://hn.algolia.com/api/v1/search`
- 参数：
  - `query`
  - `tags: story`
  - `hitsPerPage: 20`
  - `numericFilters: created_at_i>{oneDayAgo}`
- 时间窗口：
  - 最近 24 小时
- 过滤：
  - `hit.url` 或 `hit.story_text` 至少有一个存在
- 字段映射：
  - `title` -> `title`
  - `story_text || title` -> `content`
  - `url || https://news.ycombinator.com/item?id={objectID}` -> `url`
  - `objectID` -> `sourceId`
  - `created_at` -> `publishedAt`
  - `points` -> `score`
  - `num_comments` -> `commentCount`
  - `author` -> `author.name` / `author.username`
- 频率：
  - 1 秒间隔

这类 API 最适合优先接入 hot-now，因为无鉴权、结构稳定、字段质量高。

### 搜狗搜索

源码：`server/src/services/chinaSearch.ts`

- URL：`https://www.sogou.com/web`
- 参数：
  - `query`
  - `ie: utf-8`
- Headers：
  - 随机 `User-Agent`
  - `Accept`
  - `Accept-Language: zh-CN,zh;q=0.9,en;q=0.8`
- 解析：
  - 结果容器：`.vrwrap, .rb`
  - 标题和链接：`h3 a, .vr-title a, .vrTitle a`
  - 摘要：`.space-txt, .str-text-info, .str_info, .text-layout`，没有就取第一个 `p`
- URL 处理：
  - `/link?url=` 相对路径补成 `https://www.sogou.com{url}`
- 过滤：
  - 排除标题包含 `大家还在搜`
- 频率：
  - 3 秒间隔

接入风险：

- HTML selector 可能漂移。
- 搜狗返回链接可能是跳转页，不一定是最终原文 URL。
- 对 hot-now 来说，这类结果更像“发现入口”，后续仍需要现有 `fetchAndExtractArticle` 抓正文。

### 微博热搜

源码：`server/src/services/chinaSearch.ts`

- URL：`https://weibo.com/ajax/side/hotSearch`
- Headers：
  - 随机 `User-Agent`
  - `Accept: application/json`
  - `Referer: https://weibo.com/`
- 成功条件：
  - `response.data.ok === 1`
  - `response.data.data.realtime` 存在
- 匹配逻辑：
  - 取 `note || word`。
  - query 按空白分词。
  - 只要 query word 包含 topic，或 topic 包含 query word，就算匹配。
  - 也检查完整 query 与 topic 的双向包含。
- URL 生成：
  - `https://s.weibo.com/weibo?q=${encodeURIComponent("#" + topicName + "#")}`
- 字段映射：
  - 标题：`🔥 微博热搜: {topicName}`
  - 内容：`微博热搜话题「{topicName}」，热度 {num}`
  - `num` -> `viewCount`
- 频率：
  - 3 秒间隔

注意：源码注释说“无匹配时返回前几条热搜作为参考”，但当前 TypeScript 实现只打日志，实际返回 `results`，也就是无匹配时返回空数组。Python 脚本也是无匹配返回空数组。

接入建议：

- 如果 hot-now 目标是“AI-first 热榜”，微博可以配置成固定 query：`AI 人工智能 OpenAI ChatGPT 大模型` 等。
- 不建议把微博热搜当普通全文搜索，它本质是榜单匹配。

### B 站公开 API

源码：`server/src/services/chinaSearch.ts`

#### 视频搜索

- URL：`https://api.bilibili.com/x/web-interface/search/type`
- 参数：
  - `keyword`
  - `search_type: video`
  - `order: pubdate`
  - `page: 1`
  - `pagesize: 20`
- Headers：
  - 随机 `User-Agent`
  - `Referer: https://search.bilibili.com/`
  - `Accept: application/json`
  - `Cookie: buvid3={crypto.randomUUID()}infoc`
- 成功条件：
  - `response.data.code === 0`
  - `response.data.data.result` 存在
- 字段映射：
  - `title` 去掉 `<em>` 标签
  - `description || title` -> `content`
  - `https://www.bilibili.com/video/{bvid}` -> `url`
  - `bvid` -> `sourceId`
  - `pubdate * 1000` -> `publishedAt`
  - `play` -> `viewCount`
  - `like` -> `likeCount`
  - `review` -> `commentCount`
  - `danmaku` -> `danmakuCount`
  - `author` / `mid` -> author
- 频率：
  - 2 秒间隔

#### 账号检测

- 先用同一个接口搜索 `search_type: bili_user`。
- 命中规则：
  - `uname` 与 keyword 完全匹配，或大小写后匹配。
  - 或第一个结果粉丝数大于 1000，且 `uname` 包含 keyword。
- 命中账号后调用用户视频接口：
  - URL：`https://api.bilibili.com/x/space/arc/search`
  - 参数：`mid`, `pn: 1`, `ps: 10`, `order: pubdate`
  - Referer：`https://space.bilibili.com/{mid}`

接入建议：

- 第一阶段只接视频搜索，不接账号检测。
- 账号检测更适合后续“订阅某个 UP 主”功能，不适合直接混进现有 AI 新讯主采集。

### TwitterAPI.io

源码：`server/src/services/twitter.ts`

- Base URL：`https://api.twitterapi.io`
- 鉴权：
  - Header `X-API-Key: {TWITTER_API_KEY}`
  - 环境变量缺失时服务端实现返回空 tweets，不抛错。
- 高级搜索 endpoint：
  - `GET /twitter/tweet/advanced_search`
  - 参数：
    - `query`
    - `queryType: Top | Latest`
    - `cursor`
- 趋势 endpoint：
  - `GET /twitter/trends?woeid=1`
- 用户推文 endpoint：
  - `GET /twitter/user/last_tweets?userName={username}`

搜索策略：

1. 构造 Top query：
   - 原 keyword
   - `-filter:retweets`
   - `-filter:replies`
   - `since:{UTC date 7 days ago}`
   - `min_faves:10`
2. 构造 Latest query：
   - 原 keyword
   - `-filter:retweets`
   - `-filter:replies`
   - `since:{UTC date 3 days ago}`
3. 并行请求 Top 第 1 页和 Latest 第 1 页。
4. 如果 Top 有 `next_cursor`，再请求 Top 第 2 页。
5. 按 tweet id 去重。
6. 本地质量过滤和排序。

质量过滤阈值：

- likes >= 10
- retweets >= 5
- views >= 500
- author followers >= 100
- 排除 `type` 包含 reply 的 tweet
- 排除文本以 `@xxx ` 开头的 tweet
- 蓝 V 作者阈值减半

排序公式：

```ts
score = likeCount * 2 + retweetCount * 3 + viewCount / 100 + (blueVerified ? 50 : 0)
```

字段映射：

- `tweet.text.slice(0, 100)` -> `title`
- `tweet.text` -> `content`
- `tweet.url` -> `url`
- `tweet.id` -> `sourceId`
- `tweet.createdAt` -> `publishedAt`
- 互动指标和作者信息完整保留

接入风险：

- 需要 `TWITTER_API_KEY`，不能写入仓库。
- 这是付费 / 第三方 API，应该做成可选 source。
- Twitter 的互动指标很适合热点排序，但 hot-now 当前 `content_items` 没有原生字段承载这些指标。

## 聚合和处理逻辑

`runHotspotCheck` 是完整采集主链路：

1. 从数据库读取 `isActive = true` 的关键词。
2. 对每个关键词先做 B 站账号检测。
3. 用 AI 做 keyword expansion。
4. 并行采集六个来源：
   - Twitter
   - Bing
   - HackerNews
   - Sogou
   - Bilibili
   - Weibo
5. 汇总 fulfilled 的结果，失败来源只记录日志。
6. URL 去重：
   - 去掉末尾 `/`
   - 把 `http(s)://www.` 标准化成 `https://`
7. 新鲜度过滤：
   - 丢弃 `publishedAt` 超过 7 天的内容。
   - 没有 `publishedAt` 的内容保留。
8. 来源优先级排序：
   - Twitter
   - Weibo
   - Bilibili
   - HackerNews
   - Sogou
   - Bing
   - Google
   - DuckDuckGo
9. 处理配额：
   - Twitter 最多处理 15 条。
   - 非 Twitter 共享 10 条。
10. 查重：
   - 以 `url + source` 查 `Hotspot` 是否已存在。
11. AI 分析：
   - `isReal`
   - `relevance`
   - `relevanceReason`
   - `keywordMentioned`
   - `importance`
   - `summary`
12. 过滤：
   - 非真实热点过滤。
   - 相关性小于 50 过滤。
   - 未提及关键词且相关性小于 65 过滤。
13. 入库 `Hotspot`。
14. 创建通知，WebSocket 推送，高重要级别发邮件。

## 与 hot-now 当前架构的差异

hot-now 当前采集主链路：

- `content_sources` 保存来源。
- `loadEnabledSourceIssues` 读取 enabled source。
- 每个来源必须有 `rss_url`。
- loader `fetch(rss_url)` 拿 XML。
- `SourceAdapter(feedXml) -> LoadedIssue`。
- `runCollectionCycle` enrich 原文、写入 `content_items`、聚类、生成报告。

关键差异：

| 维度 | hot-now 当前 | yupi-hot-monitor |
|---|---|---|
| 采集触发 | enabled RSS sources | active keywords |
| 输入 | `rss_url` | keyword / account / API key |
| 返回 | feed issue items | search results |
| 时间语义 | RSS item published date | API/search result date，部分来源没有 |
| 存储 | `content_sources` + `content_items` | `Keyword` + `Hotspot` |
| 富指标 | 基本没有 | views / likes / comments / followers |
| 筛选 | 规则聚类 + view rules | AI 真实性 / 相关性 / 重要性 |

所以接入时不建议把这些来源伪装成 RSS。更合适的是新增一层 collector：

```ts
type SearchCollector = (input: {
  query: string;
  now: Date;
  limit: number;
}) => Promise<SearchCollectedItem[]>;

type SearchCollectedItem = {
  title: string;
  content: string;
  url: string;
  sourceKind: SourceKind;
  sourceId?: string;
  publishedAt?: string;
  metrics?: {
    viewCount?: number;
    likeCount?: number;
    retweetCount?: number;
    replyCount?: number;
    quoteCount?: number;
    commentCount?: number;
    danmakuCount?: number;
    score?: number;
  };
  author?: {
    name?: string;
    username?: string;
    avatar?: string;
    followers?: number;
    verified?: boolean;
  };
};
```

再统一转换成 hot-now 已有 `LoadedIssue` / `CandidateItem`，让 `runCollectionCycle` 尽量少改。

## 推荐接入顺序

这份调研最初按源码稳定性建议从 Hacker News 和 B 站切入。经过 2026-04-23 的产品方向讨论，hot-now 后续应按“AI 信息和新闻的一手来源优先”重新排序：

1. 先做 Twitter 账号采集。
2. 再做 Twitter 关键词搜索。
3. 再接 Hacker News。
4. 再接 B 站 / 微博热搜。

不接入搜狗 HTML 爬虫。原因是它对本项目帮助有限，且 HTML selector、跳转链接和反爬维护成本会稀释主线收益。

### 第一阶段：Twitter 账号采集

优先接入：

- TwitterAPI.io 用户最新推文接口。
- 后台页面可配置账号列表。
- 国内外 AI 厂商账号、大模型产品账号和关键人物账号。

原因：

- 这是最符合 hot-now “AI 相关信息和新闻”目标的主渠道。
- 厂商和关键人物账号更接近一手信号，比泛关键词搜索噪音低。
- 账号配置需要长期维护，必须放到后台页面，而不是只写死在代码里。

最小实现边界：

1. 新增 Twitter 账号来源类型，例如 `twitter_account`。
2. 使用独立 `twitter_accounts` 表保存账号名、展示名、优先级、分类、是否启用。
3. `/settings/sources` 支持新增 / 编辑 / 启停 Twitter 账号独立分区。
4. collector 通过 `TWITTER_API_KEY` 调用 TwitterAPI.io 用户推文接口。
5. 推文转换成统一候选内容后进入去重、新鲜度、优先级、AI 过滤、入库。
6. key 缺失时返回明确 failure，不影响 RSS 采集。

### 第二阶段：Twitter 关键词搜索

接入：

- TwitterAPI.io advanced search。
- AI 相关关键词配置。

作用：

- 作为账号采集的补漏通道。
- 捕捉非订阅账号里突然出现的 AI 热点。

要求：

- 必须比账号采集有更强 AI 过滤。
- 默认限制关键词数量和每轮处理配额。
- 默认排除转推、回复和低互动内容。

### 第三阶段：Hacker News

接入：

- Hacker News Algolia API。

原因：

- 技术新闻质量高。
- API 稳定。
- 不需要 API key。
- 适合补充开发者和技术社区侧的 AI 信号。

### 第四阶段：B 站 / 微博热搜

接入：

- Bilibili 视频搜索 API。
- 微博热搜 public API。

作用：

- 补充国内热度。
- 观察 AI 话题是否进入大众传播层。

边界：

- B 站先只做关键词视频搜索，不先做账号检测。
- 微博只接热搜榜，不当成微博全文搜索。

### 暂不接入：搜狗 HTML 爬虫

不接入：

- 搜狗 HTML 搜索。
- Google HTML 搜索。
- DuckDuckGo HTML 搜索。

原因：

- 搜狗对本项目的 AI-first 主线帮助不大。
- HTML 爬虫 selector 易漂移，维护成本高。
- 搜索结果跳转链接和正文质量不可控。
- 当前更应该把工程资源放在 Twitter 账号、Twitter 搜索、HN、B 站和微博热搜。

## 旧版源码稳定性排序记录

下面是仅按源码稳定性做过的早期判断，已经不作为当前执行顺序：

- 当时曾考虑先接 Hacker News 和 B 站，因为它们都是 JSON API，结构稳定，不需要 API key。
- 当时曾考虑把搜狗作为中文网页发现补充，但现在已明确不接入搜狗 HTML 爬虫。
- 当时曾把 Twitter 放在后置阶段，因为它需要第三方 API key；现在产品方向已调整为 Twitter 账号采集优先，但必须后台可配置、显式启用，并处理 key 缺失降级。

当前执行顺序以本文“推荐接入顺序”和路线图文档为准。

## hot-now 数据模型建议

最小可运行可以不改表，把富指标暂时写入 `summary` 或 `body_markdown`。但如果要做“热点排序”，建议新增内容元数据字段或独立表。

建议方案：

```sql
ALTER TABLE content_items ADD COLUMN metadata_json TEXT;
```

`metadata_json` 示例：

```json
{
  "metrics": {
    "viewCount": 1234,
    "likeCount": 88,
    "commentCount": 12,
    "score": 45
  },
  "author": {
    "name": "author",
    "username": "author_id",
    "followers": 10000,
    "verified": true
  },
  "collector": {
    "query": "AI",
    "rawSource": "bilibili"
  }
}
```

这样不需要先把 `content_items` 拆成社交平台专用表，也能为后续 `AI 热点` 排序提供数据。

## 配置建议

新增一类非敏感配置：

```json
{
  "searchCollectors": {
    "enabled": true,
    "queries": [
      "AI",
      "人工智能",
      "大模型",
      "OpenAI",
      "Claude",
      "AI agent"
    ],
    "sources": {
      "hackernews": { "enabled": true, "limit": 20 },
      "bilibili": { "enabled": true, "limit": 20 },
      "weibo": { "enabled": false, "limit": 20 },
      "sogou": { "enabled": false, "limit": 20 },
      "twitter": { "enabled": false, "limit": 20 }
    }
  }
}
```

敏感配置：

- `TWITTER_API_KEY`

这个值只能来自环境变量，不能写入 JSON 配置、文档示例真实值、测试快照或日志。

## 代码迁移注意事项

1. 不能直接复制 `yupi-hot-monitor` 的调度模型。
   - 它是 keyword monitor。
   - hot-now 是每日热点内容应用。
   - 应该抽采集器，不要照搬 `Keyword` / `Hotspot` 表。

2. HTML 采集器需要集中限流。
   - 不要在每个函数里各自 new limiter 后被测试绕开。
   - hot-now 里应做可注入的 `RateLimiter` / `fetcher`，便于单测。

3. 采集失败必须保持局部降级。
   - 现有 `loadEnabledSourceIssues` 已经有 `Promise.allSettled` 和 `failures` 模型。
   - 新 collector 也应返回同样的 failure 语义。

4. 不要先接 Google。
   - 源码有实现，但主服务端没有启用。
   - 反爬风险高，维护成本高。

5. 不要默认开启 Twitter 关键词搜索。
   - 需要第三方 API key。
   - 默认开启泛关键词搜索会让本地和生产部署多一个高噪音外部依赖。
   - Twitter 账号采集可以优先实现，但账号列表和 key 都必须显式配置。

6. B 站 cookie 只生成随机 `buvid3`。
   - 不需要用户 cookie。
   - 不要要求或保存 B 站账号凭据。

7. 微博只接热搜榜。
   - 不是微博正文搜索。
   - 文案和 source 名称要避免误导。

## 下一步实现清单

建议下一步先做一个可审查的小切口：

1. 新增 `SearchCollectedItem` 和 collector 接口。
2. 设计 `twitter_account` 来源类型和后台可配置账号列表。
3. 实现 TwitterAPI.io 用户最新推文 collector。
4. 把推文结果转换成 `LoadedIssue` / `CandidateItem` 并并入 collection cycle。
5. 补 `twitterAccountCollector.test.ts` 和来源配置相关测试。
6. 跑相关 source 测试和 `npm run build`。

第一阶段不要同时接 Twitter 关键词搜索、Hacker News、B 站、微博热搜。先把 Twitter 账号采集和非 RSS collector 通道打通，再逐个 source 加。

## 参考链接

- GitHub 仓库：<https://github.com/liyupi/yupi-hot-monitor>
- 调研 commit：<https://github.com/liyupi/yupi-hot-monitor/tree/cd48b0885bfa8ae9c8043cf78ef6cfd045530bdb>
- `search.ts`：<https://github.com/liyupi/yupi-hot-monitor/blob/cd48b0885bfa8ae9c8043cf78ef6cfd045530bdb/server/src/services/search.ts>
- `chinaSearch.ts`：<https://github.com/liyupi/yupi-hot-monitor/blob/cd48b0885bfa8ae9c8043cf78ef6cfd045530bdb/server/src/services/chinaSearch.ts>
- `twitter.ts`：<https://github.com/liyupi/yupi-hot-monitor/blob/cd48b0885bfa8ae9c8043cf78ef6cfd045530bdb/server/src/services/twitter.ts>
- `hotspotChecker.ts`：<https://github.com/liyupi/yupi-hot-monitor/blob/cd48b0885bfa8ae9c8043cf78ef6cfd045530bdb/server/src/jobs/hotspotChecker.ts>
- 数据源参考：<https://github.com/liyupi/yupi-hot-monitor/blob/cd48b0885bfa8ae9c8043cf78ef6cfd045530bdb/skills/hot-monitor/references/search-sources.md>
