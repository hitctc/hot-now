# HotNow Source Analytics And Content Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `/settings/sources` 增加当天 source 统计总览，并在 `/`、`/articles`、`/ai` 三个内容页加入共享的 source 复选过滤条，同时保持统计口径和当前栏目候选/展示逻辑完全一致。

**Architecture:** 先把现有内容页的候选与展示逻辑抽成一个共享的 `content view selection` 构建器，避免 source 统计再次复制一套“近似规则”。系统页统计基于这套共享选择器和 Shanghai 当日窗口实时计算；内容页过滤则通过 `localStorage + shell fetch header` 驱动服务端重渲染，不把筛选状态写进 URL，也不把用户个人勾选混进系统页统计。

**Tech Stack:** TypeScript, Fastify, better-sqlite3, Vitest, JSDOM, server-rendered HTML, localStorage

---

## File Map

- Create: `src/core/content/buildContentViewSelection.ts`
  - 抽出 `hot / articles / ai` 共用的候选集、排序、展示裁剪和 source 过滤逻辑
- Modify: `src/core/content/listContentView.ts`
  - 改为薄包装器，复用共享选择器并保留现有对外能力
- Create: `src/core/source/listContentSources.ts`
  - 返回内容页过滤条所需的已启用 source 清单，不混入统计字段
- Create: `src/core/source/listSourceWorkbench.ts`
  - 负责 `/settings/sources` 的总览统计与卡片数据组装
- Modify: `src/main.ts`
  - 注入 `listContentView` 新参数、`listContentSources` 与 `listSourceWorkbench`
- Modify: `src/server/createServer.ts`
  - 解析内容页 source 过滤 header，给内容页和系统页传正确 view model
- Modify: `src/server/renderContentPages.ts`
  - 渲染顶部 source 过滤条、过滤空态和卡片 `data-source-kind`
- Modify: `src/server/renderSystemPages.ts`
  - 渲染 `/settings/sources` 总览表与卡片统计摘要
- Modify: `src/server/public/site.js`
  - 维护内容页 source 勾选状态、`全选 / 全不选`、shell 导航 header 注入和初始重刷
- Modify: `src/server/public/site.css`
  - 增加过滤条、空态和总览表样式，保持 `Editorial Signal Desk`
- Create: `tests/content/buildContentViewSelection.test.ts`
  - 覆盖共享选择器的候选/展示与 source 过滤行为
- Modify: `tests/content/listContentView.test.ts`
  - 回归现有 `listContentView` 封装仍返回展示卡片
- Create: `tests/source/listSourceWorkbench.test.ts`
  - 覆盖总条数、今天发布、今天抓取、今日入池/展示统计
- Modify: `tests/server/contentRoutes.test.ts`
  - 覆盖内容页过滤条 HTML 与 header 传参
- Modify: `tests/server/systemRoutes.test.ts`
  - 覆盖 `/settings/sources` 总览表和卡片摘要渲染
- Modify: `tests/server/siteThemeClient.test.ts`
  - 覆盖 source 过滤本地持久化、`全选 / 全不选` 和 shell fetch header
- Update Docs: `README.md`, `AGENTS.md`
  - 同步 `/settings/sources` 页面能力和内容页 source 过滤说明

### Task 1: 抽出共享内容视图选择器

**Files:**
- Create: `src/core/content/buildContentViewSelection.ts`
- Modify: `src/core/content/listContentView.ts`
- Create: `tests/content/buildContentViewSelection.test.ts`
- Modify: `tests/content/listContentView.test.ts`

- [ ] **Step 1: 先写失败测试，锁定候选集、展示集和 source 过滤口径**

