# 反馈：Codex 生图两个问题——覆盖模式 + 过滤已废弃文章

## 问题一：手动生图应为覆盖模式，当前表现为追加模式

### 背景

hot-now 成品文章详情弹窗中有「手动生图」功能，编辑人员可以针对单篇文章触发 Codex 生图。hot-now 侧是纯透传代理，直接将请求转发至 Hermes：

```
POST /api/codex/generate-image-tasks
Body: { articleId, action, imageIndex? }
```

hot-now 不维护任何任务队列状态，任务管理完全依赖 Hermes 侧。

### 问题

当前手动触发生图时，Hermes 似乎是**追加**任务到队列，而不是**覆盖**该文章已有的待处理任务。

这会导致：
- 同一篇文章在队列中产生多条生图任务（重复生成）
- Codex 消费端重复处理同一篇文章的图片，浪费 API 调用
- 编辑人员以为第一次没生效，反复点击，队列越积越多

### 期望行为

手动触发的 Codex 生图应采用**覆盖模式**：

1. 收到 `POST /api/codex/generate-image-tasks` 时，先**删除该 articleId 已有的待处理任务**（status 为 pending/queued 的）
2. 再插入新任务
3. 确保同一篇文章在队列中最多只有一条待处理的生图任务

---

## 问题二：Codex 自动生图轮询应过滤已废弃的文章

### 背景

hot-now 新增了「废弃」功能（软删除）。编辑人员可以对没有发布价值的文章执行废弃操作，废弃后：
- 文章的 `deleted_at` 字段被设置为当前时间戳
- 文章仍在数据库中留痕，可通过筛选查看
- 但不应再进入任何自动化流程

### 问题

当前 Hermes 的 Codex 定时轮询（`codex-generate`）在生成图片任务列表时，没有过滤已废弃的文章，导致：
- 废弃文章仍被加入 Codex 生图任务队列
- 消耗 API Token 生成永远不会发布的图片
- 编辑废弃文章的目的就是为了避免这种浪费

### 期望行为

Codex 自动生图轮询（`codex-generate`）在扫描缺图文章生成任务列表时，**排除 `deleted_at IS NOT NULL` 的文章**。

判断依据：通过 hot-now 的文章列表 API 拉取缺图文章时，文章记录中 `deletedAt`（对应数据库 `deleted_at`）字段不为空即表示已废弃。

---

## 备注

两个问题都只需 Hermes 侧调整，hot-now 无需改动。
