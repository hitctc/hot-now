# HotNow AI Content Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `AI 新讯 / AI 热点` 增加共享的标题搜索能力，支持本地持久化、提交式触发、清空恢复默认结果，并保持“先搜索再分页”的内容页语义。

**Architecture:** 保持现有 `buildContentViewSelection -> buildContentPageModel -> createServer API -> Vue 内容页` 这条链路不变，只在内容页模型层增加“标题过滤”这一步，不把搜索写回策略层或 source 工作台。前端继续以共享浏览控制器方式管理 source 过滤、排序和分页，并新增一枚共享搜索控件，搜索词通过 header 传给内容 API，不进入 URL。

**Tech Stack:** TypeScript, Fastify, Vue 3, Vue Router, Ant Design Vue, Vitest

---

## File Map

- Modify: `src/core/content/buildContentPageModel.ts`
  - 在完整结果集与分页之间插入标题搜索过滤，并根据搜索命中为空返回专属空态
- Modify: `src/server/createServer.ts`
  - 解析内容搜索 header，透传给 `getContentPageModel`，并让 fallback 内容 API 路径保持同样的搜索语义
- Modify: `src/client/services/contentApi.ts`
  - 增加共享搜索 storage key、读写函数、搜索 header 组装，以及 `readAiNewPage / readAiHotPage` 的 `searchKeyword` 选项
- Create: `src/client/components/content/ContentSearchControl.vue`
  - 提供共享的紧凑搜索输入框，内置搜索 icon、可点击清空 icon、回车/按钮触发和“输入值/生效关键词”双状态
- Modify: `src/client/pages/content/AiNewPage.vue`
  - 接入共享搜索状态、提交式搜索、清空恢复和“搜索后回第一页”逻辑
- Modify: `src/client/pages/content/AiHotPage.vue`
  - 接入与 `AI 新讯` 相同的共享搜索状态和搜索交互
- Modify: `tests/content/buildContentPageModel.test.ts`
  - 覆盖标题搜索、搜索后分页、搜索空态和清空搜索恢复默认结果
- Modify: `tests/server/contentRoutes.test.ts`
  - 覆盖 `x-hot-now-content-search` header 透传和内容 API 搜索返回
- Modify: `tests/client/contentApi.test.ts`
  - 覆盖搜索 storage、搜索 header、`readAiNewPage / readAiHotPage` 选项透传
- Modify: `tests/client/aiNewPage.test.ts`
  - 覆盖共享关键词初始化、回车/按钮触发搜索、清空 icon、搜索后回第一页
- Modify: `tests/client/aiHotPage.test.ts`
  - 覆盖与 `AI 新讯` 同样的搜索交互，并验证两页共用关键词
- Modify: `README.md`
  - 同步内容页搜索口径与持久化方式
- Modify: `AGENTS.md`
  - 同步页面能力、localStorage key 和“先搜索再分页”的协作约定

### Task 1: 在内容页模型和 API 中增加标题搜索语义

**Files:**
- Modify: `src/core/content/buildContentPageModel.ts`
- Modify: `src/server/createServer.ts`
- Modify: `tests/content/buildContentPageModel.test.ts`
- Modify: `tests/server/contentRoutes.test.ts`

- [ ] **Step 1: 先写失败测试，锁定“完整结果集标题搜索后再分页”的语义**

```ts
it("filters ai-new cards by title keyword before pagination", async () => {
  const db = await createTestDatabase(databasesToClose);
  const source = resolveSourceByKind(db, "openai");

  upsertContentItems(db, {
    sourceId: source!.id,
    items: [
      buildItem("Agent platform launch", "2026-04-07T03:00:00.000Z"),
      buildItem("Model refresh bulletin", "2026-04-07T02:00:00.000Z"),
      buildItem("Agent benchmark roundup", "2026-04-07T01:00:00.000Z")
    ]
  });

  const model = buildContentPageModel(db, "ai-new", {
    searchKeyword: "agent"
  });

  expect(model.cards.map((card) => card.title)).toEqual([
    "Agent platform launch",
    "Agent benchmark roundup"
  ]);
  expect(model.pagination?.totalResults).toBe(2);
});

it("returns a search-specific empty state when no title matches", async () => {
  const db = await createTestDatabase(databasesToClose);
  const source = resolveSourceByKind(db, "openai");

  upsertContentItems(db, {
    sourceId: source!.id,
    items: [buildItem("Model refresh bulletin", "2026-04-07T03:00:00.000Z")]
  });

  const model = buildContentPageModel(db, "ai-new", {
    searchKeyword: "agent"
  });

  expect(model.cards).toEqual([]);
  expect(model.emptyState).toEqual({
    title: "没有找到匹配的内容",
    description: "可以换个关键词，或清空搜索后查看全部结果。",
    tone: "filtered"
  });
});
```

