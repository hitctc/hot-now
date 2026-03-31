# HotNow Vue And Ant Design Vue System Shell Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/settings/view-rules`、`/settings/sources`、`/settings/profile` 从服务端拼 HTML 工作台迁移为 `Vue 3 + Vite + Ant Design Vue` 渲染的系统页，同时保留 Fastify 作为登录、鉴权、业务 API 与 legacy 页面入口。

**Architecture:** 第一阶段不改内容页和 legacy 页面，只让 `/settings/*` 返回同一个前端入口 `dist/client/index.html`。前端使用 `vue-router`、`Ant Design Vue ConfigProvider` 和统一 service 层拉取 `/api/settings/*` 数据；现有写动作接口保持不变，继续由 Fastify 承接。

**Tech Stack:** Node.js, TypeScript, Fastify, Vite, Vue 3, Vue Router, Ant Design Vue, Vitest, @vue/test-utils, jsdom

---

## File Map

### New Files

- `vite.config.ts`
  - Vite 根目录、构建输出和开发 proxy 配置
- `src/client/index.html`
  - Vite 前端入口 HTML
- `src/client/main.ts`
  - Vue 应用启动文件
- `src/client/App.vue`
  - ConfigProvider 和根路由壳
- `src/client/router.ts`
  - 系统页路由定义
- `src/client/layouts/UnifiedShellLayout.vue`
  - 系统页统一布局
- `src/client/pages/settings/ViewRulesPage.vue`
  - 策略工作台页面
- `src/client/pages/settings/SourcesPage.vue`
  - source 管理页面
- `src/client/pages/settings/ProfilePage.vue`
  - 当前用户页面
- `src/client/composables/useTheme.ts`
  - `localStorage['hot-now-theme']` 与 Ant Design Vue 主题同步
- `src/client/composables/useAsyncAction.ts`
  - 通用 loading / success / error 动作封装
- `src/client/services/http.ts`
  - fetch 封装与统一错误处理
- `src/client/services/settingsApi.ts`
  - `/api/settings/*` 与现有 `/actions/*` 的前端调用封装
- `src/client/components/base/PageHeader.vue`
  - 系统页页头
- `src/client/components/base/WorkbenchCard.vue`
  - 通用工作台卡片包装
- `src/client/components/base/InlineResult.vue`
  - 行内状态反馈
- `src/client/components/domain/ProviderSettingsPanel.vue`
  - LLM 厂商设置面板
- `src/client/components/domain/NlRulesEditor.vue`
  - 正式自然语言策略编辑器
- `src/client/components/domain/NumericRulesPanel.vue`
  - 现有数值规则编辑区
- `src/client/components/domain/FeedbackPoolPanel.vue`
  - 反馈池展示区
- `src/client/components/domain/StrategyDraftsPanel.vue`
  - 草稿池展示区
- `src/client/components/domain/SourcesSummaryPanel.vue`
  - source 汇总区
- `src/client/components/domain/SourceInventoryTable.vue`
  - source 列表与启停入口
- `src/client/components/domain/ManualCollectionPanel.vue`
  - 手动采集面板
- `src/client/components/domain/ManualSendLatestEmailPanel.vue`
  - 手动发送最新报告面板
- `src/client/components/domain/ProfileSummaryCard.vue`
  - 当前用户信息卡片
- `src/client/vite-env.d.ts`
  - Vite / Vue 类型声明
- `tests/client/appShell.test.ts`
  - 前端入口与路由挂载测试
- `tests/client/useTheme.test.ts`
  - 主题 composable 测试
- `tests/client/viewRulesPage.test.ts`
  - 策略工作台交互测试
- `tests/client/sourcesPage.test.ts`
  - source 系统页交互测试
- `tests/client/profilePage.test.ts`
  - profile 页渲染测试
- `tests/server/settingsApiRoutes.test.ts`
  - 新增 `/api/settings/*` 路由测试

### Modified Files

- `package.json`
  - 新增前端依赖与 `dev/build` 脚本
- `tsconfig.json`
  - 排除 `src/client/**/*`，避免 server build 编译前端入口
- `vitest.config.ts`
  - 为 `tests/client/**/*.test.ts` 切换 `jsdom` 环境
- `src/server/createServer.ts`
  - `/settings/*` 切换到前端入口 HTML，新增 `/api/settings/*`，继续保留现有动作接口
