# HotNow Content Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 HotNow 升级成“多源采集 + 自动百分制评分 + 侧边控制台收敛”的科技资讯控制台，优先展示最新、一手、高质量内容。

**Architecture:** 继续沿用当前 Fastify SSR + SQLite + 原生浏览器脚本的结构，但把内容展示从“SQL 直接排序 + 用户手工评分”升级成“统一内容池 + 系统打分 + 视图权重排序”。采集链路从单一 active source 升级成多 source 并行采集，页面壳层则收敛成单一侧边栏承载导航、当前页面信息和用户控制。

**Tech Stack:** TypeScript, Fastify SSR, SQLite, Vitest, plain browser JS, Playwright MCP for page QA

---

## File Map

- Modify: `src/server/renderAppLayout.ts`
  - 去掉顶部 `shell-header`，把页面标题、说明和用户区并回左侧侧边栏
- Modify: `src/server/public/site.css`
  - 重排侧边栏布局，移除 header 依赖，给内容区释放高度
- Modify: `src/server/renderContentPages.ts`
  - 去掉手工评分表单，改成系统分数和解释标签
- Modify: `src/server/public/site.js`
  - 移除评分表单提交逻辑，保留收藏 / 点赞 / 点踩 / 主题切换
- Modify: `src/server/createServer.ts`
  - 收缩评分相关依赖注入和路由；接入新的 source 启用切换与视图权重保存
- Create: `src/core/content/contentScoring.ts`
  - 统一计算 `contentScore`、解释标签和三个视图的排序分
- Modify: `src/core/content/listContentView.ts`
  - 从“SQL 直接按最近时间 / 完整度 / 关键词排序”改成“先取候选，再走 TS 打分”
- Modify: `src/core/viewRules/viewRuleRepository.ts`
  - 把默认视图规则升级为权重型配置
- Create: `src/core/viewRules/viewRuleConfig.ts`
  - 负责解析和归一化视图权重配置
- Modify: `src/core/db/runMigrations.ts`
  - 给 `content_sources` 增加多源启用字段，保持内容表仍以运行时评分为主
- Modify: `src/core/db/seedInitialData.ts`
  - 以多源启用模式种子初始化 source 和新默认规则
- Modify: `src/core/source/sourceCatalog.ts`
  - 更新 source 元信息，加入来源类型和权重基线
- Modify: `src/core/source/types.ts`
  - 扩展 source 定义与已加载 issue 的元信息
- Create: `src/core/source/loadEnabledSourceIssues.ts`
  - 读取所有启用 source，逐个抓取并返回汇总结果
- Modify: `src/core/pipeline/runDailyDigest.ts`
  - 支持多 source 采集、统一入库和汇总报告
- Modify: `src/core/content/contentRepository.ts`
  - 支持读取 / 更新多 source 状态与内容评分字段
- Modify: `src/server/renderSystemPages.ts`
  - 把 source 页改成启用/停用模式，把规则页改成权重控制面板
- Test: `tests/server/contentRoutes.test.ts`
- Test: `tests/server/systemRoutes.test.ts`
- Test: `tests/server/createServer.test.ts`
- Test: `tests/content/listContentView.test.ts`
- Create: `tests/content/contentScoring.test.ts`
- Test: `tests/db/runMigrations.test.ts`
- Test: `tests/db/seedInitialData.test.ts`
- Test: `tests/source/listSourceCards.test.ts`
- Test: `tests/pipeline/runDailyDigest.test.ts`
- Update Docs: `README.md`, `AGENTS.md`

### Task 1: 收敛壳层，移除顶部 header

**Files:**
- Modify: `src/server/renderAppLayout.ts`
- Modify: `src/server/public/site.css`
- Test: `tests/server/contentRoutes.test.ts`
- Test: `tests/server/systemRoutes.test.ts`

- [ ] **Step 1: 先写失败断言，锁定“没有顶部 header，页面信息进入侧边栏”的目标**

```ts
it("renders the current page title inside the sidebar instead of a top shell header", async () => {
  const app = createServer({
    listContentView: vi.fn().mockResolvedValue([]),
    listViewRules: vi.fn().mockResolvedValue([]),
    listSources: vi.fn().mockResolvedValue([]),
    getCurrentUserProfile: vi.fn().mockResolvedValue(null)
  } as never);

  const response = await app.inject({ method: "GET", url: "/" });

  expect(response.statusCode).toBe(200);
  expect(response.body).not.toContain('class="shell-header"');
  expect(response.body).toContain('class="sidebar-page-summary"');
  expect(response.body).toContain("热点资讯");
});
```

