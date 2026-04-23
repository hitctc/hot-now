# Hacker News 搜索设计文档

日期：2026-04-23

## 背景

当前 hot-now 的多源接入顺序已经明确：

1. 先做 Twitter 账号采集。
2. 再做 Twitter 关键词搜索。
3. 再接 Hacker News。
4. 再接 B 站 / 微博热搜。

前两步已经完成。下一步需要补一条独立于 RSS / 微信公众号 / Twitter 的 `Hacker News 搜索` 链路，用来补充开发者社区和技术讨论侧的 AI 信号。

经过当前轮讨论，这一步不走“直接抓 HN 最新流再做 AI 过滤”，原因很明确：

- `newest` 是全站实时流，噪音很高，不是 AI 专区。
- 如果先抓全量再筛，后面会被迫补更重的本地过滤逻辑。
- hot-now 当前更适合走“后台维护 query 列表 -> 手动搜索 -> 写入统一内容池”的可控路径。

因此本阶段采用 `Hacker News query 搜索`，而不是 `Hacker News newest`。

## 目标

本阶段交付一个可独立管理的 `Hacker News 搜索` 能力：

- 在 `/settings/sources` 中新增独立的 HN 搜索分区。
- 支持维护 HN query 列表。
- query 只保留最小字段：`query`、`priority`、`启用状态`、`备注`。
- 所有 query 共用一套全局搜索参数，不给单条 query 配独立时间窗口。
- 只支持手动触发搜索，不接入默认 `10` 分钟采集调度。
- 搜索结果统一写入现有 `content_items`，不新开一套内容展示链路。
- HN API 失败时，只影响 HN 搜索，不影响 RSS、微信公众号和 Twitter。

## 不做范围

本阶段明确不做：

- Hacker News 最新流采集。
- 自动定时采集。
- query 级时间窗口配置。
- query 级抓取条数配置。
- query 分类。
- 内容页 HN 二级 query 筛选。
- 额外 LLM 过滤或 HN 专属 AI 打分。
- B 站、微博热搜。

这些都属于后续演进项，不在这一轮顺手扩张。

## 设计结论

本阶段采用一条与 Twitter 关键词搜索相似、但更收敛的独立链路：

1. 新增 `hackernews_queries` 保存 query 配置。
2. 在服务端固定一套全局搜索参数：
   - `timeWindowDays`
   - `maxQueriesPerRun`
   - `hitsPerQuery`
3. 保留一个隐藏聚合 source `hackernews_search`，只用于满足 `content_items.source_id` 外键。
4. 新增独立手动动作 `POST /actions/hackernews/collect`。
5. 单次执行只处理最多 `5` 个已启用 query，按优先级排序。
6. 所有结果统一写入 `content_items`，按 `external_id` 去重。
7. 第一版不做 HN 内容的二级展示控制，是否展示只取决于内容本身能否进入现有内容页选择链路。

这意味着 HN 不会塞进 `content_sources` 的普通来源库存表，也不会复用 RSS 来源的启停语义。它是一套独立的“query 配置 + 手动搜索 + 统一入库”模型。

## 用户已确认的边界

本设计基于下面这些已确认约束：

- HN 必须是独立配置区。
- 不走 `newest`，只走后台配置 query 列表。
- 所有 HN query 共用一套时间窗口和抓取条数。
- 第一版优先追求结构稳定，不把 HN 做成第二套复杂工作台。

这些点属于当前轮硬约束，不再开放成可选项。

## 外部接口

第一版使用 Algolia 的 Hacker News Search API：

- Endpoint：`GET https://hn.algolia.com/api/v1/search`
- 不需要 API key
- 主要 query 参数建议：
  - `query`
  - `tags=story`
  - `numericFilters=created_at_i>{unix_timestamp}`
  - `hitsPerPage`

选择 `tags=story` 的原因：

- 第一版优先收正文链接型内容。
- `Ask HN`、`Show HN`、评论线程虽然有价值，但噪音和解释成本更高。
- 先把“外链文章 / 项目 / 论文 / 产品发布”这类结构稳定的内容打通，再评估是否扩进 `comment` 或 `story,comment`。

