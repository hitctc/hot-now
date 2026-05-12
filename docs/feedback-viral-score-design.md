# 爆款评分需求 — 反馈与修正

> 针对「素材表新增爆款评分字段」需求，hot-now 侧有以下修正，请爱马仕智能体按此调整。

---

## 一、字段名变更

`viralScore` / `viralBreakdown` 改为 **`trendScore`** / **`trendBreakdown`**（中文名：传播趋势分）。

所有接口、请求体、响应体中出现的地方统一替换。

---

## 二、trendBreakdown 请求格式改为 JSON 对象

原需求中 trendBreakdown（原 viralBreakdown）写的是 JSON 字符串嵌套：

```json
"trendBreakdown": "{\"topicPower\":15,\"emotionResonance\":20,...}"
```

**改为直接传 JSON 对象**，服务端内部做 stringify：

```json
"trendBreakdown": {
  "topicPower": 15,
  "emotionResonance": 20,
  "infoGap": 12,
  "socialCurrency": 18,
  "timingWindow": 10,
  "audienceBreadth": 15
}
```

涉及两个接口：
- `POST /api/creative/source-items`（推送素材时的可选字段）
- `POST /actions/creative/source-items/:id/trend-score`（写入评分，路径也对应改名）

响应体中 trendBreakdown 返回格式同样是 JSON 对象（不是字符串）。

---

## 三、成品文章列表需要关联素材的 trendScore

hot-now 的成品文章表（`creative_finished_articles`）本身不存储 trendScore/trendBreakdown，需求要求成品文章列表也展示这两个字段。

hot-now 侧会在查询成品文章时 join 素材表，把关联素材的 `trendScore` 和 `trendBreakdown` 带出来，爱马仕侧无需额外操作，仅作知晓。

---

## 汇总：爱马仕侧需要调整的点

1. 所有 `viralScore` → `trendScore`，`viralBreakdown` → `trendBreakdown`
2. `trendBreakdown` 请求体传 JSON 对象，不传字符串
3. 写入评分接口路径改为 `POST /actions/creative/source-items/:id/trend-score`