```ts
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSourceByKind, upsertContentItems } from "../../src/core/content/contentRepository.js";
import { buildContentViewSelection } from "../../src/core/content/buildContentViewSelection.js";
import { listContentView } from "../../src/core/content/listContentView.js";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";

describe("buildContentViewSelection", () => {
  const databasesToClose: ReturnType<typeof openDatabase>[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T04:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    while (databasesToClose.length > 0) {
      databasesToClose.pop()?.close();
    }
  });

  it("returns candidate cards before limit trimming and visible cards after trimming", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: [
        buildItem("Candidate A", "2026-03-31T02:00:00.000Z"),
        buildItem("Candidate B", "2026-03-31T01:00:00.000Z"),
        buildItem("Candidate C", "2026-03-31T00:00:00.000Z")
      ]
    });

    const selection = buildContentViewSelection(db, "hot", { limitOverride: 2 });

    expect(selection.candidateCards).toHaveLength(3);
    expect(selection.visibleCards).toHaveLength(2);
    expect(selection.visibleCards.map((card) => card.title)).toEqual(["Candidate A", "Candidate B"]);
  });

  it("filters candidate and visible cards by selected source kinds", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");
    const aithome = resolveSourceByKind(db, "ithome");

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: [buildItem("OpenAI only", "2026-03-31T02:00:00.000Z")]
    });
    upsertContentItems(db, {
      sourceId: aithome!.id,
      items: [buildItem("IT之家 only", "2026-03-31T01:00:00.000Z")]
    });

    const selection = buildContentViewSelection(db, "articles", {
      selectedSourceKinds: ["ithome"]
    });

    expect(selection.candidateCards.map((card) => card.sourceKind)).toEqual(["ithome"]);
    expect(selection.visibleCards.map((card) => card.title)).toEqual(["IT之家 only"]);
    expect(listContentView(db, "articles", { selectedSourceKinds: ["ithome"] })).toHaveLength(1);
  });

  async function createTestDatabase(databasesToClose: ReturnType<typeof openDatabase>[]) {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-content-selection-"));
    const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
    databasesToClose.push(db);
    runMigrations(db);
    seedInitialData(db, { username: "admin", password: "bootstrap-password" });
    return db;
  }

  function buildItem(title: string, publishedAt: string) {
    return {
      title,
      canonicalUrl: `https://example.com/${encodeURIComponent(title)}`,
      summary: `${title} summary`,
      bodyMarkdown: `${title} body markdown`,
      publishedAt,
      fetchedAt: publishedAt
    };
  }
});
```

- [ ] **Step 2: 跑新测试，确认当前仓库还没有共享选择器**

Run: `npx vitest run tests/content/buildContentViewSelection.test.ts tests/content/listContentView.test.ts`

Expected: FAIL，报错点集中在 `buildContentViewSelection` 尚不存在，以及 `listContentView` 还不支持 `selectedSourceKinds`

- [ ] **Step 3: 新建共享选择器，并把现有 SQL / 评分 / 排序逻辑挪进去**

```ts
// src/core/content/buildContentViewSelection.ts
import type { SqliteDatabase } from "../db/openDatabase.js";
import { scoreContentItem } from "./contentScoring.js";
import type { ContentViewKey, ContentCardView } from "./listContentView.js";
import { getViewRuleConfig } from "../viewRules/viewRuleRepository.js";
import { BUILTIN_SOURCES } from "../source/sourceCatalog.js";
import type { ViewRuleConfigValues } from "../viewRules/viewRuleConfig.js";

export type ContentViewSelectionOptions = {
  selectedSourceKinds?: string[];
  referenceTime?: Date;
  limitOverride?: number;
};

export type RankedContentCardView = {
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
  rankingScore: number;
  rankingTimestamp: string | null;
};

// 同步把 listContentView.ts 里的 ContentCardView 增加 `sourceKind: string`，
// 这样渲染层可以把 source kind 写到卡片 data attribute 里供过滤和测试复用。

export type ContentViewSelection = {
  candidateCards: RankedContentCardView[];
  visibleCards: RankedContentCardView[];
};

export function buildContentViewSelection(
  db: SqliteDatabase,
  viewKey: ContentViewKey,
  options: ContentViewSelectionOptions = {}
): ContentViewSelection {
  const referenceTime = options.referenceTime ?? new Date();
  const config = getViewRuleConfig(db, viewKey);
  const selectedKinds = normalizeSelectedSourceKinds(options.selectedSourceKinds);

  const rows = db.prepare(contentSelectSql).all() as ContentCardRow[];
  const rankedCards = rows
    .map((row) => {
      const score = scoreContentItem(
        {
          title: row.title,
          summary: row.summary ?? "",
          bodyMarkdown: row.bodyMarkdown ?? "",
          publishedAt: row.publishedAt,
          sourceKind: row.sourceKind
        },
        { now: referenceTime }
      );

      return {
        id: row.id,
        title: row.title,
        summary: row.summary?.trim() || "暂无摘要",
        sourceName: row.sourceName,
        sourceKind: row.sourceKind,
        canonicalUrl: row.canonicalUrl,
        publishedAt: row.publishedAt,
        isFavorited: row.favoriteValue === "1",
        reaction: normalizeReaction(row.reactionValue),
        contentScore: score.contentScore,
        scoreBadges: score.badges,
        rankingScore: calculateViewRankingScore(
          viewKey,
          config,
          score,
          row.sourceKind,
          row.rankingTimestamp,
          referenceTime
        ),
        rankingTimestamp: row.rankingTimestamp
      };
    })
    .filter((card) => selectedKinds === null || selectedKinds.has(card.sourceKind))
    .sort((left, right) => {
      if (right.rankingScore !== left.rankingScore) {
        return right.rankingScore - left.rankingScore;
      }

      return toTimestampMs(right.rankingTimestamp) - toTimestampMs(left.rankingTimestamp) || right.id - left.id;
    });

  const limit = options.limitOverride ?? config.limit;

  return {
    candidateCards: rankedCards,
    visibleCards: rankedCards.slice(0, limit)
  };
}

function normalizeSelectedSourceKinds(selectedSourceKinds?: string[]) {
  if (!selectedSourceKinds) {
    return null;
  }

  return new Set(selectedSourceKinds.map((kind) => kind.trim()).filter(Boolean));
}

