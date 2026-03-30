# HotNow UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 HotNow unified shell 从“赛博控制台”升级为以浅色为母版的 `Editorial Signal Desk`，保留现有路由和交互语义，但重做品牌块、壳层、内容卡和系统页的视觉语言。

**Architecture:** 继续沿用当前 Fastify SSR + 原生 CSS + 少量浏览器端 JS 的实现模式，不引入前端框架或外部 UI 依赖。模板层通过 `renderAppLayout.ts`、`renderContentPages.ts`、`renderSystemPages.ts` 输出新的语义 class，样式层在 `site.css` 中重建 `paper / ink / signal` 主题 token，并用同一套 token 同时服务 unified shell 与 legacy 页面。

**Tech Stack:** TypeScript, Fastify SSR, plain CSS, browser localStorage theme runtime, Vitest, Playwright MCP for visual QA

---

## File Map

- Modify: `src/server/renderAppLayout.ts`
  - 把左侧品牌区从“赛博控制台”改为“报头式品牌块”，同时保留左侧导航与页面摘要区
- Modify: `src/server/renderContentPages.ts`
  - 为 `/`、`/articles`、`/ai` 建立“首页主卡 + 内容标准卡”的混合卡片体系
- Modify: `src/server/renderSystemPages.ts`
  - 把 `/settings/*` 的卡片和区块收敛成更精致、更务实的产品后台面板
- Modify: `src/server/public/site.css`
  - 重建浅色主导的设计 token、纸感分层材质、导航、卡片和响应式样式
- Modify: `tests/server/contentRoutes.test.ts`
  - 锁定壳层品牌文案和内容卡变体的 HTML 输出
- Modify: `tests/server/systemRoutes.test.ts`
  - 锁定系统页的工作台面板结构和轻量产品化卡片 class
- Modify: `tests/server/reportPages.test.ts`
  - 锁定共享 CSS 资产里的新 token，并确保 legacy wrapper 样式仍然保留
- Modify: `tests/server/siteThemeClient.test.ts`
  - 回归主题按钮与 localStorage 行为，确保样式刷新不破坏已有主题运行时
- Modify: `README.md`
  - 把“赛博双主题”更新为新的 `Editorial Signal Desk` 语义
- Modify: `AGENTS.md`
  - 更新项目内协作文档中关于主题风格的描述和当前阶段快照

### Task 1: 重写 unified shell 的品牌块与导航壳层

**Files:**
- Modify: `src/server/renderAppLayout.ts`
- Test: `tests/server/contentRoutes.test.ts`

- [ ] **Step 1: 先补壳层失败断言，锁定“报头式品牌块”而不是“赛博控制台”**

```ts
it("renders the unified shell with editorial masthead copy instead of cyber console copy", async () => {
  const app = createServer({
    listContentView: vi.fn().mockResolvedValue([]),
    listRatingDimensions: vi.fn().mockResolvedValue([])
  } as never);

  const response = await app.inject({ method: "GET", url: "/" });

  expect(response.statusCode).toBe(200);
  expect(response.body).toContain('class="brand-block brand-block--masthead"');
  expect(response.body).toContain("HotNow Editorial Desk");
  expect(response.body).toContain("HotNow");
  expect(response.body).toContain("多源热点、筛选策略与投递动作在同一编辑台内完成。");
  expect(response.body).not.toContain("Cyber Intelligence Console");
  expect(response.body).not.toContain("HotNow Signal Grid");
});
```

- [ ] **Step 2: 跑壳层测试，确认当前文案和 class 仍然是旧的赛博版本**

Run: `npx vitest run tests/server/contentRoutes.test.ts`

Expected: FAIL，提示缺少 `brand-block--masthead` 或仍然存在 `Cyber Intelligence Console`

- [ ] **Step 3: 在壳层模板里把品牌区改成轻报头，并给导航补 section 语义 class**

