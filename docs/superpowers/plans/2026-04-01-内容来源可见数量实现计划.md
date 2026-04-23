# HotNow Content Source Visible Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `AI 新讯 / AI 热点` 页的来源筛选条补上每个来源的可见条数 tag，并在筛选摘要区显示当前筛选结果总条数。

**Architecture:** 后端继续复用现有 `candidateCards -> visibleCards` 内容页选择链路，但在 `buildContentViewSelection` 里额外输出按 `sourceKind` 聚合的稳定 `visibleCountsBySourceKind`。`buildContentPageModel` 再把这个聚合结果回填到 `sourceFilter.options.visibleCount`；前端只消费当前页面接口，在 `ContentSourceFilterBar` 中渲染来源 tag 和 `已选 n / m · 共 x 条` 摘要，不新增二次请求。

**Tech Stack:** TypeScript, Fastify, Vue 3, Ant Design Vue, better-sqlite3, Vitest, @vue/test-utils

---

## File Map

- Modify: `src/core/content/buildContentViewSelection.ts`
  - 在当前内容页语义下输出 `visibleCountsBySourceKind`
- Modify: `src/core/content/buildContentPageModel.ts`
  - 将 `visibleCountsBySourceKind` 映射到 `sourceFilter.options.visibleCount`
- Modify: `src/server/createServer.ts`
  - 同步内容页 API 返回类型
- Modify: `tests/content/buildContentViewSelection.test.ts`
  - 锁定来源级可见条数统计口径
- Modify: `tests/server/contentRoutes.test.ts`
  - 锁定接口返回的 `visibleCount`
- Modify: `src/client/services/contentApi.ts`
  - 扩展 `ContentSourceFilter.options` 类型
- Modify: `src/client/components/content/ContentSourceFilterBar.vue`
  - 渲染来源条数 tag 与总条数摘要
- Modify: `src/client/pages/content/AiNewPage.vue`
  - 传入当前页总条数
- Modify: `src/client/pages/content/AiHotPage.vue`
  - 传入当前页总条数
- Modify: `tests/client/contentApi.test.ts`
  - 锁定客户端内容页模型类型契约
- Modify: `tests/client/contentSourceFilterBar.test.ts`
  - 锁定来源 tag 和总条数摘要
- Modify: `tests/client/aiNewPage.test.ts`
  - 锁定 `AI 新讯` 页筛选条数量显示
- Modify: `tests/client/aiHotPage.test.ts`
  - 锁定 `AI 热点` 页筛选条数量显示

## Task 1: 扩展后端内容页模型，返回来源级 `visibleCount`

**Files:**
- Modify: `src/core/content/buildContentViewSelection.ts`
- Modify: `src/core/content/buildContentPageModel.ts`
- Modify: `src/server/createServer.ts`
- Test: `tests/content/buildContentViewSelection.test.ts`
- Test: `tests/server/contentRoutes.test.ts`

- [ ] **Step 1: 先写失败测试，锁定来源级计数口径和 API 契约**

```ts
// tests/content/buildContentViewSelection.test.ts
it("returns stable visible counts per source kind without applying the current source filter", async () => {
  const db = await createTestDatabase(databasesToClose);
  const openai = resolveSourceByKind(db, "openai");
  const ithome = resolveSourceByKind(db, "ithome");

  upsertContentItems(db, {
    sourceId: openai!.id,
    items: [
      buildItem("OpenAI One", "2026-03-31T02:00:00.000Z"),
      buildItem("OpenAI Two", "2026-03-31T01:00:00.000Z")
    ]
  });
  upsertContentItems(db, {
    sourceId: ithome!.id,
    items: [buildItem("ITHome One", "2026-03-31T00:00:00.000Z")]
  });

  const selection = buildContentViewSelection(db, "ai", {
    selectedSourceKinds: ["openai"]
  });

  expect(selection.visibleCards.map((card) => card.sourceKind)).toEqual(["openai", "openai"]);
  expect(selection.visibleCountsBySourceKind).toEqual({
    openai: 2,
    ithome: 1
  });
});

// tests/server/contentRoutes.test.ts
expect(aiNewPayload.sourceFilter?.options).toEqual([
  { kind: "openai", name: "OpenAI", showAllWhenSelected: false, visibleCount: 1 },
  { kind: "ithome", name: "IT之家", showAllWhenSelected: true, visibleCount: 1 }
]);
```

- [ ] **Step 2: 跑后端相关测试，确认当前仓库还没有 `visibleCount` 输出**

