# HotNow Feedback And LLM Strategy Workbench Design

## 背景

当前 HotNow 已经具备：

- 公开内容页 `/`、`/articles`、`/ai`
- 登录后可访问的系统页 `/settings/view-rules`
- 内容卡片上的 `收藏 / 点赞 / 点踩`
- 基于 `view_rule_configs` 的数值型权重排序

但还缺少一条完整的“人工反馈反哺筛选策略”链路。当前用户只能通过点赞和点踩表达即时态度，系统没有：

- 用于集中收纳反馈说明的反馈池
- 用于承接反馈并整理为策略候选内容的草稿池
- 基于真实 LLM 的自然语言策略匹配
- 保存自然语言策略后立即重算当前内容库的能力

用户已确认本轮要新增两条主链路：

1. `反馈链路`
   `内容页点赞/点踩 -> 可选填写局部反馈面板 -> 反馈池 -> 转为可编辑草稿 -> 管理员手动整理 -> 写入正式策略`
2. `自然语言策略链路`
   `配置单活 LLM 厂商 -> 编辑全局/单策略自然语言规则 -> 保存 -> 后台重算当前内容库 -> 内容页读取预计算结果`

## 目标

### 核心目标

- 在不破坏现有收藏、点赞、点踩与数值权重策略的前提下，新增完整反馈池与自然语言策略工作台
- 允许管理员在内容卡片上快速提交反馈说明，并集中在 `/settings/view-rules` 里管理
- 支持把反馈池条目转成独立的策略草稿，并继续编辑、复制、删除
- 支持 `DeepSeek / MiniMax / Kimi` 三家厂商，单次只启用一个当前厂商
- API key 由页面输入后本地持久化，但必须使用环境变量主密钥加密保存
- 正式自然语言策略保存后，立即触发当前内容库全量重算
- 采集新内容后，对新增或变更内容自动执行增量自然语言匹配

### 用户感知目标

- 点赞和点踩仍然是轻量即时动作，不因为新增反馈系统变重
- 如果需要补充判断理由，可以在当前卡片局部展开面板直接填写
- `筛选策略` 页面从单纯的“权重表单”升级为完整的“策略工作台”
- 自然语言策略生效与否、最近一次重算是否成功、当前有没有可用 LLM，都能在系统页看明白

### 非目标

本轮明确不做：

- 多用户反馈与多管理员协作
- 匿名访客提交反馈
- 多厂商自动回退
- 不同 scope 绑定不同厂商
- 策略版本历史与回滚
- 运行时实时调用 LLM 决定每次页面展示结果
- 自定义确认弹窗设计系统

## 设计结论

### 总体方向

本轮采用四层分离的工作台设计：

- `reaction`：即时轻反馈，仍保留在现有内容交互中
- `feedback pool`：收纳待处理的原始反馈建议
- `strategy drafts`：承接由反馈转化出的可编辑草稿
- `nl rule sets`：保存正式自然语言规则，并驱动内容库 LLM 预计算

### 唯一推荐方案

采用“反馈池、草稿池、正式策略、LLM 结果四层拆分”的 `方案 B`，不把这四种职责混进现有 `content_feedback` 或 `view_rule_configs`。

原因：

- 当前 `content_feedback` 已经承担收藏和 reaction 的显示职责，继续叠加复杂文本反馈会让读写语义失稳
- 当前 `view_rule_configs` 适合数值权重，不适合同时承担正式自然语言文本、草稿池和运行状态
- 反馈建议与正式策略之间必须有人工整理层，避免“用户一句反馈直接污染线上策略”

## 现有能力保持不变的部分

- `收藏 / 点赞 / 点踩` 的即时接口和按钮语义保持不变
- `view_rule_configs` 中的数值权重继续存在，并继续参与内容排序
- 内容页仍然先走现有基础评分与页面加权逻辑
- auth 仍维持当前单用户管理员模式

## 数据模型

### 1. 保留现有表

以下表继续保留并沿用现有职责：

- `content_feedback`
  - 继续只存 `favorite` 和 `reaction`
- `view_rule_configs`
  - 继续只存 `hot / articles / ai` 的数值配置
- `content_items`
  - 继续作为内容主表

### 2. 新增 `feedback_pool`

用途：存“当前待处理反馈”。每个 `content_item_id` 最多保留一条反馈，后续提交覆盖旧值。

建议字段：

- `id`
- `content_item_id`
- `reaction_snapshot`
- `free_text`
- `suggested_effect`
  - 枚举：`boost | penalize | block | neutral`
- `strength_level`
  - 枚举：`low | medium | high`
