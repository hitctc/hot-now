# HotNow Vue And Ant Design Vue System Shell Migration Design

## 背景

当前 HotNow 的 unified shell 已经覆盖：

- 内容页 `/`、`/articles`、`/ai`
- 系统页 `/settings/view-rules`、`/settings/sources`、`/settings/profile`
- 登录保护、主题切换、移动端顶部导航和局部异步交互

但这些页面仍然主要依赖：

- Fastify 直接输出整页 HTML
- `src/server/public/site.css` 手写页面样式
- `src/server/public/site.js` 通过 DOM 查询和事件代理接管前端交互

这套模式在项目初期足够快，但随着 `反馈池 / 草稿池 / LLM 厂商设置 / 正式自然语言策略 / source 统计` 等工作台能力持续增长，已经暴露出两个问题：

- 新增功能容易退回到“原生表单 + 局部手写样式”，导致同一系统里视觉层次不一致
- 页面结构、组件复用、主题控制和交互状态都分散在模板字符串与手写 JS 里，后续继续扩展的成本持续上升

用户已明确确认本轮方向：

- 不需要为 unified shell 保留 SSR/SEO 优势
- 前端基线升级为 `Vue 3 + Ant Design Vue`
- 采用 `分阶段迁移`
- 第一阶段优先统一系统页，不一次性重写全站

## 目标

### 核心目标

- 让 unified shell 的系统页从“服务端拼 HTML + 手写原生表单”迁移到“Vue 3 页面 + Ant Design Vue 组件”
- 建立后续可持续复用的组件和主题基线，避免新增功能再次回到原生控件风格
- 保留 Fastify 作为后端入口、鉴权层和业务 API 层，不推翻现有后端架构
- 首轮只迁移 `/settings/*`，为后续内容页迁移打基础

### 用户感知目标

- `/settings/view-rules`、`/settings/sources`、`/settings/profile` 的视觉风格、表单控件和状态反馈统一
- 系统页中的保存、删除、开关、手动执行动作拥有一致的按钮、表单、提示和确认交互
- 深色 / 浅色主题继续保留，并且切换结果在 Vue 页面中保持一致

### 非目标

本轮明确不做：

- 把整个项目一次性改成纯前后端分离 SPA
- 第一阶段迁移 `/`、`/articles`、`/ai`
- 重写采集、反馈、自然语言重算、source 管理等后端业务逻辑
- 让 `/login`、legacy `/history`、`/reports/:date`、`/control` 同步切到 Vue
- 引入一整套新的全局状态管理方案作为前提条件

## 方案比较

### 方案 A：Vue 接管 unified shell，Fastify 保留入口与 API

做法：

- Fastify 继续负责登录、鉴权、API、legacy 页面和静态资源分发
- unified shell 页面改成一个 Vue 前端入口
- `vue-router` 接管系统页导航
- Ant Design Vue 作为统一组件体系

优点：

- 组件体系能真正统一，后续扩展成本最低
- 现有后端链路、鉴权和业务服务都可复用
- 允许按页面分阶段迁移，风险可控

缺点：

- 需要补齐前端构建链路、前端入口和一层 API 读模型

### 方案 B：保留服务端壳层，只在局部区域挂 Vue

做法：

- 页面继续由服务端渲染壳层和大部分内容
- 只把局部工作台模块改成 Vue 组件

优点：

- 首轮改动更保守

缺点：

- 新旧 UI 模式会长期并存
- 组件体系、主题和页面状态边界容易继续漂移
- 后续会形成“半旧半新”的维护成本

### 方案 C：一次性改成完整前后端分离 SPA

做法：

- unified shell 全部交给 Vue
- Fastify 退成纯 API 服务

优点：

- 前端边界最干净

缺点：

- 本轮改造范围过大，会连页面入口、登录跳转、静态资源接入和全部内容页一起波及

### 推荐结论

采用 `方案 A`。

原因：

- 这是唯一同时满足“整套系统走组件基线”和“保留现有后端主架构”的方案
- 相比局部挂载，它能从根上解决 UI 断层问题
- 相比完整 SPA 重写，它能把迁移范围收敛在当前最需要统一的系统页

## 设计结论

### 总体架构

迁移后，系统结构调整为两层：

- `Fastify 应用层`
  - 继续负责登录、鉴权、业务 API、legacy 页面和前端静态资源分发
- `Vue 3 前端应用层`
  - 负责 unified shell 的系统页界面、组件、路由、主题和交互状态

第一阶段只让 `/settings/view-rules`、`/settings/sources`、`/settings/profile` 进入 Vue 应用。

第二阶段再把 `/`、`/articles`、`/ai` 内容页迁入同一个前端壳。

### 现有能力保持不变的部分

- 登录规则不变，未登录仍不能访问 `/settings/*`
- 现有业务动作接口语义不变，包括：
  - `POST /actions/view-rules/provider-settings`
  - `POST /actions/view-rules/provider-settings/delete`
  - `POST /actions/view-rules/nl-rules`
  - `POST /actions/sources/toggle`
  - `POST /actions/collect`
  - `POST /actions/send-latest-email`
