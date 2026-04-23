# HotNow Vue Tailwind Theme Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前 `src/client/` 下的 Vue 客户端完整迁移到 `Tailwind CSS` 样式体系，并让 `Tailwind` 与 `Ant Design Vue` 共享同一份 `Editorial Desk` 主题 token。

**Architecture:** 新增 `editorialTokens.ts` 作为唯一主题源，`tailwind.config.ts` 与 `editorialTheme.ts` 同时消费这份 token。Vue 模板层把现有 `scoped CSS` 和全局 `editorialShell.css` 迁成 Tailwind utilities，仅在 `tailwind.css` 中保留主题变量、基础页面肌理和少量 AntD 深层覆写。

**Tech Stack:** Node.js, TypeScript, Vue 3, Vite, Tailwind CSS v3, PostCSS, Ant Design Vue, Vitest, @vue/test-utils

---

## File Map

### New Files

- `tailwind.config.ts`
  - Vue 客户端 Tailwind 主题扩展与扫描范围配置
- `postcss.config.js`
  - Tailwind/PostCSS 插件入口
- `src/client/theme/editorialTokens.ts`
  - `light / dark` 单一主题源、CSS 变量和 Tailwind 主题映射
- `src/client/styles/tailwind.css`
  - Tailwind 入口与少量基础样式层
- `tests/client/editorialTheme.test.ts`
  - 共享 token、CSS 变量和 AntD 主题桥接测试

### Modified Files

- `package.json`
  - 新增 `tailwindcss`、`postcss`、`autoprefixer`
- `src/client/main.ts`
  - 切换为引入 `tailwind.css`
- `src/client/theme/editorialTheme.ts`
  - 改为消费 `editorialTokens.ts`
- `src/client/composables/useTheme.ts`
  - 改为调用新的 token/CSS 变量桥接函数
- `src/client/App.vue`
  - 根层改为吃 Tailwind 背景与排版基线
- `src/client/layouts/UnifiedShellLayout.vue`
  - 统一壳层、移动端顶栏、桌面侧栏、抽屉与账号区迁到 Tailwind
- `src/client/components/content/contentCardShared.ts`
  - 抽出内容卡片共享 Tailwind class 常量
- `src/client/components/content/ContentHeroCard.vue`
  - Hero 卡片 Tailwind 化
- `src/client/components/content/ContentStandardCard.vue`
  - 标准卡 Tailwind 化
- `src/client/components/content/ContentActionBar.vue`
  - 操作条 Tailwind 化
- `src/client/components/content/ContentFeedbackPanel.vue`
  - 反馈面板 Tailwind 化
- `src/client/components/content/ContentEmptyState.vue`
  - 空态 Tailwind 化
- `src/client/components/content/ContentSourceFilterBar.vue`
  - 来源筛选条 Tailwind 化
- `src/client/pages/content/AiNewPage.vue`
  - `AI 新讯` 页 Tailwind 化
- `src/client/pages/content/AiHotPage.vue`
  - `AI 热点` 页 Tailwind 化
- `src/client/pages/settings/ViewRulesPage.vue`
  - 筛选策略页 Tailwind 化
- `src/client/pages/settings/SourcesPage.vue`
  - 数据收集页 Tailwind 化
- `src/client/pages/settings/ProfilePage.vue`
  - 当前用户页 Tailwind 化
- `tests/client/useTheme.test.ts`
  - 校验新 token 和 CSS 变量桥接
- `tests/client/appShell.test.ts`
  - 校验壳层结构与 Tailwind 关键类
- `tests/client/contentHeroCard.test.ts`
  - 校验内容卡片结构与交互未回归
- `tests/client/contentSourceFilterBar.test.ts`
  - 校验筛选条结构与交互未回归
- `tests/client/aiNewPage.test.ts`
  - 校验 `AI 新讯` 页面结构与过滤逻辑未回归
- `tests/client/aiHotPage.test.ts`
  - 校验 `AI 热点` 页面结构与过滤逻辑未回归
- `tests/client/viewRulesPage.test.ts`
  - 校验策略页结构与交互未回归
- `tests/client/sourcesPage.test.ts`
  - 校验数据收集页结构与交互未回归
- `tests/client/profilePage.test.ts`
  - 校验当前用户页结构未回归
- `README.md`
  - 更新 Vue 客户端样式栈说明
- `AGENTS.md`
  - 更新当前前端技术栈与样式治理约束

### Removed Files

- `src/client/styles/editorialShell.css`
  - 删除旧的 Vue 客户端大块全局样式文件

## Task 1: 接入 Tailwind 工具链并建立单一主题源

**Files:**
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `src/client/theme/editorialTokens.ts`
- Create: `src/client/styles/tailwind.css`
- Create: `tests/client/editorialTheme.test.ts`
- Modify: `package.json`
- Modify: `src/client/main.ts`
- Modify: `src/client/theme/editorialTheme.ts`
- Modify: `src/client/composables/useTheme.ts`
- Modify: `tests/client/useTheme.test.ts`

- [ ] **Step 1: 先写共享 token 与主题桥接失败测试**

```ts
import { describe, expect, it } from "vitest";

import {
  createEditorialCssVariables,
  createEditorialTailwindTheme,
  readEditorialTokens
} from "../../src/client/theme/editorialTokens";
import { createEditorialProviderTheme } from "../../src/client/theme/editorialTheme";

describe("editorial theme bridge", () => {
  it("shares one token source across css variables, tailwind and Ant Design Vue", () => {
    const lightTokens = readEditorialTokens("light");
    const darkTokens = readEditorialTokens("dark");
    const lightVars = createEditorialCssVariables("light");
    const darkVars = createEditorialCssVariables("dark");
    const providerTheme = createEditorialProviderTheme("dark");
    const tailwindTheme = createEditorialTailwindTheme();

    expect(lightTokens.colors.base.page).toBe("#f4ede3");
    expect(darkTokens.colors.base.page).toBe("#111722");
    expect(lightVars["--editorial-bg-page"]).toBe(lightTokens.colors.base.page);
    expect(darkVars["--editorial-accent"]).toBe(darkTokens.colors.semantic.accent);
    expect(providerTheme.token?.colorPrimary).toBe(darkTokens.colors.semantic.accent);
    expect(providerTheme.token?.fontFamily).toBe(darkTokens.fonts.ui);
    expect(tailwindTheme.colors["editorial-page"]).toBe("var(--editorial-bg-page)");
    expect(tailwindTheme.boxShadow["editorial-card"]).toBe("var(--editorial-shadow-card)");
  });
});
```

