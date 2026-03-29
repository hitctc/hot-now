# 采集与发信拆分 Design

## 背景

当前系统把“采集 RSS -> 抓正文 -> 入库 -> 生成报告 -> 发邮件”绑定在同一条 `runDailyDigest` 链路里。

这带来三个实际问题：

- 定时采集和定时发信无法独立配置，任何一次发信都会隐式依赖一次完整采集。
- 手动入口只有一个 `POST /actions/run`，用户无法表达“只采集”或“只发信”。
- 当前新增国内 RSS 源后，采集频率和发信频率需要分开控制，否则会把“实时性”和“日报发送”混在一起。

本轮目标是把系统拆成两条清晰主线：

- 采集主线：每 10 分钟执行一次，或由用户手动触发，只负责采集和更新最新报告，不发邮件。
- 发信主线：每天早上 10:00 执行一次，或由用户手动触发，只负责发送当前最新一份已生成报告，不重新采集。

用户已明确确认：

- 定时发信和手动发信都发送“当前最新的一份已生成报告”。
- 不在发信前再额外触发采集。
- 定时采集使用统一的 10 分钟周期，不做分级调度。

## 非目标

本轮不做下面这些事：

- 不引入任务队列、消息中间件、后台 worker 或新的进程模型。
- 不做按 source 分级调度。
- 不在本轮引入 `ETag` / `If-Modified-Since` 条件请求优化。
- 不重构文件产物格式，仍然沿用 `data/reports/<YYYY-MM-DD>/report.json|report.html|run-meta.json`。
- 不移除 legacy `/control`、`/history`、`/reports/:date`。

## 目标行为

### 定时行为

- 采集任务：
  - 调度表达式：每 10 分钟一次。
  - 行为：拉取所有 enabled sources，抓取正文，更新 SQLite 内容池，生成/覆盖当天最新报告文件与 `digest_reports` 镜像记录。
  - 不发邮件。
- 发信任务：
  - 调度表达式：每天 `10:00`，时区沿用当前配置时区。
  - 行为：读取当前最新一份已生成报告，发送邮件。
  - 不重新采集，不覆盖报告文件。

### 手动行为

- 手动采集：
  - 只执行采集任务。
  - 成功后最新报告会更新，页面和 legacy 报告都可读取新结果。
- 手动发信：
  - 只发送当前最新报告。
  - 如果当前没有任何已生成报告，接口返回明确错误。

### 运行锁

- 采集和发信共用同一把运行锁。
- 任一任务运行中时，另一类任务也不能并发进入。
- 锁冲突时：
  - 定时任务只记录日志，不崩服务。
  - 手动任务返回“已有任务执行中”的明确响应。

这样做的原因是避免两个风险：

- 采集正在覆盖当天报告文件时，发信读到半写入状态。
- 发信刚读取旧报告，采集随后更新，导致“页面是新报告、邮件是旧报告”的竞态更难解释。

## 架构设计

### 1. Pipeline 拆分

现有 `runDailyDigest` 会拆成两块职责：

- `runCollectionCycle`
  - 输入：`config`、`trigger`
  - 负责：source loading、正文抓取、SQLite 内容入库、topic clustering、报告 JSON/HTML 生成、`run-meta.json` 写入、`digest_reports` upsert
  - 输出：`report`、采集元信息
  - 不负责发邮件
- `sendLatestReportEmail`
  - 输入：`config`
  - 负责：定位最新报告、读取报告 JSON、调用现有 `sendDailyEmail`
  - 输出：发送结果，例如 `sent` / `failed:...`
  - 不负责采集和报告生成

是否保留 `runDailyDigest`：

- 保留一个轻量兼容包装层，用于旧测试或兼容调用方。
- 它的实现不再直接承载新业务语义，而是由新拆分的两个 pipeline 组合调用。
- 这样可以降低本轮 diff 风险，同时给后续迁移留缓冲。

### 2. “最新报告”解析策略

新增一个读取最新报告的 helper，优先顺序如下：

1. 先看 SQLite `digest_reports` 中最新的 `report_date`
2. 如果 SQLite 没有记录，再回退到 `data/reports` 目录里最新日期
3. 读对应日期的 `report.json`
4. 反序列化为 `DailyReport`

失败策略：

- 如果没有任何报告，发信接口返回 `not-found`
- 如果文件损坏或 JSON 非法，返回 `report-unavailable`

### 3. Scheduler 拆分

当前只有一个 daily scheduler。改造后拆成两个独立调度器：

- `startCollectionScheduler`
  - 接收 `intervalMinutes`
  - 生成 `*/10 * * * *` 这样的 cron
- `startMailScheduler`
  - 接收 `dailyTime` 和 `timezone`
  - 生成每天一次的 cron

两者都通过 `main.ts` 注入具体 runner，不让 scheduler 直接知道数据库和业务细节。

### 4. Server Action 拆分

新增两个显式动作接口：

- `POST /actions/collect`
- `POST /actions/send-latest-email`

兼容策略：

