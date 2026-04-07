# HotNow AI Content Strategy And Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `AI 新讯` 真正按 `24 小时 + 已保存 gate 规则` 构建结果集，并让 `AI 新讯 / AI 热点` 都改成 `50 条 / 页` 的可分页内容流，不再受旧的 `20` 条总截断影响。

**Architecture:** 保持现有 `buildContentViewSelection -> buildContentPageModel -> createServer API -> Vue 内容页` 这条链路不变，只把“结果集构建”和“分页切片”拆清楚。`buildContentViewSelection` 负责根据 gate 作用域、时间窗口和排序拿到完整结果集；`buildContentPageModel` 负责把完整结果集切成当前页并补齐分页元数据；Vue 内容页再通过 `page` query 驱动翻页，不把分页状态写入 `localStorage`。

**Tech Stack:** TypeScript, Fastify, better-sqlite3, Vue 3, Vue Router, Ant Design Vue, Vitest

---

## File Map

- Modify: `src/core/content/buildContentViewSelection.ts`
  - 给 `ai` 视图加 24 小时硬过滤，去掉 `hot / ai` 的旧总量截断，并把“完整结果集”和“当前页切片”彻底拆开
- Modify: `src/core/content/buildContentPageModel.ts`
  - 增加 `page` / `pageSize` / `pagination` 元数据，并负责把完整结果集切成当前页
- Modify: `src/core/content/listContentView.ts`
  - 保持旧调用方还能拿到“当前默认可见结果”，同时复用新的完整结果集选择逻辑
- Modify: `src/core/source/listSourceWorkbench.ts`
  - 让 `/settings/sources` 的 `AI 新讯 / AI 热点 展示数` 跟新分页语义对齐，不再偷偷沿用旧的 20 条上限
- Modify: `src/main.ts`
  - 把新的 `page` 选项透传给 `buildContentPageModel`
- Modify: `src/server/createServer.ts`
  - 解析 `page` query，扩展内容页 JSON 响应模型，并保持 fallback 路径和测试注入签名一致
- Modify: `src/client/services/contentApi.ts`
  - 让 `/api/content/ai-new`、`/api/content/ai-hot` 支持 `?page=`，并暴露分页元数据给页面
- Create: `src/client/components/content/ContentPaginationBar.vue`
  - 提供统一的紧凑分页条，服务 `AI 新讯 / AI 热点`
- Modify: `src/client/pages/content/AiNewPage.vue`
  - 接入分页 query、AI 新讯 24 小时空态文案、翻页和筛选/排序后的回到第一页逻辑
- Modify: `src/client/pages/content/AiHotPage.vue`
  - 接入分页 query、翻页和筛选/排序后的回到第一页逻辑
- Modify: `src/client/pages/settings/ViewRulesPage.vue`
  - 补充说明文案，明确 `AI 新讯` 是固定 24 小时窗口，`AI 热点` 不做人为 24 小时压缩
- Modify: `README.md`
  - 同步内容页分页和 AI 新讯 24 小时策略口径
- Modify: `AGENTS.md`
  - 同步 `/api/content/*?page=`、AI 新讯 24 小时窗口与分页行为
- Modify: `tests/content/buildContentViewSelection.test.ts`
  - 覆盖 24 小时硬过滤、时间戳回退、`AI 热点` 不限 24 小时，以及 `hot / ai` 结果不再被 20 条总截断
- Create: `tests/content/buildContentPageModel.test.ts`
  - 覆盖分页切片、总条数、总页数、越界页回退到最后一页
- Modify: `tests/content/listContentView.test.ts`
  - 回归 `listContentView` 现在对 `hot / ai` 返回完整结果集，不再断言旧的 20 条上限
- Modify: `tests/source/listSourceWorkbench.test.ts`
  - 覆盖工作台 `AI 新讯 / AI 热点 展示数` 跟随新分页语义更新
- Modify: `tests/server/contentRoutes.test.ts`
  - 覆盖 `page` query 传递和内容页 API 返回分页元数据
