# HotNow Notion Workspace UI Design

## 背景

当前 HotNow 已经完成 unified shell、内容页、系统页、反馈工作台和自然语言策略主链路，视觉母版也从更早的赛博控制台切到了 `Editorial Signal Desk`。但这套风格仍然更像“编辑台产品”，和用户当前希望的目标存在明确偏差：

- 用户希望整体 UI 高还原 `Notion Web` 的工作区气质，而不是继续沿着杂志化编辑台演进
- 用户希望主色调收口到黑、白、灰，浅色和深色都保持克制的中性色层级
- 用户接受整体布局一起调整，不只做配色层面的换皮
- 用户要求所有页面统一改造，而不是只改 unified shell 内容页

当前仓库的页面现实也决定了这轮设计必须全局考虑：

- `/`、`/ai-new`、`/ai-hot` 已经由 `Vue 3 + Vite + Ant Design Vue + Tailwind CSS` 驱动
- `/settings/view-rules`、`/settings/sources`、`/settings/profile` 已经由同一套客户端壳层驱动
- `/login`、`/history`、`/reports/:date`、`/control` 仍带有 legacy 页面特征，但已经共享部分主题资源

所以这轮不是“继续微调 Editorial Desk”，而是一次新的视觉母版切换：把 HotNow 统一站点收口为一套 `Notion Workspace` 风格。

## 目标

### 核心目标

- 把全站视觉语言从 `Editorial Signal Desk` 切换为高还原 `Notion Web` 的工作区风格
- 让浅色 / 深色双主题都遵循同一套黑白灰体系，而不是继续保留当前蓝橙品牌强调
- 允许调整整体布局骨架，包括侧栏、页面头区、主内容宽度和模块组织方式
- 让内容页像 `Notion page + database list`，系统页像 `Notion settings + inline database`
- 让 legacy 页面也回到同一套壳层语义，不再形成视觉孤岛

### 用户感知目标

用户进入站点后应该直观感受到：

- 这是一个文档式、数据库式的工作区，而不是媒体编辑台或传统后台
- 视觉克制、安静、可信，强调结构和阅读顺序，而不是颜色和装饰
- 页面之间属于同一个系统，但内容页、系统页、登录页、历史页仍有清楚的语义差异
- 深色模式不是“另一个品牌皮肤”，而是对同一套 Notion 风格的夜间翻译

### 工程目标

- 统一主题 token 语义，避免继续沿用偏 `Editorial Desk` 的命名和视觉假设
- 保持 `src/client/theme/editorialTokens.ts` 作为客户端主题源头的职责，但让其语义转向 Notion 风格
- 保持 `src/client/styles/tailwind.css` 的轻量约束，只承接基础样式、主题变量和少量 AntD 覆写
- 把布局、组件和页面的视觉实现收口到现有 `Vue + AntD + Tailwind` 体系内，不新增新的大型样式层

## 非目标

本轮明确不做：

- 不修改内容采集、反馈池、草稿池、自然语言策略或 LLM 评估的业务逻辑
- 不修改后端接口契约、路由语义或系统菜单权限边界
- 不新增外部字体资源、外部图标系统或额外网络依赖
- 不引入新的状态管理框架或新的 UI 组件库
- 不为了贴近 Notion 风格去复制其具体功能模型，例如 block 编辑器、数据库列配置或多视图切换
- 不把本轮改造扩成“重新设计产品信息架构”

## 方案比较

### 方案 A：高还原 Notion Web

做法：

- 视觉语言直接对齐 Notion Web 的工作区气质
- 重写侧栏、页面头区、卡片/列表层级、表单风格和 legacy 页视觉语言
- 浅色 / 深色两套主题都以黑白灰中性色为主，不保留当前强品牌强调色

优点：

- 最符合用户明确确认的目标
- 风格辨识度最强
- 能一次性解决“现在像编辑台，不像工作区”的偏差

缺点：

- 相比继续沿用当前母版，布局和样式变化更大
- 需要对内容页、系统页和 legacy 页一起做统一设计约束

### 方案 B：借鉴 Notion 气质，保留当前产品壳层

做法：

- 保留现有大体布局和卡片体系
- 主要调整颜色、边框、间距和控件样式

优点：

- 风险更低
- 迁移成本更低

缺点：

- 只能得到“像 Notion 的换皮”
- 无法满足“高还原”和“整体布局也一起调整”的要求

### 方案 C：内容页和系统页分开风格处理

做法：

- 内容页更像 Notion 页面
- 系统页保留现在的 workbench 风格，只做轻度黑白化

优点：

- 能保住系统页的操作密度

缺点：

- 页面之间风格会继续分叉
- 不满足“所有页面统一成 Notion 风格”的目标

### 推荐结论

采用 `方案 A`。

原因：

- 用户已经明确确认了“高还原”“双主题”“整体布局可调整”“所有页面”的四个前提
- 这轮如果只做温和换皮，会继续遗留当前母版的视觉假设，后面还得再做一次真正切换
- 当前 unified shell 和 legacy 页面已经足够收口到同一产品里，适合一次完成视觉母版迁移

