# HotNow Notion Workspace UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 HotNow 全站从当前的 `Editorial Signal Desk` 视觉母版切换成高还原 `Notion Workspace`，覆盖 unified shell、内容页、系统页和 legacy 页，同时保持现有业务逻辑、接口契约和反馈/策略链路不回归。

**Architecture:** 继续沿用当前 `Vue 3 + Ant Design Vue + Tailwind CSS` 客户端壳层，以及 Fastify 输出 legacy 页面与共享主题资源的双通道架构。主题层以 `src/client/theme/editorialTokens.ts` 和 `src/client/theme/editorialTheme.ts` 为唯一 token/AntD 桥接入口，布局与页面重构集中在 `src/client/layouts/UnifiedShellLayout.vue`、内容/系统页组件，以及 `src/server/public/site.css + src/server/renderPages.ts + src/server/createServer.ts` 的 legacy 页面输出。

**Tech Stack:** TypeScript, Vue 3, Vue Router, Ant Design Vue, Tailwind CSS, Fastify, Vitest, JSDOM

---

## File Map

- Create: `tests/client/helpers/mountWithApp.ts`
  - 为客户端页面测试统一注入 `ConfigProvider`、主题和稳定的挂载外壳，先收口当前 `prefixCls` 基线噪音
- Modify: `src/client/theme/editorialTokens.ts`
  - 把主题 token 从 `Editorial Desk` 语义切成更接近 Notion 的黑白灰工作区语义，同时保留当前文件作为唯一主题源
- Modify: `src/client/theme/editorialTheme.ts`
  - 让 Ant Design Vue 继续消费统一 token，但桥接成更克制的控件视觉
- Modify: `src/client/styles/tailwind.css`
  - 去掉 glow / grid / scanline 等装饰性背景，收口基础背景、选区、焦点和 legacy 共享基础行为
- Modify: `src/client/App.vue`
  - 收紧根节点语义和全局壳层容器 class
- Modify: `src/client/router.ts`
  - 把页面标题、描述和导航文案从“工作台”语气改成更文档式、更 Notion 的语气
- Modify: `src/client/layouts/UnifiedShellLayout.vue`
  - 重建侧栏、页面头区、移动端导航和账号区，让 unified shell 变成 Notion 式 workspace shell
- Modify: `src/client/components/content/ContentHeroCard.vue`
  - 把首页精选区改成更像置顶 page preview，而不是重 hero 卡
- Modify: `src/client/components/content/ContentStandardCard.vue`
  - 把标准卡改成 database row / page row 语言
- Modify: `src/client/components/content/ContentActionBar.vue`
  - 收口收藏、点赞、点踩、补充反馈的操作条视觉层级
- Modify: `src/client/components/content/ContentFeedbackPanel.vue`
  - 把反馈面板改成 inline toggle section 风格
- Modify: `src/client/components/content/ContentSourceFilterBar.vue`
  - 把来源过滤条收口成轻量 database toolbar
- Modify: `src/client/components/content/ContentSortControl.vue`
  - 把排序切换收口成轻量 toolbar control
- Modify: `src/client/components/content/ContentEmptyState.vue`
  - 把内容页空态改成文档式空态
- Modify: `src/client/components/content/EditorialEmptyState.vue`
  - 把系统页和壳层空态改成统一的 Notion 风格空态
- Modify: `src/client/components/content/contentCardShared.ts`
  - 如果现有卡片元信息和状态标签有共享 class/format helper，在这里同步收口为 page row 语义
- Modify: `src/client/pages/content/AiNewPage.vue`
  - 调整页面头区、精选区和内容列表的总体布局
- Modify: `src/client/pages/content/AiHotPage.vue`
  - 调整热点页的列表密度和页面头区
- Modify: `src/client/pages/settings/ViewRulesPage.vue`
  - 把筛选策略工作台改成 settings page + inline database 结构
- Modify: `src/client/pages/settings/SourcesPage.vue`
  - 把 source 工作台改成 inventory/database 风格
- Modify: `src/client/pages/settings/ProfilePage.vue`
  - 把当前用户页改成更轻的 account settings 风格
- Modify: `src/server/public/site.css`
  - 把 legacy 页面共享 CSS 改成 Notion 风格的黑白灰双主题
- Modify: `src/server/renderPages.ts`
  - 调整 legacy `/history`、`/control` 和 notice 页语义 class，配合新的共享样式
- Modify: `src/server/createServer.ts`
  - 调整 `/login` 页输出，改成极简 Notion 风格登录页
- Modify: `tests/client/editorialTheme.test.ts`
  - 锁定新的黑白灰 token 和 AntD 主题桥接
- Modify: `tests/client/useTheme.test.ts`
  - 回归主题切换与 `data-theme`、`localStorage` 行为
- Modify: `tests/client/appShell.test.ts`
  - 锁定新侧栏、页面头区和移动端导航结构
- Modify: `tests/client/contentHeroCard.test.ts`
  - 锁定精选区新的 page preview 语义
- Modify: `tests/client/aiNewPage.test.ts`
  - 锁定 AI 新讯页头区、toolbar 和列表结构