- Modify: `tests/client/contentApi.test.ts`
  - 覆盖 `?page=` URL 生成，不把分页写进 `localStorage`
- Modify: `tests/client/aiNewPage.test.ts`
  - 覆盖 AI 新讯分页条、query 同步、筛选/排序后回到第一页
- Modify: `tests/client/aiHotPage.test.ts`
  - 覆盖 AI 热点分页条和 query 同步
- Modify: `tests/client/viewRulesPage.test.ts`
  - 覆盖新的 AI 新讯 / AI 热点策略说明文案

### Task 1: 重写 AI 结果集边界，并让工作台统计脱离旧的 20 条上限

**Files:**
- Modify: `src/core/content/buildContentViewSelection.ts`
- Modify: `src/core/content/listContentView.ts`
- Modify: `src/core/source/listSourceWorkbench.ts`
- Modify: `tests/content/buildContentViewSelection.test.ts`
- Modify: `tests/content/listContentView.test.ts`
- Modify: `tests/source/listSourceWorkbench.test.ts`

- [ ] **Step 1: 先写失败测试，锁定 AI 新讯 24 小时硬过滤和 AI 热点不限 24 小时**

```ts
it("keeps only ai items from the last 24 hours using published/fetched/created fallback", async () => {
  const db = await createTestDatabase(databasesToClose);
  const openai = resolveSourceByKind(db, "openai");

  upsertContentItems(db, {
    sourceId: openai!.id,
    items: [
      buildItem("Within published", "2026-03-31T03:00:00.000Z"),
      {
        title: "Within fetched fallback",
        canonicalUrl: "https://example.com/within-fetched-fallback",
        summary: "fallback summary",
        bodyMarkdown: "fallback body",
        publishedAt: null,
        fetchedAt: "2026-03-31T02:00:00.000Z"
      },
      {
        title: "Too old for ai-new",
        canonicalUrl: "https://example.com/too-old-for-ai-new",
        summary: "old summary",
        bodyMarkdown: "old body",
        publishedAt: "2026-03-29T00:00:00.000Z",
        fetchedAt: "2026-03-29T00:05:00.000Z"
      }
    ]
  });

  const aiSelection = buildContentViewSelection(db, "ai");
  const hotSelection = buildContentViewSelection(db, "hot");

  expect(aiSelection.visibleCards.map((card) => card.title)).toEqual([
    "Within published",
    "Within fetched fallback"
  ]);
  expect(hotSelection.visibleCards.map((card) => card.title)).toContain("Too old for ai-new");
});

it("no longer caps hot and ai result sets at the old fixed limit", async () => {
  const db = await createTestDatabase(databasesToClose);
  const openai = resolveSourceByKind(db, "openai");

  upsertContentItems(db, {
    sourceId: openai!.id,
    items: Array.from({ length: 60 }, (_, index) => ({
      title: `Result ${index + 1}`,
      canonicalUrl: `https://example.com/result-${index + 1}`,
      summary: "summary",
      bodyMarkdown: "body",
      publishedAt: `2026-03-31T${String(23 - (index % 24)).padStart(2, "0")}:00:00.000Z`,
      fetchedAt: `2026-03-31T${String(23 - (index % 24)).padStart(2, "0")}:05:00.000Z`
    }))
  });

  expect(buildContentViewSelection(db, "ai").visibleCards).toHaveLength(60);
});
```

- [ ] **Step 2: 跑核心测试，确认当前实现仍然沿用旧 limit / freshness 语义**

Run: `npx vitest run tests/content/buildContentViewSelection.test.ts tests/content/listContentView.test.ts tests/source/listSourceWorkbench.test.ts`

Expected: FAIL，失败点集中在：
- `ai` 视图还会把超过 24 小时但高分的内容留下
- `hot / ai` 仍然受到旧的 `20` 条上限影响
- source workbench 的 `todayVisibleCount` 仍按旧 limit 计算

- [ ] **Step 3: 最小实现完整结果集逻辑，不再让旧 numeric config 控制 AI 新讯 / AI 热点结果边界**

```ts
// src/core/content/buildContentViewSelection.ts
function buildRankedCardCandidate(
  row: ContentCardRow,
  context: {
    viewKey: ContentViewKey;
    viewRuleConfig: ViewRuleConfigValues;
    referenceTime: Date;
    includeNlEvaluations: boolean;
  }
): RankedContentCardCandidate {
  const rankingTimestamp = row.publishedAt ?? row.rankingTimestamp;

  return {
    id: row.id,
    title: row.title,
    summary: row.summary?.trim() || "暂无摘要",
    sourceName: row.sourceName,
    sourceKind: row.sourceKind,
    showAllWhenSelected: row.showAllWhenSelected === 1,
    canonicalUrl: row.canonicalUrl,
    publishedAt: row.publishedAt,
    contentScore: score.contentScore,
    scoreBadges: score.badges,
    feedbackEntry: row.feedbackEntryId
      ? {
          freeText: row.feedbackFreeText,
          suggestedEffect: normalizeSuggestedEffect(row.feedbackSuggestedEffect),
          strengthLevel: normalizeStrengthLevel(row.feedbackStrengthLevel),
          positiveKeywords: parseKeywordJson(row.feedbackPositiveKeywordsJson),
          negativeKeywords: parseKeywordJson(row.feedbackNegativeKeywordsJson)
        }
      : undefined,
    rankingScore: calculateViewRankingScore(
      context.viewKey,
      context.viewRuleConfig,
      score,
      row.sourceKind,
      rankingTimestamp,
      context.referenceTime,
      context.includeNlEvaluations ? (row.baseScoreDelta ?? 0) + (row.viewScoreDelta ?? 0) : 0
    ),
    rankingTimestamp,
    isBlocked:
      shouldBlockByTimeWindow(context.viewKey, row, context.referenceTime) ||
      (context.includeNlEvaluations &&
        (normalizeNlDecision(row.baseDecision) === "block" || normalizeNlDecision(row.viewDecision) === "block"))
  };
}

