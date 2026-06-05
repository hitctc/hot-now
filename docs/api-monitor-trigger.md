# 需求：管线与 Codex 定时任务立即触发接口

## 背景

监控面板的三个定时任务（管线运行、Codex 生图、Codex 消费）目前只能等调度器按固定间隔自动触发。运营场景中经常需要手动立即触发一轮执行（如刚调整了参数想立即验证、或发现队列空闲想主动推进），当前只能等倒计时归零。

## 需求

在监控面板的三个间隔参数行各加一个「立即触发」按钮，点击后立即执行一次对应任务，无需等待定时调度。

## 接口需求

### 第一步：确认现有接口

请先检查 Hermes 是否已有以下能力：

1. **管线运行**：是否有手动触发一次管线运行的接口？（如 `POST /api/monitor/trigger/pipeline` 或类似）
2. **Codex 生图**：是否有手动触发一次 Codex 生图任务扫描的接口？
3. **Codex 消费**：是否有手动触发一次 Codex 结果消费的接口？

如果有，请提供接口路径、方法和入参，hot-now 侧直接对接即可。

### 第二步：如无现有接口，需要开发

请提供三个 `POST` 接口：

| 接口 | 作用 | 预期行为 |
|---|---|---|
| `POST /api/monitor/trigger/pipeline` | 立即触发一次管线运行 | 等同于定时调度触发，不影响已有定时计划 |
| `POST /api/monitor/trigger/codex-generate` | 立即触发一次 Codex 生图任务生成 | 扫描待生图文章，提交生图任务 |
| `POST /api/monitor/trigger/codex-consume` | 立即触发一次 Codex 结果消费 | 检查已完成的生图结果并写回文章 |

**统一响应格式**：

```json
{
  "ok": true,
  "message": "已触发"
}
```

**幂等性要求**：
- 如果上一轮还在执行中（running），返回 `{ "ok": false, "message": "上一轮尚未完成" }` 而不是重复触发
- 触发后不影响已有的定时调度计划

## hot-now 侧对接计划

Hermes 提供接口后，hot-now 侧改动量很小：

1. `createServer.ts` 加三行代理路由（复用现有 `hermesMonitorProxy`）
2. `monitorApi.ts` 加三个前端调用函数
3. `MonitorSwitches.vue` 在对应的间隔参数行加「立即触发」按钮

预计 0.5 小时内完成。
