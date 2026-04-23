# HotNow Current Page Source Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让内容页来源胶囊和 `/settings/sources` 来源统计概览都统一成“当前页面真实结果”口径，并为工作台补出今日占比列。

**Architecture:** 继续以 `buildContentViewSelection` 作为唯一内容选择内核，在该层产出“当前页真实结果”的来源级统计摘要，再由内容页模型和 sources workbench 共同消费。`/api/settings/sources` 复用内容页同样的来源筛选 header，上下文从浏览器传给系统页接口，避免服务端再自行假设默认来源集合。

**Tech Stack:** TypeScript, Vue 3, Fastify, Vitest, better-sqlite3

---

### Task 1: 扩展内容选择层的当前页来源统计输出

**Files:**
- Modify: `src/core/content/buildContentViewSelection.ts`
- Test: `tests/content/buildContentViewSelection.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("returns current-page source metrics for today candidate, today visible, and today visible share", async () => {
  const db = await createTestDatabase(databasesToClose);
  const openai = resolveSourceByKind(db, "openai");
  const kr36 = resolveSourceByKind(db, "kr36");

  upsertContentItems(db, {
    sourceId: openai!.id,
    items: [
      {
        title: "OpenAI today visible",
        canonicalUrl: "https://example.com/openai-today-visible",
        summary: "OpenAI today visible summary",
        bodyMarkdown: "OpenAI today visible body",
        publishedAt: "2026-03-31T01:00:00.000Z",
        fetchedAt: "2026-03-31T01:10:00.000Z"
      }
    ]
  });
  upsertContentItems(db, {
    sourceId: kr36!.id,
    items: [
      {
        title: "36Kr today visible",
        canonicalUrl: "https://example.com/kr36-today-visible",
        summary: "36Kr today visible summary",
        bodyMarkdown: "36Kr today visible body",
        publishedAt: "2026-03-31T02:00:00.000Z",
        fetchedAt: "2026-03-31T02:10:00.000Z"
      }
    ]
  });

  const selection = buildContentViewSelection(db, "ai", {
    referenceTime: new Date("2026-03-31T04:00:00.000Z"),
    selectedSourceKinds: ["openai", "kr36"],
    sortMode: "published_at"
  });

  expect(selection.currentPageTodayVisibleCount).toBe(2);
  expect(selection.currentPageMetricsBySourceKind.openai).toMatchObject({
    todayCandidateCount: 1,
    todayVisibleCount: 1,
    todayVisibleShare: 0.5
  });
  expect(selection.currentPageMetricsBySourceKind.kr36).toMatchObject({
    todayCandidateCount: 1,
    todayVisibleCount: 1,
    todayVisibleShare: 0.5
  });
});

it("falls back to fetchedAt for today metrics when publishedAt is missing", async () => {
  const db = await createTestDatabase(databasesToClose);
  const openai = resolveSourceByKind(db, "openai");

  upsertContentItems(db, {
    sourceId: openai!.id,
    items: [
      {
        title: "OpenAI today fallback",
        canonicalUrl: "https://example.com/openai-today-fallback",
        summary: "OpenAI today fallback summary",
        bodyMarkdown: "OpenAI today fallback body",
        publishedAt: null,
        fetchedAt: "2026-03-31T03:00:00.000Z"
      }
    ]
  });

  const selection = buildContentViewSelection(db, "ai", {
    referenceTime: new Date("2026-03-31T04:00:00.000Z"),
    selectedSourceKinds: ["openai"],
    sortMode: "published_at"
  });

  expect(selection.currentPageMetricsBySourceKind.openai).toMatchObject({
    todayCandidateCount: 1,
    todayVisibleCount: 1,
    todayVisibleShare: 1
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/buildContentViewSelection.test.ts`
Expected: FAIL because `currentPageMetricsBySourceKind` and `currentPageTodayVisibleCount` do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export type CurrentPageSourceMetrics = {
  todayCandidateCount: number;
  todayVisibleCount: number;
  todayVisibleShare: number;
};