- [ ] **Step 2: 跑模型与路由测试，确认当前实现还没有搜索入口**

Run: `npx vitest run tests/content/buildContentPageModel.test.ts tests/server/contentRoutes.test.ts`

Expected: FAIL，失败点集中在：
- `BuildContentPageModelOptions` 还没有 `searchKeyword`
- 内容 API 还没有读取 `x-hot-now-content-search`
- 搜索为空时不会返回专属空态

- [ ] **Step 3: 用最小实现把搜索插入“完整结果集 -> 分页”之间**

```ts
// src/core/content/buildContentPageModel.ts
export type BuildContentPageModelOptions = {
  includeNlEvaluations?: boolean;
  selectedSourceKinds?: string[];
  sortMode?: ContentSortMode;
  page?: number;
  searchKeyword?: string;
};

export function buildContentPageModel(
  db: SqliteDatabase,
  pageKey: ContentPageKey,
  options: BuildContentPageModelOptions = {}
): ContentPageModel {
  const selection = buildContentViewSelection(db, pageKey === "ai-hot" ? "hot" : "ai", {
    includeNlEvaluations: options.includeNlEvaluations,
    selectedSourceKinds: effectiveSelectedSourceKinds,
    sortMode: options.sortMode ?? "published_at"
  });
  const allCards = selection.visibleCards.map(stripRankedCard);
  const filteredCards = filterCardsByTitleKeyword(allCards, options.searchKeyword);
  const pagination = paginateContentCards(filteredCards, options.page);

  return {
    ...,
    cards: pagination.cards,
    pagination: pagination.meta,
    emptyState:
      effectiveSelectedSourceKinds.length === 0
        ? { title: "当前未选择任何数据源", description: "重新全选后即可恢复内容结果。", tone: "filtered" }
        : hasSearchKeyword(options.searchKeyword) && pagination.meta.totalResults === 0
          ? {
              title: "没有找到匹配的内容",
              description: "可以换个关键词，或清空搜索后查看全部结果。",
              tone: "filtered"
            }
          : pagination.meta.totalResults > 0
            ? null
            : ...
  };
}

function filterCardsByTitleKeyword(cards: ContentCardView[], keyword: string | undefined) {
  const normalizedKeyword = normalizeSearchKeyword(keyword);

  if (!normalizedKeyword) {
    return cards;
  }

  return cards.filter((card) => card.title.toLowerCase().includes(normalizedKeyword));
}

function normalizeSearchKeyword(keyword: string | undefined) {
  if (typeof keyword !== "string") {
    return "";
  }

  return keyword.trim().toLowerCase();
}
```

- [ ] **Step 4: 让内容 API 与 fallback 路径都吃到搜索 header**

```ts
// src/server/createServer.ts
type ContentPageModel = {
  ...,
  pagination: {
    page: number;
    pageSize: number;
    totalResults: number;
    totalPages: number;
  } | null;
};

async function readContentPageModelApiData(
  deps: ServerDeps,
  request: FastifyRequest,
  pageKey: "ai-new" | "ai-hot"
) {
  const selectedSourceKinds = readSelectedSourceKindsHeader(request.headers["x-hot-now-source-filter"]);
  const sortMode = readContentSortModeHeader(request.headers["x-hot-now-content-sort"]) ?? "published_at";
  const searchKeyword = readContentSearchHeader(request.headers["x-hot-now-content-search"]);
  const page = readContentPageQueryPage(request);

  return deps.getContentPageModel({
    pageKey,
    selectedSourceKinds,
    sortMode,
    page,
    searchKeyword
  });
}

function readContentSearchHeader(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}
```

- [ ] **Step 5: 回归模型与路由测试**