- [ ] **Step 2: 跑测试，确认当前仓库还没有新的 token 源和 Tailwind 主题桥接**

Run: `npx vitest run tests/client/editorialTheme.test.ts tests/client/useTheme.test.ts`

Expected: FAIL，并出现 `Cannot find module '../../src/client/theme/editorialTokens'` 或导出不存在的报错

- [ ] **Step 3: 安装 Tailwind，并把主题统一迁到 `editorialTokens.ts`**

```json
{
  "devDependencies": {
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17"
  }
}
```

```ts
// src/client/theme/editorialTokens.ts
export type EditorialThemeMode = "dark" | "light";

export type EditorialTokens = {
  fonts: {
    ui: string;
    mono: string;
  };
  radii: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
    pill: string;
  };
  shadows: {
    card: string;
    page: string;
    floating: string;
    accent: string;
  };
  layout: {
    shellContentWidth: string;
  };
  colors: {
    base: {
      page: string;
      pageGlowA: string;
      pageGlowB: string;
      pageGlowC: string;
      gridLine: string;
      scanline: string;
      sidebarPanel: string;
      panel: string;
      panelStrong: string;
      control: string;
      controlHover: string;
      link: string;
      linkActiveStrong: string;
    };
    text: {
      main: string;
      body: string;
      muted: string;
      sidebar: string;
      sidebarMuted: string;
      onAccent: string;
    };
    semantic: {
      accent: string;
      accentOrange: string;
      accentSoft: string;
      border: string;
      borderStrong: string;
      ring: string;
      success: string;
      warning: string;
      danger: string;
    };
    backgrounds: {
      sidebar: string;
      linkActive: string;
    };
  };
};

const tokensByMode = {
  light: {
    fonts: {
      ui: "\"Avenir Next\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif",
      mono: "\"SFMono-Regular\", Menlo, Monaco, Consolas, \"Liberation Mono\", monospace"
    },
    radii: {
      sm: "10px",
      md: "14px",
      lg: "18px",
      xl: "24px",
      pill: "999px"
    },
    shadows: {
      card: "0 18px 34px rgba(26, 42, 70, 0.08)",
      page: "0 24px 48px rgba(43, 59, 86, 0.14)",
      floating: "0 16px 30px rgba(43, 59, 86, 0.12)",
      accent: "0 0 0 1px rgba(35, 82, 255, 0.12), 0 14px 28px rgba(35, 82, 255, 0.16)"
    },
    layout: {
      shellContentWidth: "1520px"
    },
    colors: {
      base: {
        page: "#f4ede3",
        pageGlowA: "rgba(35, 82, 255, 0.08)",
        pageGlowB: "rgba(255, 106, 42, 0.07)",
        pageGlowC: "rgba(19, 35, 60, 0.05)",
        gridLine: "rgba(19, 35, 60, 0.03)",
        scanline: "rgba(255, 255, 255, 0.44)",
        sidebarPanel: "rgba(251, 247, 241, 0.94)",
        panel: "rgba(251, 247, 241, 0.9)",
        panelStrong: "rgba(255, 252, 247, 0.98)",
        control: "rgba(244, 237, 227, 0.88)",
        controlHover: "rgba(236, 228, 218, 1)",
        link: "rgba(35, 82, 255, 0.06)",
        linkActiveStrong: "rgba(255, 255, 255, 0.28)"
      },
      text: {
        main: "#13233c",
        body: "#43546e",
        muted: "#6a7890",
        sidebar: "#13233c",
        sidebarMuted: "#6f7d92",
        onAccent: "#fdfaf5"
      },
      semantic: {
        accent: "#2352ff",
        accentOrange: "#ff6a2a",
        accentSoft: "rgba(35, 82, 255, 0.18)",
        border: "rgba(19, 35, 60, 0.12)",
        borderStrong: "rgba(35, 82, 255, 0.22)",
        ring: "rgba(35, 82, 255, 0.18)",
        success: "#22624f",
        warning: "#ff6a2a",
        danger: "#b33a2c"
      },
      backgrounds: {
        sidebar: "linear-gradient(180deg, rgba(251, 247, 241, 0.98) 0%, rgba(244, 237, 227, 0.96) 100%)",
        linkActive: "linear-gradient(135deg, #2352ff, #4d7aff)"
      }
    }
  },
  dark: {
    fonts: {
      ui: "\"Avenir Next\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif",
      mono: "\"SFMono-Regular\", Menlo, Monaco, Consolas, \"Liberation Mono\", monospace"
    },
    radii: {
      sm: "10px",
      md: "14px",
      lg: "18px",
      xl: "24px",
      pill: "999px"
    },
    shadows: {
      card: "0 18px 34px rgba(3, 8, 18, 0.34)",
      page: "0 24px 48px rgba(3, 8, 18, 0.48)",
      floating: "0 16px 30px rgba(3, 8, 18, 0.34)",
      accent: "0 0 0 1px rgba(126, 162, 255, 0.14), 0 14px 28px rgba(59, 92, 170, 0.28)"
    },
    layout: {
      shellContentWidth: "1520px"
    },
    colors: {
      base: {
        page: "#111722",
        pageGlowA: "rgba(126, 162, 255, 0.16)",
        pageGlowB: "rgba(255, 155, 109, 0.12)",
        pageGlowC: "rgba(238, 243, 255, 0.06)",
        gridLine: "rgba(255, 255, 255, 0.04)",
        scanline: "rgba(255, 255, 255, 0.03)",
        sidebarPanel: "rgba(23, 31, 44, 0.92)",
        panel: "rgba(23, 31, 44, 0.9)",
        panelStrong: "rgba(29, 38, 53, 0.98)",
        control: "rgba(29, 38, 53, 0.88)",
        controlHover: "rgba(38, 49, 68, 0.98)",
        link: "rgba(126, 162, 255, 0.09)",
        linkActiveStrong: "rgba(17, 23, 34, 0.28)"
      },
      text: {
        main: "#eef3ff",
        body: "#c4cedf",
        muted: "#8f9bb2",
        sidebar: "#eef3ff",
        sidebarMuted: "#9ba8be",
        onAccent: "#0d1420"
      },
      semantic: {
        accent: "#7ea2ff",
        accentOrange: "#ff9b6d",
        accentSoft: "rgba(126, 162, 255, 0.22)",
        border: "rgba(255, 255, 255, 0.1)",
        borderStrong: "rgba(126, 162, 255, 0.28)",
        ring: "rgba(126, 162, 255, 0.24)",
        success: "#58c8a1",
        warning: "#ff9b6d",
        danger: "#ff8f80"
      },
      backgrounds: {
        sidebar: "linear-gradient(180deg, rgba(17, 23, 34, 0.98) 0%, rgba(23, 31, 44, 0.96) 100%)",
        linkActive: "linear-gradient(135deg, #7ea2ff, #557aff)"
      }
    }
  }
} as const satisfies Record<EditorialThemeMode, EditorialTokens>;

export function readEditorialTokens(mode: EditorialThemeMode): EditorialTokens {
  return tokensByMode[mode];
}

export function createEditorialCssVariables(mode: EditorialThemeMode): Record<string, string> {
  const tokens = readEditorialTokens(mode);

  return {
    "--editorial-font-ui": tokens.fonts.ui,
    "--editorial-font-mono": tokens.fonts.mono,
    "--editorial-shell-content-width": tokens.layout.shellContentWidth,
    "--editorial-radius-sm": tokens.radii.sm,
    "--editorial-radius-md": tokens.radii.md,
    "--editorial-radius-lg": tokens.radii.lg,
    "--editorial-radius-xl": tokens.radii.xl,
    "--editorial-radius-pill": tokens.radii.pill,
    "--editorial-bg-page": tokens.colors.base.page,
    "--editorial-bg-page-glow-a": tokens.colors.base.pageGlowA,
    "--editorial-bg-page-glow-b": tokens.colors.base.pageGlowB,
    "--editorial-bg-page-glow-c": tokens.colors.base.pageGlowC,
    "--editorial-bg-sidebar-panel": tokens.colors.base.sidebarPanel,
    "--editorial-bg-panel": tokens.colors.base.panel,
    "--editorial-bg-panel-strong": tokens.colors.base.panelStrong,
    "--editorial-bg-control": tokens.colors.base.control,
    "--editorial-bg-control-hover": tokens.colors.base.controlHover,
    "--editorial-bg-link": tokens.colors.base.link,
    "--editorial-bg-link-active-strong": tokens.colors.base.linkActiveStrong,
    "--editorial-bg-sidebar": tokens.colors.backgrounds.sidebar,
    "--editorial-bg-link-active": tokens.colors.backgrounds.linkActive,
    "--editorial-text-main": tokens.colors.text.main,
    "--editorial-text-body": tokens.colors.text.body,
    "--editorial-text-muted": tokens.colors.text.muted,
    "--editorial-text-sidebar": tokens.colors.text.sidebar,
    "--editorial-text-sidebar-muted": tokens.colors.text.sidebarMuted,
    "--editorial-text-on-accent": tokens.colors.text.onAccent,
    "--editorial-accent": tokens.colors.semantic.accent,
    "--editorial-accent-orange": tokens.colors.semantic.accentOrange,
    "--editorial-accent-soft": tokens.colors.semantic.accentSoft,
    "--editorial-border": tokens.colors.semantic.border,
    "--editorial-border-strong": tokens.colors.semantic.borderStrong,
    "--editorial-ring": tokens.colors.semantic.ring,
    "--editorial-success": tokens.colors.semantic.success,
    "--editorial-warning": tokens.colors.semantic.warning,
    "--editorial-danger": tokens.colors.semantic.danger,
    "--editorial-shadow-card": tokens.shadows.card,
    "--editorial-shadow-page": tokens.shadows.page,
    "--editorial-shadow-floating": tokens.shadows.floating,
    "--editorial-shadow-accent": tokens.shadows.accent
  };
}

export function createEditorialTailwindTheme() {
  return {
    colors: {
      "editorial-page": "var(--editorial-bg-page)",
      "editorial-panel": "var(--editorial-bg-panel)",
      "editorial-panel-strong": "var(--editorial-bg-panel-strong)",
      "editorial-control": "var(--editorial-bg-control)",
      "editorial-control-hover": "var(--editorial-bg-control-hover)",
      "editorial-link": "var(--editorial-bg-link)",
      "editorial-main": "var(--editorial-text-main)",
      "editorial-body": "var(--editorial-text-body)",
      "editorial-muted": "var(--editorial-text-muted)",
      "editorial-sidebar": "var(--editorial-text-sidebar)",
      "editorial-sidebar-muted": "var(--editorial-text-sidebar-muted)",
      "editorial-on-accent": "var(--editorial-text-on-accent)",
      "editorial-accent": "var(--editorial-accent)",
      "editorial-accent-orange": "var(--editorial-accent-orange)",
      "editorial-border": "var(--editorial-border)",
      "editorial-strong": "var(--editorial-border-strong)",
      "editorial-ring": "var(--editorial-ring)",
      "editorial-success": "var(--editorial-success)",
      "editorial-warning": "var(--editorial-warning)",
      "editorial-danger": "var(--editorial-danger)"
    },
    fontFamily: {
      editorial: ["var(--editorial-font-ui)"],
      "editorial-mono": ["var(--editorial-font-mono)"]
    },
    borderRadius: {
      "editorial-sm": "var(--editorial-radius-sm)",
      "editorial-md": "var(--editorial-radius-md)",
      "editorial-lg": "var(--editorial-radius-lg)",
      "editorial-xl": "var(--editorial-radius-xl)",
      "editorial-pill": "var(--editorial-radius-pill)"
    },
    boxShadow: {
      "editorial-card": "var(--editorial-shadow-card)",
      "editorial-page": "var(--editorial-shadow-page)",
      "editorial-floating": "var(--editorial-shadow-floating)",
      "editorial-accent": "var(--editorial-shadow-accent)"
    },
    maxWidth: {
      "editorial-shell": "var(--editorial-shell-content-width)"
    },
    backgroundImage: {
      "editorial-sidebar": "var(--editorial-bg-sidebar)",
      "editorial-link-active": "var(--editorial-bg-link-active)"
    }
  } as const;
}
```

