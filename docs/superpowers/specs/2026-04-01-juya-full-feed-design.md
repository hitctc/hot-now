# HotNow Juya Full Feed Visibility Design

> Superseded on 2026-04-01 by [2026-04-01-source-display-mode-and-sort-design.md](/Users/tc-nihao/100-tc/700-code/100-center/hot-now/docs/superpowers/specs/2026-04-01-source-display-mode-and-sort-design.md).
> Do not use this document for implementation. It reflects an earlier `Juya-only` direction that was later replaced by a source-level configurable display-mode design.

## 背景

当前内容页的展示链路是统一内容池模型：

- 所有 source 的内容先进入同一个候选集
- 再按栏目规则计算 ranking score
- 最后按栏目 `limit` 截断成最终可见结果

这条链路对大多数 source 是合理的，因为它强调“栏目精选”而不是“来源完整展开”。但 `Juya AI Daily` 的使用诉求已经发生变化：

- 用户希望只要当前筛选里包含 `Juya AI Daily`
- 就把 `Juya` 的内容全部放出来
- 不要再像现在这样只展示其中一小部分

这里的问题不是 `Juya` 解析不完整，也不是 source filter 没生效，而是当前 source filter 的语义仍然是：

- 先过滤 source
- 再继续走栏目 `limit`

因此，即使用户已经把视角切到 `Juya`，系统仍然把它当成“栏目精选输入”而不是“来源完整列表”。

## 目标

### 核心目标

- 只对 `Juya AI Daily` 增加一个明确的展示特例
- 只要当前内容页筛选里包含 `Juya AI Daily`
- 就让 `Juya` 的内容不再受栏目 `limit` 截断
- 其他 source 仍然保持当前栏目排序与 `limit` 规则不变

### 用户感知目标

- 只选 `Juya AI Daily` 时，用户看到的是 `Juya` 全量内容，而不是“被栏目再精选过的一小部分”
- 同时选 `Juya + 其他源` 时，用户仍能看到其他 source 的精选结果，不会因为 `Juya` 特例而把别的 source 挤没
- 页面排序气质不突然变化，不把 `Juya` 额外强行置顶

### 非目标

本轮明确不做：

- 为所有 source 建立统一的“全量视图”机制
- 在系统设置中增加“source 是否免限额”的通用配置项
- 修改 `Juya` 的 source type、source priority 或 navigation views
- 修改 view rule 表结构或增加新的 view rule 字段
- 修改 `/settings/sources` 中 source analytics 的统计口径
- 引入新的独立页面，例如“Juya 专属内容页”或“来源详情页”

## 设计结论

### 唯一推荐方案

本轮采用 `Juya 免限额合流` 方案：

- 继续复用当前 `candidateCards -> visibleCards` 的选择流程
- `candidateCards` 阶段保持不变
- `visibleCards` 阶段增加 `Juya` 特例
- 只有 `Juya AI Daily` 享受“免 limit”能力
- 其他 source 继续按当前 `limit` 被截断

推荐原因：

- 改动集中在内容选择层，不会把评分、路由、采集、来源统计一起拖进来
- SSR 内容页和客户端内容页都能共享这条规则
- 能满足“Juya 全量可见”的直接诉求，同时保持其他 source 的精选语义

## 触发条件与作用范围

### 触发条件

当且仅当当前内容页的 `selectedSourceKinds` 中包含 `juya` 时，特例生效。

这意味着：

- 只选 `Juya AI Daily`，特例生效
- 选 `Juya AI Daily + 其他源`，特例也生效
- 不包含 `Juya AI Daily`，行为完全保持现状

### 作用范围

特例对所有内容页生效，包括：

- `/`
- `/articles`
- `/ai`
- 与这些页面共用同一内容模型的 API / client page model

本轮不区分栏目，不会只在 `hot` 或 `ai` 某一页单独放开。

## 规则语义

### 现状语义

当前 `buildContentViewSelection` 的核心语义是：

1. 查询内容候选
2. 计算 ranking score
3. 排序
4. `visibleCards = rankedCards.slice(0, limit)`

这导致所有 source 都只能竞争同一组展示位。

### 新语义

当筛选中包含 `juya` 时，`visibleCards` 的生成逻辑调整为：

1. 先得到排序完成后的 `rankedCards`
2. 从中拆出两组：
   - `juyaCards`
   - `nonJuyaCards`
3. `juyaCards` 全部进入最终可见结果
4. `nonJuyaCards` 继续按当前 `limit` 截断
5. 把两组合并后，再按原有 ranking 顺序输出

因此，新的展示语义是：

- `Juya`：全量通过
- 其他 source：精选通过

### 为什么不直接调大 limit

不采用“把所有栏目 limit 调大”或“只在用户选中 Juya 时把 limit 改成很大”的方案，原因如下：