- Modify: `tests/client/aiHotPage.test.ts`
  - 锁定 AI 热点页的 database row 布局
- Modify: `tests/client/contentSourceFilterBar.test.ts`
  - 锁定过滤条的轻量 toolbar 结构
- Modify: `tests/client/viewRulesPage.test.ts`
  - 锁定 settings section、反馈池和草稿池的 inline database 布局
- Modify: `tests/client/sourcesPage.test.ts`
  - 锁定 source inventory 页的列表结构，并吃掉当前基线错误
- Modify: `tests/client/profilePage.test.ts`
  - 锁定 profile settings 风格的 section 输出，并吃掉当前基线错误
- Modify: `tests/server/reportPages.test.ts`
  - 锁定 legacy 页面共享 CSS 与更轻的 wrapper class
- Modify: `tests/server/createServer.test.ts`
  - 锁定 `/login` 新输出结构
- Modify: `tests/server/siteThemeClient.test.ts`
  - 回归 legacy 共享主题脚本与 `data-theme` 持久化
- Modify: `README.md`
  - 把产品 UI 描述从 `Editorial Signal Desk` 更新为 `Notion Workspace`
- Modify: `AGENTS.md`
  - 更新项目主题描述和当前阶段快照，避免文档继续引用旧母版

## Task 1: 重建主题 token，并先把客户端挂载基座稳定下来

**Files:**
- Create: `tests/client/helpers/mountWithApp.ts`
- Modify: `src/client/theme/editorialTokens.ts`
- Modify: `src/client/theme/editorialTheme.ts`
- Modify: `src/client/styles/tailwind.css`
- Modify: `tests/client/editorialTheme.test.ts`
- Modify: `tests/client/useTheme.test.ts`
- Modify: `tests/client/profilePage.test.ts`
- Modify: `tests/client/sourcesPage.test.ts`
- Modify: `tests/client/viewRulesPage.test.ts`

- [ ] **Step 1: 先补新的主题与测试挂载断言，锁定黑白灰 token 和统一 ConfigProvider 包装**

```ts
// tests/client/editorialTheme.test.ts
it("maps the shared tokens to a neutral notion-like light palette", () => {
  const palette = readEditorialThemePalette("light");
  const providerTheme = createEditorialProviderTheme("light");

  expect(palette.bgPage).toBe("#fbfbfa");
  expect(palette.bgSidebarPanel).toBe("#f7f7f5");
  expect(palette.textMain).toBe("#37352f");
  expect(palette.border).toBe("rgba(55, 53, 47, 0.08)");
  expect(providerTheme.token?.colorBgLayout).toBe("#fbfbfa");
  expect(providerTheme.token?.colorBgContainer).toBe("#ffffff");
  expect(providerTheme.token?.controlHeight).toBe(36);
});

it("maps the shared tokens to a neutral notion-like dark palette", () => {
  const palette = readEditorialThemePalette("dark");
  const providerTheme = createEditorialProviderTheme("dark");

  expect(palette.bgPage).toBe("#191919");
  expect(palette.bgSidebarPanel).toBe("#202020");
  expect(palette.textMain).toBe("#ffffff");
  expect(palette.border).toBe("rgba(255, 255, 255, 0.1)");
  expect(providerTheme.token?.colorBgLayout).toBe("#191919");
  expect(providerTheme.token?.colorBgContainer).toBe("#202020");
});
```

```ts
// tests/client/helpers/mountWithApp.ts
export function mountWithApp(component: Component, options?: MountingOptions<unknown>) {
  return mount(component, {
    ...options,
    global: {
      ...options?.global,
      stubs: {
        transition: false,
        teleport: true,
        ...(options?.global?.stubs ?? {})
      },
      renderStubDefaultSlot: true,
      components: {
        ...(options?.global?.components ?? {}),
        ConfigProvider
      }
    }
  });
}
```

- [ ] **Step 2: 跑主题与当前失败的客户端测试，确认现状还不满足新的 token 和挂载稳定性**

Run: `npx vitest run tests/client/editorialTheme.test.ts tests/client/useTheme.test.ts tests/client/profilePage.test.ts tests/client/sourcesPage.test.ts tests/client/viewRulesPage.test.ts`

Expected: FAIL，至少会出现旧的 `Editorial Desk` token 断言不匹配，以及当前已知的 Ant Design Vue `prefixCls` 相关挂载异常

- [ ] **Step 3: 在共享 token 里切掉 glow/grid/scanline 语义，收口为 Notion 风格的黑白灰主题**

