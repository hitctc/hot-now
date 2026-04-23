# HotNow AI-First Content Vue Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/`、`/ai-new`、`/ai-hot` 三个 AI-first 内容入口迁入现有 `Vue 3 + Vite + Ant Design Vue` 壳层，删除 `/articles`，并把旧内容页深浅主题规范完整迁移成 Vue 可复用的 token 与组件规则。

**Architecture:** 现有 `Fastify` 继续保留登录、API、legacy 页面和静态资源分发；内容页从“服务端拼整页 HTML”切到“Vue 页面 + 内容读模型 API + 现有写动作接口”。`/` 与 `/ai-new` 共享同一内容页实现，`/ai-hot` 独立展示热点综合页；主题层新增一层 `Editorial Desk` token，把 `site.css` 中已经稳定的深浅规则迁入 `ConfigProvider + CSS variables`。

**Tech Stack:** TypeScript, Fastify, Vue 3, Vue Router, Ant Design Vue, Vite, Vitest, @vue/test-utils, jsdom

---

## File Map

- Create: `src/client/theme/editorialTheme.ts`
  - 把旧 `site.css` 的核心语义 token 收口为 Vue 可消费的深浅主题定义
- Create: `src/client/pages/content/AiNewPage.vue`
  - `AI 新讯` 内容页，承载精选主卡与标准卡列表
- Create: `src/client/pages/content/AiHotPage.vue`
  - `AI 热点` 内容页，承载热点综合卡片流
- Create: `src/client/components/content/ContentHeroCard.vue`
  - 精选主卡
- Create: `src/client/components/content/ContentStandardCard.vue`
  - 标准卡
- Create: `src/client/components/content/ContentSourceFilterBar.vue`
  - 来源筛选条
- Create: `src/client/components/content/ContentActionBar.vue`
  - 收藏 / 点赞 / 点踩 / 展开反馈动作条
- Create: `src/client/components/content/ContentFeedbackPanel.vue`
  - 内容反馈面板
- Create: `src/client/components/content/ContentEmptyState.vue`
  - 空态 / 筛选空态 / 降级态
- Create: `src/client/services/contentApi.ts`
  - 内容页读模型与写动作 API 封装
- Create: `tests/client/aiNewPage.test.ts`
  - `AI 新讯` 页面测试
- Create: `tests/client/aiHotPage.test.ts`
  - `AI 热点` 页面测试
- Create: `tests/client/contentSourceFilterBar.test.ts`
  - 来源筛选条测试
- Create: `tests/client/contentHeroCard.test.ts`
  - 精选主卡测试
- Create: `tests/server/contentApiRoutes.test.ts`
  - 内容读模型 API 测试
- Modify: `src/client/router.ts`
  - 新增 `/`、`/ai-new`、`/ai-hot` 路由并删除 `/articles`
- Modify: `src/client/layouts/UnifiedShellLayout.vue`
  - 统一内容菜单顺序为 `AI 新讯 -> AI 热点`，并收口旧壳品牌与主题切换语义
- Modify: `src/client/composables/useTheme.ts`
  - 接入 `Editorial Desk` token，而不是继续使用通用深浅色
- Modify: `src/server/createServer.ts`
  - 把 `/`、`/ai-new`、`/ai-hot` 改成返回 Vue client entry；新增 `/api/content/ai-new`、`/api/content/ai-hot`；删除 `/articles`
- Modify: `src/server/renderAppLayout.ts`
  - 删除 `/articles` 页面元数据，把内容菜单顺序改成 `AI 新讯 -> AI 热点`
- Modify: `src/server/renderContentPages.ts`
  - 在第二阶段完成后仅保留 legacy / fallback 能力，不再承接主内容页渲染
- Modify: `src/main.ts`
  - 注入内容读模型依赖与内容写动作依赖
- Modify: `tests/client/appShell.test.ts`
  - 更新导航顺序和路由元数据断言
- Modify: `tests/server/contentRoutes.test.ts`
  - 把内容路由从“服务端卡片 HTML”断言切成“Vue client entry + 路由存在性 + `/articles` 已删除”断言
- Modify: `tests/server/systemRoutes.test.ts`
  - 回归系统页在内容页路由更新后仍然返回 Vue client entry
- Modify: `tests/server/siteThemeClient.test.ts`
  - 删除旧内容导航顺序断言，改成 `AI 新讯 -> AI 热点`
- Modify: `README.md`
  - 更新内容路由、内容菜单命名与前端实现说明
- Modify: `AGENTS.md`
  - 更新当前页面列表、项目核心定位和路由约定