## 设计结论

### 主方向

本轮唯一主方向定为：`Notion Workspace`

它不是对 Notion 功能的复制，而是对其页面气质、布局骨架、控件克制感和数据库式信息呈现方式的高还原借鉴。关键词如下：

- 文档式页面
- 数据库式列表
- 轻侧栏
- 黑白灰双主题
- 极弱阴影
- 细边框和大留白
- 克制的操作感

### 已确认的用户偏好

- 风格目标：高还原 `Notion Web`
- 改造范围：所有页面
- 主题模式：浅色 / 深色双主题
- 主色调：黑、白、灰
- 布局权限：允许整体布局一起调整

### 明确不采用的方向

为避免实现阶段漂移，本轮明确不采用：

- 当前 `Editorial Signal Desk` 的纸感蓝橙强调语义
- 卡片化较强的工作台视觉
- 明显的品牌大块、报头式标题或杂志化首页节奏
- 大面积光效、纹理背景、渐变背景或强存在感动效
- “只是换一套颜色”的轻量换皮

## 整体视觉语言

### 色彩策略

整站色彩按黑、白、灰三段组织：

- 浅色主题：`white / off-white / warm gray / dark gray`
- 深色主题：`near-black / dark gray / mid gray / white`

颜色职责如下：

- 页面底色负责提供文档纸面感或工作区基底
- 侧栏与 surface 通过极轻的底色差建立层级
- 边框优先承担结构分隔职责
- hover、selected、focus 全部使用轻量灰阶，不依赖鲜艳强调色

这轮不再保留“品牌主色”概念。强调性主要来自：

- 排版层级
- 留白
- 边界线
- 选中态底色差

### 字体与排版

- 字体风格保持中性、克制、系统化，不追求品牌个性字体
- 中文优先沿用系统中文 sans 体系，保证可读性和仓库内零额外资源依赖
- 页面标题像文档页标题，而不是宣传区标题
- 正文、说明、元信息和注释之间只保留必要的四级层次
- 大标题和 section title 的字重整体下降，避免当前较强的 editorial 感

### 材质与层次

- 阴影大幅减弱，很多模块只依赖边框和底色差分层
- 圆角整体收小，减少当前面板化和卡片化气质
- 背景装饰全部去噪，避免纹理、辉光和装饰性 overlay
- 交互反馈应轻，不做夸张动效或大面积状态闪烁

## 布局骨架

### 统一壳层

全站统一成 `Notion workspace shell`：

- 左侧窄栏承担一级导航和账户/主题切换
- 主内容区是单列文档流，不追求铺满整个宽屏
- 页面头区保持轻量，弱化“hero 区”概念
- 移动端继续共享同一语言，但以更轻的顶栏和更收敛的页面头区呈现

### 左侧栏

左侧栏从“品牌工作台侧栏”改成“workspace sidebar”：

- 顶部只保留轻量工作区标题，例如 `HotNow`
- 不再保留大面积品牌块
- 菜单分组像 Notion sidebar 的 section 结构
- 激活态主要通过轻底色和字重变化表达
- 底部放主题切换和账户信息，但视觉上仍保持轻量

### 页面头区

页面头区遵循 Notion 文档页语义：

- 可选的小型 section label
- 页面标题
- 一句简短说明
- 其下直接进入 toolbar、正文或列表

头区不再承担品牌展示或营销说明功能。

## 页面级设计策略

### 内容页 `/`、`/ai-new`、`/ai-hot`

内容页统一改成 `page + database list` 结构：

- 首页和 `AI 新讯` 顶部保留精选区，但它更像置顶 page preview，不是厚重 hero card
- `AI 热点` 直接强调数据库式列表，不追求首页式展示
- 来源过滤和排序切换改成轻量 database toolbar
- 内容列表从“强卡片”收口成“可点开的 page row”
- 标题是第一阅读层，摘要缩短，来源 / 时间 / 分数 / 标签弱化为次级元信息
- 收藏、点赞、点踩、补充反馈继续存在，但操作条改成更像 Notion page actions
- 局部反馈面板保留 inline 展开方式，视觉上更接近 toggle section 而不是弹窗表单

### 系统页 `/settings/view-rules`、`/settings/sources`、`/settings/profile`

系统页统一改成 `settings page + inline database`：

- 页面整体从“工作台面板堆叠”改成“文档 section + 内嵌数据库列表”
- 每个 section 通过标题、说明和内容区构成，不再依赖厚卡片分块
- `/settings/view-rules` 更像策略与数据池管理页，反馈池和草稿池使用可展开列表
- `/settings/sources` 更像 source inventory / database，source 项以行或轻列表呈现
- `/settings/profile` 更像 account settings，总体更简洁

### Legacy 页面 `/login`、`/history`、`/reports/:date`、`/control`

legacy 页面不再是统一站点之外的视觉例外：