Run: `npx vitest run tests/content/buildContentViewSelection.test.ts tests/server/contentRoutes.test.ts`

Expected: FAIL，报错点集中在 `visibleCountsBySourceKind` 不存在，以及 `sourceFilter.options` 里缺少 `visibleCount`

- [ ] **Step 3: 在内容页选择链路里增加按来源统计**

```ts
// src/core/content/buildContentViewSelection.ts
const allRankedCards = rows
  .map((row) =>
    buildRankedCardCandidate(row, {
      viewKey,
      viewRuleConfig,
      referenceTime,
      includeNlEvaluations
    })
  )
  .filter((card) => !card.isBlocked);

const visibleCountsBySourceKind = allRankedCards.reduce<Record<string, number>>((counts, card) => {
  counts[card.sourceKind] = (counts[card.sourceKind] ?? 0) + 1;
  return counts;
}, {});

const rankedCards = allRankedCards
  .filter((card) => selectedSourceKinds === null || selectedSourceKinds.has(card.sourceKind))
  .sort(compareByRanking);

return {
  candidateCards: rankedCards.map((card) => ({
    id: card.id,
    title: card.title,
    summary: card.summary,
    sourceName: card.sourceName,
    sourceKind: card.sourceKind,
    canonicalUrl: card.canonicalUrl,
    publishedAt: card.publishedAt,
    isFavorited: card.isFavorited,
    reaction: card.reaction,
    contentScore: card.contentScore,
    scoreBadges: card.scoreBadges,
    feedbackEntry: card.feedbackEntry,
    rankingScore: card.rankingScore,
    rankingTimestamp: card.rankingTimestamp,
    heroDecision: card.heroDecision,
    heroScoreDelta: card.heroScoreDelta
  })),
  visibleCards,
  visibleCountsBySourceKind
};
```

```ts
// src/core/content/buildContentPageModel.ts
export type ContentPageModel = {
  pageKey: ContentPageKey;
  sourceFilter?: {
    options: { kind: string; name: string; showAllWhenSelected: boolean; visibleCount: number }[];
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

return {
  pageKey,
  sourceFilter:
    sourceOptions.length > 0
      ? {
          options: sourceOptions.map((source) => ({
            kind: source.kind,
            name: source.name,
            showAllWhenSelected: source.showAllWhenSelected,
            visibleCount: selection.visibleCountsBySourceKind[source.kind] ?? 0
          })),
          selectedSourceKinds: effectiveSelectedSourceKinds
        }
      : undefined,
  featuredCard: null,
  cards,
  emptyState:
    effectiveSelectedSourceKinds.length === 0
      ? {
          title: "当前未选择任何数据源",
          description: "重新全选后即可恢复内容结果。",
          tone: "filtered"
        }
      : cards.length > 0
        ? null
        : {
            title: pageKey === "ai-new" ? "暂无 AI 新讯" : "暂无 AI 热点",
            description: "可以稍后刷新，或先检查数据源采集状态。",
            tone: "default"
          }
};
```

```ts
// src/server/createServer.ts
type ContentPageModel = {
  pageKey: ContentPageKey;
  sourceFilter?: {
    options: { kind: string; name: string; showAllWhenSelected: boolean; visibleCount: number }[];
    selectedSourceKinds: string[];
  };
  featuredCard: { id: number } | null;
  cards: { id: number }[];
  emptyState: { title: string; tone: string } | null;
};
```

- [ ] **Step 4: 重新跑后端测试，确认接口契约已经打通**

Run: `npx vitest run tests/content/buildContentViewSelection.test.ts tests/server/contentRoutes.test.ts`

Expected: PASS

- [ ] **Step 5: 提交后端来源条数模型改动**

```bash
git add src/core/content/buildContentViewSelection.ts src/core/content/buildContentPageModel.ts src/server/createServer.ts tests/content/buildContentViewSelection.test.ts tests/server/contentRoutes.test.ts
git commit -m "feat: 增加内容页来源可见条数后端模型"
```

## Task 2: 扩展客户端类型与筛选条组件，显示来源 tag 和总条数

**Files:**
- Modify: `src/client/services/contentApi.ts`
- Modify: `src/client/components/content/ContentSourceFilterBar.vue`
- Test: `tests/client/contentApi.test.ts`
- Test: `tests/client/contentSourceFilterBar.test.ts`

- [ ] **Step 1: 先写失败测试，锁定前端类型和筛选条展示**