## Task 1: 先锁定新的内容菜单、路由和 `/articles` 删除语义

**Files:**
- Modify: `src/client/router.ts`
- Modify: `src/server/renderAppLayout.ts`
- Modify: `tests/client/appShell.test.ts`
- Modify: `tests/server/contentRoutes.test.ts`

- [ ] **Step 1: 先写失败测试，锁定新路由和菜单顺序**

```ts
// tests/client/appShell.test.ts
import { mount } from "@vue/test-utils";
import { createMemoryHistory } from "vue-router";
import { describe, expect, it, vi } from "vitest";
import App from "../../src/client/App.vue";
import { createAppRouter } from "../../src/client/router";

vi.mock("../../src/client/services/settingsApi", () => ({
  readSettingsProfile: vi.fn().mockResolvedValue({
    username: "admin",
    displayName: "Admin",
    role: "admin",
    email: null,
    loggedIn: true
  })
}));

describe("client app shell", () => {
  it("renders AI-first navigation order and removes articles route", async () => {
    const router = createAppRouter(createMemoryHistory("/"));
    router.push("/ai-hot");
    await router.isReady();

    const wrapper = mount(App, {
      global: {
        plugins: [router]
      }
    });

    const navLabels = wrapper.findAll("[data-shell-nav-link]").map((node) => node.text());

    expect(navLabels).toEqual(["AI 新讯", "AI 热点", "筛选策略", "数据收集", "当前用户"]);
    expect(router.getRoutes().some((route) => route.path === "/articles")).toBe(false);
    expect(router.resolve("/").fullPath).toBe("/");
    expect(router.resolve("/ai-new").fullPath).toBe("/ai-new");
  });
});
```

```ts
// tests/server/contentRoutes.test.ts
import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/server/createServer.js";

describe("content routes", () => {
  it("serves the Vue client entry for ai-first content routes and removes /articles", async () => {
    const app = createServer({
      getContentPageModel: vi.fn().mockResolvedValue({
        pageKey: "ai-new",
        sourceFilter: { options: [], selectedSourceKinds: [] },
        featuredCard: null,
        cards: [],
        emptyState: {
          title: "暂无 AI 新讯",
          description: "稍后再来查看。",
          tone: "default"
        }
      })
    } as never);

    const homeResponse = await app.inject({ method: "GET", url: "/" });
    const aiNewResponse = await app.inject({ method: "GET", url: "/ai-new" });
    const aiHotResponse = await app.inject({ method: "GET", url: "/ai-hot" });
    const removedResponse = await app.inject({ method: "GET", url: "/articles" });

    expect(homeResponse.statusCode).toBe(200);
    expect(aiNewResponse.statusCode).toBe(200);
    expect(aiHotResponse.statusCode).toBe(200);
    expect(homeResponse.body).toContain('<div id="app"></div>');
    expect(aiNewResponse.body).toContain('<div id="app"></div>');
    expect(aiHotResponse.body).toContain('<div id="app"></div>');
    expect(removedResponse.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: 跑测试，确认当前仓库仍然保留 `/articles`，而且内容路由还不是 Vue entry**

Run: `npx vitest run tests/client/appShell.test.ts tests/server/contentRoutes.test.ts`

Expected: FAIL，报错集中在：
- 客户端菜单顺序仍然包含旧内容菜单
- `/articles` 仍然存在
- 服务端内容路由还在返回旧 HTML 卡片而不是 Vue client entry

- [ ] **Step 3: 最小实现新路由元数据和新菜单顺序**

```ts
// src/client/router.ts
export type ShellPageKey = "ai-new" | "ai-hot" | "view-rules" | "sources" | "profile";