- `/login` 改成极简、中心化、低装饰的登录页
- `/history` 更像归档页或文档列表页
- `/reports/:date` 更像单篇文档页面
- `/control` 如果继续保留，也应遵循 settings page 的轻量后台语义

这里的关键要求是：即便这些页面保留现有业务结构，也必须回到同一视觉体系，不允许继续以旧主题资源单独演化。

## 组件与列表语言

### 内容项

内容项从“独立卡片”转成“database row / page row”：

- 以标题为核心
- 摘要和元信息更克制
- hover 态通过轻底色和细边框变化表达
- score、来源、时间、标签都降低视觉权重

### 工具栏

来源过滤、排序、刷新、状态提示统一收口到轻量 toolbar：

- 不使用厚重工具条背景
- 不使用高饱和按钮
- 保持数据库操作条的平静节奏

### 表单控件

输入框、按钮、下拉选择器和确认框全部向轻量系统工具靠拢：

- 高度和圆角都更收敛
- 主次按钮层级更少
- 危险操作只在删除场景显式突出
- 反馈复制、转草稿、写入正式策略这类动作不再使用重 CTA

### 空态与错态

空态和错态改成文档式提示：

- 一句标题
- 一句说明
- 必要时一个轻量按钮

除非是全局阻断问题，否则不使用高对比的大块 warning panel。

## 双主题 Token 规范

### Token 语义

当前客户端主题源头仍建议收口到 `src/client/theme/editorialTokens.ts`，但语义需要从 `Editorial Desk` 改成更中性的 workspace 结构。建议的一级语义如下：

- `background.page`
- `background.sidebar`
- `background.surface`
- `background.surfaceMuted`
- `background.surfaceHover`
- `text.primary`
- `text.secondary`
- `text.tertiary`
- `text.placeholder`
- `border.subtle`
- `border.default`
- `border.strong`
- `state.hover`
- `state.selected`
- `state.focusRing`
- `radius.small`
- `radius.default`
- `shadow.subtle`

### 浅色主题

浅色主题目标是接近 Notion 的暖白纸面感：

- 页面底色接近白色和轻暖灰
- 侧栏比正文底色略深一层
- 文本对比清晰，但不过度强调纯黑
- 边框极轻，用来建立结构而不是存在感

### 深色主题

深色主题目标是 Notion 夜间模式式的柔和黑灰：

- 页面底色接近 near-black
- 侧栏和 surface 用轻微灰差分层
- 主文字保持高可读性，但避免纯白刺眼
- hover 和 selected 依赖一小步明度变化

## 与现有技术栈的对齐约束

### Vue 客户端

本轮视觉母版切换应以现有 Vue 客户端为主战场，优先影响：

- `src/client/layouts/UnifiedShellLayout.vue`
- `src/client/pages/content/`
- `src/client/pages/settings/`
- `src/client/theme/editorialTokens.ts`
- `src/client/theme/editorialTheme.ts`
- `src/client/styles/tailwind.css`

约束如下：

- 不新增新的大型皮肤 CSS 文件
- 页面和组件层面的视觉表达优先通过 Tailwind utilities 与少量共享样式完成
- Ant Design Vue 继续保留，但需要被去默认化，不能显出强烈的默认 AntD 风格

### Legacy 站点资源

legacy 页仍需要通过现有服务端输出和共享样式资源承接主题，所以以下路径也属于设计覆盖范围：

- `src/server/public/site.css`
- `src/server/render*` 系列 legacy 页面模板

但这里的改造目标是视觉统一，不是把 legacy 页面迁移成新的前端应用。

## 实施边界

本轮设计把后续实现边界收口为三层：

1. `token 层`
   - 黑白灰双主题 token
   - AntD 主题桥接
2. `shell 层`
   - 侧栏、页面头区、主内容宽度、移动端顶栏
3. `page / component 层`
   - 内容页列表与工具栏
   - 系统页 section、反馈池和草稿池列表
   - legacy 登录、历史、报告、控制台页

实现阶段应严格避免：

- 顺手改业务逻辑
- 顺手改信息架构
- 顺手重做接口或状态流

## 验证建议

进入实现阶段后，验证应至少覆盖：

- 浅色 / 深色切换是否在所有页面保持统一语言
- `/`、`/ai-new`、`/ai-hot` 的内容列表是否真正从强卡片语义收口成 page row 语义
- `/settings/view-rules`、`/settings/sources`、`/settings/profile` 是否真正从 workbench 面板收口成 settings + inline database
- `/login`、`/history`、`/reports/:date`、`/control` 是否不再是视觉孤岛
- Ant Design Vue 组件是否仍带有明显的默认皮肤痕迹

## 备注

- 当前 worktree 的 `npm run test` 在本轮设计开始前就不是绿的，存在 `tests/client/sourcesPage.test.ts`、`tests/client/profilePage.test.ts` 和一批 Ant Design Vue `prefixCls` 相关异常；这属于当前仓库基线，不是本设计文档新增的问题。
- 本文档只确认 `Notion Workspace` 风格方向与实现边界，不代表已经进入实现阶段。
