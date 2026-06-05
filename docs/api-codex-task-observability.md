# Codex 生图任务可观测性 — 接口需求文档

> 热讯平台需要在监控面板展示 Codex 生图全链路的状态，包括任务排队/执行/结果和消费回写。
> 当前热讯只有一个 `POST /api/codex/generate-image-tasks`（触发生图），无法查询任务状态和消费情况。
> 需要 Hermes 新增两个查询接口。

---

## 背景与目标

热讯监控面板（`/creative/monitor`）已接入 Hermes 的写作队列、流水线运行记录等监控数据。现在需要补上 **Codex 生图** 这条链路的可观测性，让编辑能实时看到：

1. **Codex 任务队列**：当前有没有排队/执行中的任务、排了几个、什么时候轮到、每个任务对应哪篇文章、生图成功还是失败
2. **Codex 结果消费**：生图完成后、结果有没有被消费（回写到文章）、消费成功/失败、下次消费调度在几分钟后

---

## 链路示意

```
热讯侧（触发方）                     Hermes 侧（Codex 全闭环）
───────────────                     ──────────────────────────

手动/自动生图 ──POST──▶  Codex 任务创建
                                    ├─ 排队（queued）
                                    ├─ 执行（running）
                                    ├─ 成功（completed）──▶ 等待消费
                                    └─ 失败（failed）          │
                                                               ▼
                                                     消费（回写图片到文章）
                                                      ├─ 消费成功
                                                      └─ 消费失败
```

热讯只需要 **查询** 这些数据做展示，不改变任何调度逻辑。

---

## 接口需求一：Codex 任务列表

### `GET /api/codex/tasks`

查询最近的 Codex 生图任务，支持分页和状态过滤。

#### 请求参数（Query String）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `limit` | number | 否 | 返回条数，默认 3，最大 200 |
| `offset` | number | 否 | 偏移量，默认 0 |
| `status` | string | 否 | 过滤状态：`queued` / `running` / `completed` / `failed` |
| `article_id` | number | 否 | 按文章 ID 过滤 |

#### 响应体

```json
{
  "tasks": [
    {
      "task_id": "codex_img_20260605_001",
      "article_id": 361,
      "article_title": "AI 开始给人类打分",
      "image_index": 0,
      "image_type": "cover",
      "prompt_summary": "评分刻度反转——一把水平放置的测量刻度尺...",
      "model": "gpt-image-1",
      "status": "running",
      "queue_position": null,
      "created_at": "2026-06-05T10:30:00Z",
      "started_at": "2026-06-05T10:30:15Z",
      "finished_at": null,
      "duration_ms": null,
      "result_url": null,
      "error": null
    }
  ],
  "total": 128,
  "has_more": true
}
```

#### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `task_id` | string | 任务唯一标识 |
| `article_id` | number | 关联的文章 ID（Hermes 侧 ID） |
| `article_title` | string \| null | 文章标题（方便展示，避免二次查询） |
| `image_index` | number | 图片序号（0 = 封面图，1+ = 正文配图） |
| `image_type` | string | 图片类型：`cover` / `inline` |
| `prompt_summary` | string \| null | prompt 前 100 字（展示用，不需要完整 prompt） |
| `model` | string \| null | 使用的生图模型 |
| `status` | string | 任务状态：`queued` / `running` / `completed` / `failed` |
| `queue_position` | number \| null | 排队位置（仅 queued 状态有意义） |
| `created_at` | string (ISO 8601) | 任务创建时间 |
| `started_at` | string \| null | 开始执行时间 |
| `finished_at` | string \| null | 完成时间 |
| `duration_ms` | number \| null | 执行耗时（毫秒） |
| `result_url` | string \| null | 生成的图片 URL（completed 时有值） |
| `error` | string \| null | 失败原因（failed 时有值） |

---

## 接口需求二：Codex 结果消费记录

### `GET /api/codex/consumption`

查询 Codex 生图结果的消费（回写）情况。包含待消费和已消费的记录。