```ts
// src/client/theme/editorialTokens.ts
const editorialLightTokens = {
  fontUi: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif',
  fontMono: '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  shellContentWidth: "1180px",
  radiusSm: "6px",
  radiusMd: "8px",
  radiusLg: "12px",
  radiusXl: "16px",
  radiusPill: "999px",
  bgPage: "#fbfbfa",
  bgPageGlowA: "transparent",
  bgPageGlowB: "transparent",
  bgPageGlowC: "transparent",
  gridLine: "transparent",
  scanline: "transparent",
  bgSidebar: "#f7f7f5",
  bgSidebarPanel: "#f7f7f5",
  bgPanel: "#ffffff",
  bgPanelStrong: "#ffffff",
  bgControl: "#ffffff",
  bgControlHover: "#f1f1ef",
  bgLink: "transparent",
  bgLinkActive: "#ececea",
  bgLinkActiveStrong: "#e3e3e0",
  textMain: "#37352f",
  textBody: "#5f5e58",
  textMuted: "#8f8e88",
  textSidebar: "#37352f",
  textSidebarMuted: "#7b7a74",
  textOnAccent: "#ffffff",
  accent: "#2f2f2f",
  accentOrange: "#2f2f2f",
  accentSoft: "rgba(55, 53, 47, 0.08)",
  border: "rgba(55, 53, 47, 0.08)",
  borderStrong: "rgba(55, 53, 47, 0.14)",
  ring: "rgba(55, 53, 47, 0.16)",
  success: "#2f2f2f",
  warning: "#2f2f2f",
  danger: "#2f2f2f",
  shadowCard: "0 1px 2px rgba(15, 23, 42, 0.04)",
  shadowPage: "0 0 0 rgba(0, 0, 0, 0)",
  shadowFloating: "0 8px 24px rgba(15, 23, 42, 0.06)",
  shadowAccent: "0 0 0 1px rgba(55, 53, 47, 0.08)"
} as const satisfies EditorialThemeTokens;
```

- [ ] **Step 4: 调整 AntD 主题桥接和全局 Tailwind base，去掉旧母版装饰层**

```ts
// src/client/theme/editorialTheme.ts
export function createEditorialProviderTheme(mode: EditorialThemeMode): ProviderThemeConfig {
  const palette = readEditorialThemePalette(mode);

  return {
    algorithm: mode === "dark" ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      colorPrimary: palette.accent,
      colorInfo: palette.accent,
      colorSuccess: palette.success,
      colorWarning: palette.warning,
      colorError: palette.danger,
      colorBgLayout: palette.bgPage,
      colorBgContainer: palette.bgPanelStrong,
      colorBgElevated: palette.bgPanel,
      colorFillAlter: palette.bgLinkActive,
      colorText: palette.textMain,
      colorTextSecondary: palette.textBody,
      colorTextTertiary: palette.textMuted,
      colorBorder: palette.border,
      colorBorderSecondary: palette.borderStrong,
      borderRadiusSM: readRadiusTokenValue(palette.radiusSm),
      borderRadius: readRadiusTokenValue(palette.radiusMd),
      borderRadiusLG: readRadiusTokenValue(palette.radiusLg),
      fontFamily: palette.fontUi,
      fontSize: 14,
      controlHeight: 36,
      boxShadow: palette.shadowCard,
      boxShadowSecondary: palette.shadowFloating
    }
  };
}
```

```css
/* src/client/styles/tailwind.css */
body {
  margin: 0;
  font-family: var(--editorial-font-ui);
  color: var(--editorial-text-main);
  background: var(--editorial-bg-page);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  overflow-x: hidden;
}

body::before,
body::after {
  content: none;
}

::selection {
  background: var(--editorial-bg-link-active);
  color: var(--editorial-text-main);
}
```

- [ ] **Step 5: 把当前失败的 profile / sources / view-rules 页面测试切到统一挂载 helper，消化基线噪音**

```ts
// tests/client/profilePage.test.ts
import { mountWithApp } from "./helpers/mountWithApp";

const wrapper = mountWithApp(ProfilePage, {
  global: {
    plugins: [router]
  }
});
```

- [ ] **Step 6: 回跑主题与客户端基础测试，确认新的 token 和挂载基座稳定**

Run: `npx vitest run tests/client/editorialTheme.test.ts tests/client/useTheme.test.ts tests/client/profilePage.test.ts tests/client/sourcesPage.test.ts tests/client/viewRulesPage.test.ts`

Expected: PASS

- [ ] **Step 7: 提交主题与挂载基座改动**

```bash
git add src/client/theme/editorialTokens.ts src/client/theme/editorialTheme.ts src/client/styles/tailwind.css tests/client/helpers/mountWithApp.ts tests/client/editorialTheme.test.ts tests/client/useTheme.test.ts tests/client/profilePage.test.ts tests/client/sourcesPage.test.ts tests/client/viewRulesPage.test.ts
git commit -m "feat: 收口 Notion 风格主题基座"
```

## Task 2: 重做 unified shell，切成 Notion workspace 侧栏与文档头区

**Files:**
- Modify: `src/client/App.vue`
- Modify: `src/client/router.ts`
- Modify: `src/client/layouts/UnifiedShellLayout.vue`
- Modify: `tests/client/appShell.test.ts`

- [ ] **Step 1: 先补壳层断言，锁定新侧栏和文档头区语义**