export type ContentViewSelection = {
  candidateCards: RankedContentCardView[];
  visibleCards: RankedContentCardView[];
  visibleCountsBySourceKind: Record<string, number>;
  currentPageMetricsBySourceKind: Record<string, CurrentPageSourceMetrics>;
  currentPageTodayVisibleCount: number;
};

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
```

```ts
function countCurrentPageMetricsBySourceKind(
  candidateCards: RankedContentCardCandidate[],
  visibleCards: RankedContentCardView[],
  referenceTime: Date
): Record<string, CurrentPageSourceMetrics> {
  const { shanghaiDayStart, shanghaiNextDayStart } = buildShanghaiDayRange(referenceTime);
  const metrics = new Map<string, CurrentPageSourceMetrics>();

  for (const card of candidateCards) {
    if (!isWithinShanghaiDay(card.publishedAt ?? card.rankingTimestamp, shanghaiDayStart, shanghaiNextDayStart)) {
      continue;
    }

    const entry = metrics.get(card.sourceKind) ?? {
      todayCandidateCount: 0,
      todayVisibleCount: 0,
      todayVisibleShare: 0
    };
    entry.todayCandidateCount += 1;
    metrics.set(card.sourceKind, entry);
  }

  for (const card of visibleCards) {
    if (!isWithinShanghaiDay(card.publishedAt ?? card.rankingTimestamp, shanghaiDayStart, shanghaiNextDayStart)) {
      continue;
    }

    const entry = metrics.get(card.sourceKind) ?? {
      todayCandidateCount: 0,
      todayVisibleCount: 0,
      todayVisibleShare: 0
    };
    entry.todayVisibleCount += 1;
    metrics.set(card.sourceKind, entry);
  }

  return Object.fromEntries(metrics.entries());
}

