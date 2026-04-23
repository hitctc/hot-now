# HotNow Vue Tailwind Theme Integration Design

## 背景

当前 HotNow 的 Vue 客户端已经具备：

- `Vue 3 + Vite`
- `Ant Design Vue`
- `ConfigProvider` 全局主题注入
- `light / dark` 主题切换
- 统一壳层 `UnifiedShellLayout`

但样式体系仍然处于“主题已抽象、样式仍以手写 CSS 为主”的中间状态：

- [src/client/theme/editorialTheme.ts](/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/theme/editorialTheme.ts) 已经维护了一份 `Editorial Desk` 主题 palette，并桥接到 Ant Design Vue
- [src/client/styles/editorialShell.css](/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/styles/editorialShell.css) 仍承担页面背景、壳层布局、基础排版和大量视觉实现
- Vue 模板层还没有采用统一的 utility-first 写法
- 项目里还没有接入 `Tailwind CSS` / `PostCSS`

这会带来三个持续性问题：

- 样式规范没有真正沉淀到“配置层”，而是同时散落在 TS palette、CSS 变量和组件模板之外
- Ant Design Vue 与页面自定义样式虽然接近，但仍有继续分叉的风险
- 后续继续扩系统页与内容页时，团队很容易又回到“组件里写一点、全局 CSS 里补一点”的混合模式

用户已经明确确认本轮方向：

- 只改 `Vue` 客户端，不动旧 `SSR` 页面
- 安装并接入 `Tailwind CSS`
- 以后 Vue 客户端的样式表达遵照 `Tailwind CSS`
- 把已经确认好的主题规范写进 `Tailwind` 配置中
- 同一份主题规范还要桥接进 `Ant Design Vue`，确保主题一致
- 本轮不是“先接上再说”，而是 `完整迁移`

## 目标

### 核心目标

- 在 Vue 客户端接入 `Tailwind CSS`，并让它成为主要样式表达方式
- 把当前 `Editorial Desk` 的主题规范抽成单一 token 源头
- 让 `Tailwind` 和 `Ant Design Vue` 同时消费这份 token，避免双份主题定义
- 将当前 Vue 客户端壳层和已存在页面样式从大块手写 CSS 完整迁移到 `Tailwind`

### 用户感知目标

- Vue 客户端在深色 / 浅色模式下继续保持当前 `Editorial Desk` 的视觉语言
- `Tailwind` 样式和 `Ant Design Vue` 组件看起来属于同一套系统，而不是“两张皮”
- 后续新页面和新组件进入 Vue 客户端时，默认沿用同一套 Tailwind 主题配置，不再继续堆积全局 CSS

### 工程目标

- 让主题源头只保留一份
- 让 `Tailwind` 配置成为 Vue 客户端样式规范的主要落点
- 让 `editorialTheme.ts` 从“自己维护 palette”转为“消费共享 token 并桥接 AntD”
- 删除或极度收缩现有 `editorialShell.css`，不再保留“大 CSS 皮肤文件”

## 非目标

本轮明确不做：

- 不迁移旧 `SSR` 页面到 Tailwind
- 不重写 `src/server/public/site.css`
- 不改变现有后端接口契约与业务逻辑
- 不引入新的状态管理框架
- 不一次性为全部 Ant Design Vue 组件定义全量 token 覆写
- 不把 Tailwind 当作对旧 CSS 的简单补丁层

## 方案比较

### 方案 A：Tailwind v3 + 配置中心化 + 单一 TS Token 源

做法：

- 新增 `Tailwind CSS v3` 与 `PostCSS`
- 新增一份共享主题 token 文件
- `tailwind.config.ts` 直接消费 token
- `editorialTheme.ts` 同样消费 token，并生成 `Ant Design Vue ConfigProvider` 主题
- 组件模板改成 Tailwind utilities
- 删除或收缩旧 `editorialShell.css`

优点：

- 最符合“所有样式都遵照 Tailwind CSS 来写”的目标
- 最适合把主题规范落到配置层
- Tailwind 与 AntD 可以稳定共享同一份 token
- 后续新增页面时规范最清楚