```ts
// tests/client/appShell.test.ts
it("renders the shell as a notion-like workspace sidebar and page header", async () => {
  const wrapper = mountWithApp(App, {
    global: {
      plugins: [router]
    }
  });

  await router.push("/ai-new");
  await flushPromises();

  expect(wrapper.get("[data-workspace-sidebar]").text()).toContain("HotNow");
  expect(wrapper.get("[data-workspace-sidebar]").text()).toContain("AI Workspace");
  expect(wrapper.get("[data-page-header-title]").text()).toBe("AI 新讯");
  expect(wrapper.get("[data-page-header-description]").text()).toContain("最近采集到的 AI 新消息");
  expect(wrapper.find("[data-shell-page-summary]").exists()).toBe(false);
});
```

- [ ] **Step 2: 跑壳层测试，确认当前仍然是旧的 Editorial Desk 结构**

Run: `npx vitest run tests/client/appShell.test.ts`

Expected: FAIL，提示缺少 `data-workspace-sidebar`、`data-page-header-title`，或者仍存在旧的 `data-shell-page-summary`

- [ ] **Step 3: 把路由元数据从“工作台”改成页面式标题和描述**

```ts
// src/client/router.ts
const aiNewPageMeta = {
  key: "ai-new",
  path: "/ai-new",
  section: "content",
  navLabel: "AI 新讯",
  title: "AI 新讯",
  description: "最近采集到的 AI 新消息、模型更新和产品动态。"
} as const satisfies ShellPageMeta;

const aiHotPageMeta = {
  key: "ai-hot",
  path: "/ai-hot",
  section: "content",
  navLabel: "AI 热点",
  title: "AI 热点",
  description: "已经形成热度、值得继续追踪的 AI 信号。"
} as const satisfies ShellPageMeta;
```

- [ ] **Step 4: 重写 unified shell 结构，去掉旧的品牌大卡和页面摘要卡**

```vue
<!-- src/client/layouts/UnifiedShellLayout.vue -->
<aside
  class="hidden h-[100dvh] w-[248px] flex-none border-r border-editorial-border bg-editorial-sidebar px-3 py-4 min-[901px]:flex"
  data-workspace-sidebar
>
  <div class="flex min-h-0 flex-1 flex-col gap-5">
    <section class="rounded-editorial-md px-3 py-2" data-workspace-brand>
      <p class="text-[11px] font-medium tracking-[0.08em] text-editorial-text-muted uppercase">HotNow</p>
      <h1 class="mt-1 text-[20px] font-semibold tracking-[-0.01em] text-editorial-text-main">AI Workspace</h1>
    </section>

    <nav class="flex flex-col gap-1" aria-label="内容菜单">
      <RouterLink
        v-for="page in contentNavPages"
        :key="page.path"
        :to="page.path"
        class="rounded-editorial-sm px-3 py-2 text-sm text-editorial-text-body transition hover:bg-editorial-link-active"
        :data-shell-nav-link="page.path"
      >
        {{ page.navLabel }}
      </RouterLink>
    </nav>
  </div>
</aside>

<header class="mx-auto flex w-full max-w-editorial-shell flex-col gap-2 px-6 pb-4 pt-8" data-page-header>
  <p class="text-xs font-medium uppercase tracking-[0.08em] text-editorial-text-muted">{{ route.meta.navLabel }}</p>
  <h2 class="text-[34px] font-semibold tracking-[-0.03em] text-editorial-text-main" data-page-header-title>
    {{ currentPageTitle }}
  </h2>
  <p class="max-w-3xl text-sm leading-6 text-editorial-text-body" data-page-header-description>
    {{ currentPageDescription }}
  </p>
</header>
```

- [ ] **Step 5: 收紧根节点和移动端导航，让移动端也服从同一 workspace 语言**

```vue
<!-- src/client/App.vue -->
<template>
  <ConfigProvider :theme="themeConfig">
    <div class="min-h-screen bg-editorial-page text-editorial-text-main" data-shell-root>
      <UnifiedShellLayout />
    </div>
  </ConfigProvider>
</template>
```

```ts
// src/client/layouts/UnifiedShellLayout.vue
function getMobileTabClasses(isActive: boolean): string[] {
  return [
    "flex shrink-0 items-center rounded-editorial-sm px-3 py-2 text-[13px] font-medium transition",
    isActive
      ? "bg-editorial-link-active text-editorial-text-main"
      : "text-editorial-text-body hover:bg-editorial-link-active hover:text-editorial-text-main"
  ];
}
```

- [ ] **Step 6: 回跑壳层测试，确认 unified shell 已经切到 Notion workspace**

Run: `npx vitest run tests/client/appShell.test.ts`

Expected: PASS

- [ ] **Step 7: 提交壳层改动**

```bash
git add src/client/App.vue src/client/router.ts src/client/layouts/UnifiedShellLayout.vue tests/client/appShell.test.ts
git commit -m "feat: 重做 Notion 风格统一壳层"
```

## Task 3: 把内容页改成 page preview + database row 列表

