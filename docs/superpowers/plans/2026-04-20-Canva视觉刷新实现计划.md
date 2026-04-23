# HotNow Canva Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 HotNow 全站升级为高度借鉴 Canva 的 `C2 / 电光聚焦舞台` 视觉系统，覆盖 unified shell、内容页、系统页、legacy 页面和登录页，同时保持现有功能、路由和数据链路不回归。

**Architecture:** 继续沿用现有 `Vue 3 + Ant Design Vue + Tailwind CSS + Fastify` 架构，不新增新的样式体系入口。视觉重构以 `src/client/theme/editorialTokens.ts`、`src/client/theme/editorialTheme.ts` 和 `src/client/styles/tailwind.css` 为主题基建核心，再通过 `UnifiedShellLayout`、内容组件、系统页组件和 legacy 页面输出层逐步落地。所有危险操作、表单、列表和登录体验只重绘视觉，不改变后端契约与页面职责。

**Tech Stack:** TypeScript, Vue 3, Vue Router, Ant Design Vue, Tailwind CSS, Fastify, Vitest, JSDOM

---

## File Map

- Modify: `src/client/theme/editorialTokens.ts`
  - 把当前黑白灰 `Notion` token 升级为冷感科技的 Canva 风格 token，新增 glow / glass / hero / elevated surface 语义
- Modify: `src/client/theme/editorialTheme.ts`
  - 让 Ant Design Vue 消费新的 token，收口按钮、输入、表格、弹窗、drawer 的控件视觉
- Modify: `src/client/styles/tailwind.css`
  - 写入全局背景光斑、玻璃感卡片、浮层阴影、按钮高亮、legacy 基础容器 override
- Modify: `src/client/layouts/UnifiedShellLayout.vue`
  - 重做全站壳层、侧边导航、移动导航、底部账号区和页面头区骨架
- Modify: `src/client/components/content/contentCardShared.ts`
  - 收口内容页共享 class，增加 hero/card/panel 等新的语义容器
- Modify: `src/client/components/content/EditorialPageIntro.vue`
  - 升级为全站都能复用的 spotlight intro 区
- Modify: `src/client/components/content/ContentToolbarCard.vue`
  - 升级为更强存在感的控制面板
- Modify: `src/client/components/content/ContentHeroCard.vue`
  - 提升首页精选区的品牌感与主视觉层级
- Modify: `src/client/components/content/ContentStandardCard.vue`
  - 重绘标准内容卡的 hover、角标、元信息、反馈入口
- Modify: `src/client/components/content/ContentFeedbackPanel.vue`
  - 重绘反馈入口与展开态，保持交互不变
- Modify: `src/client/components/content/ContentSourceFilterBar.vue`
  - 重绘来源过滤条、pill、分组阴影和滚动表现
- Modify: `src/client/components/content/ContentSortControl.vue`
  - 重绘排序切换
- Modify: `src/client/components/content/ContentSearchControl.vue`
  - 重绘搜索框和按钮
- Modify: `src/client/components/content/ContentEmptyState.vue`
  - 升级内容页空态
- Modify: `src/client/components/content/EditorialEmptyState.vue`
  - 升级系统/壳层空态
- Modify: `src/client/pages/content/AiNewPage.vue`
  - 调整页面头部布局与内容舞台节奏
- Modify: `src/client/pages/content/AiHotPage.vue`
  - 调整热点页的舞台布局与列表节奏
- Modify: `src/client/pages/settings/ViewRulesPage.vue`
  - 升级策略工作台的页头、分区卡、列表和动作区视觉
- Modify: `src/client/pages/settings/SourcesPage.vue`
  - 升级来源工作台的 overview、analytics、inventory 和操作样式
- Modify: `src/client/pages/settings/ProfilePage.vue`
  - 升级 profile 页面为品牌资料卡
- Modify: `src/server/createServer.ts`
  - 重绘 `/login` 页 HTML 结构与 class 语义，做成强品牌首屏
- Modify: `src/server/public/site.css`
  - 重绘 legacy 页与登录页共享样式