```ts
// tailwind.config.ts
import type { Config } from "tailwindcss";
import { createEditorialTailwindTheme } from "./src/client/theme/editorialTokens";

export default {
  content: ["./src/client/index.html", "./src/client/**/*.{vue,ts}"],
  theme: {
    extend: createEditorialTailwindTheme()
  }
} satisfies Config;
```

```js
// postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
```

```css
/* src/client/styles/tailwind.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    color-scheme: dark;
  }

  html[data-theme="light"] {
    color-scheme: light;
  }

  html,
  body,
  #app {
    min-height: 100%;
  }

  body {
    @apply bg-editorial-page font-editorial text-editorial-body antialiased;
    background-image:
      radial-gradient(circle at top left, var(--editorial-bg-page-glow-a), transparent 35%),
      radial-gradient(circle at 80% 0%, var(--editorial-bg-page-glow-b), transparent 32%),
      radial-gradient(circle at center, var(--editorial-bg-page-glow-c), transparent 48%);
  }

  ::selection {
    background: var(--editorial-accent-soft);
  }
}

@layer components {
  .unified-shell-mobile-open {
    overflow: hidden;
  }

  .ant-btn:focus-visible,
  .ant-input:focus-visible,
  .ant-input-affix-wrapper:focus-visible,
  .ant-segmented:focus-visible {
    @apply outline-none ring-2 ring-editorial-ring ring-offset-2 ring-offset-editorial-page;
  }
}
```