Run: `npx vitest run tests/content/buildContentPageModel.test.ts tests/server/contentRoutes.test.ts`

Expected: PASS，且能看到：
- 标题过滤发生在分页之前
- 搜索为空时返回专属空态
- `x-hot-now-content-search` 已透传到内容页模型

- [ ] **Step 6: Commit**

```bash
git add tests/content/buildContentPageModel.test.ts tests/server/contentRoutes.test.ts src/core/content/buildContentPageModel.ts src/server/createServer.ts
git commit -m "feat: 增加 AI 内容标题搜索模型"
```

### Task 2: 为前端服务层和共享搜索控件接入本地持久化

**Files:**
- Modify: `src/client/services/contentApi.ts`
- Create: `src/client/components/content/ContentSearchControl.vue`
- Modify: `tests/client/contentApi.test.ts`

- [ ] **Step 1: 先写失败测试，锁定 storage key、header 和搜索控件事件**

```ts
it("stores and reads the shared content search keyword from localStorage", () => {
  writeStoredContentSearchKeyword("agent");
  expect(readStoredContentSearchKeyword()).toBe("agent");
});

it("sends the shared title search keyword through the content header", async () => {
  const requestJsonMock = vi.fn().mockResolvedValue({
    pageKey: "ai-new",
    sourceFilter: undefined,
    featuredCard: null,
    cards: [],
    pagination: null,
    emptyState: null
  });

  await readAiNewPage({
    selectedSourceKinds: ["openai"],
    sortMode: "published_at",
    searchKeyword: "agent"
  });

  expect(requestJsonMock).toHaveBeenCalledWith("/api/content/ai-new", {
    headers: {
      "x-hot-now-source-filter": "openai",
      "x-hot-now-content-sort": "published_at",
      "x-hot-now-content-search": "agent"
    }
  });
});
```

- [ ] **Step 2: 跑前端 service 测试，确认当前没有搜索 storage 与 header**

Run: `npx vitest run tests/client/contentApi.test.ts`

Expected: FAIL，失败点集中在：
- `CONTENT_SEARCH_STORAGE_KEY` 还不存在
- `readAiNewPage / readAiHotPage` 还不接受 `searchKeyword`
- headers 里还没有 `x-hot-now-content-search`

- [ ] **Step 3: 在内容 API 服务层增加共享搜索 key 与 header 透传**

```ts
// src/client/services/contentApi.ts
export const CONTENT_SEARCH_STORAGE_KEY = "hot-now-content-search";

export type ReadContentPageOptions = {
  selectedSourceKinds?: string[];
  sortMode?: ContentSortMode;
  page?: number;
  searchKeyword?: string;
};

function createContentPageRequestHeaders(
  selectedSourceKinds: string[] | undefined,
  sortMode: ContentSortMode | undefined,
  searchKeyword: string | undefined
): HeadersInit | undefined {
  const headers: Record<string, string> = {};

  if (selectedSourceKinds !== undefined) {
    headers["x-hot-now-source-filter"] = normalizeSelectedSourceKinds(selectedSourceKinds).join(",");
  }

  if (sortMode !== undefined) {
    headers["x-hot-now-content-sort"] = sortMode;
  }

  if (typeof searchKeyword === "string" && searchKeyword.trim().length > 0) {
    headers["x-hot-now-content-search"] = searchKeyword.trim();
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function readStoredContentSearchKeyword(): string | null {
  return readPersistedStringValue(CONTENT_SEARCH_STORAGE_KEY);
}

export function writeStoredContentSearchKeyword(keyword: string): void {
  writePersistedStringValue(CONTENT_SEARCH_STORAGE_KEY, keyword.trim());
}
```

- [ ] **Step 4: 新增共享搜索控件，只负责输入值与提交/清空事件**