- legacy 页面继续保留
- 深色 / 浅色主题语义继续保留

## 前端接管边界

### 第一阶段接管范围

由 Vue 接管：

- `/settings/view-rules`
- `/settings/sources`
- `/settings/profile`

第一阶段保留服务端页面：

- `/login`
- `/history`
- `/reports/:date`
- `/control`
- `/`
- `/articles`
- `/ai`

### 路由策略

第一阶段采用“系统页单应用入口 + `vue-router` 页面切换”：

- Fastify 对 `/settings/view-rules`、`/settings/sources`、`/settings/profile` 继续做鉴权
- 鉴权通过后，不再输出原始工作台 HTML，而是输出同一个 Vue 挂载壳
- 前端使用 `vue-router` 渲染对应页面

这样做的原因是：

- 系统页可以先统一到组件体系内
- 内容页暂时不受影响
- 第二阶段迁内容页时可以复用同一套应用入口

## 目录与模块设计

建议新增目录：

- `src/client/main.ts`
- `src/client/App.vue`
- `src/client/router.ts`
- `src/client/layouts/UnifiedShellLayout.vue`
- `src/client/pages/settings/ViewRulesPage.vue`
- `src/client/pages/settings/SourcesPage.vue`
- `src/client/pages/settings/ProfilePage.vue`
- `src/client/components/base/`
- `src/client/components/domain/`
- `src/client/composables/useTheme.ts`
- `src/client/composables/useSession.ts`
- `src/client/composables/useAsyncAction.ts`
- `src/client/services/http.ts`
- `src/client/services/settingsApi.ts`
- `src/client/styles/`

职责分层约束：

- `layouts`
  - 放统一壳层和导航布局
- `components/base`
  - 放项目级通用 UI 语义组件，不直接暴露零散 `a-*` 组件到页面层
- `components/domain`
  - 放业务块组件
- `pages`
  - 只负责页面级编排，不直接承担请求和复杂状态细节
- `services`
  - 统一封装 API
- `composables`
  - 管页面级状态、主题、会话和通用异步动作

## 页面与组件设计

### 壳层

`UnifiedShellLayout` 负责：

- 左侧导航
- 移动端系统菜单抽屉
- 当前页面标题与描述
- 主题切换
- 当前登录用户信息

壳层迁移后，系统页不再依赖服务端模板字符串拼导航，而由前端根据一份稳定的路由元数据渲染。

### 系统页组件拆分

#### `/settings/view-rules`

拆为：

- `ProviderSettingsPanel`
- `NlRulesEditor`
- `FeedbackPoolPanel`
- `StrategyDraftsPanel`
- `NumericRulesPanel`

其中第一阶段的重点是：

- `ProviderSettingsPanel`
- `NlRulesEditor`

因为用户当前最强烈的不满集中在 LLM 设置与自然语言策略编辑区的原生表单风格。

#### `/settings/sources`

拆为：

- `SourcesSummaryPanel`
- `SourceInventoryTable`
- `ManualCollectionPanel`
- `ManualSendLatestEmailPanel`

#### `/settings/profile`

拆为：

- `ProfileSummaryCard`

### Base 组件约束

推荐的通用语义组件：

- `PageHeader`
- `WorkbenchSection`
- `WorkbenchCard`
- `StatusBadge`
- `ActionToolbar`
- `EmptyStateBlock`
- `DangerActionButton`
- `InlineResult`

要求：

- 页面层优先使用这些项目语义组件，而不是直接在页面里堆叠 `Ant Design Vue` 原子组件
- 这样可以保证将来调整风格时改动集中，而不是散落在所有页面模板中

## 数据流与 API 设计

### 原则

- Vue 页面不直接拼装 HTML
- Vue 页面通过 JSON API 获取数据，再用组件渲染
- 页面组件不直接 `fetch`
- 所有请求都通过 `services/*` 统一管理

### 保留现有动作接口

以下接口第一阶段继续沿用：

- `POST /actions/view-rules/provider-settings`
- `POST /actions/view-rules/provider-settings/delete`
- `POST /actions/view-rules/nl-rules`
- `POST /actions/sources/toggle`
- `POST /actions/collect`
- `POST /actions/send-latest-email`

### 新增读模型接口

为保证 Vue 页面可以首屏加载数据，新增：

- `GET /api/settings/view-rules`
- `GET /api/settings/sources`
- `GET /api/settings/profile`

这些接口只负责返回页面所需的 JSON 视图模型，不引入新的业务写入语义。

### 鉴权与错误处理

- Vue 页面请求复用当前 session cookie
- 如果系统页 API 返回未登录或无权限：
  - 页面统一跳回 `/login`
- 所有写操作统一提供：
  - loading 状态
  - success message
  - error message
  - 必要的 destructive action confirm

## 主题与视觉策略

### 主题基础

