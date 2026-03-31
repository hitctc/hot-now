# HotNow AI-First Content Vue Migration Design

## 背景

`/settings/view-rules`、`/settings/sources`、`/settings/profile` 已经迁入 `Vue 3 + Vite + Ant Design Vue`，但内容页仍然停留在：

- Fastify 直接拼整页 HTML
- `src/server/public/site.css` 承担主题、布局和内容卡片样式
- `src/server/public/site.js` 承担内容页导航、来源筛选、主题切换和卡片交互

这导致 unified shell 目前仍然分成两套前端模式：

- 系统页：Vue + Ant Design Vue
- 内容页：服务端模板 + 手写 DOM 事件代理

用户已经明确确认第二阶段目标不是“继续保持现状”，而是把内容页完整迁到 Vue 壳中，同时把旧壳已经稳定下来的深浅主题规范和壳层语义一并抽出来，避免后续又出现“某些页面像 Ant Design，某些页面像另一套手写站点”的断层。

## 第二阶段确认结论

### 产品定位

项目核心目标明确收口为：

- 快速收集 AI 相关新闻、AI 模型、AI 事件、AI 智能体等内容
- 尽快发现其中“及时且可能成为热点”的条目
- 在统一内容台中优先呈现 AI-first 信号，而不是泛资讯首页

### 路由与菜单

用户已经确认：

- 内容菜单顺序统一改为 `AI 新讯 -> AI 热点`
- 桌面侧边栏与移动端顶部 tabs 使用同一顺序
- `/` 保留，但与 `/ai-new` 等价
- `/ai-new`
  - 作为“最快发现 AI 新闻、AI 模型、AI 事件、AI 智能体”的信号页
  - 页面结构固定为 `首条精选主卡 + 其余标准卡`
- `/ai-hot`
  - 作为“AI 相关热点综合页”
  - 承接已经开始形成热度的 AI 内容
- `/articles` 直接删除，不重定向

### 视觉方向

第二阶段不是简单把旧页面塞进 Vue，而是：

- 继续保留当前 `Editorial Desk` 的整体气质
- 把现有深浅主题规范提取成可执行 token 与壳层规则
- 允许顺手收口旧壳中不够统一的细节
- 不允许偏离当前主题语言去做一套新审美

## 目标

### 核心目标

- 把 `/`、`/ai-new`、`/ai-hot` 迁入现有 `Vue 3 + Vite + Ant Design Vue` 壳层
- 删除 `/articles` 的菜单、路由、页面实现和相关断言
- 将当前内容页的深浅主题规则、壳层语义和交互规范沉淀为 Vue 可复用的主题规范
- 让内容页和系统页共享同一套产品级 UI 基线

### 用户感知目标

- 菜单和页面命名直接体现 AI-first 定位
- `/ai-new` 一眼能看到“最新且值得盯住”的 AI 信号
- `/ai-hot` 更强调“热度正在形成”的综合排序和聚合感
- 深色 / 浅色模式在内容页和系统页之间保持统一语义和视觉气质

## 非目标

本轮明确不做：

- 重写采集、聚类、反馈池、自然语言重算等后端业务规则
- 把 legacy `/history`、`/reports/:date`、`/control` 一并迁到 Vue
- 新增第三套内容菜单或恢复 `/articles`
- 重新定义项目品牌方向或放弃当前 `Editorial Desk` 主题

## 方案比较

### 方案 A：保守迁移

- 把内容页搬到 Vue
- 尽量复刻旧内容页结构
- 只做最小菜单重命名与 `/ai-new` 首卡补强

优点：

- 风险最低

缺点：

- AI-first 定位不够明显
- `/` 与 `/ai-new` 的差异仍然模糊
- 旧壳里的主题分层问题会继续遗留

### 方案 B：AI-first 内容台

- `/` 与 `/ai-new` 指向同一类“最快发现 AI 信号”的页面语义
- `/ai-hot` 作为热点综合页独立存在
- 内容页切到统一读模型 API
- 同时抽出完整主题规范和内容组件规则

优点：

- 最符合用户已确认的项目定位
- 信息架构、页面分工和主题规范都能一次收口
- 后续继续扩 AI 模型 / 事件 / agent 主题时不会再改一次导航逻辑

缺点：

- 相比纯搬迁，需要补读模型和内容组件边界

### 方案 C：内容页重做成单页 Dashboard

- 将两个内容页折叠成一个大工作台
- 靠页内 tabs 或分栏切换不同内容视角

优点：

- 前端结构最集中

缺点：

- 产品语义变化过大
- 与现有 unified shell 的导航习惯不一致

### 推荐结论

采用 `方案 B`。

理由：

- 它保留当前项目结构，不引入第三套前端模式
- 它直接对应用户已经确认的 `AI 新讯 / AI 热点` 双入口
- 它允许在不改整体气质的前提下，把旧主题规范完整迁入 Vue 壳

## 信息架构结论

### 内容页路由

第二阶段内容页路由固定为：

- `/`
- `/ai-new`
- `/ai-hot`

其中：

- `/` 与 `/ai-new` 指向同一个页面实现与同一个内容视图
- `/ai-hot` 单独对应热点综合页
- `/articles` 从以下位置全部移除：
  - 服务端 app shell 页面元数据
  - Vue router 路由定义
  - 桌面侧边栏菜单
  - 移动端内容 tabs
  - 相关测试断言和页面文案

### 页面定位

`/` 与 `/ai-new`：

- 作为 AI 新讯入口
- 强调最新、及时、值得立即关注的 AI 信号
- 视觉上使用 `首条精选主卡 + 标准卡列表`

`/ai-hot`：

- 作为 AI 热点综合页
- 强调已经形成热度或持续升温的内容
- 保持标准卡列表为主，但信息层级比 `/ai-new` 更强调“热点形成”