function shouldBlockByTimeWindow(
  viewKey: ContentViewKey,
  row: Pick<ContentCardRow, "publishedAt" | "rankingTimestamp">,
  referenceTime: Date
): boolean {
  if (viewKey !== "ai") {
    return false;
  }

  const timestamp = row.publishedAt ?? row.rankingTimestamp;
  return !isWithinLastHours(timestamp, referenceTime, 24);
}

function isWithinLastHours(value: string | null, referenceTime: Date, hours: number): boolean {
  if (!value) {
    return false;
  }

  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return false;
  }

  const windowStart = referenceTime.getTime() - hours * 60 * 60 * 1000;
  return parsed >= windowStart && parsed <= referenceTime.getTime();
}

export function buildContentViewSelection(
  db: SqliteDatabase,
  viewKey: ContentViewKey,
  options: ContentViewSelectionOptions = {}
): ContentViewSelection {
  const viewRuleConfig = getInternalViewRuleConfig(viewKey);
  const referenceTime = options.referenceTime ?? new Date();
  const includeNlEvaluations = options.includeNlEvaluations ?? true;
  const sortMode = options.sortMode;
  const selectedSourceKinds = normalizeSelectedSourceKinds(options.selectedSourceKinds);
  const rows = db
    .prepare(contentSelectSql)
    .all({ viewScope: mapViewScope(viewKey) }) as ContentCardRow[];
  const rankedCandidates = rows
    .map((row) =>
      buildRankedCardCandidate(row, {
        viewKey,
        viewRuleConfig,
        referenceTime,
        includeNlEvaluations
      })
    )
    .filter((card) => !card.isBlocked);
  const rankedCards = rankedCandidates
    .filter((card) => selectedSourceKinds === null || selectedSourceKinds.has(card.sourceKind))
    .sort(compareByRanking);
  const visibleCards = rankedCards
    .sort((left, right) => compareVisibleCards(sortMode, left, right))
    .map(stripInternalSelectionCard);
  const visibleCountsBySourceKind = countStableVisibleCardsBySourceKind(
    rankedCandidates,
    viewKey === "articles" ? viewRuleConfig.limit : Number.MAX_SAFE_INTEGER
  );
  const currentPageMetricsBySourceKind = countCurrentPageMetricsBySourceKind(
    rankedCards,
    visibleCards,
    referenceTime
  );
  const currentPageTodayVisibleCount = Object.values(currentPageMetricsBySourceKind)
    .reduce((sum, entry) => sum + entry.todayVisibleCount, 0);

  return {
    candidateCards: rankedCards.map(stripInternalSelectionCard),
    visibleCards,
    visibleCountsBySourceKind,
    currentPageMetricsBySourceKind: applyCurrentPageVisibleShares(
      currentPageMetricsBySourceKind,
      currentPageTodayVisibleCount
    ),
    currentPageTodayVisibleCount
  };
}