```ts
// src/client/theme/editorialTheme.ts
import { theme as antTheme, type ConfigProviderProps } from "ant-design-vue";

import {
  createEditorialCssVariables,
  readEditorialTokens,
  type EditorialThemeMode
} from "./editorialTokens";

type ProviderThemeConfig = NonNullable<ConfigProviderProps["theme"]>;

export type { EditorialThemeMode };

export function applyEditorialThemeCssVariables(
  mode: EditorialThemeMode,
  target: HTMLElement = document.documentElement
): void {
  for (const [name, value] of Object.entries(createEditorialCssVariables(mode))) {
    target.style.setProperty(name, value);
  }
}

export function createEditorialProviderTheme(mode: EditorialThemeMode): ProviderThemeConfig {
  const tokens = readEditorialTokens(mode);

  return {
    algorithm: mode === "dark" ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      colorPrimary: tokens.colors.semantic.accent,
      colorInfo: tokens.colors.semantic.accent,
      colorSuccess: tokens.colors.semantic.success,
      colorWarning: tokens.colors.semantic.warning,
      colorError: tokens.colors.semantic.danger,
      colorBgLayout: tokens.colors.base.page,
      colorBgContainer: tokens.colors.base.panelStrong,
      colorText: tokens.colors.text.main,
      colorTextSecondary: tokens.colors.text.body,
      fontFamily: tokens.fonts.ui,
      fontFamilyCode: tokens.fonts.mono,
      borderRadius: Number.parseInt(tokens.radii.md, 10),
      boxShadow: tokens.shadows.card
    }
  };
}
```

```ts
// src/client/main.ts
import "ant-design-vue/dist/reset.css";
import "./styles/tailwind.css";
```

- [ ] **Step 4: 运行最相关的测试和客户端构建**

Run: `npm install`

Expected: 安装 `tailwindcss`、`postcss`、`autoprefixer` 成功，无 peer dependency 阻断

Run: `npx vitest run tests/client/editorialTheme.test.ts tests/client/useTheme.test.ts`

Expected: PASS，`useTheme` 继续把 `data-theme`、`localStorage` 和 CSS 变量同步到同一份 token

Run: `npm run build:client`

Expected: PASS，Vite 能识别 Tailwind/PostCSS 并成功输出客户端产物

- [ ] **Step 5: 提交工具链和主题基础**

```bash
git add package.json package-lock.json tailwind.config.ts postcss.config.js \
  src/client/main.ts src/client/theme/editorialTokens.ts src/client/theme/editorialTheme.ts \
  src/client/composables/useTheme.ts src/client/styles/tailwind.css \
  tests/client/editorialTheme.test.ts tests/client/useTheme.test.ts
git commit -m "chore: add tailwind theme foundation for vue client"
```

## Task 2: 把统一壳层迁到 Tailwind utilities

**Files:**
- Modify: `src/client/App.vue`
- Modify: `src/client/layouts/UnifiedShellLayout.vue`
- Modify: `tests/client/appShell.test.ts`

- [ ] **Step 1: 先补壳层结构测试，锁住移动端顶栏和桌面侧栏的 Tailwind 骨架**

```ts
it("renders the unified shell with tailwind surfaces and keeps the compact mobile nav", async () => {
  const router = createAppRouter();

  await router.push("/settings/profile");
  await router.isReady();

  const wrapper = mount(App, {
    global: {
      plugins: [Antd, router]
    }
  });

  await flushPromises();

  expect(wrapper.get("[data-shell-root]").classes()).toEqual(
    expect.arrayContaining(["min-h-screen", "bg-editorial-page", "text-editorial-main"])
  );
  expect(wrapper.get("[data-mobile-shell-nav]").classes()).toEqual(
    expect.arrayContaining(["sticky", "top-0", "z-30", "lg:hidden"])
  );
  expect(wrapper.get("[data-shell-page-summary]").classes()).toContain("rounded-editorial-xl");
  expect(wrapper.findAll("[data-shell-nav-link]").length).toBe(5);
});
```

- [ ] **Step 2: 跑壳层测试，确认当前组件还依赖旧类名和 scoped CSS**

Run: `npx vitest run tests/client/appShell.test.ts`

Expected: FAIL，因为当前 `UnifiedShellLayout.vue` 还没有 `min-h-screen`、`sticky top-0`、`data-shell-nav-link` 等新结构

- [ ] **Step 3: 用 Tailwind 重写 `App.vue` 和 `UnifiedShellLayout.vue`，并删掉壳层 `<style scoped>`**

```vue
<!-- src/client/App.vue -->
<template>
  <ConfigProvider :theme="themeConfig">
    <div class="min-h-screen bg-editorial-page text-editorial-main">
      <UnifiedShellLayout />
    </div>
  </ConfigProvider>
</template>
```