- Modify: `src/server/renderPages.ts`
  - 调整 legacy 页面 wrapper / section 结构，使其吃到新的视觉体系
- Modify: `tests/client/editorialTheme.test.ts`
  - 锁定新 token / AntD 主题桥接
- Modify: `tests/client/appShell.test.ts`
  - 锁定新的 unified shell 结构
- Modify: `tests/client/contentToolbarCard.test.ts`
  - 锁定 toolbar card 的结构变化
- Modify: `tests/client/contentHeroCard.test.ts`
  - 锁定精选 hero card 结构变化
- Modify: `tests/client/contentStandardCard.test.ts`
  - 锁定标准卡结构变化
- Modify: `tests/client/contentSourceFilterBar.test.ts`
  - 锁定筛选条结构变化
- Modify: `tests/client/aiNewPage.test.ts`
  - 锁定 AI 新讯页结构变化
- Modify: `tests/client/aiHotPage.test.ts`
  - 锁定 AI 热点页结构变化
- Modify: `tests/client/viewRulesPage.test.ts`
  - 锁定系统页布局变化
- Modify: `tests/client/sourcesPage.test.ts`
  - 锁定来源页布局变化
- Modify: `tests/client/profilePage.test.ts`
  - 锁定 profile 页布局变化
- Modify: `tests/server/createServer.test.ts`
  - 锁定登录页输出结构变化
- Modify: `tests/server/reportPages.test.ts`
  - 锁定 legacy 页面输出结构变化
- Modify: `README.md`
  - 更新全站视觉描述
- Modify: `AGENTS.md`
  - 更新当前阶段快照与视觉母版描述

## Task 1: 重建 Canva 风格主题 token 和全局样式基建

**Files:**
- Modify: `src/client/theme/editorialTokens.ts`
- Modify: `src/client/theme/editorialTheme.ts`
- Modify: `src/client/styles/tailwind.css`
- Modify: `tests/client/editorialTheme.test.ts`

- [ ] **Step 1: 先补 token 和主题桥接断言，锁定冷感科技 palette**

```ts
// tests/client/editorialTheme.test.ts
it("maps the light palette to a cool canva-inspired product stage", () => {
  const palette = readEditorialThemePalette("light");
  const providerTheme = createEditorialProviderTheme("light");

  expect(palette.bgPage).toBe("#f4f7ff");
  expect(palette.bgPageGlowA).toContain("rgba(87, 144, 255");
  expect(palette.bgPanel).toBe("rgba(255, 255, 255, 0.72)");
  expect(palette.accent).toBe("#4d7dff");
  expect(providerTheme.token?.colorPrimary).toBe("#4d7dff");
});

it("maps the dark palette to a cool canva-inspired spotlight stage", () => {
  const palette = readEditorialThemePalette("dark");
  const providerTheme = createEditorialProviderTheme("dark");

  expect(palette.bgPage).toBe("#0a1020");
  expect(palette.bgPageGlowB).toContain("rgba(81, 220, 255");
  expect(palette.bgPanel).toBe("rgba(15, 22, 40, 0.76)");
  expect(palette.accent).toBe("#7aa2ff");
  expect(providerTheme.token?.colorBgLayout).toBe("#0a1020");
});
```

- [ ] **Step 2: 跑主题测试，确认当前旧 token 还不满足新视觉要求**

Run: `npm run test -- tests/client/editorialTheme.test.ts`

Expected: FAIL，现有 palette 仍然是 `Notion` 风格黑白灰，不会匹配冷感科技 token

- [ ] **Step 3: 在 token 文件里新增冷感科技视觉语义**