export const shellPageMetas = [
  {
    key: "ai-new",
    path: "/ai-new",
    navLabel: "AI 新讯",
    title: "AI 新讯",
    description: "最快发现 AI 新闻、模型、事件与智能体信号。"
  },
  {
    key: "ai-hot",
    path: "/ai-hot",
    navLabel: "AI 热点",
    title: "AI 热点",
    description: "查看已经开始形成热度的 AI 相关综合内容。"
  },
  {
    key: "view-rules",
    path: "/settings/view-rules",
    navLabel: "筛选策略",
    title: "筛选策略工作台",
    description: "当前会承载 LLM 厂商设置与正式自然语言策略。"
  },
  {
    key: "sources",
    path: "/settings/sources",
    navLabel: "数据收集",
    title: "数据收集工作台",
    description: "当前会承载 source 启用状态与手动采集动作。"
  },
  {
    key: "profile",
    path: "/settings/profile",
    navLabel: "当前用户",
    title: "当前登录用户页",
    description: "当前会展示登录用户摘要和会话上下文。"
  }
] as const satisfies readonly ShellPageMeta[];

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: AiNewPage,
    meta: {
      shellKey: "ai-new",
      navLabel: "AI 新讯",
      title: "AI 新讯",
      description: "最快发现 AI 新闻、模型、事件与智能体信号。"
    }
  },
  createShellRoute(shellPageMetas[0], AiNewPage),
  createShellRoute(shellPageMetas[1], AiHotPage),
  createShellRoute(shellPageMetas[2], ViewRulesPage),
  createShellRoute(shellPageMetas[3], SourcesPage),
  createShellRoute(shellPageMetas[4], ProfilePage)
];
```

```ts
// src/server/renderAppLayout.ts
const appShellPages: AppShellPage[] = [
  {
    path: "/ai-new",
    title: "AI 新讯",
    section: "content",
    description: "这里会展示最新、及时且值得第一时间关注的 AI 信号。"
  },
  {
    path: "/ai-hot",
    title: "AI 热点",
    section: "content",
    description: "这里会展示已经开始形成热度的 AI 综合内容。"
  },
  {
    path: "/settings/view-rules",
    title: "筛选策略",
    section: "system",
    description: "这里会配置各内容菜单的筛选规则与展示偏好。"
  },
  {
    path: "/settings/sources",
    title: "数据迭代收集",
    section: "system",
    description: "这里会管理 RSS 数据源的启用状态、抓取结果和手动采集。"
  },
  {
    path: "/settings/profile",
    title: "当前登录用户",
    section: "system",
    description: "这里会展示当前账号资料、角色和登录状态。"
  }
];
```

- [ ] **Step 4: 重新跑局部测试，确认新的 IA 已成立**

Run: `npx vitest run tests/client/appShell.test.ts tests/server/contentRoutes.test.ts`

Expected: PASS，客户端和服务端都不再暴露 `/articles`

- [ ] **Step 5: 提交 IA 收口**

```bash
git add src/client/router.ts src/server/renderAppLayout.ts tests/client/appShell.test.ts tests/server/contentRoutes.test.ts
git commit -m "feat: 收口 AI-first 内容路由与菜单结构"
```

## Task 2: 抽出 Editorial Desk 主题 token，并让 Vue 壳接管内容页主题规范

**Files:**
- Create: `src/client/theme/editorialTheme.ts`
- Modify: `src/client/composables/useTheme.ts`
- Modify: `src/client/layouts/UnifiedShellLayout.vue`
- Modify: `tests/client/useTheme.test.ts`
- Modify: `tests/server/siteThemeClient.test.ts`

- [ ] **Step 1: 先写失败测试，锁定主题 token 与菜单顺序**

```ts
// tests/client/useTheme.test.ts
import { describe, expect, it } from "vitest";
import { useTheme } from "../../src/client/composables/useTheme";