- 现有 `POST /actions/run` 继续保留，但语义改成“手动采集”的兼容别名。
- unified shell 和 legacy 页面都逐步指向新的显式动作。

返回约定：

- 手动采集：
  - 成功：`{ accepted: true, action: "collect" }`
  - 运行中：`409`
  - 未启用：`503`
- 手动发信：
  - 成功：`{ accepted: true, action: "send-latest-email" }`
  - 无最新报告：`404`
  - 运行中：`409`
  - 未启用：`503`

### 5. 页面改造

统一站点 `/settings/sources`：

- 保留现有 source 启停卡片
- 现在的“手动执行采集”控制卡拆成两张：
  - `手动执行采集`
  - `手动发送最新报告`
- 每张卡各自有按钮、禁用态和状态文案

legacy `/control`：

- 也拆成两个按钮
- 避免 unified shell 和 legacy 页面对同一能力的表述不一致

### 6. 配置设计

当前配置是：

- `schedule.enabled`
- `schedule.dailyTime`
- `schedule.timezone`
- `manualRun.enabled`

改造后建议为：

- `collectionSchedule.enabled`
- `collectionSchedule.intervalMinutes`
- `mailSchedule.enabled`
- `mailSchedule.dailyTime`
- `mailSchedule.timezone`
- `manualActions.collectEnabled`
- `manualActions.sendLatestEmailEnabled`

兼容策略：

- 本轮直接升级配置读取逻辑，不保留多版本混读。
- 同步更新：
  - `config/hot-now.config.json`
  - `README.md`
  - `AGENTS.md`
  - `.env.example`（如果需要）
  - 配置相关测试

默认值：

- `collectionSchedule.enabled = true`
- `collectionSchedule.intervalMinutes = 10`
- `mailSchedule.enabled = true`
- `mailSchedule.dailyTime = "10:00"`
- `mailSchedule.timezone = "Asia/Shanghai"`
- 手动采集和手动发信默认都开启

## 数据与状态约定

### collection_runs

当前表里已记录采集运行。保持不变，但 `notes` 内容需要更清晰：

- 采集任务继续写 `sourceKinds`、`sourceFailureCount`、`itemCount` 等采集信息
- 发信任务不写入 `collection_runs`

原因：

- `collection_runs` 当前语义更接近“采集任务运行记录”
- 强行把发信塞进去会让已有 `/settings/sources` 最近抓取状态含义混乱

### digest_reports

继续作为最新已生成报告的元数据索引。

- 采集任务成功后 upsert
- 发信任务只读，不写

### run-meta.json

采集任务继续写入，但邮件状态字段的意义要调整：

- 采集任务产生的 `run-meta.json` 中，`mailStatus` 不再表示“本次采集同时发信的结果”
- 建议改成固定值，例如 `not-sent-by-collection`

这样能避免误导用户以为“采集成功 = 邮件已发”。

## 错误处理

### 采集任务

- 单个 source 失败仍然允许 degraded report 生成
- 全部 enabled sources 失败时任务硬失败
- 失败不会触发补发邮件

### 发信任务

- 没有最新报告：直接失败并记录日志
- SMTP 失败：返回明确错误，但不影响后续采集调度
- 发信任务不会尝试自动补采集

## 测试设计

### 配置与调度

- `loadRuntimeConfig`：
  - 能正确读取新的 `collectionSchedule` / `mailSchedule` / `manualActions`
- scheduler：
  - 采集 cron 为每 10 分钟
  - 发信 cron 为每天 10:00

### pipeline

- `runCollectionCycle`：
  - 能生成报告但不调用 `sendDailyEmail`
- `sendLatestReportEmail`：
  - 能读取最新报告并发信
  - 没有报告时返回明确错误

### server

- `POST /actions/collect`
  - 成功、运行中、未启用
- `POST /actions/send-latest-email`
  - 成功、无报告、运行中、未启用
- `POST /actions/run`
  - 仍然兼容到“手动采集”

### 页面

- `/settings/sources`
  - 同时渲染两张手动动作卡
- legacy `/control`
  - 同时渲染两个按钮

## 风险与取舍

### 1. 单锁会降低并发

这是有意取舍。当前项目是单进程本地服务，优先保证“报告文件和邮件读取的一致性”，而不是吞吐。

### 2. 发信依赖已有报告

这意味着如果系统长时间没有成功采集，10:00 发信可能失败。这个行为是可接受的，因为它比“发信时偷偷触发一次采集”更可解释。

### 3. run-meta 的 mailStatus 语义变化

这会影响已有文案和历史记录理解，所以必须同步更新文档和相关页面描述。

## 验收标准

满足以下条件即可认为本轮完成：

- 系统能每 10 分钟自动采集，不自动发信
- 系统能每天 10:00 自动发送当前最新报告，不重新采集
- unified shell 与 legacy 页面都能分别手动触发“采集”和“发信”
- 当没有最新报告时，手动或定时发信都会返回明确错误
- 所有相关测试通过，类型构建通过