统一使用 `Ant Design Vue ConfigProvider` 管理系统页主题，不再让系统页的主要视觉依赖手写 CSS。

保留：

- `dark`
- `light`
- `localStorage['hot-now-theme']`

### 主题控制方式

首轮只定义项目需要的最小 token 集：

- `colorPrimary`
- `colorBgLayout`
- `colorBgContainer`
- `colorText`
- `borderRadius`
- `controlHeight`
- `fontSize`

使用方式：

- 系统页视觉优先由 token 驱动
- 自定义 CSS 只负责：
  - 壳层布局
  - 页面留白与容器宽度
  - 少量品牌化细节

### 主题实现约束

- 不允许新增大量“覆盖 Ant Design Vue 默认类名”的零散 CSS
- 不允许重新回到“页面局部自己发明表单样式”的做法
- 所有系统页按钮、表单、消息、抽屉、表格、标签、空态都必须优先走 Ant Design Vue

## 构建与运行方式

### 新增前端构建链路

项目新增：

- `Vite`
- `Vue 3`
- `Ant Design Vue`

构建目标：

- 前端产物输出到可被 Fastify 直接静态分发的目录
- 后端继续使用现有 TypeScript 构建

建议脚本演进方向：

- `npm run dev`
  - 并行启动 Fastify 开发服务与 Vite 开发服务
  - Vite 通过 proxy 转发 `/api`、`/actions`、`/login`、`/logout`、`/health` 到 Fastify
- `npm run build`
  - 先构建前端，再构建后端

### 首轮不采用的方案

本轮不采用：

- Vue SSR
- Ant Design Vue SSR 样式抽取
- 多前端应用分散构建

原因：

- 用户已明确不需要 SSR/SEO
- 第一阶段目标是建立系统页组件基线，不是引入更复杂的渲染模式

## 测试与门禁

### 新增测试体系

新增：

- `Vitest + @vue/test-utils + jsdom`

### 第一阶段必须覆盖的测试

- `ViewRulesPage`
  - 首屏加载
  - `ProviderSettingsPanel` 保存 / 删除
  - `NlRulesEditor` 保存后的状态提示
- `SourcesPage`
  - source 启用 / 停用
  - 手动执行采集
  - 手动发送最新报告
- `ProfilePage`
  - 当前用户信息展示
- `useTheme`
  - `localStorage` 持久化
  - `ConfigProvider` 主题同步
- 后端 API
  - `/api/settings/view-rules`
  - `/api/settings/sources`
  - `/api/settings/profile`
  - 未登录访问保护

### 验证顺序

按当前仓库验证习惯执行：

1. 先跑新增 Vue 单测
2. 再跑最相关的 server tests
3. 最后跑 `npm run build`

## 分阶段实施策略

### Phase 1

- 补齐 `Vite + Vue 3 + Ant Design Vue`
- 建立系统页单应用入口
- 补 `GET /api/settings/*` 读模型接口
- 迁移 `/settings/view-rules`
- 迁移 `/settings/sources`
- 迁移 `/settings/profile`
- 保持 legacy 页面和内容页不动

### Phase 2

- 评估内容页 `/`、`/articles`、`/ai` 的迁移
- 把内容卡片、来源筛选、反馈面板迁入 Vue 组件体系
- 逐步退出 `site.js` 中与 unified shell 页面替换相关的逻辑

### Phase 3

- 判断 legacy `/history`、`/reports/:date`、`/control` 是否继续保留
- 如有必要，再决定是否统一到同一前端应用

## 风险与控制

### 风险 1：首轮同时改构建链路和系统页，改动面较广

控制：

- 第一阶段只迁系统页
- 保持内容页和 legacy 页不动
- 通过新增 API 读模型而不是重写现有业务服务来控范围

### 风险 2：系统页完成迁移后，内容页与系统页视觉会短期不一致

控制：

- 这是分阶段迁移的接受成本
- 但系统页内部必须先完全统一，不能再混用原生控件

### 风险 3：前端组件直接依赖后端接口细节，后续难以维护

控制：

- 引入 `services/*` 和页面视图模型
- 页面层不直接操作接口细节

## 成功标准

满足以下条件即视为第一阶段完成：

- `/settings/view-rules`、`/settings/sources`、`/settings/profile` 由 Vue 3 + Ant Design Vue 渲染
- 这些系统页不再新增原生表单风格 UI
- 深色 / 浅色主题在系统页可正常切换并持久化
- 现有核心业务动作可继续使用，且交互反馈统一
- 相关前端与后端测试通过
- `npm run build` 通过

## 参考资料

本设计仅引用官方文档结论：

- Vue 官方 Quick Start: https://vuejs.org/guide/quick-start.html
- Vite 官方 Getting Started: https://vite.dev/guide/
- Ant Design Vue 官方 Getting Started: https://www.antdv.com/docs/vue/getting-started
- Ant Design Vue 官方 Customize Theme: https://www.antdv.com/docs/vue/customize-theme
