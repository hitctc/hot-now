# API 变更日志 — 2026-05-13

> 均已上线

---

## 一、qualityStatus → writingStatus

### 字段改名

所有接口中 `qualityStatus` → `writingStatus`，包括查询参数、请求体、响应体。

### 状态值变更

| 旧值 | 新值 | 含义 |
|------|------|------|
| `pending` | `ready` | 待写作（默认值） |
| _(新增)_ | `writing` | 写作中 |
| `accepted` | `done` | 已完成 |
| `rejected` | `skipped` | 跳过不写 |

### 受影响的接口

| 接口 | 变更 |
|------|------|
| `POST /api/creative/source-items` | 字段 `writingStatus`，推荐传 `"ready"` |
| `GET /api/creative/source-items` | 查询参数 `writingStatus=ready` |
| `POST /actions/creative/source-items/:id/writing-status` | 路径从 `/quality-status` 改为 `/writing-status`，body 用 `writingStatus`，允许值 `ready` / `skipped` |
| `POST /api/creative/finished-articles` | 推送后系统自动将素材标记为 `done` 并关联 `linkedArticleId` |

---

## 二、成品文章移除状态流转

### 移除内容

- 移除 `POST /actions/creative/finished-articles/:id/status` 接口（状态变更路由）
- 移除 `GET /api/creative/finished-articles` 的 `status` 查询参数（不再支持按状态筛选）
- 前端移除状态标签、状态筛选、审批操作按钮（通过/拒绝/发布等）

### 保留内容

- `POST /api/creative/finished-articles` — 推送文章接口不变
- `PUT /actions/creative/finished-articles/:id` — 编辑接口不变，直接更新字段，无状态校验
- 文章存在即视为可用，无需任何状态流转

### 你需要做的

- 删除代码中对 `finished-articles/:id/status` 接口的调用
- 忽略响应中的 `status` 字段（DB 列保留但不再使用，永远为 `generated`）

---

## 完整文档路径（项目内）

- `docs/api-collect-source-items.md` — 素材推送接口
- `docs/api-agent-workflow-collect-to-article.md` — 完整工作流
- `docs/agent-prompt-source-to-article.md` — Agent prompt