缺点：

- 首轮改动范围最大
- 需要完整迁移现有 Vue 客户端模板与样式入口

### 方案 B：Tailwind v4 CSS-first Theme

做法：

- 使用 Tailwind v4 的 CSS-first 主题配置
- 通过 CSS 变量和 `@theme` 做主题体系
- AntD 再反向消费 CSS 变量

优点：

- 语法更新
- CSS-first 体验更现代

缺点：

- 主题规范不再主要落在明确的配置文件里
- 与 “利用好样式配置功能” 的目标不完全一致
- AntD 主题桥接更绕，维护成本更高

### 方案 C：保留现有 TS 主题源，只做 Tailwind 增量接入

做法：

- 接入 Tailwind
- 继续保留 `editorialShell.css` 为主
- `Tailwind` 只承接少量新组件

优点：

- 首轮风险最低

缺点：

- 不满足“完整迁移”
- 容易形成“Tailwind + 大 CSS 文件”双轨并存
- 后续继续写样式时约束不够强

### 推荐结论

采用 `方案 A`。

原因：

- 它是唯一同时满足“完整迁移”“配置中心化”“主题进入 Tailwind 配置”“AntD 与 Tailwind 共享 token”的方案
- 虽然改动大，但边界清晰，只覆盖当前 Vue 客户端，不会误伤旧 SSR 页面
- 一次收口后，后续 Vue 页面就能自然沿用统一规范，而不是继续背着过渡层前进

## 设计结论

## 总体架构

本轮完成后，Vue 客户端样式架构调整为“三层一源”：

- `editorialTokens.ts`
  - 唯一主题源
  - 定义 `light / dark` 两套 `Editorial Desk` token
- `tailwind.config.ts`
  - 消费 token
  - 生成 Tailwind theme 扩展
- `editorialTheme.ts`
  - 消费同一份 token
  - 生成 `Ant Design Vue ConfigProvider` 主题
- `tailwind.css`
  - 只保留 `@tailwind` 入口与少量 `@layer base/components`

这样做的关键约束是：

- Tailwind 和 Ant Design Vue 不允许各自维护独立 palette
- 主题切换的语义由共享 token 决定，不由组件局部“临时补色”决定
- Vue 模板的主要视觉表达必须转到 Tailwind utilities，而不是继续依赖大块手写 CSS

## 主题源头设计

### 单一 Token 文件

新增：

- `src/client/theme/editorialTokens.ts`

职责：

- 定义 `light / dark` 两套主题 token
- 输出明确的结构化对象，而不是任意散乱常量
- 同时服务于：
  - Tailwind theme 扩展
  - Ant Design Vue token 映射
  - 必要的 CSS 变量输出

建议的 token 组织结构：

- `fonts`
- `radii`
- `shadows`
- `layout`
- `colors.base`
- `colors.semantic`
- `backgrounds`
- `effects`

命名原则：

- 用语义名，不用实现细节名
- 例如使用 `page`, `panel`, `sidebar`, `accent`, `danger`, `textMain`
- 不使用 `blue500`, `gray3` 这类纯色阶命名作为对外消费接口

## Tailwind 配置设计

### 配置文件

新增：

- `tailwind.config.ts`
- `postcss.config.js`

`tailwind.config.ts` 负责：

- 扫描 Vue 组件、TS、路由和主题入口
- 将共享 token 映射到 Tailwind theme
- 提供统一的 utility class 能力

### 进入 Tailwind Theme 的 Token

以下 token 进入 Tailwind theme 扩展：

- `colors`
- `fontFamily`
- `borderRadius`
- `boxShadow`
- `maxWidth`
- `spacing`
- `screens`
- `backgroundImage`

典型映射包括：

- `bg-editorial-page`
- `bg-editorial-panel`
- `text-editorial-main`
- `text-editorial-muted`
- `border-editorial-soft`
- `shadow-editorial-card`
- `shadow-editorial-accent`
- `font-editorial`
- `font-editorial-mono`
- `rounded-editorial-md`
- `rounded-editorial-xl`
- `max-w-editorial-shell`