参考：

- <https://hn.algolia.com/api>
- <https://hn.algolia.com/api/v1/search?tags=story&query=openai>

## 数据模型

新增独立表 `hackernews_queries`，专门保存 HN 搜索配置。

建议字段：

```sql
CREATE TABLE hackernews_queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL UNIQUE,
  priority INTEGER NOT NULL DEFAULT 60,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  last_fetched_at TEXT,
  last_success_at TEXT,
  last_result TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

字段说明：

- `query`
  - HN 搜索词，做 `trim` 后不能为空。
  - 建唯一索引，避免同词重复维护。
- `priority`
  - 影响单次手动搜索时的执行顺序。
  - 默认 `60`。
- `is_enabled`
  - 是否参与后续手动搜索。
- `notes`
  - 给后台留简短说明，例如“模型厂商”“开发工具”“AI infra”。
- `last_fetched_at`
  - 最近一次尝试搜索时间。
- `last_success_at`
  - 最近一次成功搜索时间。
- `last_result`
  - 最近一次结果摘要，例如“成功，返回 6 条结果，新增 2 条内容”或“失败：HN API 429”。

本阶段不新增第二张 `HN query -> content item` 命中关系表，原因是：

- 第一版不做内容页 HN 二级 query 筛选。
- 同一条内容被多个 query 命中时，先把命中 query 列表写进 `metadata_json` 即可。
- 只有当后续明确需要“只看某个 HN query 的结果”时，才有必要单独拆匹配关系表。

## 隐藏聚合 source

和 Twitter 两条链路保持一致，在 `content_sources` 中保留一个隐藏聚合来源：

- `kind = hackernews_search`
- `source_type = hackernews_aggregate`

作用只有两个：

- 给 `content_items.source_id` 提供合法外键。
- 让内容 API 和来源筛选能识别这是一类 HN 搜索内容。

它不进入普通 RSS 来源管理列表，也不允许被用户当普通 source 编辑。

## 后台页面

继续使用 `/settings/sources` 作为采集管理入口，但页面内部拆成分区，而不是把所有来源混成一个表。

第一版 HN 分区能力：

- 列表字段：
  - query
  - 优先级
  - 启用状态
  - 最近成功时间
  - 最近结果
  - 备注
- 表单字段：
  - query，必填
  - 优先级，默认 `60`
  - 是否启用，默认开启
  - 备注，可选
- 操作：
  - 新增 query
  - 编辑 query
  - 启用 / 停用 query
  - 删除 query
  - 手动采集 Hacker News

删除 query 只删除配置，不删除已入库历史内容。

第一版后台不展示可编辑的“全局时间窗口”和“每轮抓取条数”。它们固定在服务端常量里，等确认 HN 数据质量后再决定是否开放到 UI。

## 全局搜索参数

第一版全局参数建议固定为：

- `timeWindowDays = 7`
- `maxQueriesPerRun = 5`
- `hitsPerQuery = 10`

这样做的原因：

- `7` 天窗口足够覆盖 HN 上大多数仍有讨论价值的 AI 文章或项目。
- 单次最多 `5` 个 query，可以防止后台配置越积越多后一次性拉太多。
- 每个 query 最多处理 `10` 条结果，足够做第一版验证，也能把噪音压住。

这些值后续可以调整，但第一版先固定，不引入第二套后台配置读写链路。

## 搜索流程

### 1. 触发方式

第一版只提供手动触发：

- `POST /actions/hackernews/collect`

它不应被下面这些入口触发：

- 默认 `10` 分钟采集调度
- `POST /actions/collect`
- `POST /actions/run`

也就是说，用户必须显式进入 HN 分区点击“手动采集 Hacker News”，才会运行这条链路。

### 2. query 选择规则

一次手动搜索的 query 选择规则固定为：

1. 只读取 `is_enabled = true`
2. 按 `priority DESC, id ASC` 排序
3. 最多只取前 `5` 个 query

这样做的原因：

- 用户可以通过优先级决定“本轮先搜谁”
- query 数量上限稳定，不会因后台积累过多配置而失控

### 3. 单 query 搜索规则

每个 query 发起一次 Algolia HN `search` 请求，固定策略：

- `tags=story`
- `hitsPerPage=10`
- `created_at_i` 大于“当前时间减去 `7` 天”

如果接口返回多于 `10` 条，第一版也只处理前 `10` 条。

### 4. 执行摘要

手动采集完成后，页面需要能直接看到摘要，例如：

- 已启用 query：`8`
- 本次执行 query：`5`
- 本次返回 HN hits：`22`
- 本次新增入库：`6`
- 复用已有内容：`11`
- 失败 query：`1`

这类摘要必须回显在页面上，避免用户只看到“成功”而不知道实际结果规模。

## 入库映射

HN 结果继续映射成现有 `CandidateItem` / `content_items`。

建议映射：

- `title`：HN hit 标题
- `sourceUrl`：
  - 优先用 `url`
  - 缺失时 fallback 到 `https://news.ycombinator.com/item?id={objectID}`