describe("useTheme", () => {
  it("maps Editorial Desk tokens into Ant Design Vue theme config", () => {
    const theme = useTheme();

    theme.setThemeMode("light");
    expect(theme.themeConfig.value.token.colorPrimary).toBe("#2352ff");
    expect(theme.themeConfig.value.token.colorBgLayout).toBe("#f4ede3");

    theme.setThemeMode("dark");
    expect(theme.themeConfig.value.token.colorPrimary).toBe("#7ea2ff");
    expect(theme.themeConfig.value.token.colorBgLayout).toBe("#111722");
  });
});
```

```ts
// tests/server/siteThemeClient.test.ts
it("keeps mobile content tabs in AI-first order", async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <html data-theme="dark">
        <body>
          <div class="mobile-top-nav-tabs">
            <a class="mobile-top-tab mobile-top-tab--content is-active" data-shell-nav href="/">AI 新讯</a>
            <a class="mobile-top-tab mobile-top-tab--content" data-shell-nav href="/ai-hot">AI 热点</a>
          </div>
          <button type="button" data-theme-choice="dark" aria-pressed="true">深色模式</button>
          <button type="button" data-theme-choice="light" aria-pressed="false">浅色模式</button>
        </body>
      </html>`,
    { url: "https://example.test/", runScripts: "outside-only" }
  );

  const { window } = dom;
  window.localStorage.setItem("hot-now-theme", "light");
  window.eval(siteScript);

  const tabs = [...window.document.querySelectorAll(".mobile-top-tab")].map((node) => node.textContent?.trim());
  expect(tabs).toEqual(["AI 新讯", "AI 热点"]);
  expect(window.document.documentElement.dataset.theme).toBe("light");
});
```

- [ ] **Step 2: 跑失败测试，确认当前主题仍然是通用 token**

Run: `npx vitest run tests/client/useTheme.test.ts tests/server/siteThemeClient.test.ts`

Expected: FAIL，`useTheme.ts` 还没有输出旧壳语义 token，移动端内容 tabs 也还是旧顺序

- [ ] **Step 3: 新建 Editorial Desk 主题定义，并让 composable 使用它**

```ts
// src/client/theme/editorialTheme.ts
import type { ConfigProviderProps } from "ant-design-vue";
import { theme as antTheme } from "ant-design-vue";
import type { ThemeMode } from "../composables/useTheme";

type ProviderThemeConfig = NonNullable<ConfigProviderProps["theme"]>;

const editorialTokens = {
  light: {
    colorPrimary: "#2352ff",
    colorBgLayout: "#f4ede3",
    colorBgContainer: "#fbf7f1",
    colorText: "#13233c",
    colorTextSecondary: "#43546e",
    colorBorder: "rgba(19, 35, 60, 0.12)",
    borderRadius: 14,
    fontSize: 14
  },
  dark: {
    colorPrimary: "#7ea2ff",
    colorBgLayout: "#111722",
    colorBgContainer: "#171f2c",
    colorText: "#eef3ff",
    colorTextSecondary: "#c4cedf",
    colorBorder: "rgba(255, 255, 255, 0.1)",
    borderRadius: 14,
    fontSize: 14
  }
} as const;

export function buildEditorialTheme(mode: ThemeMode): ProviderThemeConfig {
  return {
    algorithm: mode === "dark" ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: editorialTokens[mode]
  };
}
```

```ts
// src/client/composables/useTheme.ts
import { buildEditorialTheme } from "../theme/editorialTheme";

const themeConfig = computed<ProviderThemeConfig>(() => buildEditorialTheme(themeMode.value));
```

```vue
<!-- src/client/layouts/UnifiedShellLayout.vue -->
<a-menu-item
  v-for="page in shellPageMetas"
  :key="page.key"
  :data-shell-nav="page.key"
>
  <RouterLink class="unified-shell__nav-link" :to="page.path" data-shell-nav-link>
    <span class="unified-shell__nav-label">{{ page.navLabel }}</span>
    <span class="unified-shell__nav-description">{{ page.description }}</span>
  </RouterLink>
</a-menu-item>
```

- [ ] **Step 4: 重新跑主题局部测试，确认 token 和导航顺序都成立**

Run: `npx vitest run tests/client/useTheme.test.ts tests/server/siteThemeClient.test.ts`

Expected: PASS，主题切换继续写入 `hot-now-theme`，并且使用新的 `Editorial Desk` token

- [ ] **Step 5: 提交主题规范落地**

```bash
git add src/client/theme/editorialTheme.ts src/client/composables/useTheme.ts src/client/layouts/UnifiedShellLayout.vue tests/client/useTheme.test.ts tests/server/siteThemeClient.test.ts
git commit -m "feat: 迁移内容壳层主题规范到 Vue token"
```

## Task 3: 新增内容读模型 API，并把内容页入口切到 Vue client entry

**Files:**
- Modify: `src/server/createServer.ts`
- Modify: `src/main.ts`
- Create: `tests/server/contentApiRoutes.test.ts`
- Modify: `tests/server/contentRoutes.test.ts`

- [ ] **Step 1: 先写失败测试，锁定内容读模型接口**

```ts
// tests/server/contentApiRoutes.test.ts
import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/server/createServer.js";

describe("content api routes", () => {
  it("returns the ai-new read model with featured card and source filter", async () => {
    const getContentPageModel = vi.fn().mockResolvedValue({
      pageKey: "ai-new",
      sourceFilter: {
        options: [{ kind: "openai", name: "OpenAI" }],
        selectedSourceKinds: ["openai"]
      },
      featuredCard: {
        id: 1,
        title: "GPT 新模型发布",
        summary: "模型更新摘要",
        sourceName: "OpenAI",
        sourceKind: "openai",
        canonicalUrl: "https://example.com/gpt",
        publishedAt: "2026-03-31T02:00:00.000Z",
        isFavorited: false,
        reaction: "none",
        contentScore: 98,
        scoreBadges: ["24h 内", "官方源"]
      },
      cards: [],
      emptyState: null
    });

    const app = createServer({
      getContentPageModel
    } as never);

    const response = await app.inject({ method: "GET", url: "/api/content/ai-new" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      pageKey: "ai-new",
      sourceFilter: {
        options: [{ kind: "openai", name: "OpenAI" }],
        selectedSourceKinds: ["openai"]
      },
      featuredCard: expect.objectContaining({ title: "GPT 新模型发布" }),
      cards: [],
      emptyState: null
    });
    expect(getContentPageModel).toHaveBeenCalledWith("ai-new", { selectedSourceKinds: [] });
  });

  it("passes source filter headers into ai-hot read model requests", async () => {
    const getContentPageModel = vi.fn().mockResolvedValue({
      pageKey: "ai-hot",
      sourceFilter: { options: [], selectedSourceKinds: ["openai"] },
      featuredCard: null,
      cards: [],
      emptyState: null
    });

    const app = createServer({
      getContentPageModel
    } as never);

    await app.inject({
      method: "GET",
      url: "/api/content/ai-hot",
      headers: {
        "x-hot-now-source-filter": "openai"
      }
    });

    expect(getContentPageModel).toHaveBeenCalledWith("ai-hot", { selectedSourceKinds: ["openai"] });
  });
});
```

- [ ] **Step 2: 跑失败测试，确认新的内容 API 还不存在**

Run: `npx vitest run tests/server/contentApiRoutes.test.ts tests/server/contentRoutes.test.ts`

Expected: FAIL，`/api/content/ai-new`、`/api/content/ai-hot` 还不存在，`createServer` 也没有 `getContentPageModel`

- [ ] **Step 3: 在服务端和入口注入内容读模型依赖**

```ts
// src/server/createServer.ts
type ContentPageModel = {
  pageKey: "ai-new" | "ai-hot";
  sourceFilter: {
    options: { kind: string; name: string }[];
    selectedSourceKinds: string[];
  };
  featuredCard: ContentCardView | null;
  cards: ContentCardView[];
  emptyState: {
    title: string;
    description: string;
    tone: "default" | "degraded" | "filtered";
  } | null;
};

type ServerDeps = {
  getContentPageModel?: (
    pageKey: "ai-new" | "ai-hot",
    options?: Pick<ContentViewSelectionOptions, "selectedSourceKinds">
  ) => Promise<ContentPageModel> | ContentPageModel;
  // ...
};

app.get("/api/content/ai-new", async (request, reply) => {
  const selectedSourceKinds = readSelectedSourceKinds(request);
  return reply.send(await deps.getContentPageModel?.("ai-new", { selectedSourceKinds }));
});

app.get("/api/content/ai-hot", async (request, reply) => {
  const selectedSourceKinds = readSelectedSourceKinds(request);
  return reply.send(await deps.getContentPageModel?.("ai-hot", { selectedSourceKinds }));
});

app.get("/", async (_request, reply) => reply.type("text/html").send(clientEntryHtml));
app.get("/ai-new", async (_request, reply) => reply.type("text/html").send(clientEntryHtml));
app.get("/ai-hot", async (_request, reply) => reply.type("text/html").send(clientEntryHtml));
```

```ts
// src/main.ts
function getContentPageModel(
  pageKey: "ai-new" | "ai-hot",
  options: Pick<ContentViewSelectionOptions, "selectedSourceKinds"> = {}
) {
  const viewKey = pageKey === "ai-hot" ? "hot" : "ai";
  const cards = listContentCards(db, viewKey, options);
  const contentSources = listContentSources(db).map((source) => ({
    kind: source.kind,
    name: source.name
  }));

  return {
    pageKey,
    sourceFilter: {
      options: contentSources,
      selectedSourceKinds: options.selectedSourceKinds ?? []
    },
    featuredCard: pageKey === "ai-new" ? cards[0] ?? null : null,
    cards: pageKey === "ai-new" ? cards.slice(1) : cards,
    emptyState: cards.length === 0
      ? {
          title: pageKey === "ai-new" ? "暂无 AI 新讯" : "暂无 AI 热点",
          description: "可以稍后刷新，或先检查数据源采集状态。",
          tone: "default"
        }
      : null
  };
}
```

- [ ] **Step 4: 跑服务端局部测试，确认内容路由和内容 API 都切到了新模式**

Run: `npx vitest run tests/server/contentApiRoutes.test.ts tests/server/contentRoutes.test.ts`

Expected: PASS，服务端不再渲染主内容 HTML，而是提供 Vue client entry 与 JSON 读模型

- [ ] **Step 5: 提交服务端内容入口切换**

```bash
git add src/server/createServer.ts src/main.ts tests/server/contentApiRoutes.test.ts tests/server/contentRoutes.test.ts
git commit -m "feat: 切换内容页到 Vue 读模型入口"
```

## Task 4: 实现 AI 新讯与 AI 热点页面、来源筛选条和内容卡片组件

**Files:**
- Create: `src/client/pages/content/AiNewPage.vue`
- Create: `src/client/pages/content/AiHotPage.vue`
- Create: `src/client/components/content/ContentHeroCard.vue`
- Create: `src/client/components/content/ContentStandardCard.vue`
- Create: `src/client/components/content/ContentSourceFilterBar.vue`
- Create: `src/client/components/content/ContentActionBar.vue`
- Create: `src/client/components/content/ContentFeedbackPanel.vue`
- Create: `src/client/components/content/ContentEmptyState.vue`
- Create: `src/client/services/contentApi.ts`
- Create: `tests/client/aiNewPage.test.ts`
- Create: `tests/client/aiHotPage.test.ts`
- Create: `tests/client/contentSourceFilterBar.test.ts`
- Create: `tests/client/contentHeroCard.test.ts`

- [ ] **Step 1: 先写失败测试，锁定 `AI 新讯` 首卡和来源筛选行为**

```ts
// tests/client/aiNewPage.test.ts
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AiNewPage from "../../src/client/pages/content/AiNewPage.vue";

vi.mock("../../src/client/services/contentApi", () => ({
  readAiNewPage: vi.fn().mockResolvedValue({
    pageKey: "ai-new",
    sourceFilter: {
      options: [
        { kind: "openai", name: "OpenAI" },
        { kind: "anthropic", name: "Anthropic" }
      ],
      selectedSourceKinds: ["openai"]
    },
    featuredCard: {
      id: 1,
      title: "GPT 新模型发布",
      summary: "模型更新摘要",
      sourceName: "OpenAI",
      sourceKind: "openai",
      canonicalUrl: "https://example.com/gpt",
      publishedAt: "2026-03-31T02:00:00.000Z",
      isFavorited: false,
      reaction: "none",
      contentScore: 98,
      scoreBadges: ["24h 内", "官方源"]
    },
    cards: [
      {
        id: 2,
        title: "Claude 新动态",
        summary: "第二条标准卡",
        sourceName: "Anthropic",
        sourceKind: "anthropic",
        canonicalUrl: "https://example.com/claude",
        publishedAt: "2026-03-31T01:00:00.000Z",
        isFavorited: true,
        reaction: "like",
        contentScore: 87,
        scoreBadges: ["24h 内"]
      }
    ],
    emptyState: null
  }),
  saveFavorite: vi.fn().mockResolvedValue({ ok: true, state: true }),
  saveReaction: vi.fn().mockResolvedValue({ ok: true, state: "like" }),
  saveFeedbackPoolEntry: vi.fn().mockResolvedValue({ ok: true, entryId: 11 })
}));

describe("AiNewPage", () => {
  it("renders one hero card and the remaining standard cards", async () => {
    const wrapper = mount(AiNewPage);
    await flushPromises();

    expect(wrapper.find('[data-content-hero-card="1"]').exists()).toBe(true);
    expect(wrapper.findAll("[data-content-standard-card]").length).toBe(1);
    expect(wrapper.text()).toContain("GPT 新模型发布");
    expect(wrapper.text()).toContain("Claude 新动态");
  });
});
```

```ts
// tests/client/contentSourceFilterBar.test.ts
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ContentSourceFilterBar from "../../src/client/components/content/ContentSourceFilterBar.vue";

describe("ContentSourceFilterBar", () => {
  it("emits updated selected source kinds when toggling options", async () => {
    const wrapper = mount(ContentSourceFilterBar, {
      props: {
        options: [
          { kind: "openai", name: "OpenAI" },
          { kind: "anthropic", name: "Anthropic" }
        ],
        selectedSourceKinds: ["openai"]
      }
    });

    await wrapper.get('[data-source-kind="anthropic"]').setValue(true);

    expect(wrapper.emitted("change")?.[0]?.[0]).toEqual(["openai", "anthropic"]);
  });
});
```

- [ ] **Step 2: 跑失败测试，确认内容页组件还不存在**

Run: `npx vitest run tests/client/aiNewPage.test.ts tests/client/contentSourceFilterBar.test.ts tests/client/contentHeroCard.test.ts tests/client/aiHotPage.test.ts`

Expected: FAIL，缺少内容页组件和内容 API service

- [ ] **Step 3: 实现内容 API service 与页面组件**

```ts
// src/client/services/contentApi.ts
import { getJson, postJson } from "./http";

export type ContentPageKey = "ai-new" | "ai-hot";

export type ContentCard = {
  id: number;
  title: string;
  summary: string;
  sourceName: string;
  sourceKind: string;
  canonicalUrl: string;
  publishedAt: string | null;
  isFavorited: boolean;
  reaction: "like" | "dislike" | "none";
  contentScore: number;
  scoreBadges: string[];
  feedbackEntry?: {
    freeText: string | null;
    suggestedEffect: string | null;
    strengthLevel: string | null;
    positiveKeywords: string[];
    negativeKeywords: string[];
  };
};

export type ContentPageModel = {
  pageKey: ContentPageKey;
  sourceFilter: {
    options: { kind: string; name: string }[];
    selectedSourceKinds: string[];
  };
  featuredCard: ContentCard | null;
  cards: ContentCard[];
  emptyState: {
    title: string;
    description: string;
    tone: "default" | "degraded" | "filtered";
  } | null;
};

export function readAiNewPage(): Promise<ContentPageModel> {
  return getJson("/api/content/ai-new");
}

export function readAiHotPage(): Promise<ContentPageModel> {
  return getJson("/api/content/ai-hot");
}

export function saveFavorite(contentItemId: number, isFavorited: boolean) {
  return postJson(`/actions/content/${contentItemId}/favorite`, { isFavorited });
}

export function saveReaction(contentItemId: number, reaction: "like" | "dislike") {
  return postJson(`/actions/content/${contentItemId}/reaction`, { reaction });
}

export function saveFeedbackPoolEntry(contentItemId: number, payload: Record<string, unknown>) {
  return postJson(`/actions/content/${contentItemId}/feedback-pool`, payload);
}
```

```vue
<!-- src/client/pages/content/AiNewPage.vue -->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import ContentEmptyState from "../../components/content/ContentEmptyState.vue";
import ContentHeroCard from "../../components/content/ContentHeroCard.vue";
import ContentSourceFilterBar from "../../components/content/ContentSourceFilterBar.vue";
import ContentStandardCard from "../../components/content/ContentStandardCard.vue";
import { readAiNewPage, type ContentPageModel } from "../../services/contentApi";

const model = ref<ContentPageModel | null>(null);
const isLoading = ref(true);

async function loadPage(): Promise<void> {
  isLoading.value = true;
  model.value = await readAiNewPage();
  isLoading.value = false;
}

onMounted(() => {
  void loadPage();
});
</script>

<template>
  <section class="content-page content-page--ai-new">
    <ContentSourceFilterBar
      v-if="model"
      :options="model.sourceFilter.options"
      :selected-source-kinds="model.sourceFilter.selectedSourceKinds"
    />

    <a-skeleton v-if="isLoading" :active="true" :paragraph="{ rows: 6 }" />

    <template v-else-if="model?.emptyState">
      <ContentEmptyState :state="model.emptyState" />
    </template>

    <template v-else-if="model">
      <ContentHeroCard
        v-if="model.featuredCard"
        :card="model.featuredCard"
        :data-content-hero-card="model.featuredCard.id"
      />
      <div class="content-standard-list">
        <ContentStandardCard
          v-for="card in model.cards"
          :key="card.id"
          :card="card"
          :data-content-standard-card="card.id"
        />
      </div>
    </template>
  </section>
</template>
```

```vue
<!-- src/client/pages/content/AiHotPage.vue -->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import ContentEmptyState from "../../components/content/ContentEmptyState.vue";
import ContentSourceFilterBar from "../../components/content/ContentSourceFilterBar.vue";
import ContentStandardCard from "../../components/content/ContentStandardCard.vue";
import { readAiHotPage, type ContentPageModel } from "../../services/contentApi";

const model = ref<ContentPageModel | null>(null);

onMounted(async () => {
  model.value = await readAiHotPage();
});
</script>

<template>
  <section class="content-page content-page--ai-hot">
    <ContentSourceFilterBar
      v-if="model"
      :options="model.sourceFilter.options"
      :selected-source-kinds="model.sourceFilter.selectedSourceKinds"
    />

    <template v-if="model?.emptyState">
      <ContentEmptyState :state="model.emptyState" />
    </template>

    <div v-else-if="model" class="content-standard-list">
      <ContentStandardCard
        v-for="card in model.cards"
        :key="card.id"
        :card="card"
        :data-content-standard-card="card.id"
      />
    </div>
  </section>
</template>
```

- [ ] **Step 4: 跑客户端局部测试，确认 `AI 新讯` 与 `AI 热点` 页面语义成立**

Run: `npx vitest run tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts tests/client/contentSourceFilterBar.test.ts tests/client/contentHeroCard.test.ts`

Expected: PASS，`/ai-new` 保留首条精选主卡，`/ai-hot` 只渲染热点卡片流

- [ ] **Step 5: 提交内容页组件实现**

```bash
git add src/client/pages/content src/client/components/content src/client/services/contentApi.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts tests/client/contentSourceFilterBar.test.ts tests/client/contentHeroCard.test.ts
git commit -m "feat: 实现 AI 新讯与 AI 热点内容页面"
```

## Task 5: 清理旧内容页残留，更新文档并跑全量验证

**Files:**
- Modify: `src/server/renderContentPages.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `tests/server/systemRoutes.test.ts`
- Modify: `tests/server/siteThemeClient.test.ts`

- [ ] **Step 1: 先写失败测试，锁定 `/articles` 已彻底移除且系统页不回退**

```ts
// tests/server/systemRoutes.test.ts
import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/server/createServer.js";

describe("system routes", () => {
  it("keeps settings pages on the Vue shell after content route migration", async () => {
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret"
      },
      getCurrentUserProfile: vi.fn().mockResolvedValue({
        username: "admin",
        displayName: "Admin",
        role: "admin",
        email: null
      })
    } as never);

    const response = await app.inject({ method: "GET", url: "/settings/view-rules" });
    expect(response.statusCode).toBe(302);
  });
});
```

```md
<!-- README.md / AGENTS.md -->
- `/`：AI 新讯（与 `/ai-new` 等价）
- `/ai-new`：最快发现 AI 新闻、模型、事件和智能体的信号页
- `/ai-hot`：AI 相关热点综合页
- `/articles`：已删除
```

- [ ] **Step 2: 跑相关测试，确认旧断言尚未清理干净**

Run: `npx vitest run tests/server/systemRoutes.test.ts tests/server/siteThemeClient.test.ts tests/server/contentRoutes.test.ts`

Expected: FAIL，旧的 `/articles` 文案和断言仍有残留

- [ ] **Step 3: 清理旧内容页残留并同步文档**

```ts
// src/server/renderContentPages.ts
// 第二阶段完成后，这个文件只保留 legacy/fallback 辅助函数，不再承接主内容页 HTML 渲染。
export function buildLegacyContentEmptyState(title: string, description: string) {
  return {
    title,
    description,
    tone: "default" as const
  };
}
```

```md
<!-- README.md -->
当前内容菜单：