### 通过 CSS 变量承接的动态 Token

考虑到 `light / dark` 主题切换需要在运行时即时生效，以下 token 不直接烘死为单值，而是优先通过 CSS 变量输出后再由 Tailwind 消费：

- 页面背景 glow
- scanline
- sidebar / panel 渐变
- accent 渐变
- focus ring
- 某些需要在 `light / dark` 之间切换的背景图或阴影

方式：

- `html[data-theme="light"]` 与 `html[data-theme="dark"]` 上挂载 CSS 变量
- Tailwind 主题中的颜色、阴影、背景图优先使用 `var(--editorial-*)`

这样可以保证：

- 模板仍然使用 Tailwind class
- 主题切换无需重建样式类
- 与 AntD 的 token 切换节奏保持一致

## Ant Design Vue 主题桥接设计

### 重写 `editorialTheme.ts`

[src/client/theme/editorialTheme.ts](/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/theme/editorialTheme.ts) 不再自己维护一份独立 palette，而是改成：

- 从 `editorialTokens.ts` 读 token
- 生成 `ConfigProvider` 的全局 token
- 只覆盖当前项目实际在用且视觉差异明显的组件 token

### 桥接范围

保留为 AntD token 的内容：

- `colorPrimary`
- `colorInfo`
- `colorSuccess`
- `colorWarning`
- `colorError`
- `fontFamily`
- `borderRadius`
- `boxShadow`

组件级桥接只覆盖当前壳层已显著依赖的组件：

- `Layout`
- `Menu`
- `Button`
- `Segmented`
- `Card`
- `Alert`
- `Tag`
- `Skeleton`

原则：

- 只桥接当前项目确实在用、并且视觉差异明显的组件
- 不提前为全部 AntD 组件做大而全覆写
- 组件内部细节如果能由 Tailwind 外层结构解决，就不额外堆 component token

## CSS 入口与全局基线设计

### 新入口

新增：

- `src/client/styles/tailwind.css`

该文件只承担：

- `@tailwind base`
- `@tailwind components`
- `@tailwind utilities`
- 少量 `@layer base`
- 极少量必须放在样式层的 `@layer components`

### 保留在样式层而不是模板层的内容

允许保留在 `tailwind.css` 的内容仅限：

- `html / body / #app` 的基础高度与背景基线
- `selection`
- `focus-visible`
- 主题切换依赖的 `html[data-theme]` 变量
- `body` 级别背景肌理
- `body` 滚动锁类，例如移动端抽屉打开时的锁滚动类
- 少量复杂伪元素、滚动条、keyframes
- AntD 深层选择器覆写

### 旧 CSS 文件处置

[src/client/styles/editorialShell.css](/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/styles/editorialShell.css) 不再作为主要样式源。

理想结果：

- 删除该文件

如果迁移过程中确有必要：

- 允许把少量全局基线内容吸收到新的 `tailwind.css`
- 但不允许保留“换个名字继续当大 CSS 皮肤文件”的做法

## Vue 客户端完整迁移边界

### 本轮改动范围

本轮只覆盖 Vue 客户端：

- `src/client/main.ts`
- `src/client/App.vue`
- `src/client/layouts/UnifiedShellLayout.vue`
- `src/client/theme/editorialTheme.ts`
- `src/client/theme/editorialTokens.ts`
- `src/client/styles/tailwind.css`
- `tailwind.config.ts`
- `postcss.config.js`
- 以及后续发现确实属于 Vue 客户端的页面组件

### 本轮必须完成的迁移

- Tailwind 依赖与构建链接入
- 主题 token 单一来源建立
- AntD 主题桥接改为消费共享 token
- `UnifiedShellLayout` 的主要布局和视觉写法改成 Tailwind class
- Vue 客户端入口改为引入 `tailwind.css`
- 现有 `editorialShell.css` 删除或收缩到只剩极少数基线规则

### 本轮不动的部分