- `sourceName`：`Hacker News / {query}`
- `externalId`：`hackernews:{objectID}`
- `publishedAt`：`created_at`
- `summary`：
  - 第一版优先用 `story_text`
  - 如果没有 `story_text`，则为空或保留简短说明，不强造摘要
- `metadata_json`：
  - `collector.kind = hackernews_search`
  - `query`
  - `author`
  - `points`
  - `numComments`
  - `hnObjectId`
  - `hnCreatedAt`
  - `matchedQueries`（数组，便于后续扩展）

`externalId = hackernews:{objectID}` 是第一优先去重键。重复运行同一 query 或不同 query 命中同一条 HN story，不应重复入库。

如果同一条内容被多个 query 命中：

- 不新增第二条 `content_items`
- 更新 `metadata_json.matchedQueries`

第一版不额外抓正文链接内容，先以 HN story 本身作为来源入口。原因是：

- 先把 HN 搜索链路打通更重要。
- 如果一上来再抓外链正文，会把本轮复杂度直接拉高一倍。
- 后续如果发现 HN 外链质量明显高于 story 摘要，再单独补正文抓取策略。

## 失败与降级

必须满足下面这些失败隔离要求：

- HN API 失败只影响 HN 搜索，不影响 RSS / 微信公众号 / Twitter。
- 单个 query 失败不应阻断同一轮其他 query。
- 所有 query 都失败时，这一轮 HN 任务返回失败摘要，但不影响系统其他采集链路。

后台状态语义统一为：

- `最近成功`
  - 最近一次搜索成功时间
- `最近结果`
  - 最近一次执行摘要
  - 既可能是失败原因，也可能是“成功但没有可入库新内容”

## 页面与展示边界

第一版 HN 内容进入现有内容池后，允许参与：

- `AI 新讯`
- `AI 热点`

但不新增下面这些展示能力：

- 来源筛选下的 HN 二级 query 多选
- HN query 级展示开关
- HN 专属排序规则

也就是说，第一版先把 HN 作为一类新的聚合来源接进现有内容页，而不是立刻把它做成和 Twitter 关键词同等级别的二级可视化控制面板。

## 验收标准

本阶段完成后，至少满足：

- 不需要 API key。
- HN query 可以在 `/settings/sources` 中新增、编辑、启停、删除。
- 可以手动执行一次 HN 搜索。
- API 失败只影响 HN，不影响 RSS 和 Twitter。
- HN 结果可以正确映射并写入 `content_items`。
- `url` 缺失时，会稳定 fallback 到 `news.ycombinator.com/item?id={objectID}`。
- 同一条 HN 内容不会因多个 query 或重复运行而重复入库。
- 至少有一条 HN 内容能进入 `AI 新讯` 或 `AI 热点`。

## 后续演进方向

如果第一版数据质量稳定，再按下面顺序升级：

1. 给 HN 增加二级 query 筛选。
2. 再评估是否需要把全局时间窗口和条数开放到后台。
3. 再评估是否引入 `Ask HN` / `Show HN`。
4. 再评估是否补抓外链正文。

这个顺序不能反。先把 HN 独立 query 搜索主链打通，再谈扩张。