- `positive_keywords_json`
- `negative_keywords_json`
- `created_at`
- `updated_at`

约束：

- `UNIQUE(content_item_id)`
- `content_item_id` 外键指向 `content_items(id)`

### 3. 新增 `strategy_drafts`

用途：存“由反馈池转出来、但还没并入正式策略”的独立草稿池。

建议字段：

- `id`
- `source_feedback_id`
  - 可空；允许后续手工创建纯草稿
- `draft_text`
- `suggested_scope`
  - 枚举：`unspecified | global | hot | articles | ai`
- `draft_effect_summary`
  - 结构化摘要的人类可读文本
- `positive_keywords_json`
- `negative_keywords_json`
- `created_at`
- `updated_at`

### 4. 新增 `llm_provider_settings`

用途：保存当前 LLM 厂商配置。首版只支持单活配置。

建议字段：

- `id`
- `provider_kind`
  - 枚举：`deepseek | minimax | kimi`
- `encrypted_api_key`
- `api_key_last4`
- `is_enabled`
- `created_at`
- `updated_at`

约束：

- 表内只保留一条当前生效配置；更新时覆盖
- 保存时必须存在环境变量 `LLM_SETTINGS_MASTER_KEY`

### 5. 新增 `nl_rule_sets`

用途：保存正式自然语言规则，不与 `view_rule_configs` 混存。

建议字段：

- `id`
- `scope`
  - 枚举：`global | hot | articles | ai`
- `rule_text`
- `created_at`
- `updated_at`

约束：

- `UNIQUE(scope)`

### 6. 新增 `content_nl_evaluations`

用途：保存 LLM 对每条内容在不同 scope 下的预计算结果。

建议字段：

- `id`
- `content_item_id`
- `scope`
  - 枚举：`global | hot | articles | ai`
- `decision`
  - 枚举：`boost | penalize | block | neutral`
- `strength_level`
  - 枚举：`low | medium | high`
- `score_delta`
- `matched_keywords_json`
- `reason`
- `provider_kind`
- `evaluated_at`

约束：

- `UNIQUE(content_item_id, scope)`

### 7. 新增 `nl_evaluation_runs`

用途：记录自然语言重算任务的运行状态，供系统页展示和排错。

建议字段：

- `id`
- `run_type`
  - 枚举：`full-recompute | incremental-after-collect`
- `status`
  - 枚举：`running | success | partial-failure | failed`
- `provider_kind`
- `started_at`
- `finished_at`
- `item_count`
- `success_count`
- `failure_count`
- `notes`

## 页面与交互设计

### 内容页交互

#### 内容卡片操作区

当前内容卡片继续保留：

- `收藏`
- `点赞`
- `点踩`

新增：

- `补充反馈`

#### 局部反馈面板

反馈面板采用卡片内嵌展开区，不使用全屏模态。以下操作都打开同一个面板：

- 点 `点赞` 后自动展开
- 点 `点踩` 后自动展开
- 点独立按钮 `补充反馈`

交互规则：

- 点赞/点踩先即时保存 reaction
- 展开面板不会回滚已保存的 reaction
- 若当前内容已有反馈池条目，打开面板时自动回填

面板字段：

- `反馈说明`
  - 多行文本，选填
- `建议动作`
  - `加分 / 减分 / 屏蔽 / 无影响`
- `强度`
  - `low / medium / high`
- `关键词加分`
  - 逗号分隔
- `关键词减分`
  - 逗号分隔

保存规则：

- 提交时写入或覆盖 `feedback_pool`
- 如果文本为空且结构化建议也全为空，允许只保留 reaction，不强制写反馈池

### `/settings/view-rules` 策略工作台

当前路由不变，但职责升级为完整工作台。页面拆成 5 个区域：

#### 1. 数值权重区

保留当前 `hot / articles / ai` 三组数值配置表单：

- `limit`
- `freshnessWindowDays`
- `freshnessWeight`
- `sourceWeight`
- `completenessWeight`
- `aiWeight`
- `heatWeight`

#### 2. LLM 设置区

展示并管理：

- 当前厂商选择
- API key 输入与覆盖保存
- 是否已配置
- key 尾号
- 最近一次重算状态
- 如果缺少 `LLM_SETTINGS_MASTER_KEY`，明确提示“当前环境未启用密钥加密保存”

#### 3. 正式自然语言策略区

提供四个正式编辑器：

- `全局规则`
- `hot 规则`
- `articles 规则`
- `ai 规则`

行为规则：

- 点击保存后先落库到 `nl_rule_sets`
- 再立即触发一次后台全量重算
- 页面提示“已保存，正在重算”

