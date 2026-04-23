# HotNow Cyber Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 HotNow 统一站点升级为具备赛博实验感的双主题界面，并支持在左侧导航底部手动切换深色/浅色模式且本地持久化。

**Architecture:** 继续沿用当前 Fastify SSR + 原生 CSS + 少量浏览器端 JS 的结构。主题通过根节点 `data-theme` 和双主题 CSS token 驱动，站点壳层、内容卡片、系统卡片和 legacy 页面共用同一套视觉变量，浏览器端通过 `localStorage` 记住主题选择。

**Tech Stack:** TypeScript, Fastify SSR, plain CSS, browser localStorage, Vitest, Playwright MCP for visual QA

---

### Task 1: 建立统一壳层的主题切换骨架

**Files:**
- Modify: `src/server/renderAppLayout.ts`
- Test: `tests/server/contentRoutes.test.ts`

- [ ] **Step 1: 先写壳层主题切换的失败断言**

```ts
it("renders a sidebar theme switcher in the unified shell", async () => {
  const app = createServer({
    listContentView: vi.fn().mockResolvedValue([]),
    listRatingDimensions: vi.fn().mockResolvedValue([])
  } as never);

  const response = await app.inject({ method: "GET", url: "/" });

  expect(response.statusCode).toBe(200);
  expect(response.body).toContain('data-theme-toggle');
  expect(response.body).toContain("浅色模式");
  expect(response.body).toContain("深色模式");
});
```

- [ ] **Step 2: 运行测试确认当前还没有主题切换骨架**

Run: `npx vitest run tests/server/contentRoutes.test.ts`

Expected: FAIL，提示页面 HTML 中找不到 `data-theme-toggle`

- [ ] **Step 3: 在统一壳层里加入赛博品牌区和导航底部主题切换器**

```ts
const themeControl = `
  <section class="theme-dock" data-theme-toggle>
    <p class="theme-dock-title">界面主题</p>
    <div class="theme-switch" role="group" aria-label="界面主题切换">
      <button type="button" class="theme-switch-button" data-theme-choice="dark">深色模式</button>
      <button type="button" class="theme-switch-button" data-theme-choice="light">浅色模式</button>
    </div>
  </section>
`;

return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(view.page.title)} | HotNow</title>
    <link rel="stylesheet" href="/assets/site.css" />
    <script src="/assets/site.js" defer></script>
  </head>
  <body class="shell-page">
    <div class="shell-root">
      <aside class="shell-sidebar">
        <div class="brand-block">
          <p class="brand-kicker">HotNow Signal Grid</p>
          <h1 class="brand-title">Cyber Intelligence Console</h1>
          <p class="brand-description">科技内容、采集状态与操作控制在同一控制台内完成。</p>
        </div>
        <nav class="nav-group">
          <p class="nav-title">内容菜单</p>
          ${contentLinks}
        </nav>
        <nav class="nav-group">
          <p class="nav-title">系统菜单</p>
          ${systemLinks}
        </nav>
        <div class="sidebar-footer">
          ${themeControl}
        </div>
      </aside>
```

- [ ] **Step 4: 回跑壳层测试**

Run: `npx vitest run tests/server/contentRoutes.test.ts`

Expected: PASS

- [ ] **Step 5: 提交壳层主题骨架**

```bash
git add src/server/renderAppLayout.ts tests/server/contentRoutes.test.ts
git commit -m "feat: add unified shell theme switch scaffold"
```

### Task 2: 实现主题切换与本地持久化

**Files:**
- Modify: `src/server/public/site.js`
- Modify: `src/server/renderAppLayout.ts`
- Test: `tests/server/contentRoutes.test.ts`

- [ ] **Step 1: 补主题初始化相关断言**

```ts
it("loads the shared site script for unified shell pages", async () => {
  const app = createServer({
    listContentView: vi.fn().mockResolvedValue([]),
    listRatingDimensions: vi.fn().mockResolvedValue([])
  } as never);

  const response = await app.inject({ method: "GET", url: "/" });

  expect(response.body).toContain('/assets/site.js');
  expect(response.body).toContain('data-theme="dark"');
});
```

- [ ] **Step 2: 运行测试确认主题根节点和脚本约定存在**

Run: `npx vitest run tests/server/contentRoutes.test.ts`

Expected: PASS 或在后续骨架修正后 PASS；如果 FAIL，先补齐根节点 `data-theme`

- [ ] **Step 3: 在浏览器脚本里增加主题读写逻辑**