- [ ] **Step 2: 跑壳层测试，确认当前结构和目标不一致**

Run: `npx vitest run tests/server/contentRoutes.test.ts tests/server/systemRoutes.test.ts`

Expected: FAIL，提示找到了 `shell-header` 或缺少 `sidebar-page-summary`

- [ ] **Step 3: 在壳层模板里移除顶部 header，并把页面摘要与用户区并入侧边栏**

```ts
const sidebarPageSummary = `
  <section class="sidebar-page-summary">
    <p class="sidebar-page-kicker">当前页面</p>
    <h2 class="sidebar-page-title">${escapeHtml(view.page.title)}</h2>
    <p class="sidebar-page-description">${escapeHtml(view.page.description)}</p>
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
        ${sidebarPageSummary}
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
          ${userBlock}
        </div>
      </aside>
      <main class="shell-main shell-main--without-header">
        <section class="shell-content">${pageContent}</section>
      </main>
    </div>
  </body>
</html>`;
```

- [ ] **Step 4: 更新样式，让右侧内容区从页面顶部直接开始**

```css
.shell-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 28px 28px 32px;
}

.shell-main--without-header {
  justify-content: flex-start;
}

.sidebar-page-summary {
  margin: 8px 0 18px;
  padding: 16px 18px;
  border-radius: 20px;
  background: var(--bg-panel);
  border: 1px solid var(--line-strong);
}

.sidebar-footer {
  margin-top: auto;
  display: grid;
  gap: 14px;
}
```

- [ ] **Step 5: 回跑壳层相关测试**

Run: `npx vitest run tests/server/contentRoutes.test.ts tests/server/systemRoutes.test.ts`

Expected: PASS

- [ ] **Step 6: 提交壳层收敛改动**

```bash
git add src/server/renderAppLayout.ts src/server/public/site.css tests/server/contentRoutes.test.ts tests/server/systemRoutes.test.ts
git commit -m "feat: collapse shell header into sidebar"
```

### Task 2: 用系统自动百分制评分替换手工评分表单

**Files:**
- Create: `src/core/content/contentScoring.ts`
- Modify: `src/core/content/listContentView.ts`
- Modify: `src/server/renderContentPages.ts`
- Modify: `src/server/public/site.js`
- Test: `tests/content/listContentView.test.ts`
- Create: `tests/content/contentScoring.test.ts`
- Test: `tests/server/contentRoutes.test.ts`

- [ ] **Step 1: 先写系统评分的单元测试**

```ts
it("scores fresh official ai content higher than stale partial content", () => {
  const fresh = scoreContentItem({
    title: "OpenAI launches new model",
    summary: "A new model update with API rollout details.",
    bodyMarkdown: "Long enough body ".repeat(30),
    publishedAt: new Date().toISOString(),
    sourceKind: "openai",
    sourceType: "official"
  });

  const stale = scoreContentItem({
    title: "Older roundup",
    summary: "",
    bodyMarkdown: "",
    publishedAt: "2026-03-01T00:00:00.000Z",
    sourceKind: "juya",
    sourceType: "aggregator"
  });

  expect(fresh.contentScore).toBeGreaterThan(stale.contentScore);
  expect(fresh.badges).toContain("24h 内");
  expect(fresh.badges).toContain("官方源");
});
```

- [ ] **Step 2: 跑评分测试，确认当前还没有系统评分模块**

Run: `npx vitest run tests/content/contentScoring.test.ts`

Expected: FAIL，提示 `scoreContentItem` 或 `contentScoring.ts` 不存在

- [ ] **Step 3: 实现统一评分模块**