```ts
// src/client/theme/editorialTokens.ts
const editorialLightTokens = {
  fontUi: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif',
  fontMono: '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  shellContentWidth: "1240px",
  radiusSm: "10px",
  radiusMd: "16px",
  radiusLg: "24px",
  radiusXl: "32px",
  radiusPill: "999px",
  bgPage: "#f4f7ff",
  bgPageGlowA: "radial-gradient(circle at 14% 16%, rgba(87, 144, 255, 0.24), transparent 28%)",
  bgPageGlowB: "radial-gradient(circle at 85% 18%, rgba(81, 220, 255, 0.20), transparent 24%)",
  bgPageGlowC: "radial-gradient(circle at 56% 78%, rgba(149, 111, 255, 0.16), transparent 28%)",
  bgSidebar: "linear-gradient(180deg, rgba(233, 240, 255, 0.92) 0%, rgba(245, 248, 255, 0.92) 100%)",
  bgSidebarPanel: "rgba(255, 255, 255, 0.6)",
  bgPanel: "rgba(255, 255, 255, 0.72)",
  bgPanelStrong: "rgba(255, 255, 255, 0.86)",
  bgControl: "rgba(255, 255, 255, 0.7)",
  bgControlHover: "rgba(255, 255, 255, 0.9)",
  bgLink: "rgba(77, 125, 255, 0.08)",
  bgLinkActive: "linear-gradient(135deg, rgba(89, 131, 255, 0.18), rgba(114, 225, 255, 0.12))",
  bgLinkActiveStrong: "rgba(88, 126, 255, 0.22)",
  textMain: "#10182a",
  textBody: "#36435f",
  textMuted: "#7081a4",
  accent: "#4d7dff",
  accentOrange: "#4d7dff",
  accentSoft: "rgba(77, 125, 255, 0.12)",
  border: "rgba(116, 144, 205, 0.18)",
  borderStrong: "rgba(92, 119, 190, 0.28)",
  ring: "rgba(77, 125, 255, 0.34)",
  shadowCard: "0 18px 44px rgba(31, 58, 120, 0.08)",
  shadowFloating: "0 24px 60px rgba(25, 43, 92, 0.16)",
  shadowAccent: "0 16px 36px rgba(77, 125, 255, 0.18)"
} as const satisfies EditorialThemeTokens;
```

- [ ] **Step 4: 在 AntD 主题桥接与 Tailwind 基础层同步新的 glow / glass / spotlight 语义**

```ts
// src/client/theme/editorialTheme.ts
export function createEditorialProviderTheme(mode: EditorialThemeMode): ProviderThemeConfig {
  const palette = readEditorialThemePalette(mode);

  return {
    token: {
      colorPrimary: palette.accent,
      colorBgLayout: palette.bgPage,
      colorBgContainer: palette.bgPanelStrong,
      borderRadius: 18,
      boxShadowSecondary: palette.shadowFloating,
      controlOutline: palette.ring
    }
  };
}
```

```css
/* src/client/styles/tailwind.css */
body {
  background:
    var(--editorial-bg-page-glow-a),
    var(--editorial-bg-page-glow-b),
    var(--editorial-bg-page-glow-c),
    var(--editorial-bg-page);
}

.editorial-glass-panel {
  background: var(--editorial-bg-panel);
  border: 1px solid var(--editorial-border);
  box-shadow: var(--editorial-shadow-card);
  backdrop-filter: blur(18px);
}

.editorial-spotlight-card {
  background: var(--editorial-bg-panel-strong);
  border: 1px solid var(--editorial-border-strong);
  box-shadow: var(--editorial-shadow-accent);
}
```

- [ ] **Step 5: 回跑主题测试，确认新 token 已生效**

Run: `npm run test -- tests/client/editorialTheme.test.ts`

Expected: PASS

- [ ] **Step 6: 提交主题基建**

```bash
git add src/client/theme/editorialTokens.ts src/client/theme/editorialTheme.ts src/client/styles/tailwind.css tests/client/editorialTheme.test.ts
git commit -m "feat: 重建冷感科技主题基建"
```

## Task 2: 重做 unified shell 与登录页的品牌舞台

**Files:**
- Modify: `src/client/layouts/UnifiedShellLayout.vue`
- Modify: `src/server/createServer.ts`
- Modify: `src/server/public/site.css`
- Modify: `tests/client/appShell.test.ts`
- Modify: `tests/server/createServer.test.ts`

