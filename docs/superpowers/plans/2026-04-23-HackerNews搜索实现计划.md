# Hacker News 搜索实现计划

> **执行约束：** 本计划只覆盖第一阶段 Hacker News query 搜索。不要顺手接入 HN 最新流、自动调度、HN 二级 query 筛选、B 站、微博热搜或外链正文抓取。

**Goal:** 在 `/settings/sources` 增加独立的 `Hacker News 搜索` 分区，让用户可以维护 query 列表、手动触发 Algolia HN 搜索，并把结果去重后写入现有 `content_items`，作为一类新的聚合来源进入 `AI 新讯 / AI 热点`。

**Architecture:** RSS / 微信公众号继续使用 `content_sources`；Twitter 账号和 Twitter 关键词继续使用各自独立表；Hacker News 本轮新增独立 `hackernews_queries` 表保存 query 配置和状态。采集时通过 Algolia `search` API 按优先级选择前 `5` 个启用 query、每个 query 最多处理前 `10` 条 `story` 结果；所有内容继续复用统一的 `content_items` 入库口径，并维护一个隐藏聚合 `content_sources.kind = hackernews_search` 满足 `content_items.source_id` 外键。第一版不做 HN 二级筛选，也不单独维护 query 命中关系表。

**Tech Stack:** TypeScript, Fastify, Vue 3, Ant Design Vue, SQLite, Vitest

---

## File Map

**Create**

- `src/core/hackernews/hackerNewsQueryRepository.ts`
  管理 HN query 的新增、编辑、删除、启停、状态回写和列表读取。
- `src/core/hackernews/hackerNewsApiClient.ts`
  封装 Algolia HN `search` 接口，隐藏 query 参数和响应校验细节。
- `src/core/hackernews/hackerNewsCollector.ts`
  读取启用 query、调用 client，并把 HN hit 映射成入库所需结构。
- `src/core/hackernews/runHackerNewsCollection.ts`
  负责手动执行 HN 搜索、去重入库、汇总执行摘要和返回 action 结果。
- `tests/hackernews/hackerNewsQueryRepository.test.ts`
- `tests/hackernews/hackerNewsApiClient.test.ts`
- `tests/hackernews/hackerNewsCollector.test.ts`
- `tests/hackernews/runHackerNewsCollection.test.ts`

**Modify**

- `src/core/db/runMigrations.ts`
  新增 `hackernews_queries` 表，并确保隐藏聚合 source `hackernews_search` 可被创建。
- `src/core/content/contentRepository.ts`
  增强对 HN `metadata_json.matchedQueries` 的更新支持，复用现有内容去重读写能力。
- `src/server/createServer.ts`
  增加 HN 读模型与 create/update/delete/toggle/collect actions 的依赖注入与路由。
- `src/server/renderSystemPages.ts`
  扩展 `SourcesSettingsView` 类型，支持 HN 分区的读模型字段。
- `src/main.ts`
  注入 HN repository、collector 和独立手动采集 action。
- `src/client/services/settingsApi.ts`
  增加 HN query 数据类型和 CRUD / collect action client。
- `src/client/pages/settings/SourcesPage.vue`
  增加独立的 `Hacker News 搜索` 分区、表格、表单和手动采集按钮。
- `src/core/source/loadEnabledSourceIssues.ts`
  确保 `hackernews_aggregate` 不会被误算成普通 RSS / 公众号来源。
- `src/core/source/listSourceCards.ts`
  确保隐藏 HN 聚合 source 不进入普通来源库存表。
- `README.md`
  增加 HN 搜索的使用说明、边界和手动采集说明。
- `AGENTS.md`
  同步当前主链路、`/settings/sources` 页面能力和数据源说明。

**Test**

- `tests/db/runMigrations.test.ts`
- `tests/content/contentRepository.test.ts`
- `tests/server/createServer.test.ts`
- `tests/server/settingsApiRoutes.test.ts`
- `tests/client/settingsApi.test.ts`
- `tests/client/sourcesPage.test.ts`

## Task 1: 增加 HN query 配置存储

**Files:**

- Modify: `src/core/db/runMigrations.ts`
- Create: `src/core/hackernews/hackerNewsQueryRepository.ts`
- Test: `tests/db/runMigrations.test.ts`
- Test: `tests/hackernews/hackerNewsQueryRepository.test.ts`

- [ ] **Step 1: 先写迁移和 repository 测试**
  - 断言 `hackernews_queries` 表存在。
  - 断言 `query` 唯一。
  - 断言新增 query 时会写入默认 `priority`、`is_enabled`。
  - 断言编辑、启停、删除和最近结果回写可用。

- [ ] **Step 2: 实现迁移**
  - 新增 migration，例如 `010_hackernews_queries`。
  - `CREATE TABLE IF NOT EXISTS hackernews_queries (...)`。
  - 创建必要索引：
    - `query` unique
    - `is_enabled`
    - `priority`
  - 不新增 query 命中关系表。

