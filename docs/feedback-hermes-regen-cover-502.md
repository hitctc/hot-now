# 反馈：Hermes regen-cover 接口持续返回 502

**日期**：2026-06-09
**反馈方**：hot-now 编辑台

## 现象

成品文章详情页点击「生成封面图」按钮，调用 Hermes `POST /api/regen-cover`，持续返回 502，生图失败。

测试文章 ID：426

## 时间线

- **12:02:42** — hot-now 发起 regen-cover 请求，10 秒后收到 Hermes 502
- **12:05:02 ~ 12:10:14** — 又发起两次 regen-cover，分别等了约 10 秒和 150 秒，均返回 502
- 同一时间段内（12:07 ~ 12:10），**hot-now 代理的所有 Hermes 请求**均返回 502，不限于 regen-cover，包括其他 API 调用

## 关键日志

```
# regen-cover 请求 — 10 秒后 502
reqId: req-mq | POST /api/creative/finished-articles/426/regen-cover | statusCode: 502 | responseTime: 10143ms

# regen-cover 请求 — 150 秒后 502
reqId: req-o1 | POST /api/creative/finished-articles/426/regen-cover | statusCode: 502 | responseTime: 150223ms

# 同期其他请求也全部 502
reqId: req-nw | statusCode: 502 | responseTime: 10002ms
reqId: req-nu | statusCode: 502 | responseTime: 10143ms
...（约 20+ 条）
```

## 分析

- hot-now 侧代码未做任何改动，regen-cover 代理逻辑无变化
- **非单接口问题**：同期所有 Hermes 请求均 502，说明 Hermes 服务整体不可用
- 响应时间集中在 ~10 秒，符合连接超时或服务崩溃的特征

## 请 Hermes 侧排查

1. 2026-06-09 12:00 ~ 12:10 期间 Hermes 服务是否宕机或有部署？
2. `/api/regen-cover` 当前是否已恢复？
3. 是否有相关错误日志？

## hot-now 侧代理代码参考

```typescript
// src/server/createServer.ts:1288
const res = await fetch(`${hermesApiUrl}/api/regen-cover`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${hermesApiToken}`,
  },
  body: JSON.stringify({ articleId: id }),
  signal: AbortSignal.timeout(180_000),
});
```