```ts
export type ScoreInput = {
  title: string;
  summary: string;
  bodyMarkdown: string;
  publishedAt: string | null;
  sourceKind: SourceKind;
  sourceType: "official" | "media" | "aggregator";
};

export type ScoreResult = {
  contentScore: number;
  badges: string[];
  freshnessScore: number;
  aiScore: number;
  completenessScore: number;
  sourceScore: number;
  heatScore: number;
};

export function scoreContentItem(input: ScoreInput): ScoreResult {
  const freshnessScore = scoreFreshness(input.publishedAt);
  const sourceScore = scoreSourceType(input.sourceType);
  const completenessScore = scoreCompleteness(input.summary, input.bodyMarkdown);
  const aiScore = scoreAiRelevance([input.title, input.summary, input.bodyMarkdown].join(" "));
  const heatScore = scoreHeatSignals(input.title, input.summary);
  const contentScore = clampScore(
    freshnessScore * 0.32 +
      sourceScore * 0.2 +
      completenessScore * 0.18 +
      aiScore * 0.18 +
      heatScore * 0.12
  );

  return {
    contentScore,
    badges: buildBadges({ freshnessScore, sourceType: input.sourceType, completenessScore, heatScore }),
    freshnessScore,
    aiScore,
    completenessScore,
    sourceScore,
    heatScore
  };
}
```

- [ ] **Step 4: 把内容列表从 SQL 直接排序改成“读候选 + TS 打分 + 视图排序”**

```ts
const rows = db.prepare(baseCandidateSql).all() as ContentCandidateRow[];

const cards = rows.map((row) => {
  const score = scoreContentItem({
    title: row.title,
    summary: row.summary ?? "",
    bodyMarkdown: row.bodyMarkdown ?? "",
    publishedAt: row.publishedAt,
    sourceKind: row.sourceKind,
    sourceType: row.sourceType
  });

  return {
    id: row.id,
    title: row.title,
    summary: row.summary?.trim() || "暂无摘要",
    sourceName: row.sourceName,
    canonicalUrl: row.canonicalUrl,
    publishedAt: row.publishedAt,
    isFavorited: row.favoriteValue === "1",
    reaction: normalizeReaction(row.reactionValue),
    contentScore: score.contentScore,
    scoreBadges: score.badges,
    rankingScore: selectViewRankingScore(viewKey, score)
  };
});

return cards
  .sort((left, right) => right.rankingScore - left.rankingScore || right.id - left.id)
  .slice(0, limit);
```

- [ ] **Step 5: 把内容卡片 UI 改成“系统分数 + 标签”，移除评分表单**

```ts
<p class="content-meta">
  <span>${escapeHtml(card.sourceName)}</span>
  <span>发布时间：${escapeHtml(publishedText)}</span>
  <span>系统分：<strong data-role="content-score">${card.contentScore}/100</strong></span>
</p>
<div class="content-score-badges">
  ${card.scoreBadges.map((badge) => `<span class="signal-badge">${escapeHtml(badge)}</span>`).join("")}
</div>
<div class="content-actions">
  <!-- 收藏 / 点赞 / 点踩 保留 -->
</div>
```

- [ ] **Step 6: 删掉浏览器端评分提交逻辑，避免页面继续发 `/ratings`**

```js
root.addEventListener("submit", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLFormElement)) {
    return;
  }

  if (target.dataset.systemAction === "view-rule-save") {
    event.preventDefault();
    await handleViewRuleSave(target);
    return;
  }

  if (target.dataset.systemAction === "toggle-source") {
    event.preventDefault();
    await handleToggleSource(target);
    return;
  }

  if (target.dataset.systemAction === "manual-collection-run") {
    event.preventDefault();
    await handleManualCollectionRun(target);
    return;
  }
});
```

- [ ] **Step 7: 跑评分和内容页测试**

Run: `npx vitest run tests/content/contentScoring.test.ts tests/content/listContentView.test.ts tests/server/contentRoutes.test.ts`

Expected: PASS

- [ ] **Step 8: 提交系统评分改动**

```bash
git add src/core/content/contentScoring.ts src/core/content/listContentView.ts src/server/renderContentPages.ts src/server/public/site.js tests/content/contentScoring.test.ts tests/content/listContentView.test.ts tests/server/contentRoutes.test.ts
git commit -m "feat: replace manual ratings with system content score"
```

### Task 3: 把视图规则升级成权重配置

**Files:**
- Create: `src/core/viewRules/viewRuleConfig.ts`
- Modify: `src/core/viewRules/viewRuleRepository.ts`
- Modify: `src/server/renderSystemPages.ts`
- Test: `tests/server/systemRoutes.test.ts`

- [ ] **Step 1: 先写视图规则默认值和解析测试**