export function collectIndependentTodayStatsBySourceForView(
  db: SqliteDatabase,
  viewKey: ContentViewKey,
  sourceKinds: string[],
  options: Pick<ContentViewSelectionOptions, "includeNlEvaluations" | "referenceTime"> = {}
) {
  // articles 仍保留旧 limit；hot / ai 改成统计完整展示结果。
  const visibleCards = viewKey === "articles" ? cards.slice(0, viewRuleConfig.limit) : cards;

  const metrics = {
    todayCandidateCount: countCardsWithinShanghaiDay(cards, shanghaiDayStart, shanghaiNextDayStart),
    todayVisibleCount: countCardsWithinShanghaiDay(visibleCards, shanghaiDayStart, shanghaiNextDayStart),
    todayVisibleShare: 0
  };
}
```

- [ ] **Step 4: 回归跑核心测试，确认完整结果集与工作台统计已经对齐**

Run: `npx vitest run tests/content/buildContentViewSelection.test.ts tests/content/listContentView.test.ts tests/source/listSourceWorkbench.test.ts`

Expected: PASS，且新的断言能证明：
- `AI 新讯` 只保留最近 24 小时
- `AI 热点` 仍保留较旧但符合热点逻辑的内容
- `hot / ai` 结果和工作台展示统计不再被 20 条硬截断

- [ ] **Step 5: 提交 Task 1**

```bash
git add tests/content/buildContentViewSelection.test.ts tests/content/listContentView.test.ts tests/source/listSourceWorkbench.test.ts src/core/content/buildContentViewSelection.ts src/core/content/listContentView.ts src/core/source/listSourceWorkbench.ts
git commit -m "fix: 收口 AI 内容结果集边界"
```

### Task 2: 在内容页模型和内容 API 上补齐分页元数据与 page query

**Files:**
- Create: `tests/content/buildContentPageModel.test.ts`
- Modify: `src/core/content/buildContentPageModel.ts`
- Modify: `src/main.ts`
- Modify: `src/server/createServer.ts`
- Modify: `tests/server/contentRoutes.test.ts`

- [ ] **Step 1: 先写失败测试，锁定分页切片、总页数和越界页回退行为**

```ts
// tests/content/buildContentPageModel.test.ts
it("slices ai-new cards into 50-item pages and falls back out-of-range pages to the last page", async () => {
  const db = await createTestDatabase(databasesToClose);
  const openai = resolveSourceByKind(db, "openai");

  upsertContentItems(db, {
    sourceId: openai!.id,
    items: Array.from({ length: 120 }, (_, index) => ({
      title: `Paged ${index + 1}`,
      canonicalUrl: `https://example.com/paged-${index + 1}`,
      summary: "summary",
      bodyMarkdown: "body",
      publishedAt: new Date(Date.UTC(2026, 2, 31, 3, 59 - index, 0)).toISOString(),
      fetchedAt: new Date(Date.UTC(2026, 2, 31, 3, 59 - index, 5)).toISOString()
    }))
  });

  const pageTwo = buildContentPageModel(db, "ai-new", { page: 2 });
  const overflowPage = buildContentPageModel(db, "ai-new", { page: 9 });

  expect(pageTwo.pagination).toEqual({
    page: 2,
    pageSize: 50,
    totalResults: 120,
    totalPages: 3
  });
  expect(pageTwo.cards).toHaveLength(50);
  expect(overflowPage.pagination?.page).toBe(3);
  expect(overflowPage.cards).toHaveLength(20);
});
```

```ts
// tests/server/contentRoutes.test.ts
expect(aiNewPayload.pagination).toEqual({
  page: 2,
  pageSize: 50,
  totalResults: 120,
  totalPages: 3
});
expect(getContentPageModel).toHaveBeenCalledWith("ai-new", {
  selectedSourceKinds: ["openai"],
  sortMode: "published_at",
  page: 2
});
```

- [ ] **Step 2: 跑模型和 API 测试，确认当前还没有 pagination 字段和 page query 解析**

Run: `npx vitest run tests/content/buildContentPageModel.test.ts tests/server/contentRoutes.test.ts`

Expected: FAIL，失败点集中在：
- `buildContentPageModel` 还没有 `page` / `pagination`
- `/api/content/ai-new?page=2` 还不会把页码传给核心模型

- [ ] **Step 3: 在内容模型层而不是策略层做分页切片**

```ts
// src/core/content/buildContentPageModel.ts
export type ContentPagination = {
  page: number;
  pageSize: number;
  totalResults: number;
  totalPages: number;
};

