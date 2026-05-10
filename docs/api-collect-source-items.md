# 素材推送接口 — 外部 Agent 接入文档

> 本文档面向外部采集 Agent，说明如何向 hot-now 推送原始素材（source items）。
> 成品文章（finished articles）推送接口另行提供。

---

## 服务地址与认证信息

### 推送地址

外部 Agent 应推送到**线上服务器**，数据写入服务器的 SQLite。

```
https://now.achuan.cc
```

完整推送端点：`POST https://now.achuan.cc/api/creative/source-items`

### 获取认证 Token

Token 在服务器上通过环境变量 `CREATIVE_API_TOKEN` 配置。如果 Agent 运行在本机，可以从本地项目文件读取：

```bash
# 项目路径
/Users/tc-nihao/100-tc/700-code/100-center/hot-now

# 提取 token
grep '^CREATIVE_API_TOKEN=' /Users/tc-nihao/100-tc/700-code/100-center/hot-now/.env | cut -d= -f2
```

> 注意：本地 `.env` 中的 token 是开发环境值。线上服务器的 token 以服务器 `/srv/hot-now/shared/.env` 中的值为准。如果本地和线上 token 不同，需要向管理员确认线上 token。

### 确认服务可用

```bash
curl -s https://now.achuan.cc/api/health
```

返回 `{"ok":true}` 说明服务正常。

---

## 基本约定

| 项目 | 说明 |
|------|------|
| Base URL | `https://now.achuan.cc` |
| 协议 | HTTPS |
| 编码 | UTF-8，JSON body |
| 认证 | 请求头 `x-creative-token: <token>` |
| 幂等性 | 同一 `externalId` + `collectorAgent` 组合重复推送不会覆盖，返回已有记录的 ID |

---

## 接口

### POST `/api/creative/source-items`

推送一条原始素材。适用于：RSS 文章、Twitter 帖子、Hacker News 帖子、B 站视频、微信公众号文章、微博等任何可被采集的内容。

#### 请求

```
POST /api/creative/source-items
Content-Type: application/json
x-creative-token: <your-token>
```

#### 请求体

```jsonc
{
  // ── 必填字段 ──────────────────────────────────────────────
  "externalId": "string",          // 该素材在来源系统中的唯一标识（如推文 ID、HN post ID、文章 URL hash）
  "collectorAgent": "string",      // 采集 Agent 标识，用于区分不同采集器（如 "twitter-collector"、"hn-collector"）
  "title": "string",               // 素材标题
  "url": "string",                 // 素材原始链接（必须可访问）

  // ── 可选字段 ──────────────────────────────────────────────
  "sourceName": "string | null",   // 来源名称（如 "Twitter @elonmusk"、"Hacker News"）
  "summary": "string | null",      // 摘要 / 简述
  "fullContent": "string | null",  // 全文内容（Markdown 或纯文本）
  "author": "string | null",       // 作者名
  "coverImageUrl": "string | null",// 封面图片 URL
  "tags": "string | string[] | null",  // 标签。字符串（逗号分隔）或字符串数组均可
  "language": "string",            // 语言代码，默认 "zh"
  "wordCount": "number | null",    // 正文字数
  "contentType": "string | null",  // 内容类型标识（如 "tweet"、"article"、"video"）
  "score": "number | null",        // 采集时的原始评分（0-100）
  "publishedAt": "string | null",  // 原始发布时间，ISO 8601 格式（如 "2026-05-10T08:30:00Z"）
  "collectorTimestamp": "string | null"  // 采集时间戳，ISO 8601 格式
}
```

#### 最小可用请求示例

```json
{
  "externalId": "hn-42134567",
  "collectorAgent": "hn-collector",
  "title": "OpenAI announces GPT-5",
  "url": "https://news.ycombinator.com/item?id=42134567"
}
```

#### 完整请求示例

