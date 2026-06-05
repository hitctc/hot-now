# 监控面板调度倒计时 — 接口需求文档

> 热讯监控面板需要精确展示三个调度器的下次执行倒计时（剩余分秒）。
> 当前 stats 接口返回了 `last_run`（上次运行记录）和 `switches`（包含间隔配置），
> 但缺少"下次精确触发时刻"，无法做精确倒计时。
> 需要 Hermes 在 stats 接口中补充三个 `next_*_at` 字段。

---

## 背景

监控面板（`/creative/monitor`）已展示开关配置中的三个间隔参数：

| 参数 | 含义 |
|------|------|
| `interval_pipeline` | 管线自动运行间隔（分钟） |
| `interval_codex_generate` | Codex 任务生成间隔（分钟） |
| `interval_codex_consume` | Codex 结果消费间隔（分钟） |

编辑需要实时看到**距离下一次触发还有多久**，而不是只看到一个分钟数。类似：

```
管线运行   ▸ 2分13秒后
Codex 生成 ▸ 4分51秒后
Codex 消费 ▸ 即将执行
```

---

## 需求：stats 接口补充三个字段

### `GET /api/monitor/stats` 响应体新增字段

```json
{
  "today_collected": 12,
  "today_scored": 10,
  "today_written": 3,
  "today_drafted": 1,
  "today_cover_ok": 2,
  "today_cover_fail": 0,
  "pending_score": 5,
  "pending_trend": 3,
  "pending_write": 2,
  "last_run": { "..." : "..." },
  "switches": { "..." : "..." },

  "next_pipeline_at": "2026-06-05T11:20:00Z",
  "next_codex_generate_at": "2026-06-05T11:25:00Z",
  "next_codex_consume_at": null
}
```

#### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `next_pipeline_at` | string \| null | 下一次管线自动运行的精确触发时间（ISO 8601）。管线暂停（`pipeline=off`）时返回 `null` |
| `next_codex_generate_at` | string \| null | 下一次 Codex 任务生成的精确触发时间。Codex 自动模式关闭（`image_gen_mode=off`）时返回 `null` |
| `next_codex_consume_at` | string \| null | 下一次 Codex 结果消费的精确触发时间。当前无待消费结果时返回 `null` |

#### 语义规则

1. **时间来源**：必须返回 Hermes 内部调度器真实计算的下次触发时刻，不要前端用间隔 × 上次时间估算
2. **时区**：统一使用 UTC（ISO 8601 带 `Z` 后缀），前端负责转本地时间
3. **正在执行时**：如果当前正在运行（比如管线正在执行），返回当前这一轮**预计完成后的下一次**触发时间；如果无法预判，返回 `null`
4. **暂停/关闭时**：对应开关关闭时返回 `null`
5. **精度**：秒级即可，不需要毫秒

---

## 热讯侧接入方式

Hermes 提供上述三个字段后，热讯侧的工作：

1. **monitorApi.ts**：`MonitorStats` 类型新增三个可选字段
2. **MonitorStatsCards.vue** 或独立倒计时组件：读取三个字段，每秒递减显示剩余时间
3. **MonitorSwitches.vue**：在对应参数行右侧展示倒计时标签

不需要新增路由，复用现有 `GET /api/monitor/stats` 即可。

---

## 补充说明

Codex 消费的 `next_schedule_at` 字段在 `GET /api/codex/consumption` 中已有，但消费是全局调度，和 stats 的三个调度器并列展示更统一。建议：

- **优先方案**：stats 接口直接返回 `next_codex_consume_at`，热讯只调一个接口
- **备选方案**：如果 stats 里不方便加，热讯从 consumption 接口的 `next_schedule_at` 兜底取值

两个方案热讯都能适配，Hermes 选方便的即可。
