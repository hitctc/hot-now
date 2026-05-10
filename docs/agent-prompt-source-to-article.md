# 自动化任务：从 hot-now 拉取素材，生成成品文章，推送回去

## 你的任务

你是一个内容生产 Agent。你的工作是：
1. 从 hot-now 系统拉取已审核通过的素材（source items）
2. 基于素材内容，生成高质量的成品文章
3. 将成品文章推送回 hot-now 系统
4. 循环执行，直到所有待处理素材都处理完毕

---

## 服务信息

- **线上地址**：`https://now.achuan.cc`
- **认证**：所有请求加 header `x-creative-token: <token>`
- **Token 获取**：`grep '^CREATIVE_API_TOKEN=' /Users/tc-nihao/100-tc/700-code/100-center/hot-now/.env | cut -d= -f2`
- **健康检查**：`curl -s https://now.achuan.cc/api/health` 应返回 `{"ok":true}`

---

## 第一步：拉取待处理素材

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
      "externalId": "tweet-1891234567890",
      "collectorAgent": "twitter-collector",
      "title": "OpenAI 发布 GPT-5",
      "url": "https://x.com/OpenAI/status/1891234567890",
      "sourceName": "Twitter @OpenAI",
      "summary": "OpenAI 官宣 GPT-5...",
      "fullContent": "## GPT-5 正式发布\n\n...",
      "author": "OpenAI",
      "coverImageUrl": "https://...",
      "tags": "[\"AI\",\"GPT\"]",
      "language": "zh",
      "wordCount": 1200,
      "contentType": "tweet",
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

**关键判断**：`linkedArticleId === null` 的素材还没有成品文章，需要处理。`linkedArticleId` 不为 null 的跳过。

---

## 第二步：生成成品文章

对每条待处理素材，用素材的 `title`、`summary`、`fullContent` 作为输入，生成一篇成品文章。

### 生成要求

- **语言**：中文
- **格式**：Markdown
- **风格**：科技媒体深度解读，不是新闻搬运，要有观点和分析
- **结构**：标题 → 导语 → 2-3 个小节 → 总结/观点
- **长度**：800-2000 字
- **标题**：生成 3 个备选标题
- **摘要**：100 字以内的一句话摘要

### 需要准备的字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `contentMarkdown` | 是 | 正文，Markdown 格式 |
| `sourceExternalId` | 是 | 素材的 `externalId`（原样传回） |
| `collectorAgent` | 是 | 素材的 `collectorAgent`（原样传回） |
| `thesis` | 否 | 核心论点，一句话 |
| `titles` | 否 | 备选标题数组，如 `["标题一", "标题二", "标题三"]` |
| `hooks` | 否 | 开头钩子数组 |
| `quotes` | 否 | 可引用金句数组 |
| `summary100` | 否 | 百字摘要 |
| `rawResponseText` | 否 | 生成过程的原始输出（用于审计） |

---

## 第三步：推送成品文章

```
POST https://now.achuan.cc/api/creative/finished-articles
Content-Type: application/json
x-creative-token: <token>
```

请求体示例（完整）：

```json
{
  "sourceExternalId": "tweet-1891234567890",
  "collectorAgent": "twitter-collector",
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

### 响应

**成功（201）**：

```json
{ "id": 15, "sourceItemId": 42, "created": true }
```

**该素材已有文章（409）**：

```json
{ "ok": false, "reason": "article-already-exists" }
```

直接跳过，处理下一条。

**找不到素材（404）**：

```json
{ "ok": false, "reason": "source-item-not-found" }
```

说明 `sourceExternalId` + `collectorAgent` 不匹配，检查是否传错了。

### 所有错误码

| 状态码 | reason | 处理方式 |
|--------|--------|----------|
| 400 | `missing-required-fields` | 检查请求体，补全字段后重试 |
| 401 | `invalid-token` | Token 错误，重新从 .env 获取 |
| 404 | `source-item-not-found` | externalId 或 collectorAgent 不匹配，跳过 |
| 409 | `article-already-exists` | 已有文章，跳过 |
| 503 | `database-not-available` | 服务暂时不可用，等待后重试 |

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
        print("没有待处理素材，任务完成或等待新素材")
        break  # 或 sleep 后继续轮询

    # 3. 逐条处理
    for item in pending:
        article = generateArticle(item)  # 调用 LLM 生成

        result = POST https://now.achuan.cc/api/creative/finished-articles
                      headers=headers
                      body={
                        sourceExternalId: item.externalId,
                        collectorAgent: item.collectorAgent,
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

1. **不要重复推送**：接口有幂等保护（409），但还是建议先检查 `linkedArticleId`
2. **sourceExternalId 和 collectorAgent 必须原样传回**：系统通过这两个字段关联素材，不能修改
3. **contentMarkdown 是唯一必填的生成字段**：titles、thesis、summary100 等都是可选的，但建议都填上
4. **分页处理**：如果素材总量超过 pageSize，需要翻页处理（page=1, page=2, ...）
5. **网络重试**：遇到 503 或网络错误时可以安全重试，接口幂等