```vue
<!-- src/client/components/content/ContentSearchControl.vue -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";

const props = defineProps<{
  keyword: string;
  isLoading?: boolean;
}>();

const emit = defineEmits<{
  search: [keyword: string];
  clear: [];
}>();

const draftKeyword = ref(props.keyword);

watch(
  () => props.keyword,
  (nextKeyword) => {
    draftKeyword.value = nextKeyword;
  }
);

const hasDraftKeyword = computed(() => draftKeyword.value.trim().length > 0);

function submitSearch() {
  emit("search", draftKeyword.value.trim());
}

function clearSearch() {
  draftKeyword.value = "";
  emit("clear");
}
</script>

<template>
  <div class="flex items-center gap-2" data-content-search-control>
    <a-input
      v-model:value="draftKeyword"
      allow-clear
      size="small"
      placeholder="搜索标题"
      data-content-search-input
      @pressEnter="submitSearch"
      @clear="clearSearch"
    />
    <a-button
      size="small"
      :loading="isLoading"
      data-content-search-submit
      @click="submitSearch"
    >
      搜索
    </a-button>
  </div>
</template>
```

- [ ] **Step 5: 回归 service 测试**

Run: `npx vitest run tests/client/contentApi.test.ts`

Expected: PASS，且能看到：
- `hot-now-content-search` 的读写可用
- 搜索关键词会进入 `x-hot-now-content-search`
- 空白关键词不会发搜索 header

- [ ] **Step 6: Commit**

```bash
git add tests/client/contentApi.test.ts src/client/services/contentApi.ts src/client/components/content/ContentSearchControl.vue
git commit -m "feat: 增加内容页共享搜索控件"
```

### Task 3: 在 AI 新讯 / AI 热点 页面接入共享搜索交互

**Files:**
- Modify: `src/client/pages/content/AiNewPage.vue`
- Modify: `src/client/pages/content/AiHotPage.vue`
- Modify: `tests/client/aiNewPage.test.ts`
- Modify: `tests/client/aiHotPage.test.ts`

- [ ] **Step 1: 先写失败测试，锁定提交式搜索、清空 icon 和两页共用关键词**

```ts
it("submits the shared title search keyword and reloads ai-new from page 1", async () => {
  contentApiMocks.readStoredContentSearchKeyword.mockReturnValue("agent");
  contentApiMocks.readAiNewPage.mockResolvedValue(createModel());

  const wrapper = mount(AiNewPage, { global: { plugins: [Antd] } });
  await flushPromises();

  await wrapper.get("[data-content-search-input]").setValue("openai");
  await wrapper.get("[data-content-search-submit]").trigger("click");
  await flushPromises();

  expect(contentApiMocks.writeStoredContentSearchKeyword).toHaveBeenCalledWith("openai");
  expect(routerMocks.replace).toHaveBeenCalledWith({ query: { page: "1" } });
  expect(contentApiMocks.readAiNewPage).toHaveBeenLastCalledWith({
    selectedSourceKinds: ["openai"],
    sortMode: "published_at",
    page: 1,
    searchKeyword: "openai"
  });
});

it("clears the shared search keyword and reloads the default result set", async () => {
  contentApiMocks.readStoredContentSearchKeyword.mockReturnValue("agent");
  contentApiMocks.readAiHotPage.mockResolvedValue(createModel());

  const wrapper = mount(AiHotPage, { global: { plugins: [Antd] } });
  await flushPromises();

  await wrapper.get("[data-content-search-input]").trigger("clear");
  await flushPromises();

  expect(contentApiMocks.writeStoredContentSearchKeyword).toHaveBeenCalledWith("");
  expect(contentApiMocks.readAiHotPage).toHaveBeenLastCalledWith(
    expect.objectContaining({ searchKeyword: "" })
  );
});
```

- [ ] **Step 2: 跑两个内容页测试，确认当前页面还没有共享搜索状态**

Run: `npx vitest run tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts`

Expected: FAIL，失败点集中在：
- 页面还没有 `data-content-search-*`
- `readStoredContentSearchKeyword / writeStoredContentSearchKeyword` 尚未接入
- 搜索提交或清空后不会回到第一页

- [ ] **Step 3: 在两个页面里引入“输入值/生效关键词”双状态，并接入共享本地关键词**