- `/`：AI 新讯（与 `/ai-new` 等价）
- `/ai-new`：AI-first 最新信号页，采用首条精选主卡 + 标准卡列表
- `/ai-hot`：AI 热点综合页

系统菜单：

- `/settings/view-rules`
- `/settings/sources`
- `/settings/profile`
```

```md
<!-- AGENTS.md -->
当前页面：

- `/`：AI 新讯（未登录可访问，与 `/ai-new` 等价）
- `/ai-new`：AI 新讯（未登录可访问）
- `/ai-hot`：AI 热点（未登录可访问）
- `/settings/view-rules`
- `/settings/sources`
- `/settings/profile`
- `/articles`：已删除，不再作为内容菜单入口
```

- [ ] **Step 4: 跑完整验证，确认第二阶段可交付**

Run: `npm run test`
Expected: PASS，所有测试通过

Run: `npm run build`
Expected: PASS，`dist/client` 与 `dist/server` 均成功输出；若仍有 chunk size warning，可记录为非阻塞风险，但不能阻断构建

- [ ] **Step 5: 提交文档与清理收尾**

```bash
git add src/server/renderContentPages.ts README.md AGENTS.md tests/server/systemRoutes.test.ts tests/server/siteThemeClient.test.ts tests/server/contentRoutes.test.ts
git commit -m "docs: 同步 AI-first 内容页迁移文档与门禁"
```

## Spec Coverage Self-Check

- 已覆盖 `AI 新讯 -> AI 热点` 的新内容菜单顺序：Task 1、Task 2
- 已覆盖 `/` 等同于 `/ai-new`：Task 1、Task 3
- 已覆盖 `/articles` 删除：Task 1、Task 5
- 已覆盖内容页读模型 API：Task 3
- 已覆盖 `AI 新讯` 首条精选主卡与 `AI 热点` 综合页：Task 3、Task 4
- 已覆盖 `Editorial Desk` 深浅主题规范迁移：Task 2
- 已覆盖 README / AGENTS / 测试门禁同步：Task 5
