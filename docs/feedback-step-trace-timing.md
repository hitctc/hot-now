# 反馈：stepTrace 时间字段全部为空，无法计算写作耗时

## 问题

热讯平台需要在成品文章列表和详情弹窗中展示每篇文章的写作耗时。前端已从 `stepTrace` 字段中读取 `startedAt` / `finishedAt` / `durationMs` 来计算总耗时，但当前 Hermes 回传的数据中：

- **`startedAt` 全部是 `null`**
- **`durationMs` 全部是 `0`**
- **`finishedAt` 虽有值，但所有步骤的 `finishedAt` 几乎是同一毫秒**（Hermes 最后统一写入的时间戳）

导致前端无法计算出真实的写作耗时。

## 现状数据示例（文章 #416）

```json
[
  {"step":1, "stepName":"待写素材拉取", "startedAt":null, "finishedAt":"2026-06-07T21:19:41.102600+08:00", "durationMs":0},
  {"step":2, "stepName":"素材初筛与搜索意图", "startedAt":null, "finishedAt":"2026-06-07T21:19:41.107854+08:00", "durationMs":0},
  {"step":3, "stepName":"资源包构建", "startedAt":null, "finishedAt":"2026-06-07T21:19:41.114485+08:00", "durationMs":0},
  {"step":4, "stepName":"写作策略规划", "startedAt":null, "finishedAt":"2026-06-07T21:19:41.119602+08:00", "durationMs":0},
  {"step":5, "stepName":"正文初稿生成", "startedAt":null, "finishedAt":"2026-06-07T21:19:41.123525+08:00", "durationMs":0},
  {"step":6, "stepName":"正文修订增强", "startedAt":null, "finishedAt":"2026-06-07T21:19:41.127159+08:00", "durationMs":0},
  {"step":7, "stepName":"导语生成", "startedAt":null, "finishedAt":"2026-06-07T21:19:41.130307+08:00", "durationMs":0},
  {"step":8, "stepName":"标题生成", "startedAt":null, "finishedAt":"2026-06-07T21:19:41.133339+08:00", "durationMs":0},
  {"step":9, "stepName":"摘要生成", "startedAt":null, "finishedAt":"2026-06-07T21:19:41.136201+08:00", "durationMs":0},
  {"step":10, "stepName":"文章质量自检", "startedAt":null, "finishedAt":"2026-06-07T21:19:41.139498+08:00", "durationMs":0},
  {"step":11, "stepName":"原创风险审查", "startedAt":null, "finishedAt":"2026-06-07T21:19:41.155863+08:00", "durationMs":0},
  {"step":12, "stepName":"三模型发布前质检+有限改造", "startedAt":null, "finishedAt":"2026-06-07T21:19:41.160155+08:00", "durationMs":0},
  {"step":13, "stepName":"图片生成", "startedAt":null, "finishedAt":"2026-06-07T21:19:41.163437+08:00", "durationMs":0},
  {"step":14, "stepName":"成文拼装", "startedAt":null, "finishedAt":"2026-06-07T21:19:41.165529+08:00", "durationMs":0},
  {"step":15, "stepName":"来源与署名", "startedAt":null, "finishedAt":"2026-06-07T21:19:41.168268+08:00", "durationMs":0},
  {"step":16, "stepName":"最终同步热讯平台", "startedAt":null, "finishedAt":"2026-06-07T21:19:41.170788+08:00", "durationMs":0}
]
```

16 个步骤的 `finishedAt` 全部在 `21:19:41` 同一秒内，`startedAt` 和 `durationMs` 无有效值。

## 期望数据格式

每个步骤在**实际执行时**记录时间：

```json
{
  "step": 5,
  "stepName": "正文初稿生成",
  "startedAt": "2026-06-07T21:15:30.000000+08:00",   // 步骤开始时的真实时间
  "finishedAt": "2026-06-07T21:17:20.000000+08:00",  // 步骤完成时的真实时间
  "durationMs": 110000,                               // finishedAt - startedAt 的毫秒差
  "status": "success",
  ...
}
```

前端计算逻辑：**第一步的 `startedAt` → 最后一步的 `finishedAt`**，得到总写作耗时。

## 备注

Step 13（图片生成）的 `meta.substepTraces` 里已经有正确的 `startTime` / `endTime` / `durationMs`，说明 Hermes 内部是能拿到真实时间的，只是主步骤没回传。如果主步骤也能在执行前后各记录一次时间戳并回传即可。