```ts
// tests/client/contentApi.test.ts
requestJson.mockResolvedValue({
  pageKey: "ai-new",
  sourceFilter: {
    options: [{ kind: "openai", name: "OpenAI", showAllWhenSelected: false, visibleCount: 3 }],
    selectedSourceKinds: ["openai"]
  },
  featuredCard: null,
  cards: [],
  emptyState: null
});

const result = await readAiNewPage(["openai"], "content_score");
expect(result.sourceFilter?.options[0]?.visibleCount).toBe(3);
```

```ts
// tests/client/contentSourceFilterBar.test.ts
const wrapper = mount(ContentSourceFilterBar, {
  props: {
    options: [
      { kind: "openai", name: "OpenAI", visibleCount: 3 },
      { kind: "ithome", name: "IT之家", visibleCount: 1 }
    ],
    selectedSourceKinds: ["openai"],
    visibleResultCount: 3
  },
  global: { plugins: [Antd] }
});

expect(wrapper.text()).toContain("已选 1 / 2 · 共 3 条");
expect(wrapper.get("[data-source-option='openai']").text()).toContain("OpenAI");
expect(wrapper.get("[data-source-option-count='openai']").text()).toBe("3");
expect(wrapper.get("[data-source-option-count='ithome']").text()).toBe("1");
```

- [ ] **Step 2: 跑前端组件测试，确认当前组件和类型还没接入数量字段**

Run: `npx vitest run tests/client/contentApi.test.ts tests/client/contentSourceFilterBar.test.ts`

Expected: FAIL，报错点集中在 `visibleCount` 未定义、`visibleResultCount` 缺失，以及筛选条摘要仍然只显示 `已选 n / m`

- [ ] **Step 3: 扩展客户端模型与筛选条渲染**

```ts
// src/client/services/contentApi.ts
export type ContentSourceFilter = {
  options: { kind: string; name: string; showAllWhenSelected: boolean; visibleCount: number }[];
  selectedSourceKinds: string[];
};
```

```vue
<!-- src/client/components/content/ContentSourceFilterBar.vue -->
<script setup lang="ts">
const props = defineProps<{
  options: { kind: string; name: string; showAllWhenSelected?: boolean; visibleCount: number }[];
  selectedSourceKinds: string[];
  visibleResultCount: number;
}>();
</script>

<template>
  <div class="shrink-0">
    <p class="m-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-editorial-text-muted">
      来源筛选
    </p>
    <p class="m-0 text-sm font-medium text-editorial-text-body">
      已选 {{ selectedCount }} / {{ options.length }} · 共 {{ visibleResultCount }} 条
    </p>
  </div>

  <label
    v-for="option in options"
    :key="option.kind"
    :data-source-option="option.kind"
    :class="[
      'inline-flex shrink-0 cursor-pointer select-none items-center gap-3 rounded-editorial-pill border px-3 py-2 text-sm font-semibold transition',
      selectedSet.has(option.kind)
        ? 'border-editorial-border-strong bg-editorial-link-active text-editorial-text-main shadow-editorial-accent ring-1 ring-inset ring-editorial-ring'
        : 'border-editorial-border bg-editorial-control text-editorial-text-main hover:border-editorial-border-strong hover:bg-editorial-control-hover'
    ]"
  >
    <input
      class="m-0 size-4 cursor-pointer accent-[var(--editorial-accent)]"
      :data-source-kind="option.kind"
      type="checkbox"
      :checked="selectedSet.has(option.kind)"
      @change="handleOptionToggle(option.kind, ($event.target as HTMLInputElement).checked)"
    />
    <span>{{ option.name }}</span>
    <span
      :data-source-option-count="option.kind"
      class="inline-flex min-w-6 items-center justify-center rounded-editorial-pill border border-editorial-border bg-editorial-panel-strong px-2 py-0.5 text-[11px] font-semibold leading-4 text-editorial-text-muted"
    >
      {{ option.visibleCount }}
    </span>
  </label>
</template>
```

- [ ] **Step 4: 重新跑前端类型与筛选条测试**

Run: `npx vitest run tests/client/contentApi.test.ts tests/client/contentSourceFilterBar.test.ts`

Expected: PASS

- [ ] **Step 5: 提交客户端筛选条数量展示改动**

```bash
git add src/client/services/contentApi.ts src/client/components/content/ContentSourceFilterBar.vue tests/client/contentApi.test.ts tests/client/contentSourceFilterBar.test.ts
git commit -m "feat: 增加来源筛选条数量展示"
```