```js
(function () {
  const root = document;
  const storageKey = "hot-now-theme";
  const themeRoot = document.documentElement;

  applyInitialTheme();

  root.addEventListener("click", async (event) => {
    const target = event.target;
    if (target instanceof HTMLElement) {
      const themeButton = target.closest("[data-theme-choice]");
      if (themeButton instanceof HTMLButtonElement) {
        event.preventDefault();
        setTheme(themeButton.dataset.themeChoice);
        return;
      }
    }
  });

  function applyInitialTheme() {
    const savedTheme = readStoredTheme();
    setTheme(savedTheme || "dark", false);
  }

  function setTheme(theme, persist = true) {
    const nextTheme = theme === "light" ? "light" : "dark";
    themeRoot.dataset.theme = nextTheme;
    syncThemeButtons(nextTheme);
    if (persist) {
      localStorage.setItem(storageKey, nextTheme);
    }
  }
})();
```

- [ ] **Step 4: 把主题按钮做成有选中态的语义结构**

```ts
<button
  type="button"
  class="theme-switch-button"
  data-theme-choice="dark"
  aria-pressed="true"
>
  深色模式
</button>
```

- [ ] **Step 5: 跑相关测试，确保现有内容交互不回归**

Run: `npx vitest run tests/server/contentRoutes.test.ts tests/server/systemRoutes.test.ts`

Expected: PASS

- [ ] **Step 6: 提交主题切换运行时逻辑**

```bash
git add src/server/public/site.js src/server/renderAppLayout.ts tests/server/contentRoutes.test.ts
git commit -m "feat: persist manual theme switching in unified shell"
```

### Task 3: 重建双主题 CSS token 和赛博壳层样式

**Files:**
- Modify: `src/server/public/site.css`

- [ ] **Step 1: 先整理双主题 token 区域**

```css
:root {
  color-scheme: dark;
  --font-ui: "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif;
  --radius-lg: 22px;
  --radius-md: 16px;
  --shadow-panel: 0 18px 48px rgba(4, 12, 24, 0.28);
}

html[data-theme="dark"] {
  --bg-page: #07111f;
  --bg-shell: rgba(9, 18, 32, 0.78);
  --bg-panel: rgba(10, 24, 42, 0.82);
  --bg-sidebar: linear-gradient(180deg, #08111f 0%, #0a1830 100%);
  --line-strong: rgba(79, 209, 197, 0.34);
  --text-main: #ebf5ff;
  --text-muted: #8ca3bf;
  --accent: #52e5ff;
  --accent-strong: #53f3c3;
}

html[data-theme="light"] {
  color-scheme: light;
  --bg-page: #e8eef6;
  --bg-shell: rgba(248, 252, 255, 0.88);
  --bg-panel: rgba(255, 255, 255, 0.82);
  --bg-sidebar: linear-gradient(180deg, #edf7ff 0%, #dfeeff 100%);
  --line-strong: rgba(34, 116, 255, 0.18);
  --text-main: #0f172a;
  --text-muted: #5b6c86;
  --accent: #0ea5e9;
  --accent-strong: #0f766e;
}
```

- [ ] **Step 2: 强化壳层背景、导航和顶部面板**

```css
body {
  margin: 0;
  font-family: var(--font-ui);
  color: var(--text-main);
  background:
    radial-gradient(circle at top left, rgba(82, 229, 255, 0.16), transparent 28%),
    radial-gradient(circle at bottom right, rgba(83, 243, 195, 0.12), transparent 24%),
    linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0)),
    var(--bg-page);
}

.shell-sidebar,
.shell-header,
.content-card,
.system-card,
.placeholder-card {
  backdrop-filter: blur(20px);
  box-shadow: var(--shadow-panel);
}
```

- [ ] **Step 3: 让主题切换器、按钮和状态控件进入统一赛博风格**

```css
.theme-switch-button,
.primary-mini-button,
.ghost-button,
.action-chip {
  border: 1px solid var(--line-strong);
  background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
}

.theme-switch-button[aria-pressed="true"] {
  color: #03111d;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
}
```

- [ ] **Step 4: 启动本地站点做第一轮视觉 smoke**

Run: `npm run dev:local`

Expected: 本地能打开 `http://127.0.0.1:3030/login`，统一站点基础布局未破

- [ ] **Step 5: 提交双主题样式系统**

```bash
git add src/server/public/site.css
git commit -m "feat: add cyber dual-theme visual system"
```

### Task 4: 强化内容页与系统页结构语义

**Files:**
- Modify: `src/server/renderContentPages.ts`
- Modify: `src/server/renderSystemPages.ts`
- Test: `tests/server/contentRoutes.test.ts`
- Test: `tests/server/systemRoutes.test.ts`

- [ ] **Step 1: 先给内容和系统页面补更稳定的语义断言**

```ts
expect(response.body).toContain("content-kicker");
expect(response.body).toContain("system-card");
expect(response.body).toContain("action-status");
```

- [ ] **Step 2: 运行相关测试确认现有语义覆盖不足**

Run: `npx vitest run tests/server/contentRoutes.test.ts tests/server/systemRoutes.test.ts`

Expected: 如果新类名还没接入则 FAIL；接入后 PASS

- [ ] **Step 3: 为内容页加入更强的信息分区**