#### 4. 反馈池区

按时间倒序展示 `feedback_pool`。每条卡片展示：

- 内容标题
- 来源名称
- 内容链接
- reaction 快照
- 自由文本
- 建议动作
- 强度
- 关键词加分/减分
- 更新时间

每条反馈提供动作：

- `复制`
- `转成草稿`
- `删除`

补充规则：

- `转成草稿` 只新增一条 `strategy_drafts`，不自动删除原反馈
- 反馈是否删除由管理员在确认草稿整理完成后手动决定

反馈池顶部提供：

- `一键复制全部反馈`
- `清空全部反馈`

#### 5. 草稿池区

按时间倒序展示 `strategy_drafts`。每条草稿可编辑：

- `目标范围`
  - `未指定 / 全局 / hot / articles / ai`
- `草稿正文`
- `结构化摘要`
- `关键词加分/减分`

每条草稿提供动作：

- `复制`
- `写入正式策略编辑器`
- `删除`

行为规则：

- “写入正式策略编辑器”只把内容注入当前页面编辑器，不直接持久化到 `nl_rule_sets`
- 管理员仍需手动保存正式策略，才会触发重算

## 删除与复制行为

### 删除确认

以下动作必须走确认框：

- 删除单条反馈
- 清空全部反馈
- 删除单条草稿
- 如果后续加“清空全部草稿”，同样必须确认

首版使用浏览器原生确认框。

### 复制规则

复制内容采用面向人和面向 AI 的整理文本，不直接复制原始 JSON。复制文本包含：

- 标题
- 来源
- 链接
- 反馈说明
- 建议动作
- 强度
- 关键词

## 服务端接口设计

### 内容反馈相关

- `POST /actions/content/:id/reaction`
  - 保持现有接口
- `POST /actions/content/:id/feedback-entry`
  - 新增；创建或覆盖 `feedback_pool`

### 反馈池相关

- `GET /settings/view-rules`
  - 页面渲染时附带反馈池与草稿池数据
- `POST /actions/feedback-pool/:id/delete`
- `POST /actions/feedback-pool/clear`
- `POST /actions/feedback-pool/:id/promote-draft`
  - 把反馈转成一条 `strategy_drafts`

### 草稿池相关

- `POST /actions/strategy-drafts`
  - 创建草稿
- `POST /actions/strategy-drafts/:id`
  - 更新草稿
- `POST /actions/strategy-drafts/:id/delete`

### LLM 设置相关

- `POST /actions/llm-provider`
  - 保存当前厂商和加密后的 API key
- `POST /actions/llm-provider/delete`
  - 删除当前配置

### 正式规则相关

- `POST /actions/nl-rules/:scope`
  - 保存指定 scope 的正式策略文本
  - 成功后立即创建全量重算任务
- `POST /actions/nl-rules/recompute`
  - 手动触发一次全量重算

## 自然语言策略执行规则

### scope 关系

系统维护四个 scope：

- `global`
- `hot`
- `articles`
- `ai`

生效规则：

- 如果 `global` 结果为 `block`，内容在所有页面都不展示
- 如果 `global` 不为 `block`，但某个单策略 scope 为 `block`，则该内容只在对应页面隐藏
- 如果结果为 `boost / penalize`，则把固定分值叠加到现有排序分数
- `neutral` 不改动展示结果

### 强度到分值的固定映射

LLM 不直接输出任意分数，只输出决策和强度；系统固定映射：

- `boost + low` => `+10`
- `boost + medium` => `+24`
- `boost + high` => `+42`
- `penalize + low` => `-10`
- `penalize + medium` => `-24`
- `penalize + high` => `-42`
- `block` => 直接隐藏，不走分值
- `neutral` => `0`

这样做的目的：

- 不把排序权完全交给模型
- 让不同厂商输出更稳定
- 让页面排序仍以系统原始评分为主，LLM 作为加减分信号

### 页面最终排序

内容页排序分数变为：

`现有 rankingScore + global score_delta + 当前 view scope score_delta`

隐藏规则优先于排序规则。

## LLM 执行链路

### 单活厂商

本轮支持：

- `DeepSeek`
- `MiniMax`
- `Kimi`

同一时间只允许一个当前生效厂商。

### Provider Adapter

业务层只依赖统一 provider 接口，不直接感知厂商差异。每个 provider 都必须把返回结果标准化为：

- `scope`
- `decision`
- `strength_level`
- `reason`
- `matched_keywords`

### 单次评估输入

对同一条内容，一次请求同时判断四个 scope，而不是拆成四次请求。