#### 请求参数（Query String）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `limit` | number | 否 | 返回条数，默认 3，最大 200 |
| `offset` | number | 否 | 偏移量，默认 0 |
| `consumed` | boolean | 否 | 过滤消费状态：`true`（已消费）/ `false`（待消费） |

#### 响应体

```json
{
  "items": [
    {
      "task_id": "codex_img_20260605_001",
      "article_id": 361,
      "article_title": "AI 开始给人类打分",
      "image_index": 0,
      "image_type": "cover",
      "result_url": "https://cdn.example.com/img/001.png",
      "consumed": false,
      "consumed_at": null,
      "consume_status": null,
      "consume_error": null,
      "next_consume_at": "2026-06-05T10:35:00Z"
    },
    {
      "task_id": "codex_img_20260605_002",
      "article_id": 360,
      "article_title": "Claude Opus 4.8 里程碑",
      "image_index": 0,
      "image_type": "cover",
      "result_url": "https://cdn.example.com/img/002.png",
      "consumed": true,
      "consumed_at": "2026-06-05T10:28:00Z",
      "consume_status": "success",
      "consume_error": null,
      "next_consume_at": null
    },
    {
      "task_id": "codex_img_20260605_003",
      "article_id": 359,
      "article_title": "Rust 2026 路线图",
      "image_index": 1,
      "image_type": "inline",
      "result_url": "https://cdn.example.com/img/003.png",
      "consumed": true,
      "consumed_at": "2026-06-05T10:25:00Z",
      "consume_status": "failed",
      "consume_error": "article not found in hot-now",
      "next_consume_at": "2026-06-05T10:40:00Z"
    }
  ],
  "pending_count": 1,
  "total": 95,
  "has_more": true,
  "next_schedule_at": "2026-06-05T10:35:00Z",
  "schedule_interval_seconds": 300
}
```

#### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `task_id` | string | 关联的 Codex 任务 ID |
| `article_id` | number | 关联的文章 ID |
| `article_title` | string \| null | 文章标题 |
| `image_index` | number | 图片序号 |
| `image_type` | string | 图片类型 |
| `result_url` | string | 生成的图片 URL |
| `consumed` | boolean | 是否已被消费 |
| `consumed_at` | string \| null | 消费时间 |
| `consume_status` | string \| null | 消费结果：`success` / `failed` / `pending` |
| `consume_error` | string \| null | 消费失败原因 |
| `next_consume_at` | string \| null | 下次消费调度时间（失败重试 / 待消费的预计时间） |

**顶层统计字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `pending_count` | number | 当前待消费数量 |
| `total` | number | 总记录数 |
| `has_more` | boolean | 是否有更多 |
| `next_schedule_at` | string \| null | 下次消费调度时间（全局） |
| `schedule_interval_seconds` | number \| null | 消费调度间隔（秒），方便展示"下次消费在 N 分钟后" |

---

## 热讯侧接入方式

Hermes 提供上述两个接口后，热讯侧的工作：

1. **代理路由**：在 `createServer.ts` 中新增两条代理路由（复用已有的 `hermesMonitorProxy` 模式），鉴权方式与其他监控接口一致
2. **前端组件**：在监控面板新增两个 section——「Codex 任务队列」和「Codex 结果消费」
3. **自动刷新**：30 秒轮询，与现有监控面板刷新节奏一致

不需要改动任何 Hermes 的调度逻辑或数据写入逻辑，纯只读查询。

---

## 优先级建议

| 优先级 | 接口 | 理由 |
|--------|------|------|
| P0 | `GET /api/codex/tasks` | 编辑最常需要看的是"排了几个、卡没卡、对应哪篇" |
| P0 | `GET /api/codex/consumption` | 消费链路相对稳定，但失败时需要能定位 |

两个接口如果能合并成一个（比如 `/api/codex/status` 同时返回任务列表和消费情况），也可以，字段按上面的拆分组织即可。字段命名和结构如果 Hermes 侧已有惯用的风格，以 Hermes 侧为准，热讯适配。
