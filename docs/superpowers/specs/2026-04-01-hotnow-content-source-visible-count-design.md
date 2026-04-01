# HotNow Content Source Visible Count Design

## 背景

当前 Vue 内容页已经支持：

- `AI 新讯 / AI 热点` 两个内容页
- 来源筛选条 `ContentSourceFilterBar`
- 来源多选、全选、全不选
- 根据所选来源刷新当前页内容

但筛选条目前只显示：

- 来源名称
- 已选数量

用户现在希望补两类数量信息，而且数量语义已经确认不是“全站总库条数”，而是“当前内容页里可见的内容条数”：

1. 每个来源选项后面显示一个小 tag，表示该来源在当前内容页里的可见内容条数
2. 当用户选择来源时，在筛选条上显示当前所选来源对应的可见内容总条数

## 目标

- 在 `AI 新讯 / AI 热点` 页的来源筛选条上补足来源级数量信息
- 每个来源按钮都稳定显示当前页语义下的可见条数
- 当前选择结果也能显示总条数，帮助用户判断筛选后结果规模
- 保持现有筛选交互、视觉语义和本地持久化行为不变

## 非目标

本轮明确不做：

- 不显示全站内容库总条数
- 不增加新的独立 count 接口
- 不改变来源筛选持久化逻辑
- 不扩展到旧 SSR 内容页

## 方案比较

### 方案 A：纯前端基于当前返回结果推导

做法：

- 继续使用现有接口
- 总条数直接使用当前 `cards.length`
- 来源按钮后的数量只对“已选来源”显示本次结果中的分布数量

缺点：

- 未选来源无法稳定显示条数
- 条数会随当前选择集合而变化，用户无法预判“切到另一个来源会有多少内容”
- 不满足“每个数据源选项后面都显示一个小 tag”的目标

### 方案 B：在内容页接口补来源级 `visibleCount`，推荐

做法：

- 在内容页接口的 `sourceFilter.options` 上新增 `visibleCount`
- `visibleCount` 语义固定为“该来源在当前内容页里的可见内容条数”
- 前端继续使用当前页面接口，不新增二次请求
- 当前已选来源的总条数直接使用当前筛选结果 `cards.length`

优点：

- 每个来源按钮都能稳定显示条数
- 前端只需要消费接口，不需要自己维护复杂统计逻辑
- 语义清晰，和当前页面结果一致

### 方案 C：单独新增来源计数接口

做法：

- 页面数据和来源数量拆成两次请求

缺点：

- 请求链路更重
- 前后端复杂度都比当前需求大
- 对这个功能来说收益不足

### 推荐结论

采用 `方案 B`。

## 设计结论

## 数据契约

后端内容页模型从：

- `sourceFilter.options: { kind, name, showAllWhenSelected }[]`

扩展为：

- `sourceFilter.options: { kind, name, showAllWhenSelected, visibleCount }[]`

其中：

- `visibleCount` 表示该来源在“当前内容页语义”下的可见内容条数
- 在 `AI 新讯` 页，它统计的是当前 `ai-new` 视图里的可见数量
- 在 `AI 热点` 页，它统计的是当前 `ai-hot` 视图里的可见数量
- `visibleCount` 不受当前已选来源集合影响，必须稳定返回

这样用户可以在切换筛选之前，就看到每个来源自己当前有多少内容可看。

## 后端计算规则

后端在构建内容页模型时，需要同时计算两组信息：

1. 当前筛选结果
   - 继续使用现有 `selectedSourceKinds`
   - 当前返回 `cards` 保持现有行为
2. 来源级 `visibleCount`
   - 基于当前页面语义下的候选可见池计算
   - 不受当前已选来源集合影响
   - 按 `sourceKind` 分组计数后回填到 `sourceFilter.options`

这里的“候选可见池”口径固定为：

- 与当前页面视图一致
- 与当前排序无关
- 与当前筛选集合无关
- 只统计真正会进入当前内容页的可见内容，不统计被页面规则排除的内容

## 前端展示规则

### 来源按钮后的来源条数

在 `ContentSourceFilterBar` 中：

- 每个来源按钮名称后面增加一个小 tag
- tag 内容直接显示 `visibleCount`
- 视觉上保持轻量，不抢来源名称
- 条数为 `0` 时仍然显示 `0`，不做隐藏

例如：

- `OpenAI 8`
- `36氪 0`

### 已选来源总条数

筛选条左侧摘要区从：

- `已选 n / m`

扩展为：

- `已选 n / m · 共 x 条`

其中：

- `x = 当前筛选结果总数`
- 直接使用当前页面返回结果的总量
- 由于当前内容页已经不再使用 `featuredCard`，本轮 `x` 可直接等于 `cards.length`

总条数显示规则：

- 只要筛选条存在，就显示 `共 x 条`
- 不限定为“仅多选时显示”

原因：

- 规则更稳定
- 用户更容易形成固定认知
- 单选和多选都需要知道当前结果规模

## 交互与状态

- 切换来源时，tag 上的 `visibleCount` 不应抖动成“当前已选分布”
- 左侧总条数 `x` 需要跟随当前选择即时变化
- 全选 / 全不选行为保持不变
- 如果当前无结果，左侧总条数显示 `0`
- 如果某来源本身 `visibleCount = 0`，该来源仍然可被点击选择，只是最终结果可能为空

## 影响范围

后端：

- `src/core/content/buildContentPageModel.ts`
- `src/core/content/buildContentViewSelection.ts` 需要补一个“按来源统计可见条数”的输出
- `src/server/createServer.ts` 对应返回类型

前端：

- `src/client/services/contentApi.ts`
- `src/client/components/content/ContentSourceFilterBar.vue`
- `src/client/pages/content/AiNewPage.vue`
- `src/client/pages/content/AiHotPage.vue`

测试：

- `tests/server/contentRoutes.test.ts`
- `tests/client/contentSourceFilterBar.test.ts`
- `tests/client/aiNewPage.test.ts`
- `tests/client/aiHotPage.test.ts`
- `tests/client/contentApi.test.ts`

## 验证要求

- 内容页接口返回的 `sourceFilter.options` 包含 `visibleCount`
- 前端筛选条每个来源项后面都能看到小 tag
- 左侧摘要区能显示当前结果总条数
- 切换来源后：
  - 每个来源自己的 tag 数量保持稳定
  - 左侧总条数正确变化
- 空结果下仍然能正常显示 `0`
- 相关 client test、server test 和客户端构建通过