**Files:**
- Modify: `src/client/components/content/ContentHeroCard.vue`
- Modify: `src/client/components/content/ContentStandardCard.vue`
- Modify: `src/client/components/content/ContentActionBar.vue`
- Modify: `src/client/components/content/ContentFeedbackPanel.vue`
- Modify: `src/client/components/content/ContentSourceFilterBar.vue`
- Modify: `src/client/components/content/ContentSortControl.vue`
- Modify: `src/client/components/content/ContentEmptyState.vue`
- Modify: `src/client/components/content/contentCardShared.ts`
- Modify: `src/client/pages/content/AiNewPage.vue`
- Modify: `src/client/pages/content/AiHotPage.vue`
- Modify: `tests/client/contentHeroCard.test.ts`
- Modify: `tests/client/aiNewPage.test.ts`
- Modify: `tests/client/aiHotPage.test.ts`
- Modify: `tests/client/contentSourceFilterBar.test.ts`

- [ ] **Step 1: 先补内容页断言，锁定精选区是 page preview、标准内容是 page row**

```ts
// tests/client/contentHeroCard.test.ts
it("renders the featured story as a page preview instead of a marketing hero card", () => {
  const wrapper = mountWithApp(ContentHeroCard, {
    props: {
      item: buildContentItem()
    }
  });

  expect(wrapper.get("[data-content-hero]").classes()).toContain("border");
  expect(wrapper.get("[data-content-hero-title]").text()).toBe("AI agents ship faster");
  expect(wrapper.find("[data-content-hero-kicker]").exists()).toBe(false);
  expect(wrapper.get("[data-content-hero-summary]").text()).toContain("A compact summary");
});
```

```ts
// tests/client/aiHotPage.test.ts
it("renders hot items as database rows with a light toolbar", async () => {
  const wrapper = await renderAiHotPage();

  expect(wrapper.get("[data-content-toolbar]").exists()).toBe(true);
  expect(wrapper.get("[data-content-list]").attributes("data-list-style")).toBe("database");
  expect(wrapper.findAll("[data-content-row]").length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: 跑内容页测试，确认当前仍然是旧的 hero/card 语义**

Run: `npx vitest run tests/client/contentHeroCard.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts tests/client/contentSourceFilterBar.test.ts`

Expected: FAIL，提示缺少 `data-content-toolbar`、`data-content-row` 或旧 hero/card class 仍然存在

- [ ] **Step 3: 把精选区改成轻量 page preview，把标准内容改成 database row**

```vue
<!-- src/client/components/content/ContentHeroCard.vue -->
<article
  class="rounded-editorial-lg border border-editorial-border bg-editorial-panel px-6 py-6 shadow-editorial-card"
  data-content-hero
>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2 text-xs text-editorial-text-muted">
      <span>{{ item.sourceName }}</span>
      <span>{{ publishedAtLabel }}</span>
    </div>
    <h3 class="text-[28px] font-semibold tracking-[-0.03em] text-editorial-text-main" data-content-hero-title>
      {{ item.title }}
    </h3>
    <p class="max-w-3xl text-sm leading-7 text-editorial-text-body" data-content-hero-summary>
      {{ summaryText }}
    </p>
  </div>
  <ContentActionBar :item="item" class="mt-5" />
</article>
```

```vue
<!-- src/client/components/content/ContentStandardCard.vue -->
<article
  class="group rounded-editorial-md border border-transparent px-4 py-4 transition hover:border-editorial-border hover:bg-editorial-link-active"
  data-content-row
>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center gap-2 text-xs text-editorial-text-muted">
      <span>{{ item.sourceName }}</span>
      <span>{{ publishedAtLabel }}</span>
      <span v-if="item.scoreDisplay">{{ item.scoreDisplay }}</span>
    </div>
    <h3 class="text-[17px] font-medium leading-7 text-editorial-text-main">
      <a :href="item.canonicalUrl" target="_blank" rel="noreferrer" class="hover:underline">{{ item.title }}</a>
    </h3>
    <p class="text-sm leading-6 text-editorial-text-body">{{ summaryText }}</p>
  </div>
  <ContentActionBar :item="item" class="mt-3" />
</article>
```

- [ ] **Step 4: 把过滤条、排序控件和反馈面板统一收口成轻量 toolbar / toggle section**

```vue
<!-- src/client/components/content/ContentSourceFilterBar.vue -->
<section class="flex flex-wrap items-center gap-2" data-content-toolbar>
  <button
    type="button"
    class="rounded-editorial-sm border border-editorial-border bg-editorial-panel px-3 py-1.5 text-xs text-editorial-text-body transition hover:bg-editorial-link-active"
  >
    全选
  </button>
  <label
    v-for="option in sourceOptions"
    :key="option.kind"
    class="inline-flex items-center gap-2 rounded-editorial-sm border border-transparent px-3 py-1.5 text-xs text-editorial-text-body transition hover:bg-editorial-link-active"
  >
    <input type="checkbox" :checked="selectedKinds.includes(option.kind)" />
    <span>{{ option.label }}</span>
  </label>
</section>
```

```vue
<!-- src/client/components/content/ContentFeedbackPanel.vue -->
<section
  v-if="expanded"
  class="mt-3 rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4"
  data-feedback-panel
>
  <p class="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-editorial-text-muted">补充反馈</p>
  <slot />