输入包含：

- 标题
- 摘要
- 正文截断
- 来源
- 发布时间
- `global` 正式规则
- `hot / articles / ai` 正式规则

### 单次评估输出

模型必须返回结构化 JSON，对四个 scope 分别给出：

- `decision`
- `strength_level`
- `reason`
- `matched_keywords`

系统再把 `decision + strength` 转换为 `score_delta`。

## 重算机制

### 1. 保存正式策略后的全量重算

触发时机：

- 管理员保存任意正式自然语言策略

执行方式：

- 先保存策略文本
- 再后台创建一条 `full-recompute` 任务
- 对当前内容库全量重跑自然语言评估

### 2. 采集完成后的增量重算

触发时机：

- collection-only 流程成功写入新内容后

执行方式：

- 如果当前已有可用厂商和 API key，则只对新增或更新内容跑自然语言评估
- 写入 `content_nl_evaluations`

### 3. 失败降级

降级规则：

- 没有厂商配置或 API key 时，正式策略仍可保存，但不执行匹配
- 缺少 `LLM_SETTINGS_MASTER_KEY` 时，不允许保存 API key
- 全量任务执行中部分条目失败时，任务标记为 `partial-failure`
- 单条失败不阻断整批写入

### 4. 并发与互斥

自然语言评估任务使用独立互斥锁，规则如下：

- 同一时间只允许一个 `nl_evaluation_runs` 任务处于 `running`
- `full-recompute` 优先级高于 `incremental-after-collect`
- 如果全量重算运行中，新采集产生的增量任务不单独启动，由当前或下一次全量结果覆盖
- 如果保存正式策略时已有全量重算运行中，则当前保存只更新正式规则，待当前任务结束后立即再跑一次基于最新规则的全量重算

## 内容展示规则

### 公开内容页

`/`、`/articles`、`/ai` 在读取内容时：

- 先执行现有内容读取与数值权重排序
- 再叠加 `content_nl_evaluations` 的 scope 结果
- 如果命中 `block`，则在对应页面过滤掉

### 系统页

`/settings/view-rules` 需要附带：

- 当前 feedback pool 数据
- 当前 strategy drafts 数据
- 当前 LLM provider 状态
- 当前正式自然语言策略
- 最近一条 `nl_evaluation_runs` 状态

## 安全与配置

### 主密钥

新增环境变量：

- `LLM_SETTINGS_MASTER_KEY`

用途：

- 对页面输入的 API key 做本地加密存储

规则：

- 没有这个变量时，系统允许展示设置区，但禁止保存 API key
- 页面需要明确提示当前环境未启用本地密钥加密保存能力

### API key 显示

系统页不回显完整 key，只显示：

- 当前厂商
- 是否已配置
- key 尾号

## 验证方案

### 单测

至少补以下测试：

- `feedback_pool` 的新增与覆盖
- 反馈转草稿
- 草稿编辑与删除
- `nl_rule_sets` 保存
- `content_nl_evaluations` 覆盖写入
- `decision + strength -> score_delta` 映射

### 路由测试

至少补以下测试：

- 内容卡片反馈保存接口
- 反馈池删除与清空
- 反馈转草稿
- LLM 设置保存与无主密钥报错
- 正式策略保存后触发重算任务

### smoke test

建议验证：

1. 登录后访问 `/settings/view-rules`
2. 在内容页执行点赞或点踩，确认局部反馈面板自动展开
3. 从独立按钮打开同一反馈面板并保存反馈
4. 在反馈池看到新增条目
5. 把反馈转成草稿并修改草稿
6. 把草稿写入正式策略编辑器
7. 保存正式策略并观察“正在重算”状态
8. 重算完成后回到内容页确认排序或隐藏变化

## 风险与约束

### 1. LLM 耗时与成本

保存正式策略后的全量重算可能较慢，因此必须后台化，不能把页面保存阻塞成同步长请求。

### 2. 反馈与正式策略边界

反馈池和草稿池都不是正式策略。只有写入 `nl_rule_sets` 并保存成功后，才视为生效策略。

### 3. 本地单机场景优先

本轮设计基于当前单用户本地应用，不为多人协作、权限审计和操作归属扩展复杂模型。

## 文档同步要求

后续实现落地时，以下文档必须同步更新：

- `AGENTS.md`
- `README.md`
- `.env.example`

原因：

- `/settings/view-rules` 已从单纯权重页升级为完整策略工作台
- 新增了 `LLM_SETTINGS_MASTER_KEY`
- 新增了反馈池、草稿池、正式自然语言策略和重算链路