- [ ] **Step 1: 先补 shell 与登录页结构断言**

```ts
// tests/client/appShell.test.ts
it("renders a spotlight-style shell with stage header and elevated nav rail", async () => {
  const wrapper = mountWithApp(UnifiedShellLayout, { /* existing router setup */ });
  await flushPromises();

  expect(wrapper.get("[data-shell-brand-stage]").exists()).toBe(true);
  expect(wrapper.get("[data-shell-nav-rail]").exists()).toBe(true);
  expect(wrapper.get("[data-shell-theme-toggle]").exists()).toBe(true);
});
```

```ts
// tests/server/createServer.test.ts
expect(html).toContain('data-login-stage="brand"');
expect(html).toContain('data-login-panel="form"');
expect(html).toContain("欢迎回到 HotNow");
```

- [ ] **Step 2: 跑 shell / login 测试，确认旧结构不满足新视觉骨架**

Run: `npm run test -- tests/client/appShell.test.ts tests/server/createServer.test.ts`

Expected: FAIL，当前结构还没有 spotlight hero、brand stage 和新的登录分栏语义

- [ ] **Step 3: 在 unified shell 中增加品牌舞台与更强的导航 rail**

```vue
<!-- src/client/layouts/UnifiedShellLayout.vue -->
<aside
  data-shell-nav-rail
  class="editorial-glass-panel hidden w-[276px] flex-none flex-col gap-4 rounded-[28px] px-4 py-5 min-[901px]:flex"
>
  <div data-shell-brand-stage class="editorial-spotlight-card rounded-[24px] px-4 py-4">
    <img :src="shellLogoSrc" alt="HotNow" class="h-10 w-10 rounded-2xl" />
    <h1 class="mt-4 text-[24px] font-semibold tracking-[-0.04em] text-editorial-text-main">HotNow</h1>
    <p class="mt-2 text-sm text-editorial-text-body">AI 热点与新讯的聚光舞台。</p>
  </div>
  <!-- keep existing nav items, but move them into upgraded rail blocks -->
</aside>
```

- [ ] **Step 4: 重绘登录页为双栏品牌首屏**

```ts
// src/server/createServer.ts
const loginPageHtml = `
  <main class="login-stage">
    <section class="login-stage__brand" data-login-stage="brand">
      <p class="login-stage__eyebrow">Spotlight Product</p>
      <h1>欢迎回到 HotNow</h1>
      <p>在冷色聚光舞台里，浏览、筛选并掌控每天的 AI 热点。</p>
      <div class="login-stage__floating-cards" aria-hidden="true"></div>
    </section>
    <section class="login-stage__panel editorial-glass-panel" data-login-panel="form">
      ${existingLoginFormHtml}
    </section>
  </main>
`;
```

- [ ] **Step 5: 在 `site.css` 里补登录与 legacy 共用的品牌舞台样式**

```css
/* src/server/public/site.css */
.login-stage {
  display: grid;
  grid-template-columns: 1.1fr minmax(360px, 460px);
  gap: 28px;
  min-height: 100dvh;
  padding: 28px;
}

.login-stage__brand {
  position: relative;
  border-radius: 36px;
  padding: 48px;
  background:
    radial-gradient(circle at 14% 18%, rgba(96, 134, 255, 0.42), transparent 26%),
    radial-gradient(circle at 85% 16%, rgba(85, 220, 255, 0.28), transparent 24%),
    linear-gradient(145deg, #0d1430 0%, #0c1322 55%, #111827 100%);
}
```

- [ ] **Step 6: 回跑 shell / login 测试**

Run: `npm run test -- tests/client/appShell.test.ts tests/server/createServer.test.ts`

Expected: PASS

- [ ] **Step 7: 提交壳层与登录页**

```bash
git add src/client/layouts/UnifiedShellLayout.vue src/server/createServer.ts src/server/public/site.css tests/client/appShell.test.ts tests/server/createServer.test.ts
git commit -m "feat: 重做统一壳层与登录页舞台"
```