```ts
const themeControl = `
  <section class="theme-dock" data-theme-toggle>
    <p class="theme-dock-title">界面主题</p>
    <div class="theme-switch" role="group" aria-label="界面主题切换">
      <button type="button" class="theme-switch-button" data-theme-choice="dark" aria-pressed="true">深色模式</button>
      <button type="button" class="theme-switch-button" data-theme-choice="light" aria-pressed="false">浅色模式</button>
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
      <aside class="shell-sidebar shell-sidebar--editorial">
        <div class="brand-block brand-block--masthead">
          <p class="brand-kicker">HotNow Editorial Desk</p>
          <h1 class="brand-title">HotNow</h1>
          <p class="brand-description">多源热点、筛选策略与投递动作在同一编辑台内完成。</p>
        </div>
        <nav class="nav-group nav-group--content">
          <p class="nav-title">内容菜单</p>
          ${contentLinks}
        </nav>
        <nav class="nav-group nav-group--system">
          <p class="nav-title">系统菜单</p>
          ${systemLinks}
        </nav>
        ${sidebarPageSummary}
        <div class="sidebar-footer">
          ${themeControl}
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
```

- [ ] **Step 4: 让导航链接继续保留 active 态，但输出 section 级 class 方便后续样式区分**

```ts
function renderNavGroup(pages: AppShellPage[], currentPath: string): string {
  return pages
    .map((page) => {
      const activeClass = page.path === currentPath ? " is-active" : "";
      return `<a class="nav-link nav-link--${page.section}${activeClass}" href="${escapeHtml(page.path)}">${escapeHtml(page.title)}</a>`;
    })
    .join("");
}
```

- [ ] **Step 5: 回跑壳层测试，确认新的品牌块已经替换旧文案**

Run: `npx vitest run tests/server/contentRoutes.test.ts`

Expected: PASS

- [ ] **Step 6: 提交壳层品牌块改动**

```bash
git add src/server/renderAppLayout.ts tests/server/contentRoutes.test.ts
git commit -m "feat: refresh shell masthead for editorial desk"
```

### Task 2: 为 `/`、`/articles`、`/ai` 建立混合卡片体系

**Files:**
- Modify: `src/server/renderContentPages.ts`
- Test: `tests/server/contentRoutes.test.ts`

- [ ] **Step 1: 先补内容页失败断言，锁定“首页主卡 + 内容标准卡”的分工**

```ts
it("renders featured cards on home and compact cards on articles", async () => {
  const listContentView = vi.fn().mockImplementation(async (viewKey) => [
    {
      id: viewKey === "hot" ? 201 : 301,
      title: viewKey === "hot" ? "Top Signal" : "Deep Read",
      summary: "A compact summary for layout verification.",
      sourceName: "OpenAI",
      canonicalUrl: "https://example.com/item",
      publishedAt: "2026-03-30T08:00:00.000Z",
      isFavorited: false,
      reaction: "none",
      contentScore: 88,
      scoreBadges: ["24h 内", "官方源"]
    }
  ]);
  const app = createServer({ listContentView } as never);

  const home = await app.inject({ method: "GET", url: "/" });
  const articles = await app.inject({ method: "GET", url: "/articles" });

  expect(home.body).toContain('class="content-grid content-grid--hot"');
  expect(home.body).toContain('class="content-card content-card--featured"');
  expect(home.body).toContain('data-card-variant="featured"');
  expect(articles.body).toContain('class="content-grid content-grid--articles"');
  expect(articles.body).toContain('class="content-card content-card--compact"');
  expect(articles.body).toContain('data-card-variant="compact"');
  expect(articles.body).not.toContain('content-card--featured');
});
```

- [ ] **Step 2: 跑内容路由测试，确认当前卡片还没有按视图区分变体**

Run: `npx vitest run tests/server/contentRoutes.test.ts`

Expected: FAIL，提示缺少 `content-grid--hot`、`content-card--featured` 或 `data-card-variant`

- [ ] **Step 3: 在渲染层把内容页分成首页主卡和标准卡两种输出**

```ts
export function renderContentPage(view: ContentPageView): string {
  const cardsHtml = view.cards.length > 0
    ? view.cards.map((card, index) => renderContentCard(view.viewKey, card, index)).join("")
    : `<section class="content-empty content-empty--signal"><h3>今天还没有可展示的内容</h3><p>可以先去控制台手动触发一次抓取。</p></section>`;

  return `
    <section class="content-intro content-intro--signal content-intro--${view.viewKey}">
      <p class="content-kicker">内容菜单</p>
      <p class="content-description">${escapeHtml(pageSubtitle[view.viewKey])}</p>
    </section>
    <section class="content-grid content-grid--${view.viewKey}">
      ${cardsHtml}
    </section>
  `;
}