// 其余 `contentSelectSql`、`ContentCardRow`、`normalizeReaction`、`calculateViewRankingScore`、`toTimestampMs`
// 直接从旧的 listContentView.ts 迁入本文件，不再保留两份实现。
```

```ts
// src/core/content/listContentView.ts
import { buildContentViewSelection, type ContentViewSelectionOptions } from "./buildContentViewSelection.js";

export function listContentView(
  db: SqliteDatabase,
  viewKey: ContentViewKey,
  options: ContentViewSelectionOptions = {}
): ContentCardView[] {
  return buildContentViewSelection(db, viewKey, options).visibleCards.map(
    ({ rankingScore: _rankingScore, rankingTimestamp: _rankingTimestamp, ...card }) => card
  );
}
```

- [ ] **Step 4: 跑内容选择器测试，确认共享选择器和旧封装都成立**

Run: `npx vitest run tests/content/buildContentViewSelection.test.ts tests/content/listContentView.test.ts`

Expected: PASS，且原有 `listContentView` 排序/limit 测试继续通过

- [ ] **Step 5: 提交共享逻辑抽取**

```bash
git add src/core/content/buildContentViewSelection.ts src/core/content/listContentView.ts tests/content/buildContentViewSelection.test.ts tests/content/listContentView.test.ts
git commit -m "refactor: 抽出共享内容视图选择逻辑"
```

### Task 2: 给 `/settings/sources` 增加 source 工作台统计

**Files:**
- Create: `src/core/source/listSourceWorkbench.ts`
- Modify: `src/server/renderSystemPages.ts`
- Modify: `src/server/createServer.ts`
- Modify: `src/main.ts`
- Create: `tests/source/listSourceWorkbench.test.ts`
- Modify: `tests/server/systemRoutes.test.ts`

- [ ] **Step 1: 先写失败测试，锁定来源总览表和今日统计口径**

```ts
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSourceByKind, upsertContentItems } from "../../src/core/content/contentRepository.js";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";
import { listSourceWorkbench } from "../../src/core/source/listSourceWorkbench.js";

describe("listSourceWorkbench", () => {
  const databasesToClose: ReturnType<typeof openDatabase>[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T04:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    while (databasesToClose.length > 0) {
      databasesToClose.pop()?.close();
    }
  });

  it("returns total, published-today, collected-today, and per-view candidate/visible counts", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: [
        {
          title: "Today visible",
          canonicalUrl: "https://example.com/today-visible",
          summary: "Today visible summary",
          bodyMarkdown: "Today visible body",
          publishedAt: "2026-03-31T01:00:00.000Z",
          fetchedAt: "2026-03-31T01:05:00.000Z"
        },
        {
          title: "Today collected only",
          canonicalUrl: "https://example.com/today-collected",
          summary: "Today collected summary",
          bodyMarkdown: "Today collected body",
          publishedAt: "2026-03-30T10:00:00.000Z",
          fetchedAt: "2026-03-31T02:00:00.000Z"
        }
      ]
    });

    const workbench = listSourceWorkbench(db);
    const openaiRow = workbench.find((row) => row.kind === "openai");

    expect(openaiRow).toMatchObject({
      totalCount: 2,
      publishedTodayCount: 1,
      collectedTodayCount: 2
    });
    expect(openaiRow?.viewStats.hot.candidateCount).toBeGreaterThanOrEqual(1);
    expect(openaiRow?.viewStats.hot.visibleCount).toBeGreaterThanOrEqual(1);
  });

  async function createTestDatabase(databasesToClose: ReturnType<typeof openDatabase>[]) {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-source-workbench-"));
    const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
    databasesToClose.push(db);
    runMigrations(db);
    seedInitialData(db, { username: "admin", password: "bootstrap-password" });
    return db;
  }
});
```

```ts
it("renders the sources overview table before source cards", async () => {
  const app = createServer({
    listSources: vi.fn().mockResolvedValue([
      {
        kind: "openai",
        name: "OpenAI",
        rssUrl: "https://openai.com/news/rss.xml",
        isEnabled: true,
        lastCollectedAt: "2026-03-31T01:05:00.000Z",
        lastCollectionStatus: "completed",
        totalCount: 24,
        publishedTodayCount: 6,
        collectedTodayCount: 5,
        viewStats: {
          hot: { candidateCount: 4, visibleCount: 2 },
          articles: { candidateCount: 3, visibleCount: 2 },
          ai: { candidateCount: 5, visibleCount: 3 }
        }
      }
    ]),
    getSourcesOperationSummary: vi.fn().mockResolvedValue({
      lastCollectionRunAt: "2026-03-31T03:00:00.000Z",
      lastSendLatestEmailAt: "2026-03-31T03:10:00.000Z"
    }),
    isRunning: () => false
  } as never);

  const response = await app.inject({ method: "GET", url: "/settings/sources" });

  expect(response.body).toContain('class="source-analytics-table"');
  expect(response.body).toContain("Hot 入池 / 展示");
  expect(response.body).toContain("Articles 入池 / 展示");
  expect(response.body).toContain("AI 入池 / 展示");
  expect(response.body).toContain("24");
  expect(response.body).toContain("6");
  expect(response.body).toContain("5");
  expect(response.body).toContain("4 / 2");
  expect(response.body.indexOf('class="source-analytics-table"')).toBeLessThan(
    response.body.indexOf('data-system-card="source"')
  );
});
```

- [ ] **Step 2: 跑系统页统计测试，确认当前还没有 workbench 统计层**

Run: `npx vitest run tests/source/listSourceWorkbench.test.ts tests/server/systemRoutes.test.ts`

Expected: FAIL，报错点集中在 `listSourceWorkbench` 尚不存在，以及 `/settings/sources` 还没有总览表

- [ ] **Step 3: 新建 source 工作台查询模块，并在系统页渲染总览表 + 卡片摘要**

```ts
// src/core/source/listSourceWorkbench.ts
import { buildContentViewSelection } from "../content/buildContentViewSelection.js";
import type { SqliteDatabase } from "../db/openDatabase.js";
import { listSourceCards } from "./listSourceCards.js";