## Task 3: 重做内容页 hero、工具条与内容卡

**Files:**
- Modify: `src/client/components/content/contentCardShared.ts`
- Modify: `src/client/components/content/EditorialPageIntro.vue`
- Modify: `src/client/components/content/ContentToolbarCard.vue`
- Modify: `src/client/components/content/ContentHeroCard.vue`
- Modify: `src/client/components/content/ContentStandardCard.vue`
- Modify: `src/client/components/content/ContentFeedbackPanel.vue`
- Modify: `src/client/components/content/ContentSourceFilterBar.vue`
- Modify: `src/client/components/content/ContentSortControl.vue`
- Modify: `src/client/components/content/ContentSearchControl.vue`
- Modify: `src/client/components/content/ContentEmptyState.vue`
- Modify: `src/client/pages/content/AiNewPage.vue`
- Modify: `src/client/pages/content/AiHotPage.vue`
- Modify: `tests/client/contentToolbarCard.test.ts`
- Modify: `tests/client/contentHeroCard.test.ts`
- Modify: `tests/client/contentStandardCard.test.ts`
- Modify: `tests/client/contentSourceFilterBar.test.ts`
- Modify: `tests/client/aiNewPage.test.ts`
- Modify: `tests/client/aiHotPage.test.ts`

- [ ] **Step 1: 先补内容页公共组件的失败测试**

```ts
// tests/client/contentHeroCard.test.ts
expect(wrapper.get("[data-content-hero='spotlight']").exists()).toBe(true);
expect(wrapper.get("[data-content-hero-kicker]").text()).toContain("AI");
```

```ts
// tests/client/contentToolbarCard.test.ts
expect(wrapper.get("[data-content-toolbar='shell']").classes()).toContain("editorial-glass-panel");
```

```ts
// tests/client/contentStandardCard.test.ts
expect(wrapper.get("[data-content-card='item']").classes()).toContain("editorial-spotlight-card");
```

- [ ] **Step 2: 跑这些测试，确认旧内容卡与工具条还没有新视觉语义**

Run: `npm run test -- tests/client/contentToolbarCard.test.ts tests/client/contentHeroCard.test.ts tests/client/contentStandardCard.test.ts tests/client/contentSourceFilterBar.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts`

Expected: FAIL

- [ ] **Step 3: 先在共享 class helper 里增加统一的 spotlight 容器**

```ts
// src/client/components/content/contentCardShared.ts
export const editorialContentPageClass =
  "mx-auto flex w-full max-w-editorial-shell flex-col gap-6 px-4 pb-10 pt-4 md:px-6 xl:px-8";

export const editorialSpotlightPanelClass =
  "editorial-glass-panel rounded-[28px] px-5 py-5 md:px-6";

export const editorialSpotlightCardClass =
  "editorial-spotlight-card rounded-[24px] px-5 py-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--editorial-shadow-floating)]";
```

- [ ] **Step 4: 重绘 hero / toolbar / standard card**

```vue
<!-- src/client/components/content/ContentHeroCard.vue -->
<article data-content-hero="spotlight" :class="editorialSpotlightPanelClass">
  <p data-content-hero-kicker class="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-editorial-text-muted">
    AI Spotlight
  </p>
  <h2 class="m-0 text-[30px] font-semibold tracking-[-0.04em] text-editorial-text-main">
    {{ hero.title }}
  </h2>
  <p class="mt-3 text-sm leading-7 text-editorial-text-body">{{ hero.summary }}</p>
</article>
```

```vue
<!-- src/client/components/content/ContentToolbarCard.vue -->
<section data-content-toolbar="shell" :class="editorialSpotlightPanelClass">
  <!-- keep existing controls -->
</section>
```

```vue
<!-- src/client/components/content/ContentStandardCard.vue -->
<article data-content-card="item" :class="editorialSpotlightCardClass">
  <!-- existing meta and actions remain, but upgrade heading / tag / footer layout -->
</article>
```