export type BuildContentPageModelOptions = {
  includeNlEvaluations?: boolean;
  selectedSourceKinds?: string[];
  sortMode?: ContentSortMode;
  page?: number;
  pageSize?: number;
};

export type ContentPageModel = {
  pageKey: ContentPageKey;
  sourceFilter?: {
    options: { kind: string; name: string; showAllWhenSelected: boolean; currentPageVisibleCount: number }[];
    selectedSourceKinds: string[];
  };
  featuredCard: ContentCardView | null;
  cards: ContentCardView[];
  pagination: ContentPagination | null;
  emptyState: {
    title: string;
    description: string;
    tone: "default" | "degraded" | "filtered";
  } | null;
};

export function buildContentPageModel(
  db: SqliteDatabase,
  pageKey: ContentPageKey,
  options: BuildContentPageModelOptions = {}
): ContentPageModel {
  const pageSize = 50;
  const requestedPage = normalizeRequestedPage(options.page);
  const sourceOptions = listContentSources(db).filter((source) => source.isEnabled);
  const selectedSourceKinds = normalizeSelectedSourceKinds(options.selectedSourceKinds, sourceOptions);
  const effectiveSelectedSourceKinds = selectedSourceKinds ?? deriveDefaultSelectedSourceKinds(sourceOptions);
  const selection = buildContentViewSelection(db, pageKey === "ai-hot" ? "hot" : "ai", {
    includeNlEvaluations: options.includeNlEvaluations,
    selectedSourceKinds: effectiveSelectedSourceKinds,
    sortMode: options.sortMode ?? "published_at"
  });
  const allCards = selection.visibleCards.map(stripRankedCard);
  const pagination = paginateCards(allCards, requestedPage, pageSize);

  return {
    pageKey,
    sourceFilter:
      sourceOptions.length > 0
        ? {
            options: sourceOptions.map((source) => ({
              kind: source.kind,
              name: source.name,
              showAllWhenSelected: source.showAllWhenSelected,
              currentPageVisibleCount: countCurrentPageVisibleCardsBySourceKind(pagination.cards)[source.kind] ?? 0
            })),
            selectedSourceKinds: effectiveSelectedSourceKinds
          }
        : undefined,
    featuredCard: null,
    cards: pagination.cards,
    pagination: pagination.meta,
    emptyState:
      effectiveSelectedSourceKinds.length === 0
        ? {
            title: "当前未选择任何数据源",
            description: "重新全选后即可恢复内容结果。",
            tone: "filtered"
          }
        : pagination.meta.totalResults > 0
          ? null
          : {
              title: pageKey === "ai-new" ? "当前 24 小时内暂无 AI 新讯" : "暂无 AI 热点",
              description: pageKey === "ai-new"
                ? "可以稍后刷新，或者检查最近 24 小时内是否有新的 AI 内容进入内容池。"
                : "可以稍后刷新，或先检查数据源采集状态。",
              tone: "default"
            }
  };
}