- [ ] **Step 3: 实现 repository**
  - `listHackerNewsQueries(db)`
  - `createHackerNewsQuery(db, input)`
  - `updateHackerNewsQuery(db, input)`
  - `deleteHackerNewsQuery(db, id)`
  - `toggleHackerNewsQuery(db, id, enable)`
  - `markHackerNewsQueryFetchResult(db, input)`

- [ ] **Step 4: 运行验证**
  - `npm run test -- tests/db/runMigrations.test.ts tests/hackernews/hackerNewsQueryRepository.test.ts`

## Task 2: 增加 Algolia HN client 和 collector

**Files:**

- Create: `src/core/hackernews/hackerNewsApiClient.ts`
- Create: `src/core/hackernews/hackerNewsCollector.ts`
- Test: `tests/hackernews/hackerNewsApiClient.test.ts`
- Test: `tests/hackernews/hackerNewsCollector.test.ts`

- [ ] **Step 1: 先写 client 和 collector 测试**
  - 断言请求会带 `query`、`tags=story`、`hitsPerPage=10`。
  - 断言搜索时间窗固定为最近 `7` 天。
  - 断言 collector 只取前 `5` 个启用 query。
  - 断言 `url` 缺失时会 fallback 到 `news.ycombinator.com/item?id={objectID}`。
  - 断言 `空结果 / 429 / 5xx / 非法 payload` 都会生成明确结果摘要。

- [ ] **Step 2: 实现 Algolia client**
  - 只封装本轮需要的最小参数：
    - `query`
    - `tags=story`
    - `created_at_i`
    - `hitsPerPage`
  - 不接入 `newest`。
  - 不扩展分页抓取。
  - 统一返回规整后的 HN item 结构。

- [ ] **Step 3: 实现 collector**
  - 读取 `is_enabled = true` 的 query。
  - 按 `priority DESC, id ASC` 选择前 `5` 个。
  - 每个 query 只处理前 `10` 条 hit。
  - 规整出统一的候选内容结构，并附带：
    - `author`
    - `points`
    - `num_comments`
    - `objectID`
    - `matchedQueries`
  - 返回中文摘要：
    - 已启用 query 数
    - 本次执行 query 数
    - 返回 HN hits 数
    - 失败 query 数

- [ ] **Step 4: 明确边界处理**
  - 单 query 失败：记录 `last_result`，继续其他 query。
  - 全部 query 都失败：返回失败摘要，但不抛出阻断 RSS / Twitter。
  - `story_text` 缺失：不强造正文摘要。

- [ ] **Step 5: 运行验证**
  - `npm run test -- tests/hackernews/hackerNewsApiClient.test.ts tests/hackernews/hackerNewsCollector.test.ts`

## Task 3: 接入手动采集入口和统一入库

**Files:**

- Create: `src/core/hackernews/runHackerNewsCollection.ts`
- Modify: `src/core/content/contentRepository.ts`
- Modify: `src/main.ts`
- Test: `tests/content/contentRepository.test.ts`
- Test: `tests/hackernews/runHackerNewsCollection.test.ts`

- [ ] **Step 1: 先写 run 层测试**
  - 断言手动采集会调用 collector。
  - 断言新内容会写入 `content_items`。
  - 断言已有内容不会重复入库。
  - 断言多个 query 命中同一条内容时，会更新 `matchedQueries` 而不是新增第二条内容。

- [ ] **Step 2: 实现隐藏聚合 source**
  - 新增 `ensureHackerNewsContentSource(db)`。
  - `kind = hackernews_search`
  - `source_type = hackernews_aggregate`
  - 不进入普通来源列表。

- [ ] **Step 3: 实现 run 层**
  - `runHackerNewsCollection(db, options)`
  - 把 collector 结果映射成 `UpsertContentItemInput`
  - `externalId = hackernews:{objectID}`
  - `metadata_json` 保存：
    - `collector.kind`
    - `query`
    - `author`
    - `points`
    - `numComments`
    - `hnObjectId`
    - `hnCreatedAt`
    - `matchedQueries`
  - 汇总 action 结果：
    - 新增入库数
    - 复用已有内容数
    - 失败 query 数

- [ ] **Step 4: 扩展内容仓储 helper**
  - 为已有内容补更新 `metadata_json.matchedQueries` 的 helper。
  - 不破坏 Twitter 路径现有 metadata 写入。

- [ ] **Step 5: 运行验证**
  - `npm run test -- tests/content/contentRepository.test.ts tests/hackernews/runHackerNewsCollection.test.ts`

## Task 4: 接入系统页接口和前端 service

**Files:**

- Modify: `src/server/createServer.ts`
- Modify: `src/server/renderSystemPages.ts`
- Modify: `src/client/services/settingsApi.ts`
- Test: `tests/server/createServer.test.ts`
- Test: `tests/server/settingsApiRoutes.test.ts`
- Test: `tests/client/settingsApi.test.ts`

