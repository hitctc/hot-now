# 需求：素材溯源接口

## 背景

素材库中的文章大多来自第三方媒体或聚合平台的二次加工内容，用户希望追溯每篇素材的原始官方来源（如公司官方公告、官方博客、政府公告、原始新闻稿等）。

## 接口设计

### 接口

```
POST /api/source-trace
```

### 请求体

```json
{
  "sourceItemId": 3938,
  "title": "OpenAI 发布 GPT-5：性能提升 3 倍，支持原生多模态",
  "content": "据 The Verge 报道，OpenAI 今日正式发布 GPT-5...",
  "maxResults": 3
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| sourceItemId | number | 是 | hot-now 素材 ID，用于回调写入 |
| title | string | 是 | 素材标题 |
| content | string | 否 | 素材正文或摘要（最多 2000 字） |
| maxResults | number | 否 | 最大返回条数，默认 3 |

### 搜索策略（提示词参考）

请使用 MCP 搜索工具，按以下策略执行溯源：

**第一步：提取关键实体**
从标题和内容中提取：公司名、产品名、事件名、关键人名。

**第二步：搜索**
- 用提取的关键实体组合进行搜索
- 优先搜索官方站点（公司官网、官方博客、官方新闻稿页面、政府/监管机构公告）
- 其次搜索权威媒体的一手报道

**第三步：筛选与排序**
- 排除：聚合站、转载站、二次加工文章、与当前素材同源的站点
- 优先：官方公告 > 官方博客 > 权威媒体一手报道 > 其他可靠来源
- 按可靠性（是否为原始信息源）排序，取前 N 条

### 响应

**成功：**

```json
{
  "ok": true,
  "sourceItemId": 3938,
  "results": [
    {
      "title": "Introducing GPT-5",
      "url": "https://openai.com/blog/introducing-gpt-5",
      "source_name": "OpenAI Blog",
      "published_at": "2026-06-05",
      "relevance_score": 0.95,
      "reason": "OpenAI 官方发布公告，为该新闻的原始信息源"
    }
  ]
}
```

| 字段 | 说明 |
|---|---|
| results[].title | 原始来源文章标题 |
| results[].url | 原始来源 URL |
| results[].source_name | 来源名称（站点名或媒体名） |
| results[].published_at | 发布日期（YYYY-MM-DD） |
| results[].relevance_score | 可靠性评分 0~1 |
| results[].reason | 判断为原始来源的简要理由 |

**未找到：**

```json
{
  "ok": true,
  "sourceItemId": 3938,
  "results": []
}
```

### 异步机制

- 搜索可能耗时较长（MCP 搜索 + 多轮判断），建议异步处理
- Hermes 搜索完成后，回调 hot-now 的接口写入溯源结果
- 回调接口：`PUT /api/creative/source-items/:id/trace-results`（hot-now 侧实现）

### 回调请求体

```json
{
  "results": [
    {
      "title": "...",
      "url": "...",
      "source_name": "...",
      "published_at": "...",
      "relevance_score": 0.95,
      "reason": "..."
    }
  ]
}
```

回调鉴权：使用 Hermes API Token（Bearer token），与现有回调接口一致。

## hot-now 侧对接

Hermes 提供接口后，hot-now 侧改动：

1. `createServer.ts`：新增 `POST /actions/creative/source-items/:id/trace` 代理路由 + `PUT /api/creative/source-items/:id/trace-results` 回调路由
2. 数据库：`creative_source_items` 表增加 `traced_sources_json` 字段（TEXT，存 JSON）
3. 前端：素材展开行加「溯源」按钮 + 结果展示