function renderContentCard(viewKey: ContentViewKey, card: ContentCardView, index: number): string {
  const variant = viewKey === "hot" && index === 0 ? "featured" : "compact";
  const summaryText = card.summary?.trim() || "暂无摘要";
  const publishedText = formatPublishedAt(card.publishedAt);
  const titleHtml = renderTitleLink(card.title, card.canonicalUrl);

  return `
    <article class="content-card content-card--${variant}" data-card-variant="${variant}" data-content-id="${card.id}">
      <div class="content-score-pill" aria-label="评分 ${escapeHtml(String(card.contentScore))}">
        <span data-role="content-score">${escapeHtml(String(card.contentScore))}</span>
      </div>
      <header class="content-card-header content-card-header--${variant}">
        <p class="content-meta">
          <span>${escapeHtml(card.sourceName)}</span>
          <span>发布时间：${escapeHtml(publishedText)}</span>
        </p>
        <h3 class="content-title">${titleHtml}</h3>
      </header>
      ${renderContentBody(card, summaryText, variant)}
    </article>
  `;
}
```

- [ ] **Step 4: 首页主卡保留摘要存在感，标准卡把元信息和操作区压紧**

```ts
function renderContentBody(card: ContentCardView, summaryText: string, variant: "featured" | "compact"): string {
  return `
    <div class="content-card-body content-card-body--${variant}">
      <div class="content-summary-shell">
        <p class="content-summary">${escapeHtml(summaryText)}</p>
      </div>
      ${renderScoreBadges(card.scoreBadges)}
      <div class="content-card-region content-card-region--actions">
        <div class="content-actions">
          <button
            type="button"
            class="action-chip"
            data-content-action="favorite"
            data-favorited="${card.isFavorited ? "true" : "false"}"
            aria-pressed="${card.isFavorited ? "true" : "false"}"
          >
            ${card.isFavorited ? "已收藏" : "收藏"}
          </button>
          <button
            type="button"
            class="action-chip"
            data-content-action="reaction"
            data-reaction="like"
            aria-pressed="${card.reaction === "like" ? "true" : "false"}"
          >
            点赞
          </button>
          <button
            type="button"
            class="action-chip"
            data-content-action="reaction"
            data-reaction="dislike"
            aria-pressed="${card.reaction === "dislike" ? "true" : "false"}"
          >
            点踩
          </button>
        </div>
      </div>
    </div>
  `;
}
```

- [ ] **Step 5: 回跑内容路由测试，确认首页和内容页已经输出不同卡片变体**

Run: `npx vitest run tests/server/contentRoutes.test.ts`

Expected: PASS

- [ ] **Step 6: 提交混合卡片渲染改动**

```bash
git add src/server/renderContentPages.ts tests/server/contentRoutes.test.ts
git commit -m "feat: add mixed content card variants for unified shell"
```

### Task 3: 把 `/settings/*` 收敛成精致产品后台面板

**Files:**
- Modify: `src/server/renderSystemPages.ts`
- Test: `tests/server/systemRoutes.test.ts`

- [ ] **Step 1: 先补系统页失败断言，锁定“工作台面板”而不是“控制台浮层”**

```ts
it("renders sources page with workbench panel classes and lighter product framing", async () => {
  const app = createServer({
    listSources: vi.fn().mockResolvedValue([
      {
        kind: "openai",
        name: "OpenAI",
        rssUrl: "https://openai.com/news/rss.xml",
        isEnabled: true,
        lastCollectedAt: "2026-03-30T08:00:00.000Z",
        lastCollectionStatus: "completed"
      }
    ]),
    triggerManualRun: vi.fn().mockResolvedValue({ accepted: true }),
    triggerManualSendLatestEmail: vi.fn().mockResolvedValue({ accepted: true, action: "send-latest-email" }),
    isRunning: () => false
  } as never);

  const response = await app.inject({ method: "GET", url: "/settings/sources" });

  expect(response.statusCode).toBe(200);
  expect(response.body).toContain('class="system-section system-section--operations system-section--workbench"');
  expect(response.body).toContain('class="system-card system-card--control system-card--manual-collection system-card--operation system-card--operation-primary system-card--workbench"');
  expect(response.body).toContain('class="system-card system-card--control system-card--source system-card--inventory system-card--panel"');
});
```

- [ ] **Step 2: 跑系统页测试，确认当前 HTML 还没有新的工作台面板 class**

Run: `npx vitest run tests/server/systemRoutes.test.ts`

Expected: FAIL，提示缺少 `system-section--workbench`、`system-card--workbench` 或 `system-card--panel`

- [ ] **Step 3: 给 sources 页和 view-rules 页补更清晰的分区与卡片语义 class**

```ts
return `
  <section class="content-intro content-intro--system">
    <p class="content-kicker">系统菜单</p>
    <p class="content-description">数据迭代收集：管理多 source 启用状态，并查看最近抓取结果。</p>
  </section>
  <section class="system-section system-section--operations system-section--workbench" data-system-section="operations">
    <header class="system-section-header">
      <p class="system-section-kicker">即时操作</p>
      <h3 class="system-section-title">先执行动作，再查看结果</h3>
      <p class="system-section-description">这里放直接影响采集和报告投递的操作，不和单个 source 的状态卡混在一起。</p>
    </header>
    <div class="system-stack system-stack--control system-stack--operations">
      ${renderManualCollectionCard(enabledSources, options)}
      ${renderManualSendLatestEmailCard(options)}
    </div>
  </section>
  <section class="system-section system-section--sources system-section--inventory" data-system-section="sources">
    <header class="system-section-header">
      <p class="system-section-kicker">数据源状态</p>
      <h3 class="system-section-title">查看当前接入和启用情况</h3>
      <p class="system-section-description">这里展示每个 source 的启用状态、最近抓取时间和最近抓取结果，便于逐项管理。</p>
    </header>
    <div class="system-stack system-stack--control system-stack--sources">
      ${cardsHtml}
    </div>
  </section>
`;
```

- [ ] **Step 4: 让操作卡、source 卡和规则卡各自挂上稳定的产品化面板 class**

```ts
function renderViewRuleCard(rule: ViewRuleItem): string {
  return `
    <article class="system-card system-card--control system-card--view-rule system-card--panel system-card--form-panel" data-system-card="view-rule" data-rule-key="${escapeHtml(rule.ruleKey)}">
      <header class="system-card-header">
        <h3 class="system-card-title">${escapeHtml(rule.displayName)}</h3>
        <p class="system-card-meta">rule_key: <code>${escapeHtml(rule.ruleKey)}</code> · ${rule.isEnabled ? "启用中" : "已禁用"}</p>
      </header>
      <form class="system-form rating-form" data-system-action="view-rule-save" data-rule-key="${escapeHtml(rule.ruleKey)}">
        <div class="rating-grid">
          ${viewRuleFieldDefinitions.map((field) => renderViewRuleField(rule, field)).join("")}
        </div>
        <div class="system-action-row">
          <button type="submit" class="primary-mini-button">保存策略</button>
        </div>
        <div class="system-status-region">
          <p class="action-status system-status" data-role="action-status" aria-live="polite"></p>
        </div>
      </form>
    </article>
  `;
}

function renderManualCollectionCard(sources: SourceItem[], options: SourcesPageOptions): string {
  return `
    <article class="system-card system-card--control system-card--manual-collection system-card--operation system-card--operation-primary system-card--workbench" data-system-card="manual-collection">
      <header class="system-card-header">
        <p class="system-card-kicker">采集动作</p>
        <h3 class="system-card-title">手动执行采集</h3>
        <p class="system-card-meta">对当前启用 sources 立即执行一次抓取、聚类和报告生成。</p>
      </header>
      <form class="system-form" data-system-action="manual-collection-run">
        <div class="system-action-row">
          <button type="submit" class="primary-mini-button" data-role="manual-collection-button">手动执行采集</button>
        </div>
        <div class="system-status-region">
          <p class="action-status system-status" data-role="action-status" aria-live="polite"></p>
        </div>
      </form>
    </article>
  `;
}

function renderSourceCard(source: SourceItem): string {
  return `
    <article class="system-card system-card--control system-card--source system-card--inventory system-card--panel" data-system-card="source" data-source-kind="${escapeHtml(source.kind)}" data-source-name="${escapeHtml(source.name)}">
      <header class="system-card-header">
        <p class="system-card-kicker">数据源</p>
        <h3 class="system-card-title">${escapeHtml(source.name)}</h3>
        <p class="system-card-meta">kind: <code>${escapeHtml(source.kind)}</code></p>
      </header>
      <dl class="system-detail-list system-detail-list--source">
        <div class="system-detail-row">
          <dt>RSS</dt>
          <dd class="system-detail-value system-detail-value--rss">${renderOptionalLink(source.rssUrl)}</dd>
        </div>
        <div class="system-detail-row">
          <dt>状态</dt>
          <dd data-role="source-enabled-state">${source.isEnabled ? "已启用" : "已停用"}</dd>
        </div>
      </dl>
      <div class="system-card-actions system-card-actions--source">
        <form class="system-form system-form--source-action" data-system-action="toggle-source" data-source-kind="${escapeHtml(source.kind)}" data-enable="${source.isEnabled ? "false" : "true"}">
          <button type="submit" class="primary-mini-button" data-role="toggle-button">${source.isEnabled ? "停用 source" : "启用 source"}</button>
          <div class="system-status-region">
            <p class="action-status system-status" data-role="action-status" aria-live="polite"></p>
          </div>
        </form>
      </div>
    </article>
  `;
}
```

- [ ] **Step 5: 回跑系统页测试，确认新的分区和卡片语义已经渲染**

Run: `npx vitest run tests/server/systemRoutes.test.ts`

Expected: PASS

- [ ] **Step 6: 提交系统页面板化改动**

```bash
git add src/server/renderSystemPages.ts tests/server/systemRoutes.test.ts
git commit -m "feat: restyle system pages as editorial workbench panels"
```

### Task 4: 重建共享 CSS token，把视觉母版切到浅色纸感分层

**Files:**
- Modify: `src/server/public/site.css`
- Test: `tests/server/reportPages.test.ts`
- Test: `tests/server/siteThemeClient.test.ts`

- [ ] **Step 1: 先补共享 CSS 失败断言，锁定新的 paper / ink / signal token**

```ts
it("ships editorial desk theme tokens in the shared CSS asset", async () => {
  const app = createServer({} as never);

  const response = await app.inject({ method: "GET", url: "/assets/site.css" });

  expect(response.statusCode).toBe(200);
  expect(response.body).toContain("--paper-base: #f4ede3;");
  expect(response.body).toContain("--paper-elevated: #fbf7f1;");
  expect(response.body).toContain("--signal-blue: #2352ff;");
  expect(response.body).toContain("--signal-orange: #ff6a2a;");
  expect(response.body).not.toContain("--accent-strong: #53f3c3;");
});
```

- [ ] **Step 2: 跑 CSS 资产测试，确认当前 token 仍然是旧的赛博蓝绿体系**

Run: `npx vitest run tests/server/reportPages.test.ts`

Expected: FAIL，提示找不到 `--paper-base` / `--signal-blue`，或仍然命中旧的 `--accent-strong`

- [ ] **Step 3: 在 `:root` 和 `html[data-theme]` 中重建浅色母版 token，并保留深色翻译版**

```css
:root {
  --font-ui: "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-mono: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  --paper-base: #f4ede3;
  --paper-elevated: #fbf7f1;
  --paper-muted: #ece3d7;
  --ink-strong: #13233c;
  --ink-body: #43546e;
  --ink-soft: #6a7890;
  --signal-blue: #2352ff;
  --signal-orange: #ff6a2a;
  --line-soft: rgba(19, 35, 60, 0.12);
  --line-strong: rgba(35, 82, 255, 0.22);
  --shadow-card: 0 18px 34px rgba(26, 42, 70, 0.08);
  color-scheme: light;
}

html[data-theme="dark"] {
  color-scheme: dark;
  --paper-base: #111722;
  --paper-elevated: #171f2c;
  --paper-muted: #1d2635;
  --ink-strong: #eef3ff;
  --ink-body: #c4cedf;
  --ink-soft: #8f9bb2;
  --signal-blue: #7ea2ff;
  --signal-orange: #ff9b6d;
  --line-soft: rgba(255, 255, 255, 0.1);
  --line-strong: rgba(126, 162, 255, 0.28);
  --shadow-card: 0 18px 34px rgba(3, 8, 18, 0.34);
}
```

- [ ] **Step 4: 用新 token 重画壳层、品牌块、内容卡和系统卡的基础样式**

```css
body {
  color: var(--ink-strong);
  background:
    radial-gradient(circle at top left, rgba(35, 82, 255, 0.08), transparent 24%),
    radial-gradient(circle at bottom right, rgba(255, 106, 42, 0.07), transparent 18%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.42), rgba(255, 255, 255, 0)),
    var(--paper-base);
}

.brand-block,
.sidebar-page-summary,
.theme-dock,
.sidebar-account,
.content-card,
.system-card,
.legacy-card {
  background: var(--paper-elevated);
  border: 1px solid var(--line-soft);
  box-shadow: var(--shadow-card);
}

.content-card--featured {
  border-color: var(--line-strong);
  background:
    linear-gradient(180deg, rgba(35, 82, 255, 0.03), rgba(35, 82, 255, 0)),
    var(--paper-elevated);
}

.nav-link.is-active,
.theme-switch-button[aria-pressed="true"] {
  color: var(--paper-elevated);
  background: var(--signal-blue);
}

.primary-mini-button {
  background: var(--signal-orange);
  color: #fff;
}
```

- [ ] **Step 5: 回归主题运行时，确保只改视觉不破坏 localStorage 主题切换**

Run: `npx vitest run tests/server/siteThemeClient.test.ts`

Expected: PASS

- [ ] **Step 6: 回跑 CSS 资产测试，确认新 token 已经进入共享样式**

Run: `npx vitest run tests/server/reportPages.test.ts`

Expected: PASS

- [ ] **Step 7: 提交共享样式重建改动**

```bash
git add src/server/public/site.css tests/server/reportPages.test.ts tests/server/siteThemeClient.test.ts
git commit -m "feat: rebuild shared theme tokens for editorial desk"
```

### Task 5: 同步 README / AGENTS，并完成最相关验证

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: 更新 README 中的主题描述，去掉“赛博双主题”表述**

```md
- `unified shell` 页面已完整接入以浅色为母版的 `Editorial Signal Desk` 双主题：`/`、`/articles`、`/ai`、`/settings/*`
- 统一站点保留左侧品牌块、浅深主题切换和本地 `localStorage` 持久化
```

- [ ] **Step 2: 更新 AGENTS 中的协作说明和当前阶段快照，避免继续把站点描述成赛博控制台**

```md
- `unified shell` 页面（`/`、`/articles`、`/ai`、`/settings/*`）已完整切换到 `Editorial Signal Desk` 风格双主题
- unified shell 保留左侧导航和品牌块，但视觉母版已从赛博控制台切换为浅色纸感编辑台
```

- [ ] **Step 3: 跑最相关的页面渲染与主题回归测试**

Run: `npx vitest run tests/server/contentRoutes.test.ts tests/server/systemRoutes.test.ts tests/server/reportPages.test.ts tests/server/siteThemeClient.test.ts`

Expected: PASS，所有 unified shell 渲染断言和主题运行时断言通过

- [ ] **Step 4: 跑一次构建，确保 SSR 模板和静态资源没有引入类型或打包问题**

Run: `npm run build`

Expected: PASS，TypeScript 构建完成且没有新的类型错误

- [ ] **Step 5: 启动本地服务做手动 smoke test**

Run: `npm run dev:local`

Expected: 服务启动到 `http://127.0.0.1:3030`，可以登录后目检 `/`、`/articles`、`/ai`、`/settings/sources`

- [ ] **Step 6: 提交文档同步与验证结果**

```bash
git add README.md AGENTS.md
git commit -m "docs: sync editorial desk ui language"
```

## Self-Review

### Spec coverage

- 统一壳层、报头品牌块、左侧栏保留：由 Task 1 覆盖
- 首页 / 内容页 / 系统页气质分工：由 Task 2 和 Task 3 覆盖
- 浅色母版、纸感分层、蓝橙信号色：由 Task 4 覆盖
- 主题切换和 localStorage 保持：由 Task 4 的 `siteThemeClient` 回归覆盖
- 文档同步：由 Task 5 覆盖

### Placeholder scan

已检查本计划，没有使用 `TBD`、`TODO`、`后续再看`、`类似 Task N` 这类占位语句。所有任务都给出了具体文件、示例代码、运行命令和预期结果。

### Type consistency

计划中统一使用以下命名，不在不同任务中切换：

- `brand-block--masthead`
- `content-grid--${viewKey}`
- `content-card--featured`
- `content-card--compact`
- `system-section--workbench`
- `system-card--workbench`
- `system-card--panel`
- `--paper-base`
- `--signal-blue`
- `--signal-orange`