- [ ] **Step 1: 扩展 settings read model**
  - 把 HN query 列表并入 `/api/settings/sources`。
  - 返回 capability：
    - 是否可手动采集
    - 当前已启用 query 数
    - HN 分区最近状态说明
  - 不返回可编辑全局参数。

- [ ] **Step 2: 增加写接口**
  - `POST /actions/hackernews/create`
  - `POST /actions/hackernews/update`
  - `POST /actions/hackernews/delete`
  - `POST /actions/hackernews/toggle`
  - `POST /actions/hackernews/collect`

- [ ] **Step 3: 接入 main 依赖装配**
  - 注入 HN repository。
  - 注入 HN collector / run 层。
  - 不把 HN 接回默认 `POST /actions/collect`。

- [ ] **Step 4: 扩展前端 service**
  - `SettingsHackerNewsQuery`
  - `createHackerNewsQuery(payload)`
  - `updateHackerNewsQuery(payload)`
  - `deleteHackerNewsQuery(id)`
  - `toggleHackerNewsQuery(id, enable)`
  - `triggerManualHackerNewsCollect()`

- [ ] **Step 5: 运行验证**
  - `npm run test -- tests/server/createServer.test.ts tests/server/settingsApiRoutes.test.ts tests/client/settingsApi.test.ts`

## Task 5: 增加 `/settings/sources` 的 HN 搜索分区

**Files:**

- Modify: `src/client/pages/settings/SourcesPage.vue`
- Test: `tests/client/sourcesPage.test.ts`

- [ ] **Step 1: 增加 HN 分区结构**
  - 新增标题 `Hacker News 搜索`
  - 概览卡包含：
    - query 总数
    - 已启用数
    - 最近结果概览

- [ ] **Step 2: 增加 HN query 表格**
  - 列：
    - `Query`
    - `优先级`
    - `启用状态`
    - `最近成功`
    - `最近结果`
    - `备注`
    - `操作`
  - 最近结果需要能容纳“成功但 0 条新增”的摘要。

- [ ] **Step 3: 增加表单和按钮**
  - 按钮：
    - `新增 HN Query`
    - `手动采集 Hacker News`
  - 表单字段：
    - `Query`
    - `优先级`
    - `是否启用`
    - `备注`
  - 第一版不做全局参数设置区。

- [ ] **Step 4: 补前端交互测试**
  - 渲染独立 HN 分区。
  - 新增 / 编辑 payload 正确。
  - 启停动作正确。
  - 手动采集后能显示中文摘要。

- [ ] **Step 5: 运行验证**
  - `npm run test -- tests/client/sourcesPage.test.ts`
  - `npm run build:client`

## Task 6: 文档、来源边界和整体验证

**Files:**

- Modify: `src/core/source/loadEnabledSourceIssues.ts`
- Modify: `src/core/source/listSourceCards.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: 收口普通来源边界**
  - 确保 `hackernews_aggregate` 不被普通 RSS / 公众号采集或来源库存表误伤。
  - 确保内容页来源筛选里 HN 可以作为聚合来源出现。

- [ ] **Step 2: 更新文档**
  - `README.md` 增加 HN 搜索使用说明。
  - `AGENTS.md` 同步当前主链路、`/settings/sources` 分区能力、隐藏聚合 source 边界。

- [ ] **Step 3: 跑最相关验证**
  - `npm run test -- tests/db/runMigrations.test.ts tests/content/contentRepository.test.ts tests/hackernews/hackerNewsQueryRepository.test.ts tests/hackernews/hackerNewsApiClient.test.ts tests/hackernews/hackerNewsCollector.test.ts tests/hackernews/runHackerNewsCollection.test.ts tests/server/createServer.test.ts tests/server/settingsApiRoutes.test.ts tests/client/settingsApi.test.ts tests/client/sourcesPage.test.ts`
  - `npm run build:client`
  - `npm run build`

## 状态与异常边界

- HN 不需要 API key。
- 单 query 失败：只更新该 query 的 `last_result`，其他 query 继续。
- 全部 query 失败：本轮 HN 任务返回失败摘要，但 RSS / 微信公众号 / Twitter 不受影响。
- query 被停用：下一轮手动采集不再处理。
- 删除 query：删除配置，不删除历史内容。
- 相同 HN story 被重复命中：依赖 `externalId = hackernews:{objectID}` 防止重复入库。
- `url` 缺失：统一 fallback 到 `news.ycombinator.com/item?id={objectID}`。

## 风险与边界

- 第一版不做 query 命中关系表，所以内容页暂时不能“只看某个 HN query 的结果”。这是刻意收口，不是遗漏。
- 第一版只抓 `story`，会错过一部分高价值 `Ask HN` / 评论线程，但能明显降低噪音。
- 第一版不抓外链正文，所以某些只有标题、没有 `story_text` 的结果可读性会弱一些。这属于后续增强项。
- 如果后续确认 HN 数据质量稳定，再按设计文档中的顺序继续扩张，不要反过来先补 newest 或外链正文。
