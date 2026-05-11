# 自动化任务：素材采集 + 成品文章生成

## 你的任务

你是一个内容生产 Agent，负责三条自动化链路：

**链路 A：采集外部素材并推送**
1. 从外部数据源采集科技资讯
2. 推送到 hot-now 素材库，直接标记为已审核

**链路 C：从 AI 新讯 feed 拉取高分候选并推送为素材**
1. 从 hot-now AI 新讯 feed 拉取评分 ≥ 80 的候选文章
2. 自行抓取原文（`fullContent` 为 null 时）
3. 推送到 hot-now 素材库，标记为已审核

**链路 B：生成成品文章**
1. 从 hot-now 拉取已审核但未生成文章的素材
2. 用 LLM 生成高质量成品文章
3. 推送回 hot-now 系统

---

## 服务信息

- **线上地址**：`https://now.achuan.cc`
- **认证**：所有请求加 header `x-creative-token: <token>`
- **Token 获取**：`grep '^CREATIVE_API_TOKEN=' /Users/tc-nihao/100-tc/700-code/100-center/hot-now/.env | cut -d= -f2`
- **健康检查**：`curl -s https://now.achuan.cc/api/health` 应返回 `{"ok":true}`

---

## 链路 A：推送素材

### POST `/api/creative/source-items`

```
POST https://now.achuan.cc/api/creative/source-items
Content-Type: application/json
x-creative-token: <token>
```

#### 请求体

```jsonc
{
  // ── 必填 ──
  "externalId": "string",          // 来源系统中的唯一标识
  "collectorAgent": "string",      // 采集器标识，如 "aihot-collector"
  "title": "string",               // 标题
  "url": "string",                 // 原始链接

  // ── 可选 ──
  "sourceName": "string",          // 来源名称，如 "Hacker News"
  "summary": "string",             // 摘要
  "fullContent": "string",         // 解析后的全文内容（尽量提供）
  "author": "string",              // 作者
  "coverImageUrl": "string",       // 封面图 URL
  "tags": "string | string[]",     // 标签
  "language": "string",            // 语言代码，默认 "zh"
  "wordCount": "number",           // 正文字数
  "contentType": "string",         // 内容类型，如 "tweet"、"article"
  "score": "number",               // 评分 0-100
  "publishedAt": "string",         // 发布时间 ISO 8601
  "collectorTimestamp": "string",  // 采集时间 ISO 8601
  "qualityStatus": "accepted"      // 直接标记为已审核，跳过人工审核
}
```

**重要**：推送时传 `"qualityStatus": "accepted"` 可直接标记为已审核，Writer Agent 就能立即拉取并生成文章。不传则默认 `pending`，需要人工审核。

#### 幂等与空字段补充

- 相同 `externalId` + `collectorAgent` 重复推送时不会报错（200 或 201）
- **空字段补充**：如果 DB 中某字段为空而新推送有值，会自动补充更新
- 已有数据的字段**不会被覆盖**
- 采集器升级后重新推送即可补充 `fullContent` 等之前缺失的字段

#### 响应

**新创建（201）**：

```json
{ "id": 42, "externalId": "xxx", "created": true }
```

**已存在（200）**：空字段已补充（如有）

```json
{ "id": 42, "externalId": "xxx", "created": false }
```

#### 错误码

| 状态码 | reason | 处理方式 |
|--------|--------|----------|
| 400 | `missing-required-fields` | 补全 externalId、collectorAgent、title、url |
| 401 | `invalid-token` | 重新获取 token |
| 503 | `database-not-available` | 等待后重试 |

---

## 链路 C：从 AI 新讯 feed 拉取高分候选

### GET `/api/creative/feed/ai-new`

```
GET https://now.achuan.cc/api/creative/feed/ai-new?minScore=80
x-creative-token: <token>
```

#### 查询参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `minScore` | number | 80 | 分数下限（0–100 整数），过滤 contentScore 低于此值的条目 |

#### 响应示例

```json
{
  "ok": true,
  "total": 23,
  "items": [
    {
      "id": 1234,
      "title": "OpenAI 发布 GPT-5",
      "summary": "OpenAI 官宣 GPT-5...",
      "fullContent": "## GPT-5 正式发布\n\n...",
      "canonicalUrl": "https://techcrunch.com/...",
      "publishedAt": "2026-05-12T08:00:00.000Z",
      "contentScore": 87,
      "sourceName": "TechCrunch",
      "sourceKind": "techcrunch_ai"
    }
  ]
}
```

