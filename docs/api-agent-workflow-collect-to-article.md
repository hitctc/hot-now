# 素材 → 成品文章 自动化流程 — 外部 Agent 接入文档

> 本文档描述外部 Agent 如何从 hot-now 拉取已收集的素材，生成成品文章，再推送回 hot-now 的完整流程。

---

## 服务信息

| 项目 | 值 |
|------|------|
| 线上地址 | `https://now.achuan.cc` |
| 认证方式 | 请求头 `x-creative-token: <token>` |
| Token 获取 | `grep '^CREATIVE_API_TOKEN=' /Users/tc-nihao/100-tc/700-code/100-center/hot-now/.env \| cut -d= -f2` |
| 健康检查 | `GET https://now.achuan.cc/api/health` → `{"ok":true}` |

---

## 完整流程

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  1. 拉取素材  │ ──► │  2. 生成文章  │ ──► │ 3. 推送成品文章 │
│  GET 素材列表 │     │  Agent 调 LLM │     │  POST 成品文章  │
└─────────────┘     └──────────────┘     └──────────────┘
```

---

## 第一步：拉取待处理素材

### 请求

```
GET https://now.achuan.cc/api/creative/source-items?qualityStatus=accepted&pageSize=50
x-creative-token: <token>
```

> **注意**：当前该接口只支持 session 认证（需要先登录）。自动化任务需要改为支持 token 认证。
> 改动位置：`src/server/createServer.ts` 约 750 行，将 `readSettingsApiSession` 替换为 `validateCreativeApiToken`。
> 改完后 Agent 就可以用同一个 token 完成全部流程。

### 查询参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `qualityStatus` | string | 过滤质量状态：`pending`、`accepted`、`rejected` |
| `collectorAgent` | string | 按采集 Agent 过滤 |
| `search` | string | 搜索标题和摘要 |
| `page` | number | 页码，默认 1 |
| `pageSize` | number | 每页条数，默认 20 |

Agent 应使用 `qualityStatus=accepted` 只拉取已通过质量审核的素材。

### 响应

```jsonc
{
  "items": [
    {
      "id": 42,
      "externalId": "tweet-1891234567890",
      "collectorAgent": "twitter-collector",
      "title": "OpenAI 发布 GPT-5",
      "url": "https://x.com/OpenAI/status/1891234567890",
      "sourceName": "Twitter @OpenAI",
      "summary": "OpenAI 官宣 GPT-5 模型...",
      "fullContent": "## GPT-5 正式发布\n\n...",
      "author": "OpenAI",
      "coverImageUrl": "https://...",
      "tags": "[\"AI\",\"GPT\"]",
      "language": "zh",
      "wordCount": 1200,
      "contentType": "tweet",
      "score": 88,
      "publishedAt": "2026-05-10T08:30:00Z",
      "collectorTimestamp": "2026-05-10T09:15:00Z",
      "qualityStatus": "accepted",

      // 关键字段：如果已有成品文章，这里非 null，跳过
      "linkedArticleId": null,

      "rawPayloadJson": "...",
      "createdAt": "2026-05-10T09:15:00Z",
      "updatedAt": "2026-05-10T10:00:00Z"
    }
    // ...
  ],
  "total": 156,
  "page": 1,
  "pageSize": 50
}
```

### 筛选逻辑

Agent 拿到列表后，**跳过 `linkedArticleId` 不为 null 的素材**（已有成品文章），只处理 `linkedArticleId === null` 的素材。

---

## 第二步：生成成品文章

Agent 使用 LLM 根据素材内容生成成品文章。以下是推送时需要的字段，Agent 在生成时应准备好：

| 字段 | 必填 | 说明 |
|------|------|------|
| `contentMarkdown` | **是** | 成品文章正文，Markdown 格式 |
| `mode` | 否 | 模式标识：`"A"` 或 `"B"`，可用于 A/B 测试不同风格 |
| `thesis` | 否 | 文章核心论点（一句话） |
| `titles` | 否 | 备选标题数组，如 `["标题一", "标题二", "标题三"]` |
| `hooks` | 否 | 开头钩子数组，如 `["钩子一", "钩子二"]` |
| `quotes` | 否 | 可引用的金句数组 |
| `summary100` | 否 | 百字摘要 |
| `images` | 否 | 图片数组，每项包含 `url` 和可选 `alt` |
| `rawResponseText` | 否 | LLM 原始输出（用于审计和调试） |

### 最小可用 payload

只需要 `contentMarkdown`，其余字段按需填充：

```json
{
  "contentMarkdown": "# GPT-5 正式发布：这意味着什么\n\n## 核心变化\n\nOpenAI 今天正式发布了 GPT-5..."
}
```

---

## 第三步：推送成品文章

### 请求

```
POST https://now.achuan.cc/api/creative/finished-articles
Content-Type: application/json
x-creative-token: <token>
```

### 请求体

```jsonc
{
  // ── 必填 ──
  "sourceExternalId": "string",       // 对应素材的 externalId（第一步拉取到的）
  "collectorAgent": "string",         // 对应素材的 collectorAgent（第一步拉取到的）
  "contentMarkdown": "string",        // 成品文章正文（Markdown）

  // ── 可选 ──
  "mode": "A",                        // 模式：A 或 B
  "thesis": "一句话核心论点",
  "titles": ["标题一", "标题二", "标题三"],
  "hooks": ["开头钩子一", "开头钩子二"],
  "quotes": ["金句一", "金句二"],
  "summary100": "百字以内的摘要",
  "images": [
    { "url": "https://example.com/img.jpg", "alt": "配图说明" }
  ],
  "rawResponseText": "LLM 原始输出文本"
}
```

> `sourceExternalId` 和 `collectorAgent` 必须与第一步拉取到的素材完全匹配，
> 系统通过这两个字段定位对应的素材记录。

### 完整请求示例

```json
{
  "sourceExternalId": "tweet-1891234567890",
  "collectorAgent": "twitter-collector",
  "contentMarkdown": "# GPT-5 正式发布：这意味着什么\n\n## 核心变化\n\nOpenAI 今天正式发布了 GPT-5，带来以下重大更新：\n\n- 1M token 上下文窗口\n- 原生多模态推理\n- 工具调用准确率提升 40%\n\n## 行业影响\n\n这次发布标志着大模型竞争进入新阶段...",
  "thesis": "GPT-5 的发布将大模型竞争推向新高度，1M 上下文窗口改变了应用边界",
  "titles": [
    "GPT-5 来了：1M 上下文窗口意味着什么",
    "OpenAI 发布 GPT-5，大模型竞争白热化",
    "GPT-5 上手体验：这次升级到底有多大"
  ],
  "summary100": "OpenAI 正式发布 GPT-5，支持 1M 上下文窗口和原生多模态推理，工具调用准确率提升 40%",
  "mode": "A"
}
```

### 响应

**成功（201）**

```json
{
  "id": 15,
  "sourceItemId": 42,
  "created": true
}
```

系统自动将素材的 `linkedArticleId` 指向新创建的文章，下次拉取素材列表时该条目会被跳过。

### 错误响应

| HTTP 状态码 | reason | 触发条件 |
|-------------|--------|----------|
| 400 | `missing-required-fields` | `sourceExternalId`、`collectorAgent`、`contentMarkdown` 任一缺失 |
| 401 | `invalid-token` | token 不匹配 |
| 404 | `source-item-not-found` | 找不到对应的素材（`sourceExternalId` + `collectorAgent` 不匹配） |
| 409 | `article-already-exists` | 该素材已有成品文章，不能重复创建 |
| 503 | `creative-api-token-not-configured` | 服务端未配置 token |
| 503 | `database-not-available` | 数据库不可用 |

---

## 自动化循环

Agent 可按以下逻辑循环运行：

```
1. GET  /api/creative/source-items?qualityStatus=accepted&pageSize=50
2. 过滤出 linkedArticleId === null 的素材
3. 如果没有待处理素材 → 等待后重试
4. 对每条素材：
   a. 用素材的 title + summary + fullContent 作为输入
   b. 调用 LLM 生成成品文章
   c. POST /api/creative/finished-articles 推送结果
   d. 记录 sourceExternalId + collectorAgent + 返回的 article id
5. 回到第 1 步
```

### 去重保障

- 素材维度：`linkedArticleId !== null` 的素材已有文章，跳过即可
- 接口维度：`POST` 成品文章时，如果该素材已有文章，返回 `409 article-already-exists`，Agent 直接跳过，不需要自行去重

---

## 已完成

- [x] **查询素材接口已支持 token 认证**。`GET /api/creative/source-items` 同时支持 `x-creative-token`（外部 Agent）和 session cookie（管理 UI）两种认证方式。