```vue
<!-- src/client/layouts/UnifiedShellLayout.vue -->
<a-layout
  class="min-h-screen bg-editorial-page text-editorial-main lg:grid lg:grid-cols-[280px_minmax(0,1fr)]"
  data-shell-root
>
  <div
    class="sticky top-0 z-30 border-b border-editorial-border/80 bg-editorial-panel/90 px-4 py-3 backdrop-blur lg:hidden"
    data-mobile-shell-nav
  >
    <div class="mx-auto flex w-full max-w-editorial-shell items-center gap-3">
      <div class="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1" aria-label="内容菜单">
        <RouterLink
          v-for="page in contentNavPages"
          :key="page.path"
          :to="page.path"
          :data-mobile-content-tab="page.path"
          class="shrink-0 rounded-editorial-pill border border-editorial-border bg-editorial-panel px-4 py-2 text-sm font-medium text-editorial-sidebar transition"
          :class="isActiveContentPath(page.path) ? 'bg-editorial-link-active text-editorial-on-accent shadow-editorial-accent border-transparent' : 'hover:border-editorial-strong hover:shadow-editorial-floating'"
          @click="closeMobileSystemDrawer"
        >
          {{ page.navLabel }}
        </RouterLink>
      </div>

      <a-button
        type="default"
        class="!inline-flex !h-9 !items-center !rounded-editorial-pill !border-editorial-border !bg-editorial-panel !px-4 !text-editorial-sidebar hover:!border-editorial-strong hover:!text-editorial-sidebar"
        data-mobile-system-toggle
        :aria-expanded="mobileSystemDrawerOpen ? 'true' : 'false'"
        aria-controls="mobile-system-drawer"
        @click="toggleMobileSystemDrawer"
      >
        系统菜单
      </a-button>
    </div>
  </div>

  <a-layout-sider
    width="280"
    :theme="isDarkMode ? 'dark' : 'light'"
    class="hidden !bg-transparent px-4 py-6 lg:block"
  >
    <div class="flex h-full flex-col gap-6 overflow-y-auto rounded-editorial-xl border border-editorial-strong bg-editorial-sidebar p-4 shadow-editorial-page">
      <div class="rounded-editorial-xl border border-editorial-border bg-editorial-panel p-5 shadow-editorial-card">
        <p class="text-xs uppercase tracking-[0.28em] text-editorial-sidebar-muted">HotNow Editorial Desk</p>
        <h1 class="mt-3 text-3xl font-semibold tracking-tight text-editorial-sidebar">AI-first 工作台壳层</h1>
        <p class="mt-3 text-sm leading-6 text-editorial-body">
          AI 新讯、AI 热点和系统工作台共享同一套 Editorial Desk 主题 token 与导航语义。
        </p>
      </div>

      <section
        class="rounded-editorial-xl border border-editorial-border bg-editorial-panel p-5 shadow-editorial-card"
        data-shell-page-summary
      >
        <p class="text-xs uppercase tracking-[0.24em] text-editorial-sidebar-muted">当前页面</p>
        <h2 class="mt-3 text-2xl font-semibold text-editorial-sidebar" data-shell-page-title>{{ currentPageTitle }}</h2>
        <p class="mt-3 text-sm leading-6 text-editorial-body" data-shell-page-description>{{ currentPageDescription }}</p>
      </section>

      <section class="space-y-3">
        <p class="text-xs uppercase tracking-[0.24em] text-editorial-sidebar-muted">内容菜单</p>
        <a-menu class="!border-0 !bg-transparent" mode="inline" :selected-keys="activeContentNavKeys">
          <a-menu-item v-for="page in contentNavPages" :key="page.path" class="!my-0 !h-auto !p-0">
            <RouterLink
              class="flex flex-col gap-1 rounded-editorial-lg border border-editorial-border bg-editorial-link px-4 py-3 text-editorial-sidebar transition hover:border-editorial-strong hover:shadow-editorial-floating"
              :to="page.path"
              data-shell-nav-link
            >
              <span class="text-sm font-semibold">{{ page.navLabel }}</span>
              <span class="text-xs leading-5 text-editorial-sidebar-muted">{{ page.description }}</span>
            </RouterLink>
          </a-menu-item>
        </a-menu>
      </section>
    </div>
  </a-layout-sider>
</a-layout>
```

- [ ] **Step 4: 跑壳层测试并确认移动端顶栏、系统抽屉和账号区都没有回归**

Run: `npx vitest run tests/client/appShell.test.ts`

Expected: PASS，壳层结构、导航链接、移动端系统抽屉和匿名入口仍然成立

- [ ] **Step 5: 提交壳层 Tailwind 迁移**

```bash
git add src/client/App.vue src/client/layouts/UnifiedShellLayout.vue tests/client/appShell.test.ts
git commit -m "refactor: migrate unified shell layout to tailwind"
```

## Task 3: 把 AI 内容页和内容卡片迁到 Tailwind

**Files:**
- Modify: `src/client/components/content/contentCardShared.ts`
- Modify: `src/client/components/content/ContentHeroCard.vue`
- Modify: `src/client/components/content/ContentStandardCard.vue`
- Modify: `src/client/components/content/ContentActionBar.vue`
- Modify: `src/client/components/content/ContentFeedbackPanel.vue`
- Modify: `src/client/components/content/ContentEmptyState.vue`
- Modify: `src/client/components/content/ContentSourceFilterBar.vue`
- Modify: `src/client/pages/content/AiNewPage.vue`
- Modify: `src/client/pages/content/AiHotPage.vue`
- Modify: `tests/client/contentHeroCard.test.ts`
- Modify: `tests/client/contentSourceFilterBar.test.ts`
- Modify: `tests/client/aiNewPage.test.ts`
- Modify: `tests/client/aiHotPage.test.ts`

- [ ] **Step 1: 先补内容卡片和内容页的 Tailwind 结构断言**

```ts
// tests/client/contentHeroCard.test.ts
expect(wrapper.get("[data-content-id='101']").classes()).toEqual(
  expect.arrayContaining(["rounded-editorial-xl", "border", "border-editorial-border", "bg-editorial-panel"])
);
expect(wrapper.get("[data-content-id='101']").classes()).toContain("shadow-editorial-card");
```