```ts
// src/client/pages/content/AiNewPage.vue / AiHotPage.vue
const appliedSearchKeyword = ref(readStoredContentSearchKeyword() ?? "");

async function loadPage(options: { selectedKinds?: string[]; silent?: boolean; searchKeyword?: string } = {}) {
  const requestedPage = readCurrentPage();
  const nextModel = await readAiNewPage({
    selectedSourceKinds: options.selectedKinds ?? readPageSourceKinds(),
    sortMode: sortMode.value,
    page: requestedPage,
    searchKeyword: options.searchKeyword ?? appliedSearchKeyword.value
  });
  ...
}

async function handleSearchSubmit(nextKeyword: string): Promise<void> {
  appliedSearchKeyword.value = nextKeyword;
  writeStoredContentSearchKeyword(nextKeyword);
  await replacePageQuery(1);
  await loadPage({
    selectedKinds: readPageSourceKinds(),
    searchKeyword: nextKeyword,
    silent: true
  });
}

async function handleSearchClear(): Promise<void> {
  appliedSearchKeyword.value = "";
  writeStoredContentSearchKeyword("");
  await replacePageQuery(1);
  await loadPage({
    selectedKinds: readPageSourceKinds(),
    searchKeyword: "",
    silent: true
  });
}
```

- [ ] **Step 4: 把搜索控件接进顶部筛选带，并保持搜索、筛选、排序都回第一页**

```vue
<div v-if="sourceFilter" class="flex flex-col gap-3">
  <ContentSourceFilterBar
    :options="sourceFilter.options"
    :selected-source-kinds="selectedSourceKinds ?? sourceFilter.selectedSourceKinds"
    :visible-result-count="visibleResultCount"
    @change="handleSourceKindsChange"
  />

  <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
    <ContentSortControl
      :sort-mode="sortMode"
      @change="handleSortModeChange"
    />

    <ContentSearchControl
      :keyword="appliedSearchKeyword"
      :is-loading="isRefreshing"
      @search="handleSearchSubmit"
      @clear="handleSearchClear"
    />
  </div>
</div>
```

- [ ] **Step 5: 回归页面测试**

Run: `npx vitest run tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts`

Expected: PASS，且能看到：
- `AI 新讯 / AI 热点` 都出现搜索控件
- 搜索提交后会写 `localStorage` 并重新拉取第一页
- 清空 icon 可用
- 两页都复用同一个 `hot-now-content-search`

- [ ] **Step 6: Commit**

```bash
git add tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts src/client/pages/content/AiNewPage.vue src/client/pages/content/AiHotPage.vue
git add src/client/components/content/ContentSearchControl.vue
git commit -m "feat: 接入 AI 内容页标题搜索交互"
```

### Task 4: 同步协作文档并完成最终验证

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: 同步 README 的用户可见口径**

```md
- `/`、`/ai-new`、`/ai-hot` 顶部现在同时提供共享标题搜索，只匹配标题，支持回车 / 点击搜索触发
- 标题搜索词在 `AI 新讯 / AI 热点` 间共享，保存在浏览器本地 `localStorage['hot-now-content-search']`
- 标题搜索发生在完整结果集上，再分页；清空搜索或执行新搜索后会自动回到第一页
```

- [ ] **Step 2: 同步 AGENTS 的协作与验证约定**

```md
- `/`、`/ai-new`、`/ai-hot` 顶部现在提供共享标题搜索，默认只匹配标题，不写入 URL
- 内容页搜索词写入浏览器本地 `localStorage['hot-now-content-search']`，在 `AI 新讯 / AI 热点` 两页间共享
- 内容页结果顺序现在固定为“source 过滤 -> 排序 -> 标题搜索 -> 分页”，搜索或清空后自动回到第一页
```

- [ ] **Step 3: 跑与本轮最相关的最终验证**

Run: `npx vitest run tests/content/buildContentPageModel.test.ts tests/server/contentRoutes.test.ts tests/client/contentApi.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts`

Expected: PASS，覆盖模型、API、共享搜索状态和页面交互。

- [ ] **Step 4: 跑一遍完整构建**

Run: `npm run build`

Expected: PASS，确认新增 header、控件和页面逻辑不会破坏现有 client / server 构建。

- [ ] **Step 5: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: 同步 AI 内容标题搜索口径"
```

## Self-Review Checklist

- Spec coverage
  - 搜索框位置、标题匹配、提交式触发、清空 icon、两页共享关键词、本地持久化、先搜索后分页、搜索空态都已映射到 Task 1-4
- Placeholder scan
  - 本计划没有 `TODO / TBD / implement later / add tests` 这类空占位
- Type consistency
  - 统一使用 `searchKeyword`、`x-hot-now-content-search`、`hot-now-content-search` 三个命名，不再引入第二套别名