function paginateCards(cards: ContentCardView[], requestedPage: number, pageSize: number) {
  const totalResults = cards.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * pageSize;

  return {
    cards: cards.slice(start, start + pageSize),
    meta: { page, pageSize, totalResults, totalPages }
  };
}
```

```ts
// src/server/createServer.ts
type ContentPageModel = {
  pageKey: ContentPageKey;
  sourceFilter?: {
    options: { kind: string; name: string; showAllWhenSelected: boolean; currentPageVisibleCount: number }[];
    selectedSourceKinds: string[];
  };
  featuredCard: ContentCardView | null;
  cards: ContentCardView[];
  pagination: {
    page: number;
    pageSize: number;
    totalResults: number;
    totalPages: number;
  } | null;
  emptyState: {
    title: string;
    description: string;
    tone: "default" | "degraded" | "filtered";
  } | null;
};

function readContentPageQueryPage(request: FastifyRequest): number | undefined {
  const rawValue = (request.query as { page?: string | number | undefined }).page;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
}

return deps.getContentPageModel(pageKey, {
  selectedSourceKinds,
  sortMode,
  page: readContentPageQueryPage(request)
});
```

- [ ] **Step 4: 回归跑模型和 API 测试，确认 page query 与分页元数据全通**

Run: `npx vitest run tests/content/buildContentPageModel.test.ts tests/server/contentRoutes.test.ts`

Expected: PASS，且：
- `page` 缺失/非法时回落到 `1`
- 超出总页数时回退到最后一页
- 内容页 API 返回 `pagination`

- [ ] **Step 5: 提交 Task 2**

```bash
git add tests/content/buildContentPageModel.test.ts tests/server/contentRoutes.test.ts src/core/content/buildContentPageModel.ts src/server/createServer.ts src/main.ts
git commit -m "feat: 为 AI 内容页增加分页模型"
```

### Task 3: 给 AI 新讯 / AI 热点 Vue 内容页加上分页条和 query 同步

**Files:**
- Create: `src/client/components/content/ContentPaginationBar.vue`
- Modify: `src/client/services/contentApi.ts`
- Modify: `src/client/pages/content/AiNewPage.vue`
- Modify: `src/client/pages/content/AiHotPage.vue`
- Modify: `tests/client/contentApi.test.ts`
- Modify: `tests/client/aiNewPage.test.ts`
- Modify: `tests/client/aiHotPage.test.ts`

- [ ] **Step 1: 先写失败测试，锁定客户端的 page query、分页条和“筛选/排序后回到第一页”**

```ts
// tests/client/contentApi.test.ts
await readAiNewPage({ selectedSourceKinds: ["openai"], sortMode: "content_score", page: 2 });

expect(requestJson).toHaveBeenCalledWith(
  "/api/content/ai-new?page=2",
  expect.objectContaining({
    headers: {
      "x-hot-now-source-filter": "openai",
      "x-hot-now-content-sort": "content_score"
    }
  })
);
expect(window.localStorage.getItem("hot-now-content-sources")).toBeNull();
```

```ts
// tests/client/aiNewPage.test.ts
expect(wrapper.find("[data-content-pagination]").exists()).toBe(true);
expect(wrapper.get("[data-content-pagination]").text()).toContain("第 2 / 3 页");

await wrapper.get("[data-content-sort-mode='content_score']").trigger("click");
await flushPromises();