```ts
// tests/client/contentSourceFilterBar.test.ts
expect(wrapper.get("[data-content-source-filter]").classes()).toEqual(
  expect.arrayContaining(["rounded-editorial-xl", "border", "border-editorial-border", "bg-editorial-panel"])
);
```

```ts
// tests/client/aiNewPage.test.ts
expect(wrapper.get("[data-content-page='ai-new']").classes()).toEqual(
  expect.arrayContaining(["flex", "flex-col", "gap-6"])
);
expect(wrapper.get("[data-content-section='featured']").classes()).toContain("grid");
```

```ts
// tests/client/aiHotPage.test.ts
expect(wrapper.get("[data-content-page='ai-hot']").classes()).toEqual(
  expect.arrayContaining(["flex", "flex-col", "gap-6"])
);
expect(wrapper.get("[data-content-section='list']").classes()).toContain("grid");
```

- [ ] **Step 2: 跑内容相关测试，确认当前组件还依赖旧 scoped CSS**

Run: `npx vitest run tests/client/contentHeroCard.test.ts tests/client/contentSourceFilterBar.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts`

Expected: FAIL，因为这些组件还没有对应的 Tailwind 类，页面和卡片仍然走旧 class + `<style scoped>`

- [ ] **Step 3: 迁移内容页、卡片和筛选条，删除这些文件里的 `<style scoped>`**

```ts
// src/client/components/content/contentCardShared.ts
export const editorialContentCardClass =
  "rounded-editorial-xl border border-editorial-border bg-editorial-panel shadow-editorial-card";

export const editorialContentBadgeClass =
  "inline-flex items-center rounded-editorial-pill border border-editorial-border bg-editorial-control px-3 py-1 text-xs font-medium text-editorial-body";

export const editorialContentMetaClass = "flex flex-wrap items-center gap-2 text-xs text-editorial-muted";
```

```vue
<!-- src/client/components/content/ContentHeroCard.vue -->
<a-card
  :bordered="false"
  :class="[editorialContentCardClass, 'overflow-hidden']"
  :data-content-id="card.id"
>
  <div class="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
    <div class="space-y-4">
      <div :class="editorialContentMetaClass">
        <span>{{ card.sourceName }}</span>
        <span>{{ formattedPublishedAt }}</span>
        <span class="rounded-editorial-pill bg-editorial-link px-2 py-1 text-editorial-accent">
          {{ card.contentScore }} 分
        </span>
      </div>
      <a-typography-title :level="2" class="!mb-0 !text-[2rem] !leading-tight !text-editorial-main">
        <a :href="safeUrl ?? undefined" class="text-current no-underline hover:text-editorial-accent">
          {{ card.title }}
        </a>
      </a-typography-title>
      <a-typography-paragraph class="!mb-0 !text-base !leading-7 !text-editorial-body">
        {{ card.summary }}
      </a-typography-paragraph>
      <div class="flex flex-wrap gap-2">
        <span v-for="badge in card.scoreBadges" :key="badge" :class="editorialContentBadgeClass">{{ badge }}</span>
      </div>
    </div>

    <div class="space-y-4 rounded-editorial-lg border border-editorial-border bg-editorial-control p-4">
      <ContentActionBar
        :is-favorited="cardState.isFavorited"
        :reaction="cardState.reaction"
        :is-busy="isBusy"
        :feedback-open="feedbackOpen"
        :status-text="statusText"
        @favorite="handleFavorite"
        @reaction="handleReaction"
        @toggle-feedback="feedbackOpen = !feedbackOpen"
      />
      <ContentFeedbackPanel
        v-if="feedbackOpen"
        :model-value="cardState.feedbackEntry"
        :reaction-snapshot="cardState.reaction"
        :submitting="isBusy"
        @submit="handleFeedbackSubmit"
      />
    </div>
  </div>
</a-card>
```

```vue
<!-- src/client/components/content/ContentSourceFilterBar.vue -->
<a-card
  :bordered="false"
  class="rounded-editorial-xl border border-editorial-border bg-editorial-panel shadow-editorial-floating"
  data-content-source-filter
>
  <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
    <div class="space-y-2">
      <p class="text-xs uppercase tracking-[0.24em] text-editorial-muted">来源筛选</p>
      <h3 class="text-lg font-semibold text-editorial-main">只看你当前想看的来源</h3>
      <p class="text-sm leading-6 text-editorial-body">浏览偏好只影响当前客户端，不会改 source 启用状态。</p>
    </div>

    <div class="flex flex-wrap gap-2">
      <a-button data-content-filter-action="select-all">全选</a-button>
      <a-button data-content-filter-action="clear-all">全不选</a-button>
    </div>
  </div>
</a-card>
```

```vue
<!-- src/client/pages/content/AiNewPage.vue / AiHotPage.vue -->
<div class="flex flex-col gap-6" data-content-page="ai-new">
  <section class="rounded-editorial-xl border border-editorial-border bg-editorial-panel p-6 shadow-editorial-page">
    <p class="text-xs uppercase tracking-[0.24em] text-editorial-muted">AI 新讯</p>
    <h1 class="mt-3 text-3xl font-semibold tracking-tight text-editorial-main">最快发现新一批 AI 信号</h1>
    <p class="mt-3 max-w-3xl text-base leading-7 text-editorial-body">
      这里会优先展示最新 AI 新闻、模型、事件与智能体信号。
    </p>
  </section>

  <div v-if="sourceFilter" class="sticky top-[4.25rem] z-10" data-content-filter-shell>
    <ContentSourceFilterBar
      :options="sourceFilter.options"
      :selected-source-kinds="selectedSourceKinds ?? sourceFilter.selectedSourceKinds"
      @change="handleSourceKindsChange"
    />
  </div>

  <section v-if="featuredCard" class="grid gap-6" data-content-section="featured">
    <ContentHeroCard :card="featuredCard" />
  </section>

  <section v-if="standardCards.length > 0" class="grid gap-4 xl:grid-cols-2" data-content-section="list">
    <ContentStandardCard v-for="card in standardCards" :key="card.id" :card="card" />
  </section>
</div>
```

- [ ] **Step 4: 跑内容相关测试，确认内容页和交互仍然成立**