- `src/server/renderSystemPages.ts`
  - 保留现有类型并导出前端 API 所需的 view type
- `src/main.ts`
  - 补前端入口文件缺失时的启动提示
- `scripts/dev-local.sh`
  - `dev:local` 在单端口 smoke 前先确保 client 已有可用构建产物
- `README.md`
  - 更新 Vue 系统页启动方式和页面实现说明
- `AGENTS.md`
  - 更新技术栈、运行命令和系统页实现边界
- `tests/server/systemRoutes.test.ts`
  - 从“服务端工作台 HTML”断言切换为“系统页返回前端入口 HTML”断言
- `tests/server/createServer.test.ts`
  - 校验登录保护和 `/settings/*` 路由切换后仍然成立

## Task 1: 接入 Vite、Vue 3、Ant Design Vue 构建骨架

**Files:**
- Create: `vite.config.ts`
- Create: `src/client/index.html`
- Create: `src/client/main.ts`
- Create: `src/client/App.vue`
- Create: `src/client/router.ts`
- Create: `src/client/vite-env.d.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `vitest.config.ts`
- Test: `tests/client/appShell.test.ts`

- [ ] **Step 1: 更新依赖与脚本**

```json
{
  "scripts": {
    "start": "node dist/server/main.js",
    "dev:server": "tsx watch src/main.ts",
    "dev:client": "vite",
    "dev": "npm-run-all --parallel dev:server dev:client",
    "build:client": "vite build",
    "build:server": "tsc -p tsconfig.json",
    "build": "npm run build:client && npm run build:server"
  },
  "dependencies": {
    "ant-design-vue": "^4",
    "vue": "^3",
    "vue-router": "^4"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5",
    "@vue/test-utils": "^2",
    "npm-run-all": "^4.1.5",
    "vite": "^6"
  }
}
```

Run: `npm install`
Expected: 新增 `vue`、`vite`、`ant-design-vue`、`@vue/test-utils` 相关依赖，无安装错误

- [ ] **Step 2: 调整 TypeScript 和 Vitest 边界**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "rootDir": "src",
    "outDir": "dist/server",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/client/**/*"]
}
```

```ts
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "node",
    environmentMatchGlobs: [["tests/client/**/*.test.ts", "jsdom"]],
    include: ["tests/**/*.test.ts"]
  }
});
```

Expected: server build 仍然只看后端 TS，client test 目录统一走 `jsdom`

- [ ] **Step 3: 新增 Vite 配置**

```ts
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/client",
  base: "/client/",
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3030",
      "/actions": "http://127.0.0.1:3030",
      "/login": "http://127.0.0.1:3030",
      "/logout": "http://127.0.0.1:3030",
      "/health": "http://127.0.0.1:3030"
    }
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: false
  }
});
```

Expected: client 产物固定输出到 `dist/client`，并在开发态把 API 请求 proxy 到 Fastify

- [ ] **Step 4: 写前端入口失败测试**

```ts
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import App from "../../src/client/App.vue";

describe("client app shell", () => {
  it("renders the settings app shell root", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/settings/view-rules", component: { template: "<div>view rules</div>" } }]
    });
    router.push("/settings/view-rules");
    await router.isReady();

    const wrapper = mount(App, { global: { plugins: [router] } });

    expect(wrapper.text()).toContain("view rules");
  });
});
```

Run: `npx vitest run tests/client/appShell.test.ts`
Expected: FAIL，提示找不到 `../../src/client/App.vue` 或前端入口尚未完成

- [ ] **Step 5: 实现最小前端入口**

```html
<!-- src/client/index.html -->
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HotNow Settings</title>
    <script type="module" src="/main.ts"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
```

```ts
// src/client/main.ts
import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import routes from "./router";
import "ant-design-vue/dist/reset.css";

const router = createRouter({
  history: createWebHistory(),
  routes
});

createApp(App).use(router).mount("#app");
```

```vue
<!-- src/client/App.vue -->
<template>
  <RouterView />
</template>
```

```ts
// src/client/router.ts
export default [
  { path: "/settings/view-rules", component: { template: "<div>view rules</div>" } },
  { path: "/settings/sources", component: { template: "<div>sources</div>" } },
  { path: "/settings/profile", component: { template: "<div>profile</div>" } }
];
```