## 前后端边界

### Fastify 继续负责

- 登录与鉴权
- JSON API
- legacy 页面
- 静态资源分发

### Vue 内容应用负责

- 内容页布局和导航
- 内容页组件渲染
- 深浅主题切换与主题 token 落地
- 来源筛选、卡片动作、反馈面板等交互状态

### 内容页读模型 API

第二阶段新增两类只读接口：

- `GET /api/content/ai-new`
- `GET /api/content/ai-hot`

返回结构应覆盖：

- 页面元信息
- 精选主卡
- 标准卡列表
- 来源筛选选项与当前选中状态
- 当前卡片的收藏 / 点赞 / 点踩 / 反馈池回填信息
- 空态、筛选空态与本地内容库降级态说明

`/` 作为 `/ai-new` 的别名路由，不需要额外再开第三个内容 API。

### 写接口语义

以下写接口继续保留原语义：

- `POST /actions/content/:id/favorite`
- `POST /actions/content/:id/reaction`
- `POST /actions/content/:id/feedback-pool`

第二阶段重点是把它们从旧 `site.js` DOM 事件代理迁到 Vue service 与组件内动作流，不改后端业务契约。

## 主题规范结论

### 全局视觉规则

当前稳定视觉规则来源于：

- `src/server/public/site.css`
- `src/server/renderAppLayout.ts`
- `src/server/public/site.js`
- `tests/server/siteThemeClient.test.ts`

需要完整迁入 Vue 的规则包括：

- 字体
  - `Avenir Next + PingFang SC + Microsoft YaHei`
- 基础配色
  - 浅色：纸感米白 + 深蓝墨色正文 + 蓝橙强调
  - 深色：深墨底色 + 冷白正文 + 浅蓝橙强调
- 圆角体系
  - `10 / 14 / 18 / 24 / pill`
- 阴影体系
  - `card / page / floating / accent`
- 背景肌理
  - glow、轻网格线、scanline 质感

### Token 分层

第二阶段主题 token 建议拆成四层：

#### 1. Brand / Base Tokens

- 字体
- 基础色板
- 圆角
- 阴影
- 过渡速度

#### 2. Semantic Shell Tokens

- 页面背景
- 侧边栏背景
- 面板背景
- 边框
- 文字层级
- 强调色
- 主题切换控件
- 移动端 tabs

#### 3. Content Component Tokens

- 精选主卡
- 标准卡
- 来源筛选条
- 操作按钮
- 反馈面板
- 空态 / 降级态

#### 4. Page Variant Rules

- `/ai-new`
  - 允许更强的时效感和更醒目的首卡层级
- `/ai-hot`
  - 允许更强调“热点形成”的排序与信息密度

特例边界：

- 允许 `/ai-new` 与 `/ai-hot` 产生信息密度差异
- 不允许脱离同一套颜色、字体、圆角、阴影和控件语义

## 页面结构与组件拆分

### 页面组件

- `src/client/pages/content/AiNewPage.vue`
- `src/client/pages/content/AiHotPage.vue`

### 内容组件

- `src/client/components/content/ContentHeroCard.vue`
- `src/client/components/content/ContentStandardCard.vue`
- `src/client/components/content/ContentSourceFilterBar.vue`
- `src/client/components/content/ContentActionBar.vue`
- `src/client/components/content/ContentFeedbackPanel.vue`
- `src/client/components/content/ContentEmptyState.vue`

### 服务层

- `src/client/services/contentApi.ts`

拆分原则：

- 页面只负责编排
- 来源筛选、动作条、反馈面板独立组件化
- 写动作和读模型都走 service 层
- 不再把内容页交互散落到一个全局 DOM 事件代理文件里

## 服务端改动边界

第二阶段服务端需要完成的边界调整：

- `/`、`/ai-new`、`/ai-hot` 改为返回 Vue client entry
- 删除 `/articles` 对应的页面注册、导航文案和内容路由逻辑
- 内容页读模型从服务端 API 返回 JSON，不再渲染整块 HTML 内容

保留不变的部分：

- 登录保护规则
- 本地内容库坏库降级语义
- 反馈池和交互写接口语义
- 主题 localStorage key：`hot-now-theme`

## 测试与验证门禁

### 新增测试

- `tests/client/aiNewPage.test.ts`
- `tests/client/aiHotPage.test.ts`
- `tests/client/contentSourceFilterBar.test.ts`
- `tests/client/contentHeroCard.test.ts`
- `tests/server/contentApiRoutes.test.ts`

### 更新测试

- `tests/client/appShell.test.ts`
- `tests/server/contentRoutes.test.ts`
- `tests/server/systemRoutes.test.ts`
- `tests/server/siteThemeClient.test.ts`

### 验证顺序

1. 先跑新增 client tests
2. 再跑相关 server tests
3. 再跑 `npm run test`
4. 最后跑 `npm run build`

### 必须通过的门禁

- 深色 / 浅色主题同时覆盖系统页和内容页
- `/articles` 已从菜单、路由和测试断言中移除
- `/` 与 `/ai-new` 的别名关系成立
- `/ai-new` 的首条精选主卡和标准卡列表语义成立
- `/ai-hot` 的热点综合页语义成立

## 风险与缺口

- 当前 `useTheme.ts` 里的 Ant Design Vue token 仍然偏通用深浅色，不足以表达旧壳主题，需要在实现阶段显式迁移 `site.css` 的语义 token
- `/articles` 删除会影响现有断言、文案与页面元数据，需要一次性清理干净，不能只删一半
- 内容页从服务端 HTML 切到 JSON 读模型后，必须重新梳理反馈面板和来源筛选的状态流，避免把旧 `site.js` 的耦合逻辑直接搬进 Vue