Run: `npx vitest run tests/client/contentHeroCard.test.ts tests/client/contentSourceFilterBar.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts`

Expected: PASS，卡片交互、来源筛选、特色卡与列表区都能继续工作

- [ ] **Step 5: 提交内容页 Tailwind 迁移**

```bash
git add src/client/components/content/contentCardShared.ts \
  src/client/components/content/ContentHeroCard.vue \
  src/client/components/content/ContentStandardCard.vue \
  src/client/components/content/ContentActionBar.vue \
  src/client/components/content/ContentFeedbackPanel.vue \
  src/client/components/content/ContentEmptyState.vue \
  src/client/components/content/ContentSourceFilterBar.vue \
  src/client/pages/content/AiNewPage.vue src/client/pages/content/AiHotPage.vue \
  tests/client/contentHeroCard.test.ts tests/client/contentSourceFilterBar.test.ts \
  tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts
git commit -m "refactor: migrate ai content pages to tailwind"
```

## Task 4: 把 `/settings/*` 三个 Vue 工作台页面迁到 Tailwind

**Files:**
- Modify: `src/client/pages/settings/ViewRulesPage.vue`
- Modify: `src/client/pages/settings/SourcesPage.vue`
- Modify: `src/client/pages/settings/ProfilePage.vue`
- Modify: `tests/client/viewRulesPage.test.ts`
- Modify: `tests/client/sourcesPage.test.ts`
- Modify: `tests/client/profilePage.test.ts`

- [ ] **Step 1: 先补系统页结构断言，锁住卡片面板的 Tailwind 骨架**

```ts
// tests/client/viewRulesPage.test.ts
expect(wrapper.get("[data-view-rules-section='provider-settings']").classes()).toEqual(
  expect.arrayContaining(["rounded-editorial-xl", "border", "border-editorial-border", "bg-editorial-panel"])
);
expect(wrapper.get("[data-view-rules-section='nl-rules']").classes()).toContain("shadow-editorial-card");
```

```ts
// tests/client/sourcesPage.test.ts
expect(wrapper.get("[data-sources-section='manual-collect']").classes()).toContain("rounded-editorial-xl");
expect(wrapper.get("[data-sources-section='analytics']").classes()).toContain("shadow-editorial-card");
```

```ts
// tests/client/profilePage.test.ts
expect(wrapper.get("[data-profile-section='summary']").classes()).toEqual(
  expect.arrayContaining(["rounded-editorial-xl", "border", "border-editorial-border", "bg-editorial-panel"])
);
```

- [ ] **Step 2: 跑系统页测试，确认这些页面还依赖旧 `scoped CSS`**

Run: `npx vitest run tests/client/viewRulesPage.test.ts tests/client/sourcesPage.test.ts tests/client/profilePage.test.ts`

Expected: FAIL，因为各页面还没有新的 Tailwind 类名

- [ ] **Step 3: 迁移三个工作台页面，并删除页面级 `<style scoped>`**

```vue
<!-- src/client/pages/settings/ViewRulesPage.vue -->
<div class="flex flex-col gap-6" data-settings-page="view-rules">
  <section class="rounded-editorial-xl border border-editorial-border bg-editorial-panel p-6 shadow-editorial-page">
    <p class="text-xs uppercase tracking-[0.24em] text-editorial-muted">筛选策略</p>
    <h1 class="mt-3 text-3xl font-semibold tracking-tight text-editorial-main">把规则、反馈和草稿收进一页</h1>
    <p class="mt-3 max-w-3xl text-base leading-7 text-editorial-body">
      这里会同时承载数值权重、厂商设置、正式自然语言策略、反馈池和草稿池。
    </p>
  </section>

  <section
    class="rounded-editorial-xl border border-editorial-border bg-editorial-panel p-5 shadow-editorial-card"
    data-view-rules-section="provider-settings"
  >
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div class="space-y-2">
        <p class="text-xs uppercase tracking-[0.24em] text-editorial-muted">厂商设置</p>
        <h2 class="text-xl font-semibold text-editorial-main">DeepSeek / MiniMax / Kimi 本地接入状态</h2>
        <p class="text-sm leading-6 text-editorial-body">
          继续保留 `providerKind`、`apiKey`、启用开关、`saveProviderSettings`、`deleteProviderSettings` 和结果提示，
          只把布局、间距、卡片表面和排版迁成 Tailwind。
        </p>
      </div>

      <a-tag color="blue">已配置可用厂商</a-tag>
    </div>
  </section>
</div>
```

```vue
<!-- src/client/pages/settings/SourcesPage.vue -->
<div class="flex flex-col gap-6" data-settings-page="sources">
  <section class="grid gap-4 xl:grid-cols-2">
    <a-card
      :bordered="false"
      class="rounded-editorial-xl border border-editorial-border bg-editorial-panel shadow-editorial-card"
      data-sources-section="manual-collect"
    >
      <div class="flex flex-col gap-3">
        <p class="text-xs uppercase tracking-[0.24em] text-editorial-muted">手动执行采集</p>
        <h2 class="text-xl font-semibold text-editorial-main">现在手动跑一轮多源采集</h2>
        <p class="text-sm leading-6 text-editorial-body">
          继续保留 `triggerManualCollect`、loading 态、成功 toast 和刷新当前页模型的逻辑。
        </p>
      </div>
    </a-card>
    <a-card
      :bordered="false"
      class="rounded-editorial-xl border border-editorial-border bg-editorial-panel shadow-editorial-card"
      data-sources-section="manual-send-latest-email"
    >
      <div class="flex flex-col gap-3">
        <p class="text-xs uppercase tracking-[0.24em] text-editorial-muted">手动发送最新报告</p>
        <h2 class="text-xl font-semibold text-editorial-main">按当前最新报告单独发一封邮件</h2>
        <p class="text-sm leading-6 text-editorial-body">
          继续保留 `triggerManualSendLatestEmail`、loading 态、成功提示和刷新当前页模型的逻辑。
        </p>
      </div>
    </a-card>
  </section>

  <a-card
    :bordered="false"
    class="rounded-editorial-xl border border-editorial-border bg-editorial-panel shadow-editorial-card"
    data-sources-section="analytics"
  >
    <div class="flex items-center justify-between gap-4">
      <div class="space-y-2">
        <p class="text-xs uppercase tracking-[0.24em] text-editorial-muted">来源统计概览</p>
        <h2 class="text-xl font-semibold text-editorial-main">总条数、今天发布、今天抓取与入池/展示表现</h2>
      </div>

      <a-tag color="gold">AI 新讯 / AI 热点</a-tag>
    </div>
  </a-card>
</div>
```