- `src/server/public/site.css`
- 所有旧 SSR 页面
- Fastify 路由和后端业务逻辑

## 组件与模板迁移原则

### 模板写法原则

- 布局、背景、边框、阴影、间距、排版优先直接写 Tailwind class
- 组件模板中能用 Tailwind 表达清楚的，不再回退到 scoped CSS
- 类名可以长，但必须由共享 theme/token 支撑，而不是堆随意的硬编码值

### Ant Design 组件使用原则

- AntD 继续承担组件能力，例如菜单、按钮、分段控制器、弹性布局、告警、卡片
- 页面系统视觉不交给 AntD 默认皮肤，而是通过：
  - ConfigProvider 主题
  - Tailwind 外层布局与语义样式
 共同完成

### 少量样式层保留原则

以下情况允许保留少量 CSS：

- `body/html` 级基线
- AntD 深层结构覆写
- 复杂伪元素背景
- 少量滚动条与动画定义

其余页面样式默认必须迁入模板层 Tailwind utilities。

## 构建与工具链设计

### 依赖

新增开发依赖：

- `tailwindcss`
- `postcss`
- `autoprefixer`

如果实现层需要更顺手的 class 合并工具，可选增加：

- `clsx`
- `tailwind-merge`

但它们不是本轮的前置必需品。

### Vite 集成

Vite 继续作为客户端构建器，不引入额外 bundler。

需要确保：

- `Tailwind` 能扫描 `src/client/**/*.{vue,ts}`
- `build:client` 与 `typecheck:client` 流程不回归
- `main.ts` 改为加载 `tailwind.css`

## 验证门禁

### 构建门禁

必须通过：

- `npm install`
- `npm run typecheck:client`
- `npm run build:client`
- `npm run build`

### 主题门禁

必须满足：

- `light / dark` 切换后，Tailwind 写的页面结构和 AntD 组件同时变色
- 不允许出现 Tailwind 与 AntD 视觉分裂
- 项目中不再残留第二份并行维护的 palette 常量

### 页面门禁

必须满足：

- `UnifiedShellLayout` 在桌面和移动端均可正常显示
- 移动端顶部导航、侧栏、页面摘要、主题切换和账号面板不回归
- 当前已稳定的移动端紧凑导航和交互行为不被 Tailwind 迁移带坏

### 样式治理门禁

必须满足：

- Vue 客户端不再依赖大块手写 `editorialShell.css`
- 新增或改造后的 Vue 组件样式以 Tailwind 为主
- AntD 覆写收敛在桥接层，不再重新长出第二份“大皮肤文件”

## 风险与约束

### 风险 1：AntD 仍需要少量深层覆写

即使采用 Tailwind，也不能假装实现“完全零 CSS”。

原因：

- AntD 某些内部结构、交互态和伪元素仍需要少量覆写
- 这些覆写必须被限制在 `tailwind.css` 或桥接层，不允许扩散回整站样式文件

### 风险 2：完整迁移 diff 会比较大

本轮要求 `完整迁移`，所以：

- `UnifiedShellLayout` diff 会明显变大
- 需要严格限制只改当前 Vue 客户端与已有页面
- 不允许顺手扩更多页面、更多组件或旧 SSR 部分

### 风险 3：主题切换必须同步到两套消费端

如果实现层偷懒，最容易出现的问题是：

- Tailwind 跟着 token 走了
- AntD 仍吃旧值

因此桥接层必须明确保证：

- 主题源头只一份
- Tailwind 与 AntD 都从这一份派生

## 最终结论

本轮采用：

- `Tailwind CSS v3`
- `单一 TS token 源`
- `Tailwind 配置中心化`
- `Ant Design Vue ConfigProvider` 主题桥接
- `Vue 客户端完整迁移`

交付后的目标状态是：

- Vue 客户端主要样式表达改为 Tailwind utilities
- 已确认的 `Editorial Desk` 主题规范进入共享 token 与 Tailwind 配置
- Ant Design Vue 与 Tailwind 使用同一份主题源
- 现有大块手写壳层 CSS 被删除或压缩到极少量全局基线规则