```ts
it("normalizes missing weights with view defaults", () => {
  const config = normalizeViewRuleConfig("ai", { limit: 10, freshnessWeight: 0.8 });

  expect(config.limit).toBe(10);
  expect(config.freshnessWeight).toBe(0.8);
  expect(config.aiWeight).toBeGreaterThan(config.heatWeight);
  expect(config.freshnessWindowDays).toBe(7);
});
```

- [ ] **Step 2: 跑相关测试，确认当前没有权重配置归一化层**

Run: `npx vitest run tests/server/systemRoutes.test.ts`

Expected: FAIL 或缺少新配置结构断言

- [ ] **Step 3: 新建权重配置模块，统一默认值**

```ts
export type ViewRuleConfig = {
  limit: number;
  freshnessWindowDays: number;
  freshnessWeight: number;
  sourceWeight: number;
  completenessWeight: number;
  aiWeight: number;
  heatWeight: number;
};

const viewDefaults = {
  hot: { limit: 20, freshnessWindowDays: 7, freshnessWeight: 0.34, sourceWeight: 0.18, completenessWeight: 0.12, aiWeight: 0.12, heatWeight: 0.24 },
  articles: { limit: 20, freshnessWindowDays: 7, freshnessWeight: 0.18, sourceWeight: 0.24, completenessWeight: 0.34, aiWeight: 0.08, heatWeight: 0.16 },
  ai: { limit: 20, freshnessWindowDays: 7, freshnessWeight: 0.26, sourceWeight: 0.16, completenessWeight: 0.12, aiWeight: 0.34, heatWeight: 0.12 }
} as const;
```

- [ ] **Step 4: 更新规则页渲染，先用明确字段表单替代纯 JSON 大文本框**

```ts
<form class="system-form" data-system-action="view-rule-save" data-rule-key="${escapeHtml(rule.ruleKey)}">
  <label class="system-label">展示上限 <input name="limit" type="number" min="1" max="80" value="${rule.config.limit}" /></label>
  <label class="system-label">新鲜度权重 <input name="freshnessWeight" type="number" step="0.01" value="${rule.config.freshnessWeight}" /></label>
  <label class="system-label">来源权重 <input name="sourceWeight" type="number" step="0.01" value="${rule.config.sourceWeight}" /></label>
  <label class="system-label">完整度权重 <input name="completenessWeight" type="number" step="0.01" value="${rule.config.completenessWeight}" /></label>
  <label class="system-label">AI 权重 <input name="aiWeight" type="number" step="0.01" value="${rule.config.aiWeight}" /></label>
  <label class="system-label">热点权重 <input name="heatWeight" type="number" step="0.01" value="${rule.config.heatWeight}" /></label>
  <button type="submit" class="primary-mini-button">保存策略</button>
</form>
```

- [ ] **Step 5: 跑系统页测试**

Run: `npx vitest run tests/server/systemRoutes.test.ts`

Expected: PASS

- [ ] **Step 6: 提交视图权重配置改动**

```bash
git add src/core/viewRules/viewRuleConfig.ts src/core/viewRules/viewRuleRepository.ts src/server/renderSystemPages.ts tests/server/systemRoutes.test.ts
git commit -m "feat: add weighted view strategy controls"
```

### Task 4: 把单一 active source 升级成多 source 启用模式

**Files:**
- Modify: `src/core/db/runMigrations.ts`
- Modify: `src/core/db/seedInitialData.ts`
- Modify: `src/core/source/types.ts`
- Modify: `src/core/source/sourceCatalog.ts`
- Create: `src/core/source/loadEnabledSourceIssues.ts`
- Modify: `src/core/content/contentRepository.ts`
- Modify: `src/core/pipeline/runDailyDigest.ts`
- Test: `tests/db/runMigrations.test.ts`
- Test: `tests/db/seedInitialData.test.ts`
- Test: `tests/pipeline/runDailyDigest.test.ts`

- [ ] **Step 1: 先写 migration/seed 测试，锁定多 source 启用语义**

