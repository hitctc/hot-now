# 反馈：Hermes 服务 502 影响写文章与监控面板

**日期**：2026-07-06
**反馈方**：hot-now 编辑台

## 现象

2026-07-06，hot-now 多个依赖 Hermes 的接口返回 502，前端表现为「写文章失败」「监控面板全部数据加载失败」。

测试请求：

1. 素材库写文章
   ```
   POST https://now.achuan.cc/api/creative/source-items/5679/write-article
   ```
   返回：
   ```json
   {
     "ok": false,
     "reason": "Hermes HTTP 502",
     "hermesResponse": "<!DOCTYPE html>\n\t<html lang=\"zh\">\n\t  <head>\n\t\t<meta charset=\"utf-8\">\n\t\t<title>Lucky Warning</title>\n\t  </head>\n\t  <body>\n\t\t<center><h1>502 Bad Gateway</h1></center>\n\t\t<hr><center><a href=\"https://lucky666.cn\" target=\"_blank\" style=\"color: black\">Lucky</a>/web</center>\n\t  </body>\n\t</html>"
   }
   ```

2. 监控面板统计
   ```
   GET https://now.achuan.cc/api/monitor/stats
   ```
   同样失败。

## 关键判断

- **不是 hot-now 应用故障**：hot-now 进程正常运行，健康检查通过，本地接口（采集、内容页、健康检查等）均可访问。
- **不是 hot-now 最近部署引起**：hot-now 本次只改动了素材库爆文分筛选的前端交互，未触碰任何 Hermes 相关代码、环境变量或 systemd 配置。
- **上游 Hermes 整体不可用**：`hermesResponse` 字段中的 HTML 是「Lucky」反代（lucky666.cn）在后端进程不可达时返回的兜底页，说明 **Hermes 进程本身已崩溃或被重启**，不是单接口逻辑错误。

## 受影响范围

hot-now 对 Hermes 是纯透传关系，下面所有接口在同一时间全部失败：

| hot-now 端点 | Hermes 目标 | 用途 |
|---|---|---|
| `POST /api/creative/source-items/:id/write-article` | `/api/write-article` | 素材库写文章 |
| `GET /api/monitor/stats` | `/api/monitor/stats` | 监控统计 |
| `GET /api/monitor/platform-stats` | `/api/monitor/platform-stats` | 平台统计 |
| `GET /api/monitor/runs-with-steps` | `/api/monitor/runs-with-steps` | 运行列表 |
| `GET /api/monitor/items` | `/api/monitor/items` | 监控条目 |
| `GET/POST /api/monitor/switch/:key` | `/api/monitor/switch/:key` | 开关读写 |
| `POST /api/monitor/trigger/*` | `/api/monitor/trigger/*` | 手动触发管线 |
| `GET /api/codex/tasks` | `/api/codex/tasks` | Codex 任务队列 |
| `GET /api/codex/consumption` | `/api/codex/consumption` | Codex 消费统计 |
| `POST .../regen-cover`、`.../regen-inline-image` 等 | `/api/regen-*` | 生图相关 |

监控面板的 12 个端点 **100% 依赖 Hermes，无本地兜底**；连站点头部的管线状态（`usePipelineStatus`）也读 `/api/monitor/stats`，所以 Hermes 宕机会波及整站顶部状态条。

## hot-now 侧的代理行为

hot-now 对两类接口的故障映射略有不同，供 Hermes 侧对照：

- **写文章 / 生图类**（`createServer.ts:1801-1803` 等）：Hermes 返回 5xx 时，hot-now 会转成 `502` 并附 `reason: "Hermes HTTP <status>"` 与 `hermesResponse` 原始响应体。
- **监控代理类**（`hermesMonitorProxy`，`createServer.ts:1684-1707`）：状态码原样透传；只有 fetch 抛异常（不可达/超时 15s）时才返回 `502 + reason: "Hermes 调用失败"`。

本次监控接口也失败，说明 Hermes 不仅是「业务逻辑返回 500」，而是 **整体不可达或进程崩溃**。

## 请 Hermes 侧排查

1. 2026-07-06 当前 Hermes 服务是否宕机、重启或正在部署？
2. Hermes 进程前面的「Lucky」反代为什么返回 502 兜底页？后端是否未监听端口 / 已退出？
3. Hermes 的 systemd / 进程守护是否把崩溃服务拉起？日志里是否有 OOM、未捕获异常或主动退出记录？
4. 当前 Hermes 是否已恢复？建议给一个 `/health` 或等价端点供 hot-now 做存活探测。
5. 是否考虑在 Lucky 反代与 Hermes 之间配置健康检查 + 自动重启，避免后端崩溃后一直返回兜底 502 页。

## hot-now 侧参考信息

- Hermes base URL / Token 通过环境变量 `HERMES_API_BASE_URL` / `HERMES_API_TOKEN` 注入，未配置时 hot-now 返回 `503 hermes-api-not-configured`（与本次 502 不同）。
- hot-now 侧不做 Hermes 数据的本地缓存或兜底；Hermes 恢复后，所有接口会自动恢复透传，无需 hot-now 重新部署。

---

附：本次 hot-now 部署（commit `0a2173e`）只修改素材库爆文分筛选交互，与 Hermes 故障无关；hot-now 健康检查 `{"ok":true}` 正常。