</section>
```

- [ ] **Step 5: 在页面层收口 AI 新讯与 AI 热点的头区和列表容器**

```vue
<!-- src/client/pages/content/AiNewPage.vue -->
<template>
  <section class="mx-auto flex w-full max-w-editorial-shell flex-col gap-6 px-6 pb-10">
    <ContentSourceFilterBar ... />
    <ContentSortControl ... />
    <ContentHeroCard v-if="heroItem" :item="heroItem" />
    <section class="flex flex-col gap-1" data-content-list data-list-style="database">
      <ContentStandardCard v-for="item in standardItems" :key="item.id" :item="item" />
    </section>
  </section>
</template>
```

- [ ] **Step 6: 回跑内容页测试，确认卡片体系已经切成 page preview + database row**

Run: `npx vitest run tests/client/contentHeroCard.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts tests/client/contentSourceFilterBar.test.ts`

Expected: PASS

- [ ] **Step 7: 提交内容页改动**

```bash
git add src/client/components/content/ContentHeroCard.vue src/client/components/content/ContentStandardCard.vue src/client/components/content/ContentActionBar.vue src/client/components/content/ContentFeedbackPanel.vue src/client/components/content/ContentSourceFilterBar.vue src/client/components/content/ContentSortControl.vue src/client/components/content/ContentEmptyState.vue src/client/components/content/contentCardShared.ts src/client/pages/content/AiNewPage.vue src/client/pages/content/AiHotPage.vue tests/client/contentHeroCard.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts tests/client/contentSourceFilterBar.test.ts
git commit -m "feat: 调整 Notion 风格内容页列表"
```

## Task 4: 把系统页改成 settings page + inline database

**Files:**
- Modify: `src/client/components/content/EditorialEmptyState.vue`
- Modify: `src/client/pages/settings/ViewRulesPage.vue`
- Modify: `src/client/pages/settings/SourcesPage.vue`
- Modify: `src/client/pages/settings/ProfilePage.vue`
- Modify: `tests/client/viewRulesPage.test.ts`
- Modify: `tests/client/sourcesPage.test.ts`
- Modify: `tests/client/profilePage.test.ts`

- [ ] **Step 1: 先补系统页断言，锁定 section 化 settings 布局和 inline database 结构**

```ts
// tests/client/viewRulesPage.test.ts
it("renders view rules as settings sections and inline database rows", async () => {
  const wrapper = await renderViewRulesPage();

  expect(wrapper.get("[data-settings-section='overview']").exists()).toBe(true);
  expect(wrapper.get("[data-settings-section='nl-rules']").exists()).toBe(true);
  expect(wrapper.findAll("[data-feedback-row]").length).toBeGreaterThan(0);
  expect(wrapper.findAll("[data-draft-row]").length).toBeGreaterThan(0);
});
```

```ts
// tests/client/profilePage.test.ts
it("renders the current user summary as account settings blocks", async () => {
  const wrapper = await renderProfilePage();

  expect(wrapper.get("[data-profile-section='summary']").exists()).toBe(true);
  expect(wrapper.get("[data-profile-field='display-name']").text()).toContain("管理员");
});
```

- [ ] **Step 2: 跑系统页测试，确认当前仍然是 workbench 卡片语义**

Run: `npx vitest run tests/client/viewRulesPage.test.ts tests/client/sourcesPage.test.ts tests/client/profilePage.test.ts`

Expected: FAIL，提示缺少新的 section/data-row 标记，或者仍然命中旧的 panel/workbench 结构

- [ ] **Step 3: 把筛选策略页改成文档 section + 内嵌列表**

```vue
<!-- src/client/pages/settings/ViewRulesPage.vue -->
<template>
  <section class="mx-auto flex w-full max-w-editorial-shell flex-col gap-10 px-6 pb-12">
    <section class="flex flex-col gap-4" data-settings-section="overview">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.08em] text-editorial-text-muted">策略概览</p>
        <h3 class="mt-1 text-2xl font-semibold tracking-[-0.02em] text-editorial-text-main">自然语言策略与反馈池</h3>
      </div>
      <p class="max-w-3xl text-sm leading-6 text-editorial-text-body">这里统一维护厂商设置、正式规则、反馈池与草稿池。</p>
    </section>

    <section class="flex flex-col gap-4" data-settings-section="nl-rules">
      <header class="flex items-center justify-between gap-4">
        <div>
          <h4 class="text-lg font-medium text-editorial-text-main">正式自然语言策略</h4>
          <p class="text-sm text-editorial-text-body">四道门各自维护启用状态与自然语言规则。</p>
        </div>
      </header>
      <div class="flex flex-col gap-3">
        <article
          v-for="gate in gates"
          :key="gate.scope"
          class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4"
        >
          ...
        </article>
      </div>
    </section>

    <section class="flex flex-col gap-3" data-settings-section="feedback-pool">
      <article
        v-for="item in feedbackPool"
        :key="item.id"
        class="rounded-editorial-md border border-editorial-border px-4 py-4"
        data-feedback-row
      >
        ...
      </article>
    </section>
  </section>