```ts
it("adds is_enabled to content_sources and keeps multiple built-ins enabled", () => {
  runMigrations(db);
  seedInitialData(db, { username: "admin", password: "secret" });

  const rows = db.prepare(`
    SELECT kind, is_enabled
    FROM content_sources
    ORDER BY kind ASC
  `).all();

  expect(rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "juya", is_enabled: 1 }),
      expect.objectContaining({ kind: "openai", is_enabled: 1 }),
      expect.objectContaining({ kind: "google_ai", is_enabled: 1 }),
      expect.objectContaining({ kind: "techcrunch_ai", is_enabled: 1 })
    ])
  );
});
```

- [ ] **Step 2: 跑数据库与采集测试，确认当前 schema 仍是单 active source**

Run: `npx vitest run tests/db/runMigrations.test.ts tests/db/seedInitialData.test.ts tests/pipeline/runDailyDigest.test.ts`

Expected: FAIL，提示缺少 `is_enabled` 或仍假设只有一个 active source

- [ ] **Step 3: 给 `content_sources` 补多源启用字段，并保留兼容迁移**

```ts
if (!hasColumn(db, "content_sources", "is_enabled")) {
  db.exec("ALTER TABLE content_sources ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1");
}
```

- [ ] **Step 4: 把 source catalog 扩成带来源类型和优先级的结构**

```ts
openai: {
  kind: "openai",
  name: "OpenAI",
  siteUrl: "https://openai.com/news/",
  rssUrl: "https://openai.com/news/rss.xml",
  category: "最新 AI 消息",
  sourceType: "official",
  sourcePriority: 90
},
techcrunch_ai: {
  kind: "techcrunch_ai",
  name: "TechCrunch AI",
  siteUrl: "https://techcrunch.com/category/artificial-intelligence/",
  rssUrl: "https://techcrunch.com/category/artificial-intelligence/feed/",
  category: "热门文章",
  sourceType: "media",
  sourcePriority: 82
}
```

- [ ] **Step 5: 新建多源加载器，并让日报流水线按所有启用 source 逐个抓取**

```ts
export async function loadEnabledSourceIssues(db: SqliteDatabase): Promise<LoadedIssue[]> {
  const enabledRows = db.prepare(`
    SELECT kind, rss_url
    FROM content_sources
    WHERE is_enabled = 1
    ORDER BY kind ASC
  `).all() as SourceRow[];

  return Promise.all(enabledRows.map(async (row) => {
    const adapter = readSourceAdapter(row.kind);
    const response = await fetch(row.rss_url);
    if (response.status !== 200) {
      throw new Error(`RSS request failed with ${response.status} for ${row.kind}`);
    }
    return adapter(await response.text());
  }));
}
```

- [ ] **Step 6: 更新 `runDailyDigest`，把多 source 结果统一拉平并入库**

```ts
const issues = await runtimeDeps.loadEnabledSourceIssues(config);
const enrichedItems = await Promise.all(
  issues.flatMap((issue) =>
    issue.items.map(async (item) => ({
      rank: item.rank,
      category: item.category,
      title: item.title,
      sourceUrl: item.sourceUrl,
      sourceName: item.sourceName,
      externalId: item.externalId,
      publishedAt: item.publishedAt,
      summary: item.summary,
      sourceKind: issue.sourceKind,
      article: await runtimeDeps.fetchArticle(item.sourceUrl)
    }))
  )
);
```

- [ ] **Step 7: 跑数据库和流水线测试**

Run: `npx vitest run tests/db/runMigrations.test.ts tests/db/seedInitialData.test.ts tests/pipeline/runDailyDigest.test.ts`

Expected: PASS

- [ ] **Step 8: 提交多 source 采集改动**

```bash
git add src/core/db/runMigrations.ts src/core/db/seedInitialData.ts src/core/source/types.ts src/core/source/sourceCatalog.ts src/core/source/loadEnabledSourceIssues.ts src/core/content/contentRepository.ts src/core/pipeline/runDailyDigest.ts tests/db/runMigrations.test.ts tests/db/seedInitialData.test.ts tests/pipeline/runDailyDigest.test.ts
git commit -m "feat: collect from all enabled sources"
```

### Task 5: 把系统菜单改成“多源状态 + 权重控制”

**Files:**
- Modify: `src/server/createServer.ts`
- Modify: `src/server/renderSystemPages.ts`
- Modify: `src/server/public/site.js`
- Modify: `src/core/source/listSourceCards.ts`
- Test: `tests/source/listSourceCards.test.ts`
- Test: `tests/server/systemRoutes.test.ts`
- Test: `tests/server/createServer.test.ts`