Run: `npx vitest run tests/client/appShell.test.ts`
Expected: PASS

- [ ] **Step 6: 验证 client build**

Run: `npm run build:client`
Expected: PASS，生成 `dist/client/index.html` 和 `dist/client/assets/*`

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts vite.config.ts src/client/index.html src/client/main.ts src/client/App.vue src/client/router.ts src/client/vite-env.d.ts tests/client/appShell.test.ts
git commit -m "chore: 接入 Vue 系统页构建骨架"
```

## Task 2: 让 `/settings/*` 返回前端入口 HTML，并保留登录保护

**Files:**
- Modify: `src/server/createServer.ts`
- Modify: `src/main.ts`
- Modify: `tests/server/createServer.test.ts`
- Modify: `tests/server/systemRoutes.test.ts`

- [ ] **Step 1: 先写服务端路由失败测试**

```ts
it("serves the client settings shell for authenticated /settings/view-rules", async () => {
  const app = createServer({
    auth: {
      requireLogin: true,
      sessionSecret: "secret",
      verifyLogin: () => ({ username: "admin", displayName: "Admin", role: "admin" })
    },
    getCurrentUserProfile: () => ({ username: "admin", displayName: "Admin", role: "admin", email: null })
  });

  const login = await app.inject({
    method: "POST",
    url: "/login",
    payload: { username: "admin", password: "password" }
  });

  const response = await app.inject({
    method: "GET",
    url: "/settings/view-rules",
    headers: { cookie: login.headers["set-cookie"] as string }
  });

  expect(response.statusCode).toBe(200);
  expect(response.body).toContain('<div id="app"></div>');
  expect(response.body).toContain('/client/assets/');
});
```

Run: `npx vitest run tests/server/createServer.test.ts tests/server/systemRoutes.test.ts`
Expected: FAIL，现有 `/settings/*` 仍返回服务端拼装工作台 HTML

- [ ] **Step 2: 在 server 中读取并缓存 client index.html**

```ts
function readClientIndexHtml() {
  const runtimePath = path.resolve(process.cwd(), "dist/client/index.html");

  if (existsSync(runtimePath)) {
    return readFileSync(runtimePath, "utf8");
  }

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="stylesheet" href="/client/assets/index.css" /><script type="module" src="/client/assets/index.js"></script></head><body><div id="app"></div></body></html>`;
}

function guessClientAssetMime(filePath: string) {
  if (filePath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }

  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  return "application/octet-stream";
}
```

```ts
app.get("/client/*", async (request, reply) => {
  const relativePath = request.params["*"];
  const filePath = path.resolve(process.cwd(), "dist/client", relativePath);
  return reply.type(guessClientAssetMime(filePath)).send(readFileSync(filePath));
});
```

Expected: server 具备生产态 client shell 和静态资源分发能力

- [ ] **Step 3: 仅切换 `/settings/*` 页面返回前端入口**

```ts
const spaSettingsRoutes = new Set(["/settings/view-rules", "/settings/sources", "/settings/profile"]);

if (spaSettingsRoutes.has(currentPage.path)) {
  return reply.type("text/html").send(readClientIndexHtml());
}
```

```ts
if (!session && currentPage.section === "system") {
  return reply.redirect("/login");
}
```

Expected: 只有系统页切到前端入口，内容页和 legacy 页行为不变

- [ ] **Step 4: 启动入口在缺少 client build 时给出明确提示**

```ts
if (!existsSync(path.resolve(process.cwd(), "dist/client/index.html"))) {
  app.log.warn("Client build not found. Run `npm run build:client` before opening /settings/* in single-port mode.");
}
```

Run: `npx vitest run tests/server/createServer.test.ts tests/server/systemRoutes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/createServer.ts src/main.ts tests/server/createServer.test.ts tests/server/systemRoutes.test.ts
git commit -m "feat: 切换系统页到前端应用入口"
```

## Task 3: 新增 `/api/settings/*` 读模型接口

**Files:**
- Create: `tests/server/settingsApiRoutes.test.ts`
- Modify: `src/server/createServer.ts`
- Modify: `src/server/renderSystemPages.ts`

- [ ] **Step 1: 写 API 失败测试**

```ts
it("returns view-rules workbench data as json", async () => {
  const app = createServer({
    auth: {
      requireLogin: true,
      sessionSecret: "secret",
      verifyLogin: () => ({ username: "admin", displayName: "Admin", role: "admin" })
    },
    getViewRulesWorkbenchData: () => ({
      numericRules: [],
      providerSettings: null,
      providerCapability: { hasMasterKey: false, featureAvailable: false, message: "disabled" },
      nlRules: [],
      feedbackPool: [],
      strategyDrafts: [],
      latestEvaluationRun: null,
      isEvaluationRunning: false
    })
  });

  const login = await app.inject({ method: "POST", url: "/login", payload: { username: "admin", password: "password" } });
  const response = await app.inject({
    method: "GET",
    url: "/api/settings/view-rules",
    headers: { cookie: login.headers["set-cookie"] as string }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toHaveProperty("numericRules");
});
```

```ts
it("returns 401 json for unauthenticated settings api", async () => {
  const app = createServer({
    auth: { requireLogin: true, sessionSecret: "secret", verifyLogin: () => null }
  });

  const response = await app.inject({ method: "GET", url: "/api/settings/profile" });

  expect(response.statusCode).toBe(401);
  expect(response.json()).toEqual({ ok: false, reason: "unauthorized" });
});
```

Run: `npx vitest run tests/server/settingsApiRoutes.test.ts`
Expected: FAIL，接口尚不存在

- [ ] **Step 2: 导出前端 API 需要的 view type**

```ts
export type { ViewRulesWorkbenchView };
```

```ts
export type SettingsProfileView = {
  username: string;
  displayName: string;
  role: string;
  email: string | null;
  loggedIn: boolean;
};
```

Expected: 前后端共享的页面视图模型不需要重新发明字段名

- [ ] **Step 3: 在 `createServer` 中新增 `/api/settings/*`**

```ts
function requireSettingsSession(request: FastifyRequest) {
  return readAuthenticatedSession(request.headers.cookie, authConfig?.sessionSecret ?? "");
}

app.get("/api/settings/view-rules", async (request, reply) => {
  const session = requireSettingsSession(request);
  if (!session) {
    return reply.code(401).send({ ok: false, reason: "unauthorized" });
  }

  const workbench = deps.getViewRulesWorkbenchData
    ? await deps.getViewRulesWorkbenchData()
    : await deps.listViewRules!();

  return reply.send(workbench);
});

app.get("/api/settings/sources", async (request, reply) => {
  const session = requireSettingsSession(request);
  if (!session) {
    return reply.code(401).send({ ok: false, reason: "unauthorized" });
  }

  const sources = await deps.listSources!();
  const summary = await deps.getSourcesOperationSummary!();

  return reply.send({ sources, summary, isRunning: deps.isRunning?.() ?? false });
});

app.get("/api/settings/profile", async (request, reply) => {
  const session = requireSettingsSession(request);
  if (!session) {
    return reply.code(401).send({ ok: false, reason: "unauthorized" });
  }

  return reply.send(await deps.getCurrentUserProfile?.());
});
```

Run: `npx vitest run tests/server/settingsApiRoutes.test.ts tests/server/createServer.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/server/createServer.ts src/server/renderSystemPages.ts tests/server/settingsApiRoutes.test.ts tests/server/createServer.test.ts
git commit -m "feat: 新增系统页读模型接口"
```

## Task 4: 实现统一布局、主题同步和请求封装

**Files:**
- Create: `src/client/layouts/UnifiedShellLayout.vue`
- Create: `src/client/composables/useTheme.ts`
- Create: `src/client/composables/useAsyncAction.ts`
- Create: `src/client/services/http.ts`
- Create: `src/client/components/base/PageHeader.vue`
- Create: `src/client/components/base/WorkbenchCard.vue`
- Create: `src/client/components/base/InlineResult.vue`
- Modify: `src/client/App.vue`
- Modify: `src/client/router.ts`
- Test: `tests/client/useTheme.test.ts`

- [ ] **Step 1: 写主题失败测试**

```ts
import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";
import { useTheme } from "../../src/client/composables/useTheme";

describe("useTheme", () => {
  it("reads and writes hot-now-theme", async () => {
    localStorage.setItem("hot-now-theme", "light");
    const mode = ref<"light" | "dark">("dark");
    const { applyTheme } = useTheme(mode);

    applyTheme("light");
    await nextTick();

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("hot-now-theme")).toBe("light");
  });
});
```

Run: `npx vitest run tests/client/useTheme.test.ts`
Expected: FAIL，`useTheme` 尚不存在

- [ ] **Step 2: 实现主题 composable 和根布局**

```ts
// src/client/composables/useTheme.ts
import { onMounted, type Ref } from "vue";

const themeStorageKey = "hot-now-theme";

export function useTheme(mode: Ref<"light" | "dark">) {
  function applyTheme(next: "light" | "dark") {
    mode.value = next;
    document.documentElement.dataset.theme = next;
    localStorage.setItem(themeStorageKey, next);
  }

  onMounted(() => {
    const saved = localStorage.getItem(themeStorageKey) === "light" ? "light" : "dark";
    applyTheme(saved);
  });

  return { applyTheme };
}
```

```vue
<!-- src/client/App.vue -->
<template>
  <a-config-provider :theme="themeConfig">
    <RouterView />
  </a-config-provider>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { theme } from "ant-design-vue";
import { useTheme } from "./composables/useTheme";

const mode = ref<"light" | "dark">("dark");
useTheme(mode);

const themeConfig = computed(() => ({
  algorithm: mode.value === "light" ? theme.defaultAlgorithm : theme.darkAlgorithm,
  token: {
    colorPrimary: "#1677ff",
    borderRadius: 10,
    controlHeight: 40
  }
}));
</script>
```

- [ ] **Step 3: 实现布局和 HTTP 封装**

```ts
// src/client/services/http.ts
export async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init
  });

  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("unauthorized");
  }

  if (!response.ok) {
    throw new Error(`request-failed:${response.status}`);
  }

  return response.json() as Promise<T>;
}
```

```vue
<!-- src/client/layouts/UnifiedShellLayout.vue -->
<template>
  <a-layout class="settings-shell">
    <a-layout-sider width="260">
      <div class="brand-block">HotNow</div>
      <a-menu :selected-keys="[route.path]" mode="inline" @click="onMenuClick">
        <a-menu-item key="/settings/view-rules">筛选策略</a-menu-item>
        <a-menu-item key="/settings/sources">数据迭代收集</a-menu-item>
        <a-menu-item key="/settings/profile">当前登录用户</a-menu-item>
      </a-menu>
    </a-layout-sider>
    <a-layout>
      <a-layout-content>
        <slot />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();

function onMenuClick({ key }: { key: string }) {
  void router.push(key);
}
</script>
```

Run: `npx vitest run tests/client/appShell.test.ts tests/client/useTheme.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/client/App.vue src/client/router.ts src/client/layouts/UnifiedShellLayout.vue src/client/composables/useTheme.ts src/client/composables/useAsyncAction.ts src/client/services/http.ts src/client/components/base/PageHeader.vue src/client/components/base/WorkbenchCard.vue src/client/components/base/InlineResult.vue tests/client/useTheme.test.ts
git commit -m "feat: 新增系统页统一壳层与主题"
```

## Task 5: 迁移 `/settings/view-rules` 到 Vue 工作台

**Files:**
- Create: `src/client/services/settingsApi.ts`
- Create: `src/client/pages/settings/ViewRulesPage.vue`
- Create: `src/client/components/domain/ProviderSettingsPanel.vue`
- Create: `src/client/components/domain/NlRulesEditor.vue`
- Create: `src/client/components/domain/NumericRulesPanel.vue`
- Create: `src/client/components/domain/FeedbackPoolPanel.vue`
- Create: `src/client/components/domain/StrategyDraftsPanel.vue`
- Modify: `src/client/router.ts`
- Test: `tests/client/viewRulesPage.test.ts`

- [ ] **Step 1: 写策略工作台失败测试**

```ts
import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import ViewRulesPage from "../../src/client/pages/settings/ViewRulesPage.vue";

vi.mock("../../src/client/services/settingsApi", () => ({
  fetchViewRulesPage: vi.fn(async () => ({
    numericRules: [{ ruleKey: "hot", displayName: "热点页", config: { limit: 20 }, isEnabled: true }],
    providerSettings: null,
    providerCapability: { hasMasterKey: false, featureAvailable: false, message: "disabled" },
    nlRules: [],
    feedbackPool: [],
    strategyDrafts: [],
    latestEvaluationRun: null,
    isEvaluationRunning: false
  }))
}));

describe("ViewRulesPage", () => {
  it("renders provider settings and nl rules sections", async () => {
    const wrapper = mount(ViewRulesPage);
    await flushPromises();

    expect(wrapper.text()).toContain("LLM 设置");
    expect(wrapper.text()).toContain("正式自然语言策略");
  });
});
```

Run: `npx vitest run tests/client/viewRulesPage.test.ts`
Expected: FAIL，页面与组件尚不存在

- [ ] **Step 2: 实现 settings API service**

```ts
// src/client/services/settingsApi.ts
import { readJson } from "./http";

export function fetchViewRulesPage() {
  return readJson("/api/settings/view-rules");
}

export function saveProviderSettings(payload: { providerKind: string; apiKey: string }) {
  return readJson("/actions/view-rules/provider-settings", {
    method: "POST",
    body: JSON.stringify({ ...payload, isEnabled: true })
  });
}

export function deleteProviderSettings() {
  return readJson("/actions/view-rules/provider-settings/delete", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function saveNlRules(rules: Record<string, string>) {
  return readJson("/actions/view-rules/nl-rules", {
    method: "POST",
    body: JSON.stringify({ rules })
  });
}
```

- [ ] **Step 3: 实现 ViewRules 页面和核心面板**

```vue
<!-- src/client/pages/settings/ViewRulesPage.vue -->
<template>
  <UnifiedShellLayout>
    <PageHeader title="筛选策略" description="在同一工作台里维护数值权重、自然语言规则、反馈池、草稿池和 LLM 厂商配置。" />
    <a-space direction="vertical" size="large" style="width: 100%">
      <NumericRulesPanel :rules="data?.numericRules ?? []" />
      <ProviderSettingsPanel
        :provider-settings="data?.providerSettings ?? null"
        :provider-capability="data?.providerCapability ?? null"
        :latest-run="data?.latestEvaluationRun ?? null"
        :is-evaluation-running="data?.isEvaluationRunning ?? false"
      />
      <NlRulesEditor :rules="data?.nlRules ?? []" />
      <FeedbackPoolPanel :entries="data?.feedbackPool ?? []" />
      <StrategyDraftsPanel :drafts="data?.strategyDrafts ?? []" />
    </a-space>
  </UnifiedShellLayout>
</template>
```

```ts
// src/client/router.ts
import ViewRulesPage from "./pages/settings/ViewRulesPage.vue";
import SourcesPage from "./pages/settings/SourcesPage.vue";
import ProfilePage from "./pages/settings/ProfilePage.vue";

export default [
  { path: "/settings/view-rules", component: ViewRulesPage },
  { path: "/settings/sources", component: SourcesPage },
  { path: "/settings/profile", component: ProfilePage }
];
```

- [ ] **Step 4: 加交互断言**

```ts
it("posts provider settings and shows success message", async () => {
  const saveProviderSettings = vi.fn(async () => ({ ok: true }));
  vi.mocked(await import("../../src/client/services/settingsApi")).saveProviderSettings = saveProviderSettings;

  const wrapper = mount(ViewRulesPage);
  await flushPromises();

  await wrapper.find('input[type="password"]').setValue("secret-key");
  await wrapper.find("form").trigger("submit");
  await flushPromises();

  expect(saveProviderSettings).toHaveBeenCalled();
});
```

Run: `npx vitest run tests/client/viewRulesPage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/services/settingsApi.ts src/client/pages/settings/ViewRulesPage.vue src/client/components/domain/ProviderSettingsPanel.vue src/client/components/domain/NlRulesEditor.vue src/client/components/domain/NumericRulesPanel.vue src/client/components/domain/FeedbackPoolPanel.vue src/client/components/domain/StrategyDraftsPanel.vue src/client/router.ts tests/client/viewRulesPage.test.ts
git commit -m "feat: 迁移策略工作台到 Vue"
```

## Task 6: 迁移 `/settings/sources` 与 `/settings/profile`

**Files:**
- Create: `src/client/pages/settings/SourcesPage.vue`
- Create: `src/client/pages/settings/ProfilePage.vue`
- Create: `src/client/components/domain/SourcesSummaryPanel.vue`
- Create: `src/client/components/domain/SourceInventoryTable.vue`
- Create: `src/client/components/domain/ManualCollectionPanel.vue`
- Create: `src/client/components/domain/ManualSendLatestEmailPanel.vue`
- Create: `src/client/components/domain/ProfileSummaryCard.vue`
- Test: `tests/client/sourcesPage.test.ts`
- Test: `tests/client/profilePage.test.ts`

- [ ] **Step 1: 写 sources/profile 失败测试**

```ts
import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import SourcesPage from "../../src/client/pages/settings/SourcesPage.vue";
import ProfilePage from "../../src/client/pages/settings/ProfilePage.vue";

vi.mock("../../src/client/services/settingsApi", () => ({
  fetchSourcesPage: vi.fn(async () => ({
    sources: [{ kind: "juya", name: "Juya AI Daily", isEnabled: true, rssUrl: "", lastCollectedAt: null, lastCollectionStatus: null }],
    summary: { lastCollectionRunAt: null, lastSendLatestEmailAt: null },
    isRunning: false
  })),
  fetchProfilePage: vi.fn(async () => ({
    username: "admin",
    displayName: "Admin",
    role: "admin",
    email: null,
    loggedIn: true
  }))
}));

describe("SourcesPage", () => {
  it("renders source inventory table", async () => {
    const wrapper = mount(SourcesPage);
    await flushPromises();
    expect(wrapper.text()).toContain("Juya AI Daily");
  });
});

describe("ProfilePage", () => {
  it("renders current user profile", async () => {
    const wrapper = mount(ProfilePage);
    await flushPromises();
    expect(wrapper.text()).toContain("Admin");
  });
});
```

Run: `npx vitest run tests/client/sourcesPage.test.ts tests/client/profilePage.test.ts`
Expected: FAIL，页面与 domain 组件尚不存在

- [ ] **Step 2: 扩展 settingsApi**

```ts
export function fetchSourcesPage() {
  return readJson("/api/settings/sources");
}

export function fetchProfilePage() {
  return readJson("/api/settings/profile");
}

export function toggleSource(kind: string, enable: boolean) {
  return readJson("/actions/sources/toggle", {
    method: "POST",
    body: JSON.stringify({ kind, enable })
  });
}

export function triggerManualCollect() {
  return readJson("/actions/collect", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function triggerManualSendLatestEmail() {
  return readJson("/actions/send-latest-email", {
    method: "POST",
    body: JSON.stringify({})
  });
}
```

- [ ] **Step 3: 实现两个页面**

```vue
<!-- src/client/pages/settings/SourcesPage.vue -->
<template>
  <UnifiedShellLayout>
    <PageHeader title="数据迭代收集" description="管理 RSS 数据源、抓取结果和手动动作。" />
    <a-space direction="vertical" size="large" style="width: 100%">
      <SourcesSummaryPanel :summary="data?.summary" :is-running="data?.isRunning ?? false" />
      <SourceInventoryTable :sources="data?.sources ?? []" />
      <a-row :gutter="16">
        <a-col :span="12"><ManualCollectionPanel /></a-col>
        <a-col :span="12"><ManualSendLatestEmailPanel /></a-col>
      </a-row>
    </a-space>
  </UnifiedShellLayout>
</template>
```

```vue
<!-- src/client/pages/settings/ProfilePage.vue -->
<template>
  <UnifiedShellLayout>
    <PageHeader title="当前登录用户" description="查看当前账号资料与登录状态。" />
    <ProfileSummaryCard :profile="data" />
  </UnifiedShellLayout>
</template>
```

- [ ] **Step 4: 给 source 开关和手动动作补断言**

```ts
it("posts source toggle and collect actions", async () => {
  const toggleSource = vi.fn(async () => ({ ok: true }));
  const triggerManualCollect = vi.fn(async () => ({ accepted: true }));

  vi.mocked(await import("../../src/client/services/settingsApi")).toggleSource = toggleSource;
  vi.mocked(await import("../../src/client/services/settingsApi")).triggerManualCollect = triggerManualCollect;

  const wrapper = mount(SourcesPage);
  await flushPromises();

  await wrapper.find('[data-testid="toggle-source-juya"]').trigger("click");
  await wrapper.find('[data-testid="manual-collect"]').trigger("click");

  expect(toggleSource).toHaveBeenCalled();
  expect(triggerManualCollect).toHaveBeenCalled();
});
```

Run: `npx vitest run tests/client/sourcesPage.test.ts tests/client/profilePage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/pages/settings/SourcesPage.vue src/client/pages/settings/ProfilePage.vue src/client/components/domain/SourcesSummaryPanel.vue src/client/components/domain/SourceInventoryTable.vue src/client/components/domain/ManualCollectionPanel.vue src/client/components/domain/ManualSendLatestEmailPanel.vue src/client/components/domain/ProfileSummaryCard.vue src/client/services/settingsApi.ts tests/client/sourcesPage.test.ts tests/client/profilePage.test.ts
git commit -m "feat: 迁移 sources 与 profile 系统页"
```

## Task 7: 收口文档、命令与最终验证

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `scripts/dev-local.sh`
- Modify: `package.json`
- Test: `tests/client/*.test.ts`
- Test: `tests/server/createServer.test.ts`
- Test: `tests/server/settingsApiRoutes.test.ts`

- [ ] **Step 1: 调整 `dev:local` 单端口 smoke 逻辑**

```zsh
#!/bin/zsh

set -euo pipefail

if [ ! -f .env.local ]; then
  echo ".env.local not found. Create it before running npm run dev:local." >&2
  exit 1
fi

set -a
. ./.env.local
set +a

port="${PORT:-3030}"
listen_pids="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"

npm run build:client

if [ -n "${listen_pids}" ]; then
  echo "Port ${port} is already in use. Asking existing listener(s) to exit cleanly: ${listen_pids}"
  kill ${=listen_pids} 2>/dev/null || true

  for _ in {1..20}; do
    remaining_pids="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"
    if [ -z "${remaining_pids}" ]; then
      break
    fi
    sleep 0.5
  done

  remaining_pids="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "${remaining_pids}" ]; then
    echo "Port ${port} is still busy. Force stopping listener(s): ${remaining_pids}"
    kill -9 ${=remaining_pids}
    sleep 1
  fi
fi

exec tsx watch src/main.ts
```

Expected: `dev:local` 继续面向单端口 smoke，但先确保系统页有可用的 client 产物

- [ ] **Step 2: 更新 README 和 AGENTS**

```md
- 当前技术栈新增：`Vite`、`Vue 3`、`Vue Router`、`Ant Design Vue`
- `npm run dev`：并行启动 Fastify 与 Vite，Vite proxy `/api`、`/actions`、`/login`、`/logout`、`/health`
- `npm run dev:local`：先构建 client，再以单端口方式运行 Fastify
- `/settings/*` 现已由 Vue 3 + Ant Design Vue 渲染；内容页和 legacy 页面仍保留原实现
```

Expected: 文档与真实运行方式保持一致

- [ ] **Step 3: 跑前后端相关验证**

Run: `npx vitest run tests/client/appShell.test.ts tests/client/useTheme.test.ts tests/client/viewRulesPage.test.ts tests/client/sourcesPage.test.ts tests/client/profilePage.test.ts tests/server/createServer.test.ts tests/server/settingsApiRoutes.test.ts`
Expected: PASS

- [ ] **Step 4: 跑完整构建**

Run: `npm run build`
Expected: PASS，生成后端产物和 `dist/client/*`

- [ ] **Step 5: 最终提交**

```bash
git add README.md AGENTS.md scripts/dev-local.sh package.json package-lock.json
git commit -m "docs: 更新 Vue 系统页开发说明"
```

## Self-Review Checklist

- [ ] Spec coverage
  - `Vue 3 + Vite + Ant Design Vue`：Task 1
  - `/settings/*` 切前端入口：Task 2
  - `/api/settings/*`：Task 3
  - 统一壳层和主题：Task 4
  - `ViewRulesPage`：Task 5
  - `SourcesPage` / `ProfilePage`：Task 6
  - 文档、命令、验证：Task 7
- [ ] Placeholder scan
  - 搜索 `TODO|TBD|以后再说|类似 Task`，确保计划内没有占位语
- [ ] Type consistency
  - `fetchViewRulesPage` / `fetchSourcesPage` / `fetchProfilePage`
  - `ProviderSettingsPanel` / `NlRulesEditor` / `SourceInventoryTable`
  - `/api/settings/*` 与 `/actions/*` 的命名在所有任务里保持一致