</template>
```

- [ ] **Step 4: 把 source 页和 profile 页改成 inventory / account settings 风格**

```vue
<!-- src/client/pages/settings/SourcesPage.vue -->
<section class="mx-auto flex w-full max-w-editorial-shell flex-col gap-8 px-6 pb-12">
  <section class="flex flex-col gap-4" data-sources-section="overview">
    <h3 class="text-2xl font-semibold tracking-[-0.02em] text-editorial-text-main">数据收集</h3>
    <p class="text-sm text-editorial-text-body">查看 source 状态、执行采集和发送最新报告。</p>
  </section>
  <section class="flex flex-col gap-2" data-sources-inventory>
    <article
      v-for="source in sources"
      :key="source.kind"
      class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4"
      data-source-row
    >
      ...
    </article>
  </section>
</section>
```

```vue
<!-- src/client/pages/settings/ProfilePage.vue -->
<section class="mx-auto flex w-full max-w-editorial-shell flex-col gap-8 px-6 pb-12">
  <section class="flex flex-col gap-3" data-profile-section="summary">
    <h3 class="text-2xl font-semibold tracking-[-0.02em] text-editorial-text-main">当前用户</h3>
    <p class="text-sm text-editorial-text-body">本地单用户模式下的登录摘要与账号信息。</p>
  </section>
  <section class="grid gap-3">
    <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
      <p class="text-xs uppercase tracking-[0.08em] text-editorial-text-muted">显示名称</p>
      <p class="mt-2 text-base text-editorial-text-main" data-profile-field="display-name">{{ profile.displayName }}</p>
    </article>
  </section>
</section>
```

- [ ] **Step 5: 把共享空态改成更安静的文档式空态**

```vue
<!-- src/client/components/content/EditorialEmptyState.vue -->
<template>
  <section class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-5 py-5" data-editorial-empty-state>
    <h3 class="text-base font-medium text-editorial-text-main">{{ title }}</h3>
    <p class="mt-2 text-sm leading-6 text-editorial-text-body">{{ description }}</p>
    <slot />
  </section>
</template>
```

- [ ] **Step 6: 回跑系统页测试，确认 settings 页面已经切到新语义**

Run: `npx vitest run tests/client/viewRulesPage.test.ts tests/client/sourcesPage.test.ts tests/client/profilePage.test.ts`

Expected: PASS

- [ ] **Step 7: 提交系统页改动**

```bash
git add src/client/components/content/EditorialEmptyState.vue src/client/pages/settings/ViewRulesPage.vue src/client/pages/settings/SourcesPage.vue src/client/pages/settings/ProfilePage.vue tests/client/viewRulesPage.test.ts tests/client/sourcesPage.test.ts tests/client/profilePage.test.ts
git commit -m "feat: 收口 Notion 风格系统页布局"
```

## Task 5: 让 legacy 页面和登录页回到同一套 Notion 风格

**Files:**
- Modify: `src/server/public/site.css`
- Modify: `src/server/renderPages.ts`
- Modify: `src/server/createServer.ts`
- Modify: `tests/server/reportPages.test.ts`
- Modify: `tests/server/createServer.test.ts`
- Modify: `tests/server/siteThemeClient.test.ts`

- [ ] **Step 1: 先补 legacy 页断言，锁定登录页和历史页的新 wrapper 语义**

```ts
// tests/server/createServer.test.ts
it("renders the login page as a minimal workspace login shell", async () => {
  const app = createServer({} as never);
  const response = await app.inject({ method: "GET", url: "/login" });

  expect(response.statusCode).toBe(200);
  expect(response.body).toContain('class="login-page"');
  expect(response.body).toContain('data-login-card');
  expect(response.body).toContain("HotNow");
  expect(response.body).not.toContain("统一站点已启用账号校验，请使用管理员账号继续。");
});
```

```ts
// tests/server/reportPages.test.ts
it("renders legacy pages with notion-like shell classes", () => {
  const html = renderHistoryPage([]);

  expect(html).toContain('class="legacy-page legacy-page--history"');
  expect(html).toContain('class="legacy-shell legacy-shell--history"');
  expect(html).toContain('class="legacy-card legacy-card--history legacy-card--notion"');
});
```

- [ ] **Step 2: 跑 legacy 测试，确认当前 CSS 与模板仍然是旧的 editorial 风格**

Run: `npx vitest run tests/server/reportPages.test.ts tests/server/createServer.test.ts tests/server/siteThemeClient.test.ts`

Expected: FAIL，提示缺少 `legacy-card--notion`、`data-login-card`，或者仍存在旧登录文案

- [ ] **Step 3: 重写 `site.css` 的 legacy token 和 wrapper，让它和客户端主题保持同一语言**

```css
/* src/server/public/site.css */
:root {
  --paper-base: #fbfbfa;
  --paper-elevated: #ffffff;
  --paper-muted: #f7f7f5;
  --ink-strong: #37352f;
  --ink-body: #5f5e58;
  --ink-soft: #8f8e88;
  --line-soft: rgba(55, 53, 47, 0.08);
  --line-strong: rgba(55, 53, 47, 0.14);
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --shadow-card: 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-page: 0 0 0 rgba(0, 0, 0, 0);
}