- [ ] **Step 5: 在 AI 新讯与 AI 热点页加页面舞台区，收口 hero + toolbar + list 节奏**

```vue
<!-- src/client/pages/content/AiHotPage.vue -->
<section class="grid gap-5">
  <EditorialPageIntro
    eyebrow="AI Hot"
    title="AI 热点聚光台"
    description="把今天真正形成热度的 AI 内容拉到同一个聚光舞台里。"
  />
  <ContentToolbarCard ... />
  <section :class="editorialContentListSectionClass">
    <!-- existing cards -->
  </section>
</section>
```

- [ ] **Step 6: 回跑内容页测试**

Run: `npm run test -- tests/client/contentToolbarCard.test.ts tests/client/contentHeroCard.test.ts tests/client/contentStandardCard.test.ts tests/client/contentSourceFilterBar.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts`

Expected: PASS

- [ ] **Step 7: 提交内容页改版**

```bash
git add src/client/components/content/contentCardShared.ts src/client/components/content/EditorialPageIntro.vue src/client/components/content/ContentToolbarCard.vue src/client/components/content/ContentHeroCard.vue src/client/components/content/ContentStandardCard.vue src/client/components/content/ContentFeedbackPanel.vue src/client/components/content/ContentSourceFilterBar.vue src/client/components/content/ContentSortControl.vue src/client/components/content/ContentSearchControl.vue src/client/components/content/ContentEmptyState.vue src/client/pages/content/AiNewPage.vue src/client/pages/content/AiHotPage.vue tests/client/contentToolbarCard.test.ts tests/client/contentHeroCard.test.ts tests/client/contentStandardCard.test.ts tests/client/contentSourceFilterBar.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts
git commit -m "feat: 重做内容页聚光舞台"
```

## Task 4: 升级 `/settings/*` 为高完成度产品控制中心

**Files:**
- Modify: `src/client/pages/settings/ViewRulesPage.vue`
- Modify: `src/client/pages/settings/SourcesPage.vue`
- Modify: `src/client/pages/settings/ProfilePage.vue`
- Modify: `src/client/components/content/EditorialEmptyState.vue`
- Modify: `tests/client/viewRulesPage.test.ts`
- Modify: `tests/client/sourcesPage.test.ts`
- Modify: `tests/client/profilePage.test.ts`

- [ ] **Step 1: 补系统页布局测试**

```ts
// tests/client/viewRulesPage.test.ts
expect(wrapper.get("[data-settings-hero='view-rules']").exists()).toBe(true);
expect(wrapper.get("[data-settings-surface='rules']").exists()).toBe(true);
```

```ts
// tests/client/sourcesPage.test.ts
expect(wrapper.get("[data-settings-hero='sources']").exists()).toBe(true);
expect(wrapper.get("[data-sources-section='inventory']").classes()).toContain("editorial-spotlight-card");
```

```ts
// tests/client/profilePage.test.ts
expect(wrapper.get("[data-settings-hero='profile']").exists()).toBe(true);
```

- [ ] **Step 2: 跑系统页测试，确认旧布局仍然是工具台风格**

Run: `npm run test -- tests/client/viewRulesPage.test.ts tests/client/sourcesPage.test.ts tests/client/profilePage.test.ts`

Expected: FAIL

- [ ] **Step 3: 为三个系统页统一引入 spotlight hero 和新的 section surface**

```vue
<!-- src/client/pages/settings/SourcesPage.vue -->
<section data-settings-hero="sources" :class="editorialSpotlightPanelClass">
  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-editorial-text-muted">Source Control</p>
  <h1 class="m-0 text-[30px] font-semibold tracking-[-0.04em] text-editorial-text-main">来源控制中心</h1>
  <p class="mt-3 text-sm leading-7 text-editorial-text-body">管理接入来源、来源展示策略与手动采集动作。</p>
</section>
```

- [ ] **Step 4: 重绘 overview、analytics、inventory、rule cards、profile cards**

