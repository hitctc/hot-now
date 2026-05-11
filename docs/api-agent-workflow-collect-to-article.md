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

所有接口均使用 `x-creative-token` 认证。

---

## 第一步：拉取待处理素材

### 请求

```
GET https://now.achuan.cc/api/creative/source-items?qualityStatus=accepted&pageSize=50
x-creative-token: <token>
```

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
      "externalId": "hn-42134567",
      "collectorAgent": "aihot-collector",
      "title": "OpenAI 发布 GPT-5",
      "url": "https://news.ycombinator.com/item?id=42134567",
      "sourceName": "Hacker News",
      "summary": "OpenAI 官宣 GPT-5...",
      "fullContent": "## GPT-5 正式发布\n\n...",
      "qualityStatus": "accepted",
      "linkedArticleId": null  // 关键字段：null 表示没有成品文章
    }
  ],
  "total": 30,
  "page": 1,
  "pageSize": 50
}
```

### 筛选逻辑

**跳过 `linkedArticleId` 不为 null 的素材**（已有成品文章），只处理 `linkedArticleId === null` 的素材。

---

## 第二步：生成成品文章

Agent 使用 LLM 根据素材内容生成成品文章。以下是推送时需要的字段：

| 字段 | 必填 | 说明 |
|------|------|------|
| `contentMarkdown` | 是 | 成品文章正文，Markdown 格式 |
| `sourceExternalId` | 是 | 素材的 `externalId`（原样传回） |
| `collectorAgent` | 是 | 素材的 `collectorAgent`（原样传回） |
| `mode` | 否 | 模式标识：`"A"` 或 `"B"` |
| `thesis` | 否 | 文章核心论点（一句话） |
| `titles` | 否 | 备选标题数组 |
| `hooks` | 否 | 开头钩子数组 |
| `quotes` | 否 | 可引用的金句数组 |
| `summary100` | 否 | 百字摘要 |
| `rawResponseText` | 否 | LLM 原始输出（用于审计） |

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
  // 必填
  "sourceExternalId": "hn-42134567",
  "collectorAgent": "aihot-collector",
  "contentMarkdown": "# GPT-5 正式发布\n\n## 核心变化\n\n...",

  // 可选
  "mode": "A",
  "thesis": "GPT-5 将大模型竞争推向新阶段",
  "titles": ["标题一", "标题二", "标题三"],
  "summary100": "百字摘要"
}
```

### 响应

**成功（201）**：

```json
{ "id": 15, "sourceItemId": 42, "created": true }
```

系统自动将素材的 `linkedArticleId` 指向新创建的文章。

### 错误码

| 状态码 | reason | 处理方式 |
|--------|--------|----------|
| 400 | `missing-required-fields` | 补全字段后重试 |
| 401 | `invalid-token` | 重新获取 token |
| 404 | `source-item-not-found` | externalId 或 collectorAgent 不匹配，跳过 |
| 409 | `article-already-exists` | 已有文章，跳过 |
| 503 | `database-not-available` | 等待后重试 |

---

## 辅助接口

### 更新素材质量状态

```
POST https://now.achuan.cc/actions/creative/source-items/:id/quality-status
x-creative-token: <token>

{ "qualityStatus": "accepted" }
```

允许值：`"accepted"` 或 `"rejected"`。

---

## 已完成

- [x] **查询素材接口已支持 token 认证**。所有 creative 模块接口统一使用 `x-creative-token`。
- [x] **推送素材接口支持 `qualityStatus` 字段**。传 `"accepted"` 跳过人工审核。
- [x] **幂等推送支持空字段补充**。重复推送时 DB 中为空的字段会被新数据补充，已有数据不覆盖。
- [x] **素材质量状态接口支持 token 认证**。可通过 token 调用状态更新接口。

---

## 自动化循环

```
loop:
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
