# HotNow Mobile Top Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 HotNow 移动端 unified shell 从“整块顶部导航卡片”收口成“内容 tabs + 系统抽屉入口”的低高度 sticky 顶栏，同时保持桌面端结构与现有路由不变。

**Architecture:** 继续沿用 Fastify SSR + 原生 CSS + 轻量浏览器脚本的现有结构。`renderAppLayout.ts` 负责输出移动端专用的顶部导航 DOM，`site.css` 在移动断点下将其渲染为 sticky 浮层并隐藏原侧栏 `nav-group`，`site.js` 负责 `系统菜单` 抽屉的开关、点击外部关闭和切换内容页前收起。

**Tech Stack:** TypeScript, Fastify SSR templates, plain CSS, plain browser JavaScript, Vitest, JSDOM

---

## File Map

- Modify: `src/server/renderAppLayout.ts`
  - 新增移动端顶部导航结构。
  - 保留桌面端侧边栏品牌块、页面摘要、主题、账号区结构不变。
- Modify: `src/server/public/site.css`
  - 新增移动端顶部 sticky 导航、内容 tabs、系统按钮、系统抽屉样式。
  - 在移动断点隐藏侧边栏里的原 `nav-group`，避免重复导航。
- Modify: `src/server/public/site.js`
  - 新增系统抽屉开关逻辑。
  - 处理点击外部收起、点击内容导航前收起。
- Modify: `tests/server/contentRoutes.test.ts`
  - 锁定移动端导航 SSR 结构。
  - 锁定公开访问模式下不渲染系统菜单按钮/抽屉。
- Modify: `tests/server/reportPages.test.ts`
  - 锁定 CSS 资产中移动端 sticky 顶栏与抽屉关键规则。
- Modify: `tests/server/siteThemeClient.test.ts`
  - 为 `site.js` 增加抽屉开关与点击外部关闭的交互测试。

### Task 1: 重写 SSR 顶部导航结构

**Files:**
- Modify: `src/server/renderAppLayout.ts`
- Test: `tests/server/contentRoutes.test.ts`

- [ ] **Step 1: 写 SSR 结构测试，让移动端顶部导航契约先失败**

```ts
it("renders a compact mobile top nav with content tabs and a system drawer trigger", async () => {
  const app = createServer({
    listContentView: vi.fn().mockResolvedValue([]),
    listRatingDimensions: vi.fn().mockResolvedValue([])
  } as never);

  const response = await app.inject({ method: "GET", url: "/" });

  expect(response.statusCode).toBe(200);
  expect(response.body).toContain('class="mobile-top-nav"');
  expect(response.body).toContain('class="mobile-top-nav-tabs"');
  expect(response.body).toContain('class="mobile-top-tab mobile-top-tab--content is-active" href="/"');
  expect(response.body).toContain('data-mobile-system-toggle');
  expect(response.body).toContain('aria-expanded="false"');
  expect(response.body).toContain('data-mobile-system-drawer');
  expect(response.body).toContain('hidden');
});

it("omits the mobile system drawer trigger when system navigation is hidden", async () => {
  const app = createServer({
    auth: {
      requireLogin: true,
      sessionSecret: "test-secret"
    },
    listContentView: vi.fn().mockResolvedValue([]),
    listRatingDimensions: vi.fn().mockResolvedValue([])
  } as never);

  const response = await app.inject({ method: "GET", url: "/" });

  expect(response.statusCode).toBe(200);
  expect(response.body).toContain('class="mobile-top-nav"');
  expect(response.body).not.toContain('data-mobile-system-toggle');
  expect(response.body).not.toContain('data-mobile-system-drawer');
});
```

- [ ] **Step 2: 跑测试，确认它先因为新结构不存在而失败**

Run: `npx vitest run tests/server/contentRoutes.test.ts`

Expected: FAIL，报错包含 `mobile-top-nav` 或 `data-mobile-system-toggle` not found。

- [ ] **Step 3: 在模板里输出新的移动端顶栏 DOM**

```ts
function renderMobileTopNav(currentPath: string, showSystemMenu: boolean): string {
  const contentPages = appShellPages.filter((page) => page.section === "content");
  const systemPages = appShellPages.filter((page) => page.section === "system");
  const contentTabs = contentPages
    .map((page) => {
      const activeClass = page.path === currentPath ? " is-active" : "";
      return `<a class="mobile-top-tab mobile-top-tab--content${activeClass}" href="${escapeHtml(page.path)}">${escapeHtml(page.title)}</a>`;
    })
    .join("");
  const systemDrawer = showSystemMenu
    ? `
      <button
        type="button"
        class="mobile-top-system-toggle"
        data-mobile-system-toggle
        aria-expanded="false"
        aria-controls="mobile-system-drawer"
      >
        系统菜单
      </button>
      <div id="mobile-system-drawer" class="mobile-system-drawer" data-mobile-system-drawer hidden>
        ${systemPages
          .map((page) => `<a class="mobile-system-link" href="${escapeHtml(page.path)}">${escapeHtml(page.title)}</a>`)
          .join("")}
      </div>
    `
    : "";

  return `
    <div class="mobile-top-nav">
      <div class="mobile-top-nav-bar">
        <nav class="mobile-top-nav-tabs" aria-label="内容菜单">
          ${contentTabs}
        </nav>
        ${systemDrawer}
      </div>
    </div>
  `;
}
```

