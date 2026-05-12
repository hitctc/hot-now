# 素材推送接口 — 外部 Agent 接入文档

> 本文档面向外部采集 Agent，说明如何向 hot-now 推送原始素材（source items）。

---

## 服务地址与认证信息

### 推送地址

外部 Agent 应推送到**线上服务器**，数据写入服务器的 SQLite。

```
https://now.achuan.cc
```

完整推送端点：`POST https://now.achuan.cc/api/creative/source-items`

### 获取认证 Token

Token 在服务器上通过环境变量 `CREATIVE_API_TOKEN` 配置。本地项目文件也可读取：

```bash
grep '^CREATIVE_API_TOKEN=' /Users/tc-nihao/100-tc/700-code/100-center/hot-now/.env | cut -d= -f2
```

> 注意：本地 `.env` 中的 token 是开发环境值。线上服务器的 token 以服务器 `/srv/hot-now/shared/.env` 中的值为准。

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
| 幂等性 | 相同 `externalId` + `collectorAgent` 重复推送不报错，空字段可补充，已有数据不覆盖 |

---

## 接口

### POST `/api/creative/source-items`

推送一条原始素材。适用于：RSS 文章、Twitter 帖子、Hacker News 帖子、B 站视频、微信公众号文章、微博等任何可被采集的内容。

#### 请求

```
POST https://now.achuan.cc/api/creative/source-items
Content-Type: application/json
x-creative-token: <token>
```

#### 请求体

```jsonc
{
  // ── 必填字段 ──
  "externalId": "string",          // 来源系统中的唯一标识
  "collectorAgent": "string",      // 采集器标识，如 "aihot-collector"
  "title": "string",               // 标题
  "url": "string",                 // 原始链接

  // ── 可选字段 ──
  "sourceName": "string",          // 来源名称，如 "Hacker News"
  "summary": "string",             // 摘要
  "fullContent": "string",         // 解析后的全文内容（尽量提供）
  "author": "string",              // 作者
  "coverImageUrl": "string",       // 封面图 URL
  "tags": "string | string[]",     // 标签。字符串或数组均可
  "language": "string",            // 语言代码，默认 "zh"
  "wordCount": "number",           // 正文字数
  "contentType": "string",         // 内容类型，如 "tweet"、"article"
  "score": "number",               // 评分 0-100
  "publishedAt": "string",         // 发布时间 ISO 8601
  "collectorTimestamp": "string",  // 采集时间 ISO 8601
  "writingStatus": "ready"      // 直接标记为待写作，跳过等待直接进入待写作
}
```

#### 最小可用请求

```json
{
  "externalId": "hn-42134567",
  "collectorAgent": "aihot-collector",
  "title": "OpenAI announces GPT-5",
  "url": "https://news.ycombinator.com/item?id=42134567"
}
```

#### 推荐请求（带全文 + 直接标记待写作）

```json
{
  "externalId": "hn-42134567",
  "collectorAgent": "aihot-collector",
  "title": "OpenAI announces GPT-5",
  "url": "https://news.ycombinator.com/item?id=42134567",
  "sourceName": "Hacker News",
  "summary": "OpenAI 官宣 GPT-5 模型上线",
  "fullContent": "## GPT-5 正式发布\n\n今天 OpenAI 宣布...",
  "author": "OpenAI",
  "tags": ["AI", "GPT"],
  "score": 92,
  "contentType": "article",
  "publishedAt": "2026-05-10T08:30:00Z",
  "writingStatus": "ready"
}
```

#### 响应

**成功 — 新创建（201）**

```json
{ "id": 42, "externalId": "hn-42134567", "created": true }
```

**成功 — 已存在，空字段已补充（200）**

相同 `externalId` + `collectorAgent` 重复推送时，如果 DB 中有空字段而新推送有值，会自动补充。

```json
{ "id": 42, "externalId": "hn-42134567", "created": false }
```

通过 `created` 字段区分新建还是已存在。

#### 错误响应

| HTTP 状态码 | reason | 触发条件 |
|-------------|--------|----------|
| 400 | `missing-required-fields` | `externalId`、`collectorAgent`、`title`、`url` 任一缺失或为空 |
| 401 | `invalid-token` | `x-creative-token` 不匹配 |
| 503 | `creative-api-token-not-configured` | 服务端未配置 token |
| 503 | `database-not-available` | 数据库不可用 |

---

## 幂等性与空字段补充

接口天然幂等，设计为可安全重试：

1. 首次推送 → 201 + `created: true`
2. 重复推送 → 200 + `created: false`
3. **空字段补充**：如果 DB 中某字段为 NULL 而新推送有值，会自动更新该字段
4. 已有数据的字段**不会被覆盖**

受空字段补充影响的字段：`fullContent`、`summary`、`sourceName`、`author`、`coverImageUrl`、`tags`、`wordCount`、`contentType`、`score`、`publishedAt`、`collectorTimestamp`

采集器升级后重新推送即可补充之前缺失的字段（如 `fullContent`），无需担心覆盖已有数据。

---

## 辅助接口

### 更新素材质量状态

```
POST https://now.achuan.cc/actions/creative/source-items/:id/writing-status
Content-Type: application/json
x-creative-token: <token>

{ "writingStatus": "ready" }
```

允许值：`"ready"` 或 `"skipped"`。

### 查询素材列表

```
GET https://now.achuan.cc/api/creative/source-items?writingStatus=ready&pageSize=50
x-creative-token: <token>
```

查询参数：`writingStatus`、`collectorAgent`、`search`、`page`、`pageSize`。

---

## 字段补充说明

### `externalId` 设计建议

- 在 `collectorAgent` 范围内全局唯一
- 推荐格式：`{来源类型}-{原始ID}`，如 `tweet-1891234567890`、`hn-42134567`

### `collectorAgent` 设计建议

- 简短英文标识，如 `aihot-collector`、`hn-collector`
- 不同 Agent 之间允许 `externalId` 冲突

### `fullContent` 字段

- 尽量提供解析后的原文全文
- 部分数据源（如 RSS 摘要）可能无法提取全文，此时可不传
- 素材库页面会直接展示该字段内容，无原文时标注"采集未提供原文"
- 后续重新推送可补充

### `writingStatus` 字段

- `"ready"` — 待写作，Writer Agent 可立即拉取生成文章（默认值）
- `"writing"` — 写作中
- `"done"` — 已完成
- `"skipped"` — 跳过不写
- 推荐自动化场景传 `"ready"`

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
    "url": "https://example.com/test-001",
    "fullContent": "这是测试素材的全文内容。",
    "writingStatus": "ready"
  }'
```

成功后应返回 `{"id":...,"externalId":"test-001","created":true}`。