```vue
<!-- src/client/pages/settings/ProfilePage.vue -->
<div class="flex flex-col gap-6" data-settings-page="profile">
  <section class="rounded-editorial-xl border border-editorial-border bg-editorial-panel p-6 shadow-editorial-page">
    <p class="text-xs uppercase tracking-[0.24em] text-editorial-muted">当前登录用户</p>
    <h1 class="mt-3 text-3xl font-semibold tracking-tight text-editorial-main">确认当前会话和账号摘要</h1>
    <p class="mt-3 max-w-3xl text-base leading-7 text-editorial-body">
      这里会展示当前登录状态、角色和联系邮箱。
    </p>
  </section>

  <section
    class="rounded-editorial-xl border border-editorial-border bg-editorial-panel p-6 shadow-editorial-card"
    data-profile-section="summary"
  >
    <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
      <div class="space-y-2">
        <p class="text-xs uppercase tracking-[0.24em] text-editorial-muted">账号摘要</p>
        <h2 class="text-xl font-semibold text-editorial-main">{{ profile?.displayName ?? "公开访问" }}</h2>
        <p class="text-sm leading-6 text-editorial-body">
          继续渲染 `username`、`displayName`、`role`、`email` 和 `loggedIn`，只把容器、标签和间距迁到 Tailwind。
        </p>
      </div>

      <a-tag :color="profile?.loggedIn ? 'green' : 'default'">{{ profile?.loggedIn ? "已登录" : "未登录" }}</a-tag>
    </div>
  </section>
</div>
```

- [ ] **Step 4: 跑系统页测试，确认页面功能和反馈文案没有回归**

Run: `npx vitest run tests/client/viewRulesPage.test.ts tests/client/sourcesPage.test.ts tests/client/profilePage.test.ts`

Expected: PASS，三个系统页的加载、保存、操作提示和关键区域都通过

- [ ] **Step 5: 提交系统页 Tailwind 迁移**

```bash
git add src/client/pages/settings/ViewRulesPage.vue \
  src/client/pages/settings/SourcesPage.vue src/client/pages/settings/ProfilePage.vue \
  tests/client/viewRulesPage.test.ts tests/client/sourcesPage.test.ts tests/client/profilePage.test.ts
git commit -m "refactor: migrate settings pages to tailwind"
```

## Task 5: 删除旧 CSS 依赖、更新文档并跑最终门禁

**Files:**
- Delete: `src/client/styles/editorialShell.css`
- Modify: `src/client/main.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: 先写最终回归检查命令，锁住“Vue 客户端不再依赖旧大 CSS 文件”**

```bash
rg -n "editorialShell.css" src/client README.md AGENTS.md
rg -n "<style scoped>" src/client -g "*.vue"
```

Expected:

- 第一条命令无输出
- 第二条命令命中 `0` 条；如果还有任何 Vue 页面级 `<style scoped>`，本任务不算完成

- [ ] **Step 2: 删除旧 CSS 文件，并更新协作文档**

```md
<!-- README.md -->
- Vue 客户端当前样式栈：`Vue 3 + Vite + Ant Design Vue + Tailwind CSS`
- `src/client/theme/editorialTokens.ts` 是统一主题源；Tailwind 和 `ConfigProvider` 都从这里取值
- `src/client/styles/editorialShell.css` 已移除，新增样式优先写在模板层 Tailwind utilities
```

```md
<!-- AGENTS.md -->
- 当前技术栈：`Node.js + TypeScript + Fastify + Vue 3 + Vite + Tailwind CSS + Ant Design Vue + Vitest`
- `src/client/theme/` 负责共享 token、AntD 主题桥接与客户端主题切换
- `src/client/styles/tailwind.css` 仅保留基础样式、主题变量和少量 AntD 深层覆写；不要重新长出新的大 CSS 皮肤文件
```

- [ ] **Step 3: 依次运行最相关测试、类型检查和构建**

Run: `npx vitest run tests/client/editorialTheme.test.ts tests/client/useTheme.test.ts tests/client/appShell.test.ts tests/client/contentHeroCard.test.ts tests/client/contentSourceFilterBar.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts tests/client/viewRulesPage.test.ts tests/client/sourcesPage.test.ts tests/client/profilePage.test.ts`

Expected: PASS，所有 Vue 客户端相关门禁通过

Run: `npm run typecheck:client`

Expected: PASS，无 Vue/TS 类型错误

Run: `npm run build:client`

Expected: PASS，客户端 Tailwind/Vite 构建通过

Run: `npm run build`

Expected: PASS，完整仓库构建仍然通过

- [ ] **Step 4: 手动做一次样式治理检查**

Run: `rg -n "editorialShell.css|<style scoped>" src/client -g "*.{vue,ts,css}"`

Expected: 不再命中 `editorialShell.css`；Vue 页面和内容组件不再保留大块页面级 `scoped CSS`

- [ ] **Step 5: 提交清理和文档更新**

```bash
git add src/client/main.ts src/client/styles/tailwind.css README.md AGENTS.md
git rm src/client/styles/editorialShell.css
git commit -m "docs: document tailwind styling workflow"
```

## Self-Review Checklist

- Spec coverage:
  - Tailwind 工具链、共享 token、AntD 桥接：Task 1
  - 壳层与移动端顶部导航：Task 2
  - 内容页与卡片完整迁移：Task 3
  - 系统页完整迁移：Task 4
  - 删除旧 CSS、文档同步、最终门禁：Task 5
- Placeholder scan:
  - 本计划没有 `TODO`、`TBD`、`implement later` 之类占位词
  - 每个任务都给了具体文件、测试、命令和至少一组实现代码片段
- Type consistency:
  - `EditorialThemeMode` 统一从 `editorialTokens.ts` 输出
  - `createEditorialCssVariables`、`createEditorialTailwindTheme`、`createEditorialProviderTheme` 在计划里使用的命名保持一致