export type SourceWorkbenchRow = {
  kind: string;
  name: string;
  rssUrl: string | null;
  isEnabled: boolean;
  lastCollectedAt: string | null;
  lastCollectionStatus: string | null;
  totalCount: number;
  publishedTodayCount: number;
  collectedTodayCount: number;
  viewStats: {
    hot: { candidateCount: number; visibleCount: number };
    articles: { candidateCount: number; visibleCount: number };
    ai: { candidateCount: number; visibleCount: number };
  };
};

export function listSourceWorkbench(db: SqliteDatabase, referenceTime = new Date()): SourceWorkbenchRow[] {
  const cards = listSourceCards(db);
  const countMap = readSourceCountMap(db, referenceTime);
  const viewStats = {
    hot: indexCountsBySource(buildContentViewSelection(db, "hot", { referenceTime })),
    articles: indexCountsBySource(buildContentViewSelection(db, "articles", { referenceTime })),
    ai: indexCountsBySource(buildContentViewSelection(db, "ai", { referenceTime }))
  };

  return cards.map((card) => ({
    ...card,
    totalCount: countMap.get(card.kind)?.totalCount ?? 0,
    publishedTodayCount: countMap.get(card.kind)?.publishedTodayCount ?? 0,
    collectedTodayCount: countMap.get(card.kind)?.collectedTodayCount ?? 0,
    viewStats: {
      hot: viewStats.hot.get(card.kind) ?? { candidateCount: 0, visibleCount: 0 },
      articles: viewStats.articles.get(card.kind) ?? { candidateCount: 0, visibleCount: 0 },
      ai: viewStats.ai.get(card.kind) ?? { candidateCount: 0, visibleCount: 0 }
    }
  }));
}

function readSourceCountMap(db: SqliteDatabase, referenceTime: Date) {
  const { shanghaiDayStart, shanghaiDayEnd } = buildShanghaiDayRange(referenceTime);
  const rows = db
    .prepare(
      `
        SELECT
          cs.kind AS sourceKind,
          COUNT(*) AS totalCount,
          SUM(CASE WHEN ci.published_at >= ? AND ci.published_at < ? THEN 1 ELSE 0 END) AS publishedTodayCount,
          SUM(CASE WHEN ci.created_at >= ? AND ci.created_at < ? THEN 1 ELSE 0 END) AS collectedTodayCount
        FROM content_items ci
        JOIN content_sources cs ON cs.id = ci.source_id
        GROUP BY cs.kind
      `
    )
    .all(shanghaiDayStart, shanghaiDayEnd, shanghaiDayStart, shanghaiDayEnd) as Array<{
      sourceKind: string;
      totalCount: number;
      publishedTodayCount: number;
      collectedTodayCount: number;
    }>;

  return new Map(rows.map((row) => [row.sourceKind, row]));
}

function indexCountsBySource(selection: ContentViewSelection) {
  const stats = new Map<string, { candidateCount: number; visibleCount: number }>();

  for (const card of selection.candidateCards) {
    const entry = stats.get(card.sourceKind) ?? { candidateCount: 0, visibleCount: 0 };
    entry.candidateCount += 1;
    stats.set(card.sourceKind, entry);
  }

  for (const card of selection.visibleCards) {
    const entry = stats.get(card.sourceKind) ?? { candidateCount: 0, visibleCount: 0 };
    entry.visibleCount += 1;
    stats.set(card.sourceKind, entry);
  }

  return stats;
}

function buildShanghaiDayRange(referenceTime: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(referenceTime);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const shanghaiDayStart = `${year}-${month}-${day}T00:00:00+08:00`;
  const shanghaiDayEnd = `${year}-${month}-${day}T23:59:59.999+08:00`;

  return { shanghaiDayStart, shanghaiDayEnd };
}
```

```ts
// src/server/renderSystemPages.ts
type SourceItem = {
  kind: string;
  name: string;
  rssUrl: string | null;
  isEnabled: boolean;
  lastCollectedAt: string | null;
  lastCollectionStatus: string | null;
  totalCount: number;
  publishedTodayCount: number;
  collectedTodayCount: number;
  viewStats: {
    hot: { candidateCount: number; visibleCount: number };
    articles: { candidateCount: number; visibleCount: number };
    ai: { candidateCount: number; visibleCount: number };
  };
};