expect(router.replace).toHaveBeenCalledWith({
  query: {
    page: "1"
  }
});
expect(contentApiMocks.readAiNewPage).toHaveBeenLastCalledWith({
  selectedSourceKinds: ["openai"],
  sortMode: "content_score",
  page: 1
});
```

- [ ] **Step 2: 跑客户端测试，确认当前页面还没有分页条也不会读写 page query**

Run: `npx vitest run tests/client/contentApi.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts`

Expected: FAIL，失败点集中在：
- `readAiNewPage` / `readAiHotPage` 还不支持 `page`
- 页面还没渲染分页条
- 筛选/排序变化后不会把 query page 重置到 `1`

- [ ] **Step 3: 增加统一分页组件，并让两个内容页都以 route query 为唯一分页状态来源**

```vue
<!-- src/client/components/content/ContentPaginationBar.vue -->
<script setup lang="ts">
const props = defineProps<{
  page: number;
  pageSize: number;
  totalResults: number;
  totalPages: number;
}>();

const emit = defineEmits<{
  change: [page: number];
}>();
</script>

<template>
  <div
    v-if="totalResults > pageSize"
    class="flex items-center justify-between gap-3 rounded-editorial-lg border border-editorial-line bg-editorial-panel px-4 py-3"
    data-content-pagination
  >
    <span class="text-xs text-editorial-muted">
      第 {{ page }} / {{ totalPages }} 页 · 共 {{ totalResults }} 条
    </span>

    <a-pagination
      size="small"
      :current="page"
      :page-size="pageSize"
      :total="totalResults"
      :show-size-changer="false"
      @change="(nextPage) => emit('change', nextPage)"
    />
  </div>
</template>
```

```ts
// src/client/services/contentApi.ts
export type ContentPageModel = {
  pageKey: ContentPageKey;
  sourceFilter?: ContentSourceFilter;
  featuredCard: ContentCard | null;
  cards: ContentCard[];
  pagination: {
    page: number;
    pageSize: number;
    totalResults: number;
    totalPages: number;
  } | null;
  emptyState: {
    title: string;
    description: string;
    tone: "default" | "degraded" | "filtered";
  } | null;
};

export type ReadContentPageOptions = {
  selectedSourceKinds?: string[];
  sortMode?: ContentSortMode;
  page?: number;
};

function buildContentPagePath(path: string, page?: number): string {
  if (!page || page <= 1) {
    return path;
  }

  return `${path}?page=${encodeURIComponent(String(page))}`;
}

export function readAiNewPage(options: ReadContentPageOptions = {}) {
  return readContentPage(buildContentPagePath("/api/content/ai-new", options.page), options.selectedSourceKinds, options.sortMode);
}
```

```ts
// src/client/pages/content/AiNewPage.vue
const route = useRoute();
const router = useRouter();

const currentPage = computed(() => normalizeRoutePage(route.query.page));

async function loadPage(options: { selectedKinds?: string[]; silent?: boolean; page?: number } = {}) {
  const nextModel = await readAiNewPage({
    selectedSourceKinds: options.selectedKinds ?? readPageSourceKinds(),
    sortMode: sortMode.value,
    page: options.page ?? currentPage.value
  });

  pageModel.value = nextModel;

  if (nextModel.pagination && nextModel.pagination.page !== currentPage.value) {
    await replacePageQuery(nextModel.pagination.page);
  }
}

async function handlePaginationChange(nextPage: number) {
  await replacePageQuery(nextPage);
  await loadPage({ silent: true, page: nextPage });
}