- 这会同时放大所有 source，不符合“只对 Juya 特殊处理”的需求
- 会模糊系统原本的栏目精选语义
- 会让 `/settings/view-rules` 的 `limit` 字段失去稳定含义
- 无法精确表达“Juya 全量 + 其他源精选”的混合结果

## 页面表现

### 只选 Juya

当当前筛选只包含 `Juya AI Daily` 时：

- 页面应展示全部 `Juya` 候选内容
- 不再因为栏目 `limit` 被截成前若干条
- 仍按当前 ranking 顺序展示

### Juya + 其他源

当当前筛选同时包含 `Juya AI Daily` 和其他 source 时：

- `Juya` 内容全部展示
- 其他 source 仍只展示当前栏目精选结果
- 最终页面是“Juya 全量 + 其他源精选”的混合列表
- 列表顺序仍由 ranking 决定，不额外按 source 分组

### 不包含 Juya

当当前筛选不包含 `Juya AI Daily` 时：

- 页面行为完全保持现状
- 不引入任何排序、数量或布局变化

## 架构与实现边界

### 修改层级

本轮只应修改内容选择层：

- `buildContentViewSelection`
- 如有必要，补充少量 `listContentView` / page model 调用约定

不应改动：

- `contentScoring`
- `viewRuleConfig`
- `sourceCatalog`
- `source analytics`
- route 权限
- 页面视觉结构

### 数据流

新的数据流仍然保持：

1. route / API 读取 `selectedSourceKinds`
2. `listContentView` 调 `buildContentViewSelection`
3. `buildContentViewSelection` 先生成完整候选与排序
4. 仅在 `visibleCards` 这一步应用 `Juya` 特例
5. 页面继续消费同样的 `cards` 结构

这样可以保证：

- 现有客户端和 SSR 渲染接口不需要改协议
- source filter 的持久化逻辑不需要改
- source workbench 统计口径不会被误伤

## 与来源统计的关系

`/settings/sources` 里的 source analytics 当前基于：

- `candidateCards`
- `visibleCards`

来统计“入池 / 展示”。

本轮因为 `Juya` 的 `visibleCards` 变多，所以：

- `Juya` 在三个栏目的 `展示数` 会相应增加
- 这是符合新产品语义的，不视为统计错误

但本轮不单独调整 analytics 的定义说明，只接受其自然继承这一新规则。

## 边界情况

### Juya 未启用

如果 `Juya` 当前未启用，它不会出现在过滤条中，因此该特例自然不会触发。

### Juya 无内容

如果筛选里包含 `Juya`，但当前内容库没有任何 `Juya` 内容：

- 不报错
- 页面仍按其他 source 的规则正常出结果
- 如果整体无内容，则继续落入现有空态

### Juya 与其他 source 数量差异过大

当 `Juya` 内容远多于其他 source 时，页面总高度会显著增加。这是本轮接受的产品后果，不额外用折叠、分页或分组来对冲。

### 首页 featured card

现有客户端首页存在 `featuredCard + cards` 的结构：

- 是否命中 `Juya` 特例，不改变 featured 选取逻辑
- 仍然由当前排序后的第一条内容决定 featured card
- 其余 `Juya` 内容继续进入标准列表

## 测试策略

至少补齐以下测试：

1. `selectedSourceKinds` 不包含 `juya` 时，`visibleCards` 继续按原 `limit` 截断
2. 只包含 `juya` 时，`Juya` 内容全部进入 `visibleCards`
3. 同时包含 `juya` 与其他 source 时：
   - `Juya` 全量进入 `visibleCards`
   - 其他 source 仍按 `limit` 截断
4. 合并后的 `visibleCards` 仍按原 ranking 顺序输出
5. 内容页 API / page model 在 `juya` 参与筛选时不发生结构回归

优先在已有测试层补：

- `tests/content/buildContentViewSelection.test.ts`
- 如有必要，再补最小量页面模型测试

## 风险与取舍

### 主要风险

- 页面内容量会比现在明显增加
- “栏目精选”语义会对 `Juya` 局部失效
- source analytics 中 `Juya` 的展示数会因为新规则上升

### 接受这些风险的原因

这是一个有意引入的产品特例，而不是系统误差。目标不是保持所有 source 规则一致，而是明确满足 `Juya AI Daily` 的完整可见性需求。

## 本轮交付边界

本轮交付完成的标志是：

- `Juya AI Daily` 在所有内容页中，只要被当前筛选包含，就不再受栏目 `limit` 截断
- 其他 source 仍然维持原规则
- 现有页面协议与 source filter 交互协议保持不变
- 相关测试覆盖到位

本轮不要求同时完成：

- 更细粒度的来源专属视图
- 通用 source exemption 机制
- 后台可配置化