function renderSourcesOverviewTable(sources: SourceItem[]) {
  return `
    <div class="source-analytics-shell">
      <table class="source-analytics-table">
        <thead>
          <tr>
            <th>来源</th>
            <th>总条数</th>
            <th>今天发布</th>
            <th>今天抓取</th>
            <th>Hot 入池 / 展示</th>
            <th>Articles 入池 / 展示</th>
            <th>AI 入池 / 展示</th>
          </tr>
        </thead>
        <tbody>
          ${sources.map(renderSourcesOverviewRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSourcesOverviewRow(source: SourceItem) {
  return `
    <tr>
      <th scope="row">${escapeHtml(source.name)}</th>
      <td>${source.totalCount}</td>
      <td>${source.publishedTodayCount}</td>
      <td>${source.collectedTodayCount}</td>
      <td>${source.viewStats.hot.candidateCount} / ${source.viewStats.hot.visibleCount}</td>
      <td>${source.viewStats.articles.candidateCount} / ${source.viewStats.articles.visibleCount}</td>
      <td>${source.viewStats.ai.candidateCount} / ${source.viewStats.ai.visibleCount}</td>
    </tr>
  `;
}
```

```ts
// src/main.ts
import { listSourceWorkbench } from "./core/source/listSourceWorkbench.js";

listSources: async () => listSourceWorkbench(db),
```

- [ ] **Step 4: 跑系统页统计测试，确认总览表和统计查询都成立**

Run: `npx vitest run tests/source/listSourceWorkbench.test.ts tests/server/systemRoutes.test.ts`

Expected: PASS，且 `/settings/sources` 同时出现操作区、总览表和 source 卡片

- [ ] **Step 5: 提交 source 工作台统计**

```bash
git add src/core/source/listSourceWorkbench.ts src/server/renderSystemPages.ts src/server/createServer.ts src/main.ts tests/source/listSourceWorkbench.test.ts tests/server/systemRoutes.test.ts
git commit -m "feat: 增加 source 工作台统计"
```

### Task 3: 给内容页增加共享 source 过滤条

**Files:**
- Create: `src/core/source/listContentSources.ts`
- Modify: `src/server/createServer.ts`
- Modify: `src/server/renderContentPages.ts`
- Modify: `src/server/public/site.js`
- Modify: `src/server/public/site.css`
- Modify: `src/main.ts`
- Modify: `tests/server/contentRoutes.test.ts`
- Modify: `tests/server/siteThemeClient.test.ts`

- [ ] **Step 1: 先写失败测试，锁定过滤条 HTML、header 传参和 localStorage 持久化**

```ts
it("renders a compact source filter bar on content pages", async () => {
  const listContentView = vi.fn().mockResolvedValue([
    {
      id: 101,
      title: "AI Weekly Insight",
      summary: "Roundup of recent AI and product updates.",
      sourceName: "OpenAI",
      sourceKind: "openai",
      canonicalUrl: "https://example.com/ai-weekly",
      publishedAt: "2026-03-31T01:00:00.000Z",
      isFavorited: false,
      reaction: "none",
      contentScore: 91,
      scoreBadges: ["24h 内"]
    }
  ]);
  const app = createServer({
    listContentView,
    listContentSources: vi.fn().mockResolvedValue([
      { kind: "openai", name: "OpenAI", isEnabled: true },
      { kind: "ithome", name: "IT之家", isEnabled: true }
    ])
  } as never);

  const response = await app.inject({ method: "GET", url: "/" });

  expect(response.body).toContain('class="content-source-filter"');
  expect(response.body).toContain('data-content-source-filter');
  expect(response.body).toContain('data-source-kind="openai"');
  expect(response.body).toContain("来源筛选");
  expect(response.body).toContain("全选");
  expect(response.body).toContain("全不选");
});

it("passes selected source kinds from shell header into listContentView", async () => {
  const listContentView = vi.fn().mockResolvedValue([]);
  const app = createServer({
    listContentView,
    listContentSources: vi.fn().mockResolvedValue([{ kind: "openai", name: "OpenAI", isEnabled: true }])
  } as never);

  await app.inject({
    method: "GET",
    url: "/articles",
    headers: {
      "x-hot-now-source-filter": "openai"
    }
  });

  expect(listContentView).toHaveBeenCalledWith("articles", { selectedSourceKinds: ["openai"] });
});
```

```ts
it("persists source filter selection and injects the header into shell fetches", async () => {
  const dom = new JSDOM(
    `<!doctype html>
<html data-theme="light">
  <body>
    <div class="shell-root">
      <aside class="shell-sidebar"></aside>
      <div class="shell-main">
        <main class="shell-content">
          <section class="content-intro content-intro--signal content-intro--hot">
            <form class="content-source-filter" data-content-source-filter data-selected-source-kinds="openai,ithome">
              <label><input type="checkbox" data-source-kind="openai" checked />OpenAI</label>
              <label><input type="checkbox" data-source-kind="ithome" checked />IT之家</label>
              <button type="button" data-source-filter-action="clear">全不选</button>
            </form>
          </section>
        </main>
      </div>
    </div>
  </body>
</html>`,
      { url: "https://example.test/", runScripts: "outside-only" }
  );

  const nextHtml = `<!doctype html><html data-theme="light"><body><div class="shell-root"><aside class="shell-sidebar"></aside><div class="shell-main"><main class="shell-content"><section class="content-empty">当前未选择任何数据源</section></main></div></div></body></html>`;
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => nextHtml });
  dom.window.fetch = fetchMock as typeof dom.window.fetch;
  dom.window.eval(siteScript);

  dom.window.document
    .querySelector('[data-source-filter-action="clear"]')
    ?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));

  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  expect(dom.window.localStorage.getItem("hot-now-content-sources")).toBe("[]");
  expect(fetchMock).toHaveBeenCalledWith("/", {
    headers: {
      accept: "text/html",
      "x-hot-now-shell-nav": "1",
      "x-hot-now-source-filter": ""
    },
    credentials: "same-origin"
  });
});
```

- [ ] **Step 2: 跑内容页过滤测试，确认当前还没有 source 过滤条与 header 传参**

Run: `npx vitest run tests/server/contentRoutes.test.ts tests/server/siteThemeClient.test.ts`

Expected: FAIL，报错点集中在过滤条 HTML 缺失、`listContentView` 还只接收 `viewKey`、site.js 还没有 source 持久化逻辑

- [ ] **Step 3: 新建内容页 source 清单查询，并在 server + render 层接线**

```ts
// src/core/source/listContentSources.ts
import type { SqliteDatabase } from "../db/openDatabase.js";

export type ContentSourceOption = {
  kind: string;
  name: string;
  isEnabled: boolean;
};

export function listContentSources(db: SqliteDatabase): ContentSourceOption[] {
  return db
    .prepare(
      `
        SELECT kind, name, is_enabled
        FROM content_sources
        ORDER BY id ASC
      `
    )
    .all()
    .map((row) => ({
      kind: row.kind,
      name: row.name,
      isEnabled: row.is_enabled === 1
    }));
}
```

```ts
// src/server/createServer.ts
type ContentSourceOption = { kind: string; name: string; isEnabled: boolean };

type ServerDeps = {
  listContentView?: (
    viewKey: ContentViewKey,
    options?: { selectedSourceKinds?: string[] }
  ) => Promise<ContentCardView[]> | ContentCardView[];
  listContentSources?: () => Promise<ContentSourceOption[]> | ContentSourceOption[];
};

async function renderContentForView(
  deps: ServerDeps,
  request: FastifyRequest,
  viewKey: ContentViewKey
): Promise<string | undefined> {
  const selectedSourceKinds = readSelectedSourceKindsHeader(request.headers["x-hot-now-source-filter"]);
  const cards = await deps.listContentView?.(viewKey, { selectedSourceKinds });
  const sourceOptions = ((await deps.listContentSources?.()) ?? []).filter((source) => source.isEnabled);

  return renderContentPage({
    viewKey,
    cards: cards ?? [],
    sourceFilter: {
      options: sourceOptions,
      selectedSourceKinds: selectedSourceKinds ?? sourceOptions.map((source) => source.kind)
    },
    emptyState: selectedSourceKinds?.length === 0
      ? {
          title: "当前未选择任何数据源",
          description: "重新全选后即可恢复内容结果。"
        }
      : undefined
  });
}

function readSelectedSourceKindsHeader(headerValue: string | string[] | undefined) {
  if (typeof headerValue === "undefined") {
    return undefined;
  }

  const rawValue = Array.isArray(headerValue) ? headerValue.join(",") : headerValue ?? "";
  const selectedSourceKinds = rawValue
    .split(",")
    .map((kind) => kind.trim())
    .filter(Boolean);

  return rawValue === "" ? [] : selectedSourceKinds;
}
```

```ts
// src/server/renderContentPages.ts
type ContentSourceFilter = {
  options: { kind: string; name: string }[];
  selectedSourceKinds: string[];
};

export function renderContentPage(view: ContentPageView): string {
  return `
    <section class="content-intro content-intro--signal content-intro--${view.viewKey}">
      <p class="content-kicker">内容菜单</p>
      <p class="content-description">${escapeHtml(pageSubtitle[view.viewKey])}</p>
      ${renderContentSourceFilter(view.sourceFilter)}
    </section>
    <section class="content-grid content-grid--${view.viewKey}">
      ${cardsHtml}
    </section>
  `;
}

function renderContentSourceFilter(sourceFilter?: ContentSourceFilter) {
  if (!sourceFilter || sourceFilter.options.length === 0) {
    return "";
  }

  const selectedKinds = new Set(sourceFilter.selectedSourceKinds);

  return `
    <form class="content-source-filter" data-content-source-filter data-selected-source-kinds="${escapeHtml(sourceFilter.selectedSourceKinds.join(","))}">
      <span class="content-source-filter-label">来源筛选</span>
      <div class="content-source-filter-options">
        ${sourceFilter.options
          .map(
            (source) => `
              <label class="content-source-filter-option">
                <input type="checkbox" data-source-kind="${escapeHtml(source.kind)}" ${selectedKinds.has(source.kind) ? "checked" : ""} />
                <span>${escapeHtml(source.name)}</span>
              </label>
            `
          )
          .join("")}
      </div>
      <div class="content-source-filter-actions">
        <button type="button" data-source-filter-action="all">全选</button>
        <button type="button" data-source-filter-action="clear">全不选</button>
      </div>
    </form>
  `;
}
```

- [ ] **Step 4: 在浏览器脚本里补 localStorage、`全选 / 全不选` 和 shell fetch header**

```ts
// src/server/public/site.js
const contentSourceStorageKey = "hot-now-content-sources";

applyInitialTheme();
hydrateContentSourceFilter();
closeMobileSystemDrawer();

root.addEventListener("change", async (event) => {
  const target = event.target;

  if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
    return;
  }

  const filter = target.closest("[data-content-source-filter]");

  if (!(filter instanceof HTMLFormElement)) {
    return;
  }

  persistContentSourceSelection(filter);
  await refreshCurrentContentSourceView();
});

root.addEventListener("click", async (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const actionButton = target.closest("[data-source-filter-action]");

  if (!(actionButton instanceof HTMLButtonElement)) {
    return;
  }

  const filter = actionButton.closest("[data-content-source-filter]");

  if (!(filter instanceof HTMLFormElement)) {
    return;
  }

  event.preventDefault();

  if (actionButton.dataset.sourceFilterAction === "all") {
    syncContentSourceCheckboxes(filter, readRenderedSourceKinds(filter));
  }

  if (actionButton.dataset.sourceFilterAction === "clear") {
    syncContentSourceCheckboxes(filter, []);
  }

  persistContentSourceSelection(filter);
  await refreshCurrentContentSourceView();
});

function buildShellFetchHeaders(targetUrl) {
  const headers = {
    accept: "text/html",
    [shellNavigationHeader]: "1"
  };

  if (isContentPathname(targetUrl.pathname)) {
    const storedKinds = readStoredContentSourceKinds();
    const selectedKinds = storedKinds ?? readRenderedSourceKinds();
    headers["x-hot-now-source-filter"] = selectedKinds.join(",");
  }

  return headers;
}

function hydrateContentSourceFilter() {
  const filter = root.querySelector("[data-content-source-filter]");

  if (!(filter instanceof HTMLFormElement)) {
    return;
  }

  const storedKinds = readStoredContentSourceKinds();

  if (storedKinds === null) {
    return;
  }

  syncContentSourceCheckboxes(filter, storedKinds);
}

function persistContentSourceSelection(filter) {
  const selectedKinds = [...filter.querySelectorAll("input[type='checkbox'][data-source-kind]")]
    .filter((checkbox) => checkbox instanceof HTMLInputElement && checkbox.checked)
    .map((checkbox) => checkbox.dataset.sourceKind)
    .filter((value) => typeof value === "string" && value.length > 0);

  localStorage.setItem(contentSourceStorageKey, JSON.stringify(selectedKinds));
}

function readStoredContentSourceKinds() {
  try {
    const rawValue = localStorage.getItem(contentSourceStorageKey);
    if (rawValue === null) {
      return null;
    }

    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    return null;
  }
}

function refreshCurrentContentSourceView() {
  return navigateShellPage(window.location.pathname + window.location.search, { pushHistory: false, force: true });
}

function isContentPathname(pathname) {
  return pathname === "/" || pathname === "/articles" || pathname === "/ai";
}

function syncContentSourceCheckboxes(filter, selectedKinds) {
  const selectedSet = new Set(selectedKinds);

  for (const checkbox of filter.querySelectorAll("input[type='checkbox'][data-source-kind]")) {
    if (!(checkbox instanceof HTMLInputElement)) {
      continue;
    }

    checkbox.checked = selectedSet.has(checkbox.dataset.sourceKind || "");
  }
}

function readRenderedSourceKinds(filter = root.querySelector("[data-content-source-filter]")) {
  if (!(filter instanceof HTMLElement)) {
    return [];
  }

  return [...filter.querySelectorAll("input[type='checkbox'][data-source-kind]")]
    .map((checkbox) => checkbox.getAttribute("data-source-kind") || "")
    .filter(Boolean);
}

// 同步扩展 navigateShellPage 的 options：
// `{ pushHistory?: boolean; force?: boolean }`
// 当 `force === true` 时跳过“同一路径直接 return”的早退出分支。
```

```ts
// src/server/public/site.css
.content-source-filter {
  position: sticky;
  top: 1rem;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: rgba(251, 247, 241, 0.9);
  box-shadow: var(--shadow-floating);
  backdrop-filter: blur(8px);
}

.content-source-filter-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.content-empty--filtered {
  border-color: var(--border-strong);
}
```

- [ ] **Step 5: 跑内容页过滤测试，确认过滤条、持久化和 shell header 都成立**

Run: `npx vitest run tests/server/contentRoutes.test.ts tests/server/siteThemeClient.test.ts`

Expected: PASS，且 source 过滤条在 shell 导航和刷新后的行为一致

- [ ] **Step 6: 提交内容页 source 过滤条**

```bash
git add src/core/source/listContentSources.ts src/server/createServer.ts src/server/renderContentPages.ts src/server/public/site.js src/server/public/site.css src/main.ts tests/server/contentRoutes.test.ts tests/server/siteThemeClient.test.ts
git commit -m "feat: 增加内容页 source 过滤条"
```

### Task 4: 同步文档并做最终验证

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Verify: `tests/source/listSourceWorkbench.test.ts`
- Verify: `tests/content/buildContentViewSelection.test.ts`
- Verify: `tests/server/contentRoutes.test.ts`
- Verify: `tests/server/systemRoutes.test.ts`
- Verify: `tests/server/siteThemeClient.test.ts`
- Verify: `npm run build`

- [ ] **Step 1: 更新 README 和 AGENTS，写清 source 统计与过滤的新边界**

```md
<!-- README.md -->
- `/settings/sources` 现在同时展示 source 工作台总览表与单个 source 卡片
- 总览表包含：总条数、今天发布、今天抓取、Hot / Articles / AI 今日入池与展示
- `/`、`/articles`、`/ai` 顶部支持来源筛选，状态保存在浏览器 localStorage
- 来源筛选只影响浏览结果，不影响 source 是否启用
```

```md
<!-- AGENTS.md -->
- `/settings/sources`：统一站点数据迭代收集页，除了 source 启停和手动操作外，还展示每个 source 的总条数、今天发布、今天抓取，以及 Hot / Articles / AI 今日入池与展示
- `/`、`/articles`、`/ai`：内容页顶部新增共享 source 复选过滤条，支持全选 / 全不选，并把浏览偏好写入 localStorage
```

- [ ] **Step 2: 先跑最相关测试矩阵，确认查询、系统页、内容页和浏览器脚本都通过**

Run: `npx vitest run tests/content/buildContentViewSelection.test.ts tests/content/listContentView.test.ts tests/source/listSourceWorkbench.test.ts tests/server/contentRoutes.test.ts tests/server/systemRoutes.test.ts tests/server/siteThemeClient.test.ts`

Expected: PASS，所有新增与改动测试通过

- [ ] **Step 3: 再跑构建，确认类型和入口没有被新的 view model 改坏**

Run: `npm run build`

Expected: PASS，TypeScript 构建通过，无新的签名错误

- [ ] **Step 4: 如需本地手动烟测，按最小路径验证 source 过滤与统计页面**

Run: `npm run dev:local`

Expected:
- `/settings/sources` 可以看到总览表在卡片上方
- `/`、`/articles`、`/ai` 顶部有紧凑悬浮过滤条
- `全不选` 后显示空态
- 勾选结果刷新后仍保留

- [ ] **Step 5: 提交文档与验证收口**

```bash
git add README.md AGENTS.md
git commit -m "docs: 同步 source 统计与过滤说明"
```

## Self-Review

### Spec coverage

- `/settings/sources` 的三层结构：Task 2 覆盖操作带下新增总览表，并保留 source 卡片
- `总条数 / 今天发布 / 今天抓取 / 今日入池与展示`：Task 2 查询与系统页模板覆盖
- 内容页顶部紧凑、可悬浮、可复选过滤条：Task 3 模板 + `site.css` 覆盖
- 三个内容页共享一套 source 选择并写入 `localStorage`：Task 3 `site.js` 覆盖
- `全选 / 全不选` 与空态：Task 3 模板、脚本和测试覆盖
- 展示数固定按系统默认口径，不受访客勾选影响：Task 2 通过共享选择器默认全选统计覆盖
- 不做历史报表和 URL 参数同步：本计划未引入新表、趋势图或 URL state

### Placeholder scan

- 没有 `TBD`、`TODO`、`implement later`
- 每个 Task 都写清了实际文件、测试、命令和提交点
- 所有新增能力都指定了对应代码入口和测试入口

### Type consistency

- `listContentView(viewKey, options?)` 在 Task 1 和 Task 3 中保持同一签名
- `SourceItem` / `SourceWorkbenchRow` 的统计字段在 Task 2 和 Task 4 中命名一致：
  - `totalCount`
  - `publishedTodayCount`
  - `collectedTodayCount`
  - `viewStats.<view>.candidateCount`
  - `viewStats.<view>.visibleCount`
- 内容页过滤 header 统一使用 `x-hot-now-source-filter`，不混用 query 参数或 cookie