async function handleSortModeChange(nextSortMode: ContentSortMode) {
  sortMode.value = nextSortMode;
  writeStoredContentSortMode(nextSortMode);
  await replacePageQuery(1);
  await loadPage({ selectedKinds: readPageSourceKinds(), silent: true, page: 1 });
}
```

- [ ] **Step 4: 回归跑客户端测试，确认 query、分页和页面刷新逻辑都成立**

Run: `npx vitest run tests/client/contentApi.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts`

Expected: PASS，且：
- `page` 只写进 URL，不写进 `localStorage`
- `AI 新讯 / AI 热点` 都会渲染分页条
- 筛选/排序变化后会自动回到第一页

- [ ] **Step 5: 提交 Task 3**

```bash
git add tests/client/contentApi.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts src/client/components/content/ContentPaginationBar.vue src/client/services/contentApi.ts src/client/pages/content/AiNewPage.vue src/client/pages/content/AiHotPage.vue
git commit -m "feat: 为 AI 新讯与 AI 热点接入分页交互"
```

### Task 4: 补齐策略说明文案、协作文档和最终回归

**Files:**
- Modify: `src/client/pages/settings/ViewRulesPage.vue`
- Modify: `tests/client/viewRulesPage.test.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: 先写失败测试，锁定设置页的策略说明要把 AI 新讯 24 小时窗口讲清楚**

```ts
expect(wrapper.get("[data-view-rules-section='nl-rules']").text()).toContain("AI 新讯固定按最近 24 小时窗口构建结果集");
expect(wrapper.get("[data-view-rules-section='nl-rules']").text()).toContain("AI 热点不会被额外压成 24 小时");
```

- [ ] **Step 2: 跑设置页测试，确认当前文案还没覆盖新的页面语义**

Run: `npx vitest run tests/client/viewRulesPage.test.ts`

Expected: FAIL，失败点是新的说明文案尚未出现

- [ ] **Step 3: 更新设置页说明和协作文档**

```vue
<!-- src/client/pages/settings/ViewRulesPage.vue -->
<a-alert
  type="info"
  show-icon
  message="AI 新讯固定按最近 24 小时窗口构建结果集；AI 热点继续按热点形成逻辑筛选，不会被额外压成 24 小时。"
/>
```

```md
<!-- README.md / AGENTS.md -->
- `/api/content/ai-new?page=<n>` 与 `/api/content/ai-hot?page=<n>` 支持分页，固定 `50` 条 / 页
- `AI 新讯` 结果集固定为最近 `24` 小时内且满足 `ai_new` gate 的内容
- `AI 热点` 结果集固定为满足 `ai_hot` gate 与热点形成逻辑的内容，不加 `24` 小时硬窗
```

- [ ] **Step 4: 跑这轮最相关验证，确认前后端、客户端和文档口径已经统一**

Run:

```bash
npx vitest run tests/content/buildContentViewSelection.test.ts tests/content/buildContentPageModel.test.ts tests/content/listContentView.test.ts tests/source/listSourceWorkbench.test.ts tests/server/contentRoutes.test.ts tests/client/contentApi.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts tests/client/viewRulesPage.test.ts
npm run build
```

Expected:
- 第一条命令 PASS
- `npm run build` PASS

- [ ] **Step 5: 提交 Task 4**

```bash
git add tests/client/viewRulesPage.test.ts README.md AGENTS.md src/client/pages/settings/ViewRulesPage.vue
git commit -m "docs: 同步 AI 内容策略与分页口径"
```

## Self-Review

- Spec coverage:
  - `/settings/view-rules` 与内容页真实逻辑接线：Task 1 + Task 4
  - `AI 新讯` 严格 24 小时：Task 1
  - `AI 热点` 不压 24 小时：Task 1
  - 两页每页 50 条分页：Task 2 + Task 3
  - `page` query、越界处理、排序后再分页：Task 2 + Task 3
  - 策略说明与协作文档同步：Task 4
- Placeholder scan:
  - 没有保留 `TODO` / `TBD` / “后续再补” 这类空洞步骤
  - 每个 Task 都给了明确文件、代码片段、验证命令和提交动作
- Type consistency:
  - 统一使用 `ContentPageModel.pagination`
  - 统一使用 `page` query 和 `50` 条固定页大小
  - `AI 新讯` 对应 `ai` 视图，`AI 热点` 对应 `hot` 视图