```ts
return `
  <section class="content-intro content-intro--signal">
    <p class="content-kicker">内容菜单</p>
    <p class="content-description">${escapeHtml(pageSubtitle[view.viewKey])}</p>
  </section>
  <section class="content-stack content-stack--signal">
    ${cardsHtml}
  </section>
`;
```

- [ ] **Step 4: 为系统页加入控制台型模块结构**

```ts
return `
  <section class="content-intro content-intro--system">
    <p class="content-kicker">系统菜单</p>
    <p class="content-description">数据迭代收集：切换当前启用 source，并查看最近抓取状态。</p>
  </section>
  <section class="system-stack system-stack--control">
    ${renderManualCollectionCard(activeSource, options)}
    ${cardsHtml}
  </section>
`;
```

- [ ] **Step 5: 回归内容和系统页面测试**

Run: `npx vitest run tests/server/contentRoutes.test.ts tests/server/systemRoutes.test.ts`

Expected: PASS

- [ ] **Step 6: 提交页面结构增强**

```bash
git add src/server/renderContentPages.ts src/server/renderSystemPages.ts tests/server/contentRoutes.test.ts tests/server/systemRoutes.test.ts
git commit -m "feat: refine content and system page structure for cyber theme"
```

### Task 5: 让 legacy 页面轻量跟随新主题

**Files:**
- Modify: `src/server/renderPages.ts`
- Test: `tests/server/reportPages.test.ts`

- [ ] **Step 1: 补 legacy 页面主题接入断言**

```ts
it("renders the control page with shared site assets", async () => {
  const app = createServer({
    config: {
      report: { dataDir: "./data/reports", topN: 10, allowDegraded: true },
      schedule: { enabled: true, dailyTime: "08:00", timezone: "Asia/Shanghai" },
      manualRun: { enabled: true },
      smtp: { user: "sender@qq.com", to: "receiver@example.com" }
    },
    listReportSummaries: vi.fn().mockResolvedValue([]),
    readReportHtml: vi.fn(),
    triggerManualRun: vi.fn().mockResolvedValue({ accepted: true }),
    latestReportDate: vi.fn().mockResolvedValue(null)
  } as never);

  const response = await app.inject({ method: "GET", url: "/control" });
  expect(response.body).toContain('/assets/site.css');
  expect(response.body).toContain('/assets/site.js');
});
```

- [ ] **Step 2: 运行 legacy 页面测试确认当前还是裸 HTML**

Run: `npx vitest run tests/server/reportPages.test.ts`

Expected: FAIL，提示缺少共享样式和脚本资源

- [ ] **Step 3: 给 control/history/notice 页面接入 shared assets 和主题根节点**

```ts
return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>HotNow 控制台</title>
    <link rel="stylesheet" href="/assets/site.css" />
    <script src="/assets/site.js" defer></script>
  </head>
  <body class="legacy-page">
    <main class="legacy-shell">
      <section class="legacy-card">
        <h1>HotNow 控制台</h1>
        <p>每日执行时间：${escapeHtml(String(dailyTime))}</p>
      </section>
    </main>
  </body>
</html>`;
```

- [ ] **Step 4: 回跑 legacy 页面测试**

Run: `npx vitest run tests/server/reportPages.test.ts`

Expected: PASS

- [ ] **Step 5: 提交 legacy 页面轻量跟随**

```bash
git add src/server/renderPages.ts tests/server/reportPages.test.ts
git commit -m "feat: align legacy report pages with shared theme shell"
```

### Task 6: 用前端 MCP 工具做真实页面验收并同步文档

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: 补充主题切换和本地持久化说明**

```md
- 统一站点左侧导航底部支持深色 / 浅色主题切换
- 主题偏好保存在浏览器本地，不依赖数据库
- legacy `/history`、`/reports/:date`、`/control` 会轻量跟随当前主题样式
```

- [ ] **Step 2: 运行最终自动化验证**

Run:

```bash
npm run test
npm run build
npm run dev:local
```

Expected:

- `vitest` 全量通过
- `build` 成功
- 本地站点可启动到 `http://127.0.0.1:3030`

- [ ] **Step 3: 用前端 MCP 做真实页面验收**

Run:

```text
使用 Playwright / 浏览器 MCP：
- 登录 `/login`
- 验证 `/`、`/articles`、`/ai`、`/settings/view-rules`、`/settings/sources`、`/settings/profile`
- 切换到浅色主题并刷新，确认主题保持
- 切回深色主题并刷新，确认主题保持
- 打开 `/history` 和 `/control`，确认视觉跟随
```

Expected:

- 统一站点赛博主题成立
- 深浅主题切换稳定
- 业务交互和 legacy 页面不回归

- [ ] **Step 4: 提交文档与最终验证结果**

```bash
git add README.md AGENTS.md
git commit -m "docs: document cyber theme behavior and verification"
```