#### 字段说明

| 字段 | 说明 |
|------|------|
| `contentScore` | 0–100 整数，hot-now 内部综合评分（时效、来源、完整度、AI 相关性等） |
| `fullContent` | 原文 Markdown，**RSS 来源大多为 null**，null 时需自行用 `canonicalUrl` 抓取 |
| `canonicalUrl` | 原始链接，推素材时作为 `url` 字段传入 |
| `id` | hot-now 内部 content_item id，仅用于参考，不需要传回 |

**接口已自动去重**：已推入素材库的 URL 不会再出现在返回列表中，无需 Agent 侧去重。固定返回最多 50 条，不分页。

#### 推送到素材库

拿到候选后，按链路 A 的推送接口将条目写入素材库。推荐字段映射：

```jsonc
{
  "externalId": "hotnow-<id>",          // 用 hot-now id 构造，避免重复
  "collectorAgent": "hotnow-feed",       // 固定标识
  "title": "<title>",
  "url": "<canonicalUrl>",
  "sourceName": "<sourceName>",
  "summary": "<summary>",
  "fullContent": "<fullContent 或自行抓取的原文>",
  "score": "<contentScore>",
  "publishedAt": "<publishedAt>",
  "qualityStatus": "accepted"
}
```

---

## 链路 B：拉取素材 → 生成文章 → 推送

### 第一步：拉取待处理素材

```
GET https://now.achuan.cc/api/creative/source-items?qualityStatus=accepted&pageSize=50
x-creative-token: <token>
```

查询参数（均可选）：
- `qualityStatus=accepted` — 只拉取已审核通过的素材
- `collectorAgent=xxx` — 按采集来源过滤
- `search=关键词` — 搜索标题和摘要
- `page=1` — 页码
- `pageSize=50` — 每页条数

响应示例：

```json
{
  "items": [
    {
      "id": 42,
      "externalId": "hn-42134567",
      "collectorAgent": "aihot-collector",
      "title": "OpenAI 发布 GPT-5",
      "url": "https://news.ycombinator.com/item?id=42134567",
      "sourceName": "Hacker News",
      "summary": "OpenAI 官宣 GPT-5...",
      "fullContent": "## GPT-5 正式发布\n\n...",
      "author": "OpenAI",
      "coverImageUrl": "https://...",
      "tags": "[\"AI\",\"GPT\"]",
      "language": "zh",
      "wordCount": 1200,
      "contentType": "article",
      "score": 88,
      "publishedAt": "2026-05-10T08:30:00Z",
      "qualityStatus": "accepted",
      "linkedArticleId": null,
      "createdAt": "2026-05-10T09:15:00Z"
    }
  ],
  "total": 30,
  "page": 1,
  "pageSize": 50
}
```

**关键判断**：`linkedArticleId === null` 的素材没有成品文章，需要处理。不为 null 的跳过。

### 第二步：生成成品文章

用素材的 `title`、`summary`、`fullContent` 作为输入，生成成品文章。

#### 生成要求

- **语言**：中文
- **格式**：Markdown
- **风格**：科技媒体深度解读，不是新闻搬运，要有观点和分析
- **结构**：标题 → 导语 → 2-3 个小节 → 总结/观点
- **长度**：800-2000 字
- **标题**：生成 3-5 个备选标题
- **摘要**：100 字以内的一句话摘要
- **模式**：传 `"mode": "A"`

#### 需要准备的字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `contentMarkdown` | 是 | 正文，Markdown 格式 |
| `sourceExternalId` | 是 | 素材的 `externalId`（原样传回） |
| `collectorAgent` | 是 | 素材的 `collectorAgent`（原样传回） |
| `mode` | 否 | 模式：`"A"` 或 `"B"` |
| `thesis` | 否 | 核心论点，一句话 |
| `titles` | 否 | 备选标题数组，如 `["标题一", "标题二", "标题三"]` |
| `hooks` | 否 | 开头钩子数组 |
| `quotes` | 否 | 可引用金句数组 |
| `summary100` | 否 | 百字摘要 |
| `rawResponseText` | 否 | 生成过程的原始输出（用于审计） |