```ts
export function renderAppLayout(view: AppShellView): string {
  const contentLinks = renderNavGroup(appShellPages.filter((page) => page.section === "content"), view.currentPath);
  const systemLinks = renderNavGroup(appShellPages.filter((page) => page.section === "system"), view.currentPath);
  const showSystemMenu = view.showSystemMenu ?? true;
  const pageContent = view.contentHtml ?? renderPlaceholder(view.page.description);
  const sidebarPageSummary = renderSidebarPageSummary(view.page);
  const sidebarAccount = renderSidebarAccount(view.user, view.loginHref);
  const mobileTopNav = renderMobileTopNav(view.currentPath, showSystemMenu);

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
    ${mobileTopNav}
    <div class="shell-root">
      <aside class="shell-sidebar shell-sidebar--editorial">
        <div class="brand-block brand-block--masthead">
          <p class="brand-kicker">HotNow Editorial Desk</p>
          <h1 class="brand-title">HotNow</h1>
          <p class="brand-description">多源热点、筛选策略与投递动作在同一编辑台内完成。</p>
        </div>
        ${sidebarPageSummary}
        <nav class="nav-group nav-group--content">
          <p class="nav-title">内容菜单</p>
          ${contentLinks}
        </nav>
        ${showSystemMenu ? `<nav class="nav-group nav-group--system">
          <p class="nav-title">系统菜单</p>
          ${systemLinks}
        </nav>` : ""}
        <div class="sidebar-footer">
          <section class="theme-dock" data-theme-toggle>
            <p class="theme-dock-title">界面主题</p>
            <div class="theme-switch" role="group" aria-label="界面主题切换">
              <button type="button" class="theme-switch-button" data-theme-choice="dark" aria-pressed="true">深色模式</button>
              <button type="button" class="theme-switch-button" data-theme-choice="light" aria-pressed="false">浅色模式</button>
            </div>
          </section>
          ${sidebarAccount}
        </div>
      </aside>
      <div class="shell-main">
        <main class="shell-content">
          ${pageContent}
        </main>
      </div>
    </div>
  </body>
</html>`;
}
```

- [ ] **Step 4: 跑测试，确认模板结构通过**

Run: `npx vitest run tests/server/contentRoutes.test.ts`

Expected: PASS，`content routes` 全绿。

- [ ] **Step 5: Commit**

```bash
git add src/server/renderAppLayout.ts tests/server/contentRoutes.test.ts
git commit -m "feat: add mobile top nav shell structure"
```

### Task 2: 把移动端样式收口为低高度 sticky 顶栏

**Files:**
- Modify: `src/server/public/site.css`
- Test: `tests/server/reportPages.test.ts`

- [ ] **Step 1: 先写 CSS 资产测试，锁定 sticky 顶栏和移动端隐藏旧导航**

```ts
it("ships mobile top nav sticky rules in the shared CSS asset", async () => {
  const app = createServer({} as never);

  const response = await app.inject({ method: "GET", url: "/assets/site.css" });

  expect(response.statusCode).toBe(200);
  expect(response.body).toContain(".mobile-top-nav {");
  expect(response.body).toContain("position: sticky;");
  expect(response.body).toContain(".mobile-top-nav-tabs {");
  expect(response.body).toContain("overflow-x: auto;");
  expect(response.body).toContain(".mobile-system-drawer {");
  expect(response.body).toContain(".shell-sidebar .nav-group {");
  expect(response.body).toContain("display: none;");
});
```

- [ ] **Step 2: 跑测试，确认 CSS 规则还没落地时先失败**

Run: `npx vitest run tests/server/reportPages.test.ts`

Expected: FAIL，报错包含 `.mobile-top-nav {` 或 `overflow-x: auto;` not found。

- [ ] **Step 3: 实现移动端 sticky 顶栏、横向 tabs 和系统抽屉样式**

```css
.mobile-top-nav {
  display: none;
}

@media (max-width: 900px) {
  .mobile-top-nav {
    position: sticky;
    top: 0;
    z-index: 30;
    display: block;
    padding: 10px 14px 6px;
    background:
      linear-gradient(180deg, rgba(244, 237, 227, 0.94), rgba(244, 237, 227, 0.82) 72%, transparent);
    backdrop-filter: blur(16px);
  }

  .mobile-top-nav-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
    border: 1px solid var(--border-sidebar-soft);
    border-radius: 20px;
    background: rgba(251, 247, 241, 0.88);
    box-shadow: var(--shadow-card);
  }

  .mobile-top-nav-tabs {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .mobile-top-nav-tabs::-webkit-scrollbar {
    display: none;
  }

  .mobile-top-tab,
  .mobile-top-system-toggle {
    min-height: 36px;
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid var(--border-sidebar-soft);
    font-size: 13px;
    font-weight: 600;
  }

  .mobile-top-tab {
    white-space: nowrap;
    background: rgba(255, 255, 255, 0.34);
    color: var(--text-sidebar);
  }

  .mobile-top-tab.is-active {
    color: var(--text-on-accent);
    background: var(--bg-link-active);
    border-color: transparent;
    box-shadow: var(--shadow-accent);
  }

  .mobile-top-system-toggle {
    background: rgba(255, 106, 42, 0.08);
    color: var(--signal-orange);
  }

  .mobile-top-system-toggle[aria-expanded="true"] {
    color: var(--text-on-accent);
    background: linear-gradient(135deg, var(--signal-orange), #ff8a54);
    border-color: transparent;
  }

  .mobile-system-drawer {
    grid-column: 1 / -1;
    display: grid;
    gap: 8px;
    padding-top: 8px;
  }

  .mobile-system-link {
    display: flex;
    align-items: center;
    min-height: 40px;
    padding: 10px 12px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.38);
    border: 1px solid rgba(255, 106, 42, 0.12);
    color: var(--text-sidebar);
    font-weight: 600;
  }

  .shell-sidebar .nav-group {
    display: none;
  }

  .shell-root {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .mobile-top-nav {
    padding: 8px 12px 4px;
  }

  .mobile-top-nav-bar {
    padding: 8px 10px;
    gap: 8px;
  }

  .mobile-top-tab,
  .mobile-top-system-toggle {
    min-height: 34px;
    padding: 7px 12px;
    font-size: 12px;
  }
}
```

- [ ] **Step 4: 跑 CSS 资产测试和构建**

Run: `npx vitest run tests/server/reportPages.test.ts && npm run build`

Expected: PASS，Vitest 通过，`tsc -p tsconfig.json` 无报错。

- [ ] **Step 5: Commit**

```bash
git add src/server/public/site.css tests/server/reportPages.test.ts
git commit -m "feat: style mobile top nav as sticky compact dock"
```

### Task 3: 给系统抽屉补浏览器端交互

**Files:**
- Modify: `src/server/public/site.js`
- Test: `tests/server/siteThemeClient.test.ts`

- [ ] **Step 1: 先写 JSDOM 测试，锁定抽屉开关和点击外部关闭**

```ts
it("toggles the mobile system drawer and closes it when clicking outside", () => {
  const dom = new JSDOM(
    `<!doctype html>
<html data-theme="dark">
  <body>
    <div class="mobile-top-nav">
      <div class="mobile-top-nav-bar">
        <nav class="mobile-top-nav-tabs">
          <a class="mobile-top-tab is-active" href="/">热点资讯</a>
        </nav>
        <button
          type="button"
          class="mobile-top-system-toggle"
          data-mobile-system-toggle
          aria-expanded="false"
          aria-controls="mobile-system-drawer"
        >
          系统菜单
        </button>
        <div id="mobile-system-drawer" class="mobile-system-drawer" data-mobile-system-drawer hidden>
          <a class="mobile-system-link" href="/settings/view-rules">筛选策略</a>
        </div>
      </div>
    </div>
  </body>
</html>`,
    {
      url: "https://example.test/",
      runScripts: "outside-only"
    }
  );

  const { window } = dom;
  window.eval(siteScript);

  const toggle = window.document.querySelector("[data-mobile-system-toggle]");
  const drawer = window.document.querySelector("[data-mobile-system-drawer]");

  toggle?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  expect(toggle?.getAttribute("aria-expanded")).toBe("true");
  expect(drawer?.hasAttribute("hidden")).toBe(false);

  window.document.body.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  expect(toggle?.getAttribute("aria-expanded")).toBe("false");
  expect(drawer?.hasAttribute("hidden")).toBe(true);
});
```

- [ ] **Step 2: 跑测试，确认交互逻辑还不存在时先失败**

Run: `npx vitest run tests/server/siteThemeClient.test.ts`

Expected: FAIL，报错包含 `aria-expanded` expected `true` or drawer hidden state mismatch。

- [ ] **Step 3: 在现有 document click 逻辑里补系统抽屉状态机**

```js
  root.addEventListener("click", async (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const mobileSystemToggle = target.closest("[data-mobile-system-toggle]");

    if (mobileSystemToggle instanceof HTMLButtonElement) {
      event.preventDefault();
      toggleMobileSystemDrawer(mobileSystemToggle);
      return;
    }

    if (target.closest(".mobile-top-tab")) {
      closeMobileSystemDrawer();
      return;
    }

    if (target.closest(".mobile-system-link")) {
      closeMobileSystemDrawer();
      return;
    }

    if (!target.closest(".mobile-top-nav")) {
      closeMobileSystemDrawer();
    }

    const themeButton = target.closest("[data-theme-choice]");
    if (themeButton instanceof HTMLButtonElement) {
      event.preventDefault();
      setTheme(themeButton.dataset.themeChoice || "dark");
      return;
    }

    const button = target.closest("[data-content-action]");

    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const card = button.closest("[data-content-id]");

    if (!(card instanceof HTMLElement)) {
      return;
    }

    const contentId = Number(card.dataset.contentId);

    if (!Number.isInteger(contentId) || contentId <= 0) {
      return;
    }

    const action = button.dataset.contentAction;

    if (action === "favorite") {
      event.preventDefault();
      await handleFavorite(button, contentId);
      return;
    }

    if (action === "reaction") {
      event.preventDefault();
      await handleReaction(card, button, contentId);
    }
  });

  function toggleMobileSystemDrawer(toggleButton) {
    const drawer = root.querySelector("[data-mobile-system-drawer]");
    const nextExpanded = toggleButton.getAttribute("aria-expanded") !== "true";

    if (!(drawer instanceof HTMLElement)) {
      return;
    }

    toggleButton.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
    drawer.toggleAttribute("hidden", !nextExpanded);
  }

  function closeMobileSystemDrawer() {
    const drawer = root.querySelector("[data-mobile-system-drawer]");
    const toggleButton = root.querySelector("[data-mobile-system-toggle]");

    if (drawer instanceof HTMLElement) {
      drawer.setAttribute("hidden", "");
    }

    if (toggleButton instanceof HTMLButtonElement) {
      toggleButton.setAttribute("aria-expanded", "false");
    }
  }
```

- [ ] **Step 4: 跑前端脚本测试**

Run: `npx vitest run tests/server/siteThemeClient.test.ts`

Expected: PASS，主题测试与抽屉交互测试都通过。

- [ ] **Step 5: Commit**

```bash
git add src/server/public/site.js tests/server/siteThemeClient.test.ts
git commit -m "feat: add mobile system drawer interactions"
```

### Task 4: 做一轮聚焦回归和移动端 smoke check

**Files:**
- Test: `tests/server/contentRoutes.test.ts`
- Test: `tests/server/reportPages.test.ts`
- Test: `tests/server/siteThemeClient.test.ts`

- [ ] **Step 1: 跑全部最相关自动化验证**

Run:

```bash
npx vitest run \
  tests/server/contentRoutes.test.ts \
  tests/server/reportPages.test.ts \
  tests/server/siteThemeClient.test.ts
```

Expected: PASS，所有相关用例通过。

- [ ] **Step 2: 跑构建，确认 SSR 模板和浏览器脚本没有类型/打包回归**

Run: `npm run build`

Expected: PASS，`tsc -p tsconfig.json` 成功退出。

- [ ] **Step 3: 做一次移动端手动 smoke check**

Run:

```bash
npm run dev:local
```

Manual check:

```text
1. 打开移动端宽度视口（390px 左右）。
2. 确认顶部只剩一条低高度 sticky 顶栏。
3. 确认内容 tabs 单行横向排列，可直接切换 `/`、`/articles`、`/ai`。
4. 确认点击“系统菜单”后只展开一个轻量抽屉，不出现整块大卡片。
5. 确认公开访问模式下，顶部不出现系统菜单按钮。
6. 确认桌面端左侧侧边栏导航没有回归。
```

- [ ] **Step 4: 记录结果并准备收口**

```text
- 如果 smoke 通过：记录“移动端顶部导航已切为内容 tabs + 系统抽屉入口”。
- 如果 smoke 失败：回到对应任务，先修结构/样式/交互，再重跑相关测试。
```

- [ ] **Step 5: Commit**

```bash
git add src/server/renderAppLayout.ts src/server/public/site.css src/server/public/site.js \
  tests/server/contentRoutes.test.ts tests/server/reportPages.test.ts tests/server/siteThemeClient.test.ts
git commit -m "feat: refine mobile navigation into top tabs and system drawer"
```