```vue
<!-- apply to cards across settings pages -->
<a-card :class="['editorial-spotlight-card', editorialContentCardClass]" ... />
```

- [ ] **Step 5: 保持危险操作与二次确认逻辑不变，只升级危险按钮视觉**

```vue
<a-popconfirm ...>
  <a-button danger class="editorial-danger-link-button" ...>删除</a-button>
</a-popconfirm>
```

- [ ] **Step 6: 回跑系统页测试**

Run: `npm run test -- tests/client/viewRulesPage.test.ts tests/client/sourcesPage.test.ts tests/client/profilePage.test.ts`

Expected: PASS

- [ ] **Step 7: 提交系统页改版**

```bash
git add src/client/pages/settings/ViewRulesPage.vue src/client/pages/settings/SourcesPage.vue src/client/pages/settings/ProfilePage.vue src/client/components/content/EditorialEmptyState.vue tests/client/viewRulesPage.test.ts tests/client/sourcesPage.test.ts tests/client/profilePage.test.ts
git commit -m "feat: 重做系统页控制中心样式"
```

## Task 5: 重绘 legacy 页、补文档并做全量视觉验收

**Files:**
- Modify: `src/server/renderPages.ts`
- Modify: `src/server/public/site.css`
- Modify: `tests/server/reportPages.test.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: 补 legacy 页面输出测试**

```ts
// tests/server/reportPages.test.ts
expect(html).toContain('class="legacy-shell legacy-shell--history legacy-shell--spotlight"');
expect(html).toContain("Legacy pages under the shared spotlight theme");
```

- [ ] **Step 2: 跑 legacy 测试，确认旧 wrapper 不满足新语义**

Run: `npm run test -- tests/server/reportPages.test.ts`

Expected: FAIL

- [ ] **Step 3: 在 render 层给 legacy 页面补统一 spotlight shell 语义**

```ts
// src/server/renderPages.ts
<body class="legacy-page legacy-page--${config.pageKind}">
  <main class="legacy-shell legacy-shell--${config.pageKind} legacy-shell--spotlight">
    <header class="legacy-header legacy-header--spotlight">
      ...
    </header>
```

- [ ] **Step 4: 在 `site.css` 补 legacy 页的品牌卡片、按钮和背景层**

```css
/* src/server/public/site.css */
.legacy-shell--spotlight {
  max-width: 1180px;
  margin: 0 auto;
  padding: 28px 20px 72px;
}

.legacy-card--history,
.legacy-card--control,
.legacy-card--notice {
  border-radius: 28px;
  border: 1px solid rgba(127, 153, 221, 0.18);
  background: rgba(15, 22, 40, 0.7);
  box-shadow: 0 20px 50px rgba(11, 20, 42, 0.22);
  backdrop-filter: blur(18px);
}
```

- [ ] **Step 5: 更新 README 与 AGENTS 的视觉描述**

```md
<!-- README.md / AGENTS.md -->
- unified shell、内容页、系统页、legacy 页面和登录页现在统一切换到 Canva-inspired `C2 / 电光聚焦舞台` 视觉母版
```

- [ ] **Step 6: 跑最终验证**

Run: `npm run test`

Expected: PASS

Run: `npm run build:client`

Expected: PASS

- [ ] **Step 7: 做手动 smoke test**

Run:

```bash
npm run dev
```

Expected:
- `/login` 显示双栏品牌舞台
- `/`、`/ai-new`、`/ai-hot` 具备 spotlight hero + 新工具条 + 新内容卡
- `/settings/view-rules`、`/settings/sources`、`/settings/profile` 具备 spotlight hero 与新 surfaces
- `/history`、`/reports/:date`、`/control` 进入统一视觉体系
- 深色 / 浅色切换都正常
- 移动端系统抽屉与登录页单栏不崩

- [ ] **Step 8: 提交最终验收与文档**

```bash
git add src/server/renderPages.ts src/server/public/site.css tests/server/reportPages.test.ts README.md AGENTS.md
git commit -m "feat: 完成全站 canva 风格视觉升级"
```