### 第三步：推送成品文章

```
POST https://now.achuan.cc/api/creative/finished-articles
Content-Type: application/json
x-creative-token: <token>
```

请求体示例：

```json
{
  "sourceExternalId": "hn-42134567",
  "collectorAgent": "aihot-collector",
  "mode": "A",
  "contentMarkdown": "# GPT-5 正式发布：这意味着什么\n\n## 核心变化\n\nOpenAI 今天正式发布了 GPT-5...\n\n## 行业影响\n\n这次发布标志着...",
  "thesis": "GPT-5 将大模型竞争推向新阶段",
  "titles": [
    "GPT-5 来了：1M 上下文窗口意味着什么",
    "OpenAI 发布 GPT-5，大模型竞争白热化",
    "GPT-5 上手体验：这次升级到底有多大"
  ],
  "summary100": "OpenAI 正式发布 GPT-5，支持 1M 上下文窗口，工具调用准确率提升 40%"
}
```

#### 响应

**成功（201）**：

```json
{ "id": 15, "sourceItemId": 42, "created": true }
```

**该素材已有文章（409）**：

```json
{ "ok": false, "reason": "article-already-exists" }
```

直接跳过，处理下一条。

#### 错误码

| 状态码 | reason | 处理方式 |
|--------|--------|----------|
| 400 | `missing-required-fields` | 检查请求体，补全字段后重试 |
| 401 | `invalid-token` | Token 错误，重新获取 |
| 404 | `source-item-not-found` | externalId 或 collectorAgent 不匹配，跳过 |
| 409 | `article-already-exists` | 已有文章，跳过 |
| 503 | `database-not-available` | 服务暂时不可用，等待后重试 |

---

## 辅助接口：更新素材质量状态

如果需要手动将 pending 素材标记为 accepted 或 rejected：

```
POST https://now.achuan.cc/actions/creative/source-items/:id/quality-status
Content-Type: application/json
x-creative-token: <token>

{ "qualityStatus": "accepted" }
```

`qualityStatus` 允许值：`"accepted"` 或 `"rejected"`。

---

## 执行流程（伪代码）

```
token = 从 .env 文件获取 CREATIVE_API_TOKEN
headers = { "x-creative-token": token }

loop:
    # 1. 拉取素材
    response = GET https://now.achuan.cc/api/creative/source-items
                 ?qualityStatus=accepted&pageSize=50
                 headers=headers

    # 2. 过滤出未处理的素材
    pending = response.items.filter(item => item.linkedArticleId === null)

    if pending.length === 0:
        print("没有待处理素材，等待新素材")
        sleep
        continue

    # 3. 逐条处理
    for item in pending:
        article = generateArticle(item)

        result = POST https://now.achuan.cc/api/creative/finished-articles
                      headers=headers
                      body={
                        sourceExternalId: item.externalId,
                        collectorAgent: item.collectorAgent,
                        mode: "A",
                        contentMarkdown: article.contentMarkdown,
                        titles: article.titles,
                        thesis: article.thesis,
                        summary100: article.summary100
                      }

        if result.status == 201:
            print(f"✓ 素材 {item.externalId} → 文章 #{result.id}")
        elif result.status == 409:
            print(f"→ 素材 {item.externalId} 已有文章，跳过")
        else:
            print(f"✗ 素材 {item.externalId} 推送失败: {result.reason}")
```

---

## 注意事项

1. **fullContent 说明**：链路 A 推送时尽量提供全文；链路 C 从 feed 拉取时，RSS 来源的 `fullContent` 大多为 null，需用 `canonicalUrl` 自行抓取原文后再推入素材库
2. **推送时传 qualityStatus: "accepted"**：跳过人工审核，Writer Agent 可立即拉取处理
3. **sourceExternalId 和 collectorAgent 必须原样传回**：系统通过这两个字段关联素材和成品文章
4. **幂等安全**：重复推送素材不会覆盖已有数据，但会补充空字段；重复推送成品文章会返回 409
5. **分页处理**：素材总量超过 pageSize 时需要翻页（page=1, page=2, ...）
6. **网络重试**：遇到 503 或网络错误可以安全重试
