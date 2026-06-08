# 反馈：手动生图应为覆盖模式，当前表现为追加模式

## 背景

hot-now 成品文章详情弹窗中有「手动生图」功能，编辑人员可以针对单篇文章触发 Codex 生图。hot-now 侧是纯透传代理，直接将请求转发至 Hermes：

```
POST /api/codex/generate-image-tasks
Body: { articleId, action, imageIndex? }
```

hot-now 不维护任何任务队列状态，任务管理完全依赖 Hermes 侧。

## 问题

当前手动触发生图时，Hermes 似乎是**追加**任务到队列，而不是**覆盖**该文章已有的待处理任务。

这会导致：
- 同一篇文章在队列中产生多条生图任务（重复生成）
- Codex 消费端重复处理同一篇文章的图片，浪费 API 调用
- 编辑人员以为第一次没生效，反复点击，队列越积越多

## 期望行为

手动触发的 Codex 生图应采用**覆盖模式**：

1. 收到 `POST /api/codex/generate-image-tasks` 时，先**删除该 articleId 已有的待处理任务**（status 为 pending/queued 的）
2. 再插入新任务
3. 确保同一篇文章在队列中最多只有一条待处理的生图任务

## 理由

- Codex 定时轮询（`codex-generate`）会自动为缺图文章生成任务列表，批量补图
- 手动生图是编辑针对单篇文章的精确操作，目的是**立即覆盖**，而不是在队列末尾再排一条
- 编辑不会一次性对所有文章手动生图，一定是逐篇操作，每次都应该是最新的意图

## 备注

hot-now 侧无需改动，请求格式不变。只需 Hermes 端 `/api/codex/generate-image-tasks` 端点将插入逻辑改为 upsert 或 delete-then-insert（按 articleId 去重）。