body {
  background: var(--paper-base);
  color: var(--ink-strong);
}

body::before,
body::after {
  content: none;
}

.legacy-shell {
  width: min(100%, 840px);
  margin: 0 auto;
  padding: 64px 24px 80px;
}

.legacy-card--notion {
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-lg);
  background: var(--paper-elevated);
  box-shadow: var(--shadow-card);
}
```

- [ ] **Step 4: 调整 legacy 模板和登录页输出，使其改成极简文档页**

```ts
// src/server/renderPages.ts
function renderLegacyDocument(config: LegacyDocumentConfig) {
  return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
  <head>...</head>
  <body class="legacy-page legacy-page--${config.pageKind}">
    <main class="legacy-shell legacy-shell--${config.pageKind}">
      <section class="legacy-card legacy-card--${config.pageKind} legacy-card--notion">
        ${config.bodyHtml}
      </section>
    </main>
  </body>
</html>`;
}
```

```ts
// src/server/createServer.ts
function renderLoginPage() {
  return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
  <head>...</head>
  <body class="login-page">
    <main class="login-shell">
      <section class="login-card" data-login-card>
        <p class="login-brand">HotNow</p>
        <h1>登录</h1>
        <p class="login-subtitle">使用管理员账号进入系统菜单与工作台。</p>
        <form id="login-form">...</form>
      </section>
    </main>
  </body>
</html>`;
}
```

- [ ] **Step 5: 回跑 legacy 测试，确认旧页面不再是视觉孤岛**

Run: `npx vitest run tests/server/reportPages.test.ts tests/server/createServer.test.ts tests/server/siteThemeClient.test.ts`

Expected: PASS

- [ ] **Step 6: 提交 legacy 主题改动**

```bash
git add src/server/public/site.css src/server/renderPages.ts src/server/createServer.ts tests/server/reportPages.test.ts tests/server/createServer.test.ts tests/server/siteThemeClient.test.ts
git commit -m "feat: 统一 legacy 页面到 Notion 风格"
```

## Task 6: 更新协作文档并完成验证

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: 更新 README 和 AGENTS，把旧的 Editorial 描述改成 Notion Workspace**

```md
<!-- README.md / AGENTS.md -->
- unified shell 已从 `Editorial Signal Desk` 切换为 `Notion Workspace` 黑白灰双主题
- 内容页现在采用 `page preview + database row` 的呈现方式
- `/settings/*` 采用 `settings page + inline database` 语义
- legacy `/login`、`/history`、`/reports/:date`、`/control` 也已纳入统一主题
```

- [ ] **Step 2: 跑客户端相关测试，确认 shell、内容页和系统页都通过**

Run: `npx vitest run tests/client/editorialTheme.test.ts tests/client/useTheme.test.ts tests/client/appShell.test.ts tests/client/contentHeroCard.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts tests/client/contentSourceFilterBar.test.ts tests/client/viewRulesPage.test.ts tests/client/sourcesPage.test.ts tests/client/profilePage.test.ts`

Expected: PASS

- [ ] **Step 3: 跑 legacy/服务端相关测试，确认共享主题资源与登录页不回归**

Run: `npx vitest run tests/server/reportPages.test.ts tests/server/createServer.test.ts tests/server/siteThemeClient.test.ts`

Expected: PASS

- [ ] **Step 4: 构建客户端，确认 Tailwind / Vite / AntD 主题整合没有破**

Run: `npm run build:client`

Expected: PASS，生成最新 client bundle

- [ ] **Step 5: 跑全量类型构建，确认 unified shell 与 legacy 页面一起通过**

Run: `npm run build`

Expected: PASS

- [ ] **Step 6: 做一轮最小手动 smoke，确认全站页面都落在新母版上**

Run:

```bash
npm run dev:local
```

Expected:

- `/login` 是极简黑白灰登录页
- `/`、`/ai-new`、`/ai-hot` 是 page preview + database row
- `/settings/view-rules`、`/settings/sources`、`/settings/profile` 是 settings + inline database
- `/history`、`/reports/:date`、`/control` 不再保留旧的 Editorial Desk 视觉残留

- [ ] **Step 7: 提交文档和最终验证结果**

```bash
git add README.md AGENTS.md
git commit -m "docs: 同步 Notion 风格站点说明"
```

## 自检

- Spec coverage: 已覆盖视觉语言、双主题 token、整体壳层、内容页、系统页、legacy 页、文档更新和验证路径。
- Placeholder scan: 计划内没有 `TBD` / `TODO` / “后续补” 之类占位语句；每个 task 都包含明确文件、命令和关键代码片段。
- Type consistency: 统一沿用现有 `editorial*` 文件名与导出名，避免计划阶段就引入大规模重命名；新的测试 helper 固定为 `mountWithApp`，后续页面测试统一复用。

## 备注

- 当前 worktree 在进入本计划前，`npm run test` 就存在基线失败，集中在 `tests/client/sourcesPage.test.ts`、`tests/client/profilePage.test.ts` 和 Ant Design Vue `prefixCls` 相关异常。Task 1 已把这部分纳入执行范围，后续实现时不要把它误判成新回归。