```json
{
  "externalId": "tweet-1891234567890",
  "collectorAgent": "twitter-collector",
  "title": "我们刚刚发布了 Claude 5",
  "url": "https://x.com/AnthropicAI/status/1891234567890",
  "sourceName": "Twitter @AnthropicAI",
  "summary": "Anthropic 官宣 Claude 5 模型上线，支持 1M 上下文窗口和原生工具调用",
  "fullContent": "## Claude 5 正式发布\n\n今天我们很高兴地宣布 Claude 5 已正式上线...\n\n### 主要特性\n- 1M 上下文窗口\n- 原生工具调用\n- 多模态推理",
  "author": "Anthropic",
  "coverImageUrl": "https://pbs.twimg.com/media/example.jpg",
  "tags": ["AI", "Claude", "Anthropic", "LLM"],
  "language": "zh",
  "wordCount": 850,
  "contentType": "tweet",
  "score": 92,
  "publishedAt": "2026-05-10T08:30:00Z",
  "collectorTimestamp": "2026-05-10T09:15:00Z"
}
```

#### 响应

**成功 — 新创建（201）**

```json
{
  "id": 42,
  "externalId": "hn-42134567",
  "created": true
}
```

**成功 — 已存在，幂等返回（200）**

相同 `externalId` + `collectorAgent` 重复推送时返回已有记录，不做任何覆盖。

```json
{
  "id": 42,
  "externalId": "hn-42134567",
  "created": false
}
```

通过 `created` 字段区分是新建还是已存在，`id` 是系统内部的主键。

#### 错误响应

所有错误响应体格式统一：

```json
{
  "ok": false,
  "reason": "string"
}
```

| HTTP 状态码 | reason | 触发条件 |
|-------------|--------|----------|
| 400 | `missing-required-fields` | `externalId`、`collectorAgent`、`title`、`url` 任一缺失或为空字符串 |
| 401 | `invalid-token` | `x-creative-token` 请求头缺失或不匹配 |
| 503 | `creative-api-token-not-configured` | 服务端未配置 token（环境变量 `CREATIVE_API_TOKEN` 未设置） |
| 503 | `database-not-available` | 数据库不可用 |

---

## 字段补充说明

### `externalId` 设计建议

- 应在 `collectorAgent` 范围内全局唯一
- 推荐格式：`{来源类型}-{原始ID}`，如 `tweet-1891234567890`、`hn-42134567`、`bili-BV1xx411c7mD`
- 不要用 URL 作为 externalId（URL 可能过长且包含查询参数变化），URL 放 `url` 字段

### `collectorAgent` 设计建议

- 用简短英文标识，如 `twitter-collector`、`hn-collector`、`rss-techcrunch`
- 同一 Agent 内的 `externalId` 必须唯一；不同 Agent 之间允许 `externalId` 冲突

### `tags` 字段

支持两种格式，等价处理：
- 字符串：`"AI, Claude, Anthropic"`（逗号分隔）
- 数组：`["AI", "Claude", "Anthropic"]`

### `score` 字段

- 0-100 整数，由采集 Agent 自行打分
- 进入系统后可由编辑手动调整质量状态（pending → accepted / rejected）
- score 不影响质量状态，只是采集时的参考评分

---

## 幂等性保障

接口天然幂等，设计为可安全重试：

1. 发送请求 → 收到网络错误或超时 → 直接重发即可
2. 首次推送返回 `201` + `created: true`
3. 重复推送返回 `200` + `created: false`（返回相同 `id`，不覆盖已有数据）

Agent 不需要自行实现去重逻辑，只需保证每次推送时 `externalId` + `collectorAgent` 组合一致即可。

---

## 快速测试

```bash
# 确认服务可用
curl -s https://now.achuan.cc/api/health

# 推送一条测试素材（替换 $TOKEN 为实际值）
curl -X POST https://now.achuan.cc/api/creative/source-items \
  -H "Content-Type: application/json" \
  -H "x-creative-token: $TOKEN" \
  -d '{
    "externalId": "test-001",
    "collectorAgent": "test-agent",
    "title": "测试素材",
    "url": "https://example.com/test-001"
  }'
```

成功后应返回 `{"id":...,"externalId":"test-001","created":true}`。