## Task 3: 把当前页总条数接进 `AI 新讯 / AI 热点` 页面并做整体验证

**Files:**
- Modify: `src/client/pages/content/AiNewPage.vue`
- Modify: `src/client/pages/content/AiHotPage.vue`
- Test: `tests/client/aiNewPage.test.ts`
- Test: `tests/client/aiHotPage.test.ts`

- [ ] **Step 1: 先写失败测试，锁定页面透传总条数和交互刷新结果**

```ts
// tests/client/aiNewPage.test.ts
contentApiMocks.readAiNewPage.mockResolvedValueOnce(
  createModel({
    sourceFilter: {
      options: [
        { kind: "openai", name: "OpenAI", showAllWhenSelected: false, visibleCount: 1 },
        { kind: "ithome", name: "IT之家", showAllWhenSelected: true, visibleCount: 1 }
      ],
      selectedSourceKinds: ["openai"]
    }
  })
);

const wrapper = mount(AiNewPage, {
  global: {
    plugins: [Antd]
  }
});

await flushPromises();

expect(wrapper.get("[data-content-source-filter]").text()).toContain("已选 1 / 2 · 共 2 条");
expect(wrapper.get("[data-source-option-count='openai']").text()).toBe("1");
expect(wrapper.get("[data-source-option-count='ithome']").text()).toBe("1");
```

```ts
// tests/client/aiHotPage.test.ts
contentApiMocks.readAiHotPage.mockResolvedValueOnce(
  createModel({
    sourceFilter: {
      options: [
        { kind: "openai", name: "OpenAI", showAllWhenSelected: false, visibleCount: 1 },
        { kind: "ithome", name: "IT之家", showAllWhenSelected: true, visibleCount: 0 }
      ],
      selectedSourceKinds: ["openai"]
    }
  })
);

const wrapper = mount(AiHotPage, {
  global: {
    plugins: [Antd]
  }
});

await flushPromises();

expect(wrapper.get("[data-content-source-filter]").text()).toContain("已选 1 / 2 · 共 1 条");
expect(wrapper.get("[data-source-option-count='openai']").text()).toBe("1");
expect(wrapper.get("[data-source-option-count='ithome']").text()).toBe("0");
```

- [ ] **Step 2: 跑页面测试，确认当前页面还没有把总条数传给筛选条**

Run: `npx vitest run tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts`

Expected: FAIL，报错点集中在 `visibleResultCount` prop 缺失，以及页面文本里没有 `共 x 条`

- [ ] **Step 3: 在两个内容页中透传当前结果总数**

```ts
// src/client/pages/content/AiNewPage.vue
const listCards = computed(() => pageModel.value?.cards ?? []);
const visibleResultCount = computed(() => listCards.value.length);
```

```vue
<!-- src/client/pages/content/AiNewPage.vue -->
<ContentSourceFilterBar
  v-if="sourceFilter"
  :options="sourceFilter.options"
  :selected-source-kinds="selectedSourceKinds ?? sourceFilter.selectedSourceKinds"
  :visible-result-count="visibleResultCount"
  @change="handleSourceKindsChange"
/>
```

```ts
// src/client/pages/content/AiHotPage.vue
const listCards = computed(() => pageModel.value?.cards ?? []);
const visibleResultCount = computed(() => listCards.value.length);
```

```vue
<!-- src/client/pages/content/AiHotPage.vue -->
<ContentSourceFilterBar
  v-if="sourceFilter"
  :options="sourceFilter.options"
  :selected-source-kinds="selectedSourceKinds ?? sourceFilter.selectedSourceKinds"
  :visible-result-count="visibleResultCount"
  @change="handleSourceKindsChange"
/>
```

- [ ] **Step 4: 运行页面测试和最终相关门禁**

Run: `npx vitest run tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts tests/client/contentApi.test.ts tests/client/contentSourceFilterBar.test.ts tests/content/buildContentViewSelection.test.ts tests/server/contentRoutes.test.ts`

Expected: PASS

Run: `npm run build:client`

Expected: PASS，允许保留现有 chunk size warning

- [ ] **Step 5: 提交页面透传与整体验证改动**

```bash
git add src/client/pages/content/AiNewPage.vue src/client/pages/content/AiHotPage.vue tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts
git commit -m "feat: 接入内容页来源筛选可见条数"
```