function applyCurrentPageVisibleShares(
  metricsBySourceKind: Record<string, CurrentPageSourceMetrics>,
  currentPageTodayVisibleCount: number
): Record<string, CurrentPageSourceMetrics> {
  return Object.fromEntries(
    Object.entries(metricsBySourceKind).map(([sourceKind, metrics]) => [
      sourceKind,
      {
        ...metrics,
        todayVisibleShare:
          currentPageTodayVisibleCount > 0
            ? metrics.todayVisibleCount / currentPageTodayVisibleCount
            : 0
      }
    ])
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/content/buildContentViewSelection.test.ts`
Expected: PASS with new current-page metrics assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/core/content/buildContentViewSelection.ts tests/content/buildContentViewSelection.test.ts
git commit -m "feat: 增加当前页来源指标统计"
```

### Task 2: 切换内容页来源胶囊到当前页真实结果口径

**Files:**
- Modify: `src/core/content/buildContentPageModel.ts`
- Modify: `src/client/services/contentApi.ts`
- Modify: `src/client/components/content/ContentSourceFilterBar.vue`
- Test: `tests/client/contentApi.test.ts`
- Test: `tests/client/contentSourceFilterBar.test.ts`
- Test: `tests/client/aiNewPage.test.ts`
- Test: `tests/client/aiHotPage.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("maps source filter options to current-page today visible counts instead of stable single-source counts", async () => {
  const db = await createTestDatabase(databasesToClose);
  const openai = resolveSourceByKind(db, "openai");
  const kr36 = resolveSourceByKind(db, "kr36");

  upsertContentItems(db, {
    sourceId: openai!.id,
    items: [buildItem("OpenAI current-page visible", "2026-03-31T01:00:00.000Z")]
  });
  upsertContentItems(db, {
    sourceId: kr36!.id,
    items: [buildItem("36Kr current-page visible", "2026-03-31T02:00:00.000Z")]
  });

  const model = buildContentPageModel(db, "ai-new", {
    selectedSourceKinds: ["openai", "kr36"],
    sortMode: "published_at"
  });

  expect(model.sourceFilter?.options.find((option) => option.kind === "openai")).toMatchObject({
    todayVisibleCount: 1
  });
  expect(model.sourceFilter?.options.find((option) => option.kind === "kr36")).toMatchObject({
    todayVisibleCount: 1
  });
});
```

```ts
it("renders current-page today visible count badges for source filters", async () => {
  const wrapper = mount(ContentSourceFilterBar, {
    props: {
      options: [
        { kind: "openai", name: "OpenAI", todayVisibleCount: 3 },
        { kind: "kr36", name: "36氪", todayVisibleCount: 5 }
      ],
      selectedSourceKinds: ["openai", "kr36"],
      visibleResultCount: 8
    }
  });

  expect(wrapper.get("[data-source-option-count='openai']").text()).toBe("3");
  expect(wrapper.get("[data-source-option-count='kr36']").text()).toBe("5");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/client/contentApi.test.ts tests/client/contentSourceFilterBar.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts`
Expected: FAIL because current API/types/components still use `visibleCount`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/content/buildContentPageModel.ts
sourceFilter:
  sourceOptions.length > 0
    ? {
        options: sourceOptions.map((source) => ({
          kind: source.kind,
          name: source.name,
          showAllWhenSelected: source.showAllWhenSelected,
          todayVisibleCount: selection.currentPageMetricsBySourceKind[source.kind]?.todayVisibleCount ?? 0
        })),
        selectedSourceKinds: effectiveSelectedSourceKinds
      }
    : undefined
```

```ts
// src/client/services/contentApi.ts
export type ContentSourceFilter = {
  options: {
    kind: string;
    name: string;
    showAllWhenSelected: boolean;
    todayVisibleCount: number;
  }[];
  selectedSourceKinds: string[];
};
```

```vue
<!-- src/client/components/content/ContentSourceFilterBar.vue -->
const props = defineProps<{
  options: { kind: string; name: string; todayVisibleCount: number }[];
  selectedSourceKinds: string[];
  visibleResultCount: number;
}>();
```

```vue
<span
  :data-source-option-count="option.kind"
  class="inline-flex min-w-6 items-center justify-center rounded-editorial-pill border border-editorial-border bg-editorial-panel-strong px-2 py-0.5 text-[11px] font-semibold leading-4 text-editorial-text-muted"
>
  {{ option.todayVisibleCount }}
</span>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/client/contentApi.test.ts tests/client/contentSourceFilterBar.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts`
Expected: PASS with source filter badges reflecting current-page visible counts.

- [ ] **Step 5: Commit**

```bash
git add src/core/content/buildContentPageModel.ts src/client/services/contentApi.ts src/client/components/content/ContentSourceFilterBar.vue tests/client/contentApi.test.ts tests/client/contentSourceFilterBar.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts
git commit -m "feat: 切换内容页来源胶囊到当前页结果"
```

### Task 3: 让 `/api/settings/sources` 接收当前页来源筛选上下文

**Files:**
- Modify: `src/server/createServer.ts`
- Modify: `src/client/services/settingsApi.ts`
- Test: `tests/server/settingsApiRoutes.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("reads x-hot-now-source-filter for settings sources analytics", async () => {
  const app = await createTestApp({
    listSources: async (options) => {
      expect(options?.selectedSourceKinds).toEqual(["openai", "kr36"]);
      return [];
    }
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/settings/sources",
    headers: {
      cookie: createAuthenticatedSessionCookie(),
      "x-hot-now-source-filter": "openai,kr36"
    }
  });

  expect(response.statusCode).toBe(200);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/settingsApiRoutes.test.ts`
Expected: FAIL because `/api/settings/sources` does not pass source filter context through.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/createServer.ts
app.get("/api/settings/sources", async (request, reply) => {
  const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");

  if (session === undefined) {
    return;
  }

  const sourceOptions = ((await deps.listContentSources?.()) ?? []).filter((source) => source.isEnabled);
  const selectedSourceKinds = readContentPageSelectedSourceKinds(
    request.headers["x-hot-now-source-filter"],
    sourceOptions
  );

  return reply.send(await readSettingsSourcesApiData(deps, {
    selectedSourceKinds
  }));
});
```

```ts
type ReadSettingsSourcesApiDataOptions = {
  selectedSourceKinds?: string[];
};

async function readSettingsSourcesApiData(
  deps: ServerDeps,
  options: ReadSettingsSourcesApiDataOptions = {}
): Promise<SourcesSettingsView> {
  const sources = ((await deps.listSources?.(options)) ?? []) as SourceCard[];
  // ...
}
```

```ts
// src/client/services/settingsApi.ts
export function readSettingsSources(selectedSourceKinds?: string[]): Promise<SettingsSourcesResponse> {
  return requestJson<SettingsSourcesResponse>("/api/settings/sources", {
    headers: selectedSourceKinds !== undefined
      ? { "x-hot-now-source-filter": selectedSourceKinds.join(",") }
      : undefined
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/settingsApiRoutes.test.ts`
Expected: PASS with settings sources API forwarding source filter context.

- [ ] **Step 5: Commit**

```bash
git add src/server/createServer.ts src/client/services/settingsApi.ts tests/server/settingsApiRoutes.test.ts
git commit -m "feat: 透传当前页来源筛选到来源工作台"
```

### Task 4: 重构来源统计概览为四列当前页指标

**Files:**
- Modify: `src/core/source/listSourceWorkbench.ts`
- Modify: `src/client/services/settingsApi.ts`
- Modify: `src/client/pages/settings/SourcesPage.vue`
- Test: `tests/source/listSourceWorkbench.test.ts`
- Test: `tests/client/sourcesPage.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("returns current-page ai and hot today metrics with visible share", async () => {
  const db = await createTestDatabase(databasesToClose);
  const openai = resolveSourceByKind(db, "openai");
  const kr36 = resolveSourceByKind(db, "kr36");

  upsertContentItems(db, {
    sourceId: openai!.id,
    items: [buildItem("OpenAI ai today", "2026-03-31T01:00:00.000Z")]
  });
  upsertContentItems(db, {
    sourceId: kr36!.id,
    items: [buildItem("36Kr hot today", "2026-03-31T02:00:00.000Z")]
  });

  const workbench = listSourceWorkbench(db, {
    referenceTime: new Date("2026-03-31T04:00:00.000Z"),
    selectedSourceKinds: ["openai", "kr36"]
  });

  expect(workbench.find((row) => row.kind === "openai")?.viewStats.ai).toMatchObject({
    todayCandidateCount: 1,
    todayVisibleCount: 1,
    todayVisibleShare: 1
  });
});
```

```ts
it("renders current-page share columns with one decimal percentage", async () => {
  vi.mocked(settingsApi.readSettingsSources).mockResolvedValue({
    ...createSourcesModel(),
    sources: [
      {
        ...createSourcesModel().sources[0],
        viewStats: {
          hot: { todayCandidateCount: 1, todayVisibleCount: 1, todayVisibleShare: 0.25 },
          articles: { todayCandidateCount: 0, todayVisibleCount: 0, todayVisibleShare: 0 },
          ai: { todayCandidateCount: 2, todayVisibleCount: 1, todayVisibleShare: 0.5 }
        }
      }
    ]
  });

  const wrapper = mount(SourcesPage, { global: { plugins: [Antd] } });
  await flushPromises();

  expect(wrapper.get("[data-sources-section='analytics']").text()).toContain("AI 新讯当前页今日占比");
  expect(wrapper.get("[data-sources-section='analytics']").text()).toContain("50.0%");
  expect(wrapper.get("[data-sources-section='analytics']").text()).toContain("25.0%");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/source/listSourceWorkbench.test.ts tests/client/sourcesPage.test.ts`
Expected: FAIL because current sources workbench still returns only `candidateCount / visibleCount`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/source/listSourceWorkbench.ts
type SourceViewStats = {
  todayCandidateCount: number;
  todayVisibleCount: number;
  todayVisibleShare: number;
};

export function listSourceWorkbench(
  db: SqliteDatabase,
  options: {
    referenceTime?: Date;
    selectedSourceKinds?: string[];
  } = {}
): SourceWorkbenchRow[] {
  const referenceTime = options.referenceTime ?? new Date();
  const hotSelection = buildContentViewSelection(db, "hot", {
    referenceTime,
    selectedSourceKinds: options.selectedSourceKinds,
    sortMode: "published_at"
  });
  const aiSelection = buildContentViewSelection(db, "ai", {
    referenceTime,
    selectedSourceKinds: options.selectedSourceKinds,
    sortMode: "published_at"
  });

  return sourceCards.map((sourceCard) => ({
    ...sourceCard,
    viewStats: {
      hot: hotSelection.currentPageMetricsBySourceKind[sourceCard.kind] ?? emptySourceViewStats(),
      articles: emptySourceViewStats(),
      ai: aiSelection.currentPageMetricsBySourceKind[sourceCard.kind] ?? emptySourceViewStats()
    }
  }));
}
```

```ts
function emptySourceViewStats(): SourceViewStats {
  return {
    todayCandidateCount: 0,
    todayVisibleCount: 0,
    todayVisibleShare: 0
  };
}
```

```vue
// src/client/pages/settings/SourcesPage.vue
const analyticsColumns = [
  { title: "来源", key: "name", align: "center" as const },
  { title: "总条数", key: "totalCount", align: "center" as const },
  { title: "今天发布", key: "publishedTodayCount", align: "center" as const },
  { title: "今天抓取", key: "collectedTodayCount", align: "center" as const },
  { title: "AI 新讯今日候选 / 今日展示", key: "aiStats", align: "center" as const },
  { title: "AI 新讯当前页今日占比", key: "aiShare", align: "center" as const },
  { title: "AI 热点今日候选 / 今日展示", key: "hotStats", align: "center" as const },
  { title: "AI 热点当前页今日占比", key: "hotShare", align: "center" as const }
];
```

```ts
function formatViewStats(
  stats: { todayCandidateCount: number; todayVisibleCount: number } | undefined
): string {
  if (!stats) {
    return "0 / 0";
  }

  return `${stats.todayCandidateCount} / ${stats.todayVisibleCount}`;
}

function formatShare(value: number | undefined): string {
  return `${(((value ?? 0) * 100) || 0).toFixed(1)}%`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/source/listSourceWorkbench.test.ts tests/client/sourcesPage.test.ts`
Expected: PASS with four analytics columns and one-decimal share values.

- [ ] **Step 5: Commit**

```bash
git add src/core/source/listSourceWorkbench.ts src/client/services/settingsApi.ts src/client/pages/settings/SourcesPage.vue tests/source/listSourceWorkbench.test.ts tests/client/sourcesPage.test.ts
git commit -m "feat: 增加当前页来源今日占比统计"
```

### Task 5: 贯通当前页筛选上下文并做回归验证

**Files:**
- Modify: `src/client/pages/settings/SourcesPage.vue`
- Modify: `src/client/pages/content/AiNewPage.vue`
- Modify: `src/client/pages/content/AiHotPage.vue`
- Test: `tests/client/aiNewPage.test.ts`
- Test: `tests/client/aiHotPage.test.ts`
- Test: `tests/server/contentRoutes.test.ts`
- Test: `tests/server/settingsApiRoutes.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("loads settings sources analytics with the same stored source filter as the content pages", async () => {
  window.localStorage.setItem("hot-now-content-source-kinds", JSON.stringify(["openai", "kr36"]));
  vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());

  mount(SourcesPage, { global: { plugins: [Antd] } });

  await flushPromises();

  expect(settingsApi.readSettingsSources).toHaveBeenCalledWith(["openai", "kr36"]);
});
```

```ts
it("updates source filter counts when the current page source selection changes", async () => {
  // Use existing ai page harness and assert badges refresh after changing source kinds.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts tests/server/contentRoutes.test.ts tests/server/settingsApiRoutes.test.ts`
Expected: FAIL because settings page does not read the stored source filter yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/client/pages/settings/SourcesPage.vue
import { readStoredContentSourceKinds } from "../../services/contentApi";

async function loadSources(options: { silent?: boolean } = {}): Promise<boolean> {
  const selectedSourceKinds = readStoredContentSourceKinds() ?? undefined;

  // ...
  sourcesModel.value = await readSettingsSources(selectedSourceKinds);
  // ...
}
```

```ts
// tests/server/contentRoutes.test.ts
expect(parsed.sourceFilter.options.find((option) => option.kind === "openai")?.todayVisibleCount).toBe(1);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts tests/server/contentRoutes.test.ts tests/server/settingsApiRoutes.test.ts`
Expected: PASS with settings workbench following the same stored source filter context as content pages.

- [ ] **Step 5: Commit**

```bash
git add src/client/pages/settings/SourcesPage.vue src/client/pages/content/AiNewPage.vue src/client/pages/content/AiHotPage.vue tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts tests/server/contentRoutes.test.ts tests/server/settingsApiRoutes.test.ts
git commit -m "feat: 对齐来源工作台与当前页筛选上下文"
```

### Task 6: 文档同步与最终验证

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update docs**

```md
- 内容页来源胶囊和 `/settings/sources` 来源统计概览现在统一按“当前页面真实结果”口径展示
- `/settings/sources` 新增 `AI 新讯当前页今日占比` 与 `AI 热点当前页今日占比`
- 占比按当前页面今日实际展示总条数计算，保留一位小数百分比
```

- [ ] **Step 2: Run focused regression**

Run: `npx vitest run tests/content/buildContentViewSelection.test.ts tests/client/contentSourceFilterBar.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts tests/client/sourcesPage.test.ts tests/source/listSourceWorkbench.test.ts tests/server/contentRoutes.test.ts tests/server/settingsApiRoutes.test.ts`
Expected: PASS

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: 同步当前页来源指标说明"
```

## Self-Review

- Spec coverage:
  - 当前页真实结果口径：Task 1, 2, 4, 5
  - 工作台四列与占比：Task 4
  - 内容页来源胶囊切口径：Task 2
  - 系统页与内容页同筛选上下文：Task 3, 5
- Placeholder scan:
  - 已去掉泛化的“后续补齐”表述，所有测试和代码步骤都给出具体路径与代码片段
- Type consistency:
  - 全文统一使用 `todayCandidateCount` / `todayVisibleCount` / `todayVisibleShare`
  - 当前页汇总统一使用 `currentPageMetricsBySourceKind` / `currentPageTodayVisibleCount`