- [ ] **Step 1: 先写 source 页测试，锁定启用/停用而不是单选激活**

```ts
it("renders sources page with enable toggles instead of active-source switch copy", async () => {
  const app = createServer({
    listSources: vi.fn().mockResolvedValue([
      {
        kind: "openai",
        name: "OpenAI",
        rssUrl: "https://openai.com/news/rss.xml",
        isEnabled: true,
        lastCollectedAt: "2026-03-29T08:00:00.000Z",
        lastCollectionStatus: "completed"
      }
    ])
  } as never);

  const response = await app.inject({ method: "GET", url: "/settings/sources" });

  expect(response.body).toContain("已启用");
  expect(response.body).toContain("停用 source");
  expect(response.body).not.toContain("设为当前启用");
});
```

- [ ] **Step 2: 跑系统页测试，确认当前仍是 active source 文案和动作**

Run: `npx vitest run tests/source/listSourceCards.test.ts tests/server/systemRoutes.test.ts tests/server/createServer.test.ts`

Expected: FAIL

- [ ] **Step 3: 调整 source 卡片数据结构和页面文案**

```ts
type SourceItem = {
  kind: string;
  name: string;
  rssUrl: string | null;
  isEnabled: boolean;
  lastCollectedAt: string | null;
  lastCollectionStatus: string | null;
};

<dd data-role="source-enabled-state">${source.isEnabled ? "已启用" : "已停用"}</dd>
<button type="submit" class="primary-mini-button" data-role="toggle-button">
  ${source.isEnabled ? "停用 source" : "启用 source"}
</button>
```

- [ ] **Step 4: 调整浏览器交互与服务端动作**

```js
if (form.dataset.systemAction === "toggle-source") {
  event.preventDefault();
  const sourceKind = form.dataset.sourceKind;
  const enable = form.dataset.enable === "true";
  const response = await postJson("/actions/sources/toggle", { kind: sourceKind, enable });
  if (!response.ok) {
    showFormStatus(form, await readSystemActionError(response, "切换失败，请稍后再试。"));
    return;
  }

  showFormStatus(form, enable ? "已启用 source。" : "已停用 source。");
}
```

- [ ] **Step 5: 跑系统菜单和 server 路由测试**

Run: `npx vitest run tests/source/listSourceCards.test.ts tests/server/systemRoutes.test.ts tests/server/createServer.test.ts`

Expected: PASS

- [ ] **Step 6: 提交系统菜单改动**

```bash
git add src/server/createServer.ts src/server/renderSystemPages.ts src/server/public/site.js src/core/source/listSourceCards.ts tests/source/listSourceCards.test.ts tests/server/systemRoutes.test.ts tests/server/createServer.test.ts
git commit -m "feat: switch source settings to multi-enable workflow"
```

### Task 6: 文档同步与页面验收

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: 更新 README，说明新的页面结构、自动评分和多源采集语义**

```md
- 统一站点已去掉顶部 header，当前页面信息和用户区收进左侧侧边栏
- 内容卡片展示系统自动生成的百分制分数，不再提供手工评分表单
- 采集任务会对所有启用 source 并行拉取，再统一写入内容池
```

- [ ] **Step 2: 更新 AGENTS，记录新的壳层、评分与多源约定**

```md
- `/settings/sources`：统一站点数据迭代收集页（登录后，可启用/停用多个 source，并手动执行一次全量采集）
- 统一内容页现在展示系统自动计算的 `contentScore`，不再提供人工评分表单
- 采集链路已从单一 active source 升级为多启用 source 汇总
```

- [ ] **Step 3: 跑全量测试与构建**

Run:

```bash
npm run test
npm run build
```

Expected:

- `npm run test` 全部通过
- `npm run build` 通过

- [ ] **Step 4: 用 Playwright MCP 做页面验收**

Validate:

- 登录后左侧侧边栏能看到当前页面标题、用户信息和退出按钮
- 页面顶部不再出现旧 `shell-header`
- 内容卡片显示 `xx/100` 系统分数和解释标签
- `/settings/sources` 可以看到多个 source 的启用状态
- 手动执行一次采集后页面仍能正常显示内容

- [ ] **Step 5: 提交文档和最终验证结果**

```bash
git add README.md AGENTS.md
git commit -m "docs: record content priority workflow"
```
