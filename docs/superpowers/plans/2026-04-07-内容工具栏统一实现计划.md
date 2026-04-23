# HotNow Content Toolbar Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `AI 新讯 / AI 热点` 顶部的来源筛选、排序方式和标题搜索收成一张统一控制卡，减少默认占高，同时保持现有 source / sort / search 语义不变。

**Architecture:** 前端只重组内容页顶部控制区，不改内容 API、localStorage key、筛选规则、排序规则或标题搜索规则。实现上新增一个统一容器组件承接“来源摘要 + 排序 + 搜索 + 来源展开层”，再把两个内容页改为消费这个容器；现有 `ContentSourceFilterBar`、`ContentSortControl`、`ContentSearchControl` 会保留，但调整为更适合嵌入式布局的子控件，而不是各自持有完整 panel 壳层。

**Tech Stack:** Vue 3, TypeScript, Ant Design Vue, Tailwind CSS, Vitest

---

## File Map

- Create: `src/client/components/content/ContentToolbarCard.vue`
  - 统一承接来源摘要、展开按钮、排序方式、标题搜索和来源展开层
- Modify: `src/client/components/content/ContentSourceFilterBar.vue`
  - 去掉“独立大卡片”假设，支持嵌入统一控制卡后的紧凑来源展开层
- Modify: `src/client/components/content/ContentSortControl.vue`
  - 去掉独立 panel 壳层和大段说明文案，收成嵌入式排序切换
- Modify: `src/client/components/content/ContentSearchControl.vue`
  - 保持提交式搜索语义，但对齐统一控制卡里的紧凑宽度与按钮布局
- Modify: `src/client/pages/content/AiNewPage.vue`
  - 把现有三段控制区替换成一张统一控制卡，保留原有 source / sort / search 处理函数
- Modify: `src/client/pages/content/AiHotPage.vue`
  - 与 `AI 新讯` 使用同一套统一控制卡接线方式
- Create: `tests/client/contentToolbarCard.test.ts`
  - 覆盖来源摘要、展开 / 收起、保持展开、零选中摘要和事件透传
- Modify: `tests/client/contentSourceFilterBar.test.ts`
  - 对齐嵌入式来源区的结构与按钮行为
- Modify: `tests/client/contentSearchControl.test.ts`
  - 对齐紧凑搜索控件在统一卡内的基础交互
- Modify: `tests/client/aiNewPage.test.ts`
  - 覆盖“单卡片控制区”渲染与搜索 / 排序 / 来源切换仍然生效
- Modify: `tests/client/aiHotPage.test.ts`
  - 覆盖与 `AI 新讯` 一致的统一控制卡接线

> 本轮不需要同步 `README.md` / `AGENTS.md`，因为没有新增路由、能力或协作约定，只是重排内容页顶部控制区结构。

### Task 1: 新建统一控制卡并收紧来源 / 排序 / 搜索子控件

**Files:**
- Create: `src/client/components/content/ContentToolbarCard.vue`
- Modify: `src/client/components/content/ContentSourceFilterBar.vue`
- Modify: `src/client/components/content/ContentSortControl.vue`
- Modify: `src/client/components/content/ContentSearchControl.vue`
- Create: `tests/client/contentToolbarCard.test.ts`
- Modify: `tests/client/contentSourceFilterBar.test.ts`
- Modify: `tests/client/contentSearchControl.test.ts`

- [ ] **Step 1: 先写统一控制卡失败测试，锁定摘要、展开和事件透传**

```ts
import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { describe, expect, it, vi } from "vitest";

import ContentToolbarCard from "../../src/client/components/content/ContentToolbarCard.vue";

describe("ContentToolbarCard", () => {
  it("renders source summary and toggles the embedded source panel", async () => {
    const wrapper = mount(ContentToolbarCard, {
      props: {
        sourceOptions: [
          { kind: "openai", name: "OpenAI", currentPageVisibleCount: 3 },
          { kind: "ithome", name: "IT之家", currentPageVisibleCount: 1 },
          { kind: "kr36", name: "36氪", currentPageVisibleCount: 4 }
        ],
        selectedSourceKinds: ["openai", "ithome", "kr36"],
        visibleResultCount: 8,
        sortMode: "published_at",
        searchKeyword: "",
        isLoading: false
      },
      global: {
        plugins: [Antd]
      }
    });

    expect(wrapper.get("[data-content-toolbar-summary]").text()).toContain("来源：OpenAI、IT之家 +1");
    expect(wrapper.find("[data-content-toolbar-source-panel]").exists()).toBe(false);

    await wrapper.get("[data-content-toolbar-summary]").trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-content-toolbar-source-panel]").exists()).toBe(true);
  });

  it("keeps the source panel open after selecting another source", async () => {
    const wrapper = mount(ContentToolbarCard, {
      props: {
        sourceOptions: [
          { kind: "openai", name: "OpenAI", currentPageVisibleCount: 3 },
          { kind: "ithome", name: "IT之家", currentPageVisibleCount: 1 }
        ],
        selectedSourceKinds: ["openai"],
        visibleResultCount: 3,
        sortMode: "published_at",
        searchKeyword: "",
        isLoading: false
      },
      global: {
        plugins: [Antd]
      }
    });

    await wrapper.get("[data-content-toolbar-toggle]").trigger("click");
    await flushPromises();
    await wrapper.get("[data-source-kind='ithome']").setValue(true);
    await flushPromises();

    expect(wrapper.emitted("source-change")?.at(-1)).toEqual([["openai", "ithome"]]);
    expect(wrapper.find("[data-content-toolbar-source-panel]").exists()).toBe(true);
  });
});
```

- [ ] **Step 2: 跑组件测试，确认统一控制卡还不存在**

Run: `npx vitest run tests/client/contentToolbarCard.test.ts tests/client/contentSourceFilterBar.test.ts tests/client/contentSearchControl.test.ts`

Expected: FAIL，失败点集中在：
- `ContentToolbarCard.vue` 还不存在
- 现有来源 / 排序控件仍然假设自己拥有独立 panel

- [ ] **Step 3: 写 `ContentToolbarCard.vue`，把三类控制收进一张卡**

```vue
<script setup lang="ts">
import { computed, ref } from "vue";

import type { ContentSortMode } from "../../services/contentApi";
import {
  editorialContentFloatingPanelClass,
  editorialContentControlButtonClass,
  editorialContentControlButtonIdleClass
} from "./contentCardShared";
import ContentSearchControl from "./ContentSearchControl.vue";
import ContentSortControl from "./ContentSortControl.vue";
import ContentSourceFilterBar from "./ContentSourceFilterBar.vue";

const props = defineProps<{
  sourceOptions: { kind: string; name: string; currentPageVisibleCount: number }[];
  selectedSourceKinds: string[];
  visibleResultCount: number;
  sortMode: ContentSortMode;
  searchKeyword: string;
  isLoading?: boolean;
}>();

const emit = defineEmits<{
  "source-change": [selectedSourceKinds: string[]];
  "sort-change": [sortMode: ContentSortMode];
  search: [keyword: string];
  clear: [];
}>();

const sourcePanelExpanded = ref(false);

const sourceSummary = computed(() => {
  if (props.selectedSourceKinds.length === 0) {
    return "来源：未选择";
  }

  const selectedNames = props.sourceOptions
    .filter((option) => props.selectedSourceKinds.includes(option.kind))
    .map((option) => option.name);

  if (selectedNames.length <= 2) {
    return `来源：${selectedNames.join("、")}`;
  }

  return `来源：${selectedNames.slice(0, 2).join("、")} +${selectedNames.length - 2}`;
});

function toggleSourcePanel(): void {
  sourcePanelExpanded.value = !sourcePanelExpanded.value;
}
</script>

<template>
  <section
    :class="[editorialContentFloatingPanelClass, 'flex flex-col gap-3 px-4 py-4']"
    data-content-toolbar-card
  >
    <div class="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1.6fr)_auto_minmax(280px,1fr)] xl:items-center">
      <button
        type="button"
        class="flex min-w-0 items-center justify-between gap-3 rounded-editorial-sm px-3 py-2 text-left transition hover:bg-editorial-link"
        data-content-toolbar-summary
        @click="toggleSourcePanel"
      >
        <div class="min-w-0">
          <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">来源</p>
          <p class="m-0 truncate text-sm text-editorial-text-body">{{ sourceSummary }}</p>
        </div>
        <span class="text-editorial-text-muted" :data-expanded="sourcePanelExpanded ? 'true' : 'false'">⌄</span>
      </button>

      <ContentSortControl
        compact
        :sort-mode="sortMode"
        @change="emit('sort-change', $event)"
      />

      <div class="min-w-0 xl:justify-self-end">
        <ContentSearchControl
          :keyword="searchKeyword"
          :is-loading="isLoading"
          @search="emit('search', $event)"
          @clear="emit('clear')"
        />
      </div>
    </div>

    <div
      v-if="sourcePanelExpanded"
      data-content-toolbar-source-panel
      class="border-t border-editorial-border pt-3"
    >
      <ContentSourceFilterBar
        compact
        :options="sourceOptions"
        :selected-source-kinds="selectedSourceKinds"
        :visible-result-count="visibleResultCount"
        @change="emit('source-change', $event)"
      />
    </div>
  </section>
</template>
```

- [ ] **Step 4: 把来源 / 排序 / 搜索子控件改成可嵌入模式**

```vue
<!-- src/client/components/content/ContentSourceFilterBar.vue -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  options: { kind: string; name: string; currentPageVisibleCount: number }[];
  selectedSourceKinds: string[];
  visibleResultCount: number;
  compact?: boolean;
}>(), {
  compact: false
});
</script>

<template>
  <section
    :class="props.compact ? 'flex flex-col gap-3' : [editorialContentFloatingPanelClass, 'flex flex-col gap-3 px-4 py-4']"
    data-content-source-filter
    :data-compact="props.compact ? 'true' : 'false'"
  >
    <div v-if="!props.compact" class="shrink-0">
      <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">来源筛选</p>
      <p class="m-0 text-sm text-editorial-text-body">已选 {{ selectedCount }} / {{ options.length }} · 共 {{ visibleResultCount }} 条</p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <!-- 保留现有 checkbox 与 toggle-all 语义 -->
    </div>
  </section>
</template>
```

```vue
<!-- src/client/components/content/ContentSortControl.vue -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  sortMode: ContentSortMode;
  compact?: boolean;
}>(), {
  compact: false
});
</script>

<template>
  <section
    :class="props.compact ? 'flex items-center gap-2' : [editorialContentFloatingPanelClass, 'flex flex-col gap-3 px-4 py-4']"
    data-content-sort-control
    :data-compact="props.compact ? 'true' : 'false'"
  >
    <div v-if="!props.compact" class="space-y-1">
      <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">排序方式</p>
      <p class="m-0 text-sm leading-6 text-editorial-text-body">三个内容页共享这一组浏览顺序偏好。</p>
    </div>

    <div class="flex flex-wrap gap-2">
      <!-- 保留现有两个按钮 -->
    </div>
  </section>
</template>
```

```vue
<!-- src/client/components/content/ContentSearchControl.vue -->
<template>
  <div
    class="flex min-w-0 items-center gap-2 xl:w-[320px]"
    data-content-search-control
  >
    <a-input
      class="min-w-0 flex-1"
      v-model:value="draftKeyword"
      size="small"
      placeholder="搜索标题"
      data-content-search-input
      @pressEnter="submitSearch"
    >
```

- [ ] **Step 5: 回归组件测试，确认统一控制卡与嵌入式子控件通过**

Run: `npx vitest run tests/client/contentToolbarCard.test.ts tests/client/contentSourceFilterBar.test.ts tests/client/contentSearchControl.test.ts`

Expected: PASS，且能看到：
- 来源摘要按 `OpenAI、IT之家 +N` 规则生成
- 摘要与按钮都可展开 / 收起
- 勾选来源后展开层保持打开
- 排序与搜索控件变成可嵌入式布局

- [ ] **Step 6: Commit**

```bash
git add src/client/components/content/ContentToolbarCard.vue src/client/components/content/ContentSourceFilterBar.vue src/client/components/content/ContentSortControl.vue src/client/components/content/ContentSearchControl.vue tests/client/contentToolbarCard.test.ts tests/client/contentSourceFilterBar.test.ts tests/client/contentSearchControl.test.ts
git commit -m "feat: 增加统一内容控制卡"
```

### Task 2: 让 AI 新讯 / AI 热点 页面改用统一控制卡

**Files:**
- Modify: `src/client/pages/content/AiNewPage.vue`
- Modify: `src/client/pages/content/AiHotPage.vue`
- Modify: `tests/client/aiNewPage.test.ts`
- Modify: `tests/client/aiHotPage.test.ts`

- [ ] **Step 1: 先写页面失败测试，锁定“单卡片控制区”与原行为不变**

```ts
it("renders a single unified toolbar card instead of three separate control panels", async () => {
  contentApiMocks.readAiNewPage.mockResolvedValueOnce(createModel());

  const wrapper = mount(AiNewPage, {
    global: {
      plugins: [Antd]
    }
  });

  await flushPromises();

  expect(wrapper.findAll("[data-content-toolbar-card]")).toHaveLength(1);
  expect(wrapper.findAll("[data-content-source-filter][data-compact='true']")).toHaveLength(0);
  expect(wrapper.findAll("[data-content-sort-control][data-compact='true']")).toHaveLength(1);
  expect(wrapper.get("[data-content-toolbar-summary]").text()).toContain("来源：OpenAI");
});

it("keeps search, sort and source change semantics after the toolbar unification", async () => {
  contentApiMocks.readAiHotPage
    .mockResolvedValueOnce(createModel())
    .mockResolvedValueOnce(createModel());

  const wrapper = mount(AiHotPage, {
    global: {
      plugins: [Antd]
    }
  });

  await flushPromises();
  await wrapper.get("[data-content-toolbar-toggle]").trigger("click");
  await flushPromises();
  await wrapper.get("[data-source-kind='ithome']").setValue(true);
  await flushPromises();

  expect(routerMocks.replace).toHaveBeenCalledWith({
    query: {
      page: "1"
    }
  });
  expect(contentApiMocks.readAiHotPage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      selectedSourceKinds: ["openai", "ithome"]
    })
  );
});
```

- [ ] **Step 2: 跑页面测试，确认内容页还在渲染三段控制区**

Run: `npx vitest run tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts`

Expected: FAIL，失败点集中在：
- 页面里仍然直接引入 `ContentSourceFilterBar` / `ContentSortControl` / `ContentSearchControl`
- 还没有统一控制卡的数据属性

- [ ] **Step 3: 用统一控制卡替换页面里的三段控制区**

```vue
<!-- src/client/pages/content/AiNewPage.vue -->
<script setup lang="ts">
import ContentToolbarCard from "../../components/content/ContentToolbarCard.vue";
</script>

<template>
  <div
    v-if="sourceFilter"
    class="sticky top-4 z-20 max-[900px]:top-[72px]"
    data-content-sticky-toolbar
  >
    <ContentToolbarCard
      :source-options="sourceFilter.options"
      :selected-source-kinds="selectedSourceKinds ?? sourceFilter.selectedSourceKinds"
      :visible-result-count="visibleResultCount"
      :sort-mode="sortMode"
      :search-keyword="appliedSearchKeyword"
      :is-loading="isRefreshing"
      @source-change="handleSourceKindsChange"
      @sort-change="handleSortModeChange"
      @search="handleSearchSubmit"
      @clear="handleSearchClear"
    />
  </div>
</template>
```

```vue
<!-- src/client/pages/content/AiHotPage.vue -->
<script setup lang="ts">
import ContentToolbarCard from "../../components/content/ContentToolbarCard.vue";
</script>

<template>
  <div
    v-if="sourceFilter"
    class="sticky top-4 z-20 max-[900px]:top-[72px]"
    data-content-sticky-toolbar
  >
    <ContentToolbarCard
      :source-options="sourceFilter.options"
      :selected-source-kinds="selectedSourceKinds ?? sourceFilter.selectedSourceKinds"
      :visible-result-count="visibleResultCount"
      :sort-mode="sortMode"
      :search-keyword="appliedSearchKeyword"
      :is-loading="isRefreshing"
      @source-change="handleSourceKindsChange"
      @sort-change="handleSortModeChange"
      @search="handleSearchSubmit"
      @clear="handleSearchClear"
    />
  </div>
</template>
```

- [ ] **Step 4: 扩充页面测试，覆盖来源摘要、展开来源区和仍然回第一页**

```ts
it("shows collapsed source summary before opening the source panel", async () => {
  contentApiMocks.readStoredContentSourceKinds.mockReturnValue(["openai", "ithome", "kr36"]);
  contentApiMocks.readAiNewPage.mockResolvedValue(createModel({
    sourceFilter: {
      options: [
        { kind: "openai", name: "OpenAI", showAllWhenSelected: false, currentPageVisibleCount: 1 },
        { kind: "ithome", name: "IT之家", showAllWhenSelected: false, currentPageVisibleCount: 1 },
        { kind: "kr36", name: "36氪", showAllWhenSelected: false, currentPageVisibleCount: 0 }
      ],
      selectedSourceKinds: ["openai", "ithome", "kr36"]
    }
  }));

  const wrapper = mount(AiNewPage, { global: { plugins: [Antd] } });
  await flushPromises();

  expect(wrapper.get("[data-content-toolbar-summary]").text()).toContain("来源：OpenAI、IT之家 +1");
  expect(wrapper.find("[data-content-toolbar-source-panel]").exists()).toBe(false);
});

it("expands the source panel inside the same toolbar card", async () => {
  contentApiMocks.readAiHotPage.mockResolvedValue(createModel());

  const wrapper = mount(AiHotPage, { global: { plugins: [Antd] } });
  await flushPromises();

  await wrapper.get("[data-content-toolbar-toggle]").trigger("click");
  await flushPromises();

  expect(wrapper.find("[data-content-toolbar-source-panel]").exists()).toBe(true);
  expect(wrapper.findAll("[data-content-source-filter][data-compact='true']")).toHaveLength(1);
});
```

- [ ] **Step 5: 回归页面测试**

Run: `npx vitest run tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts`

Expected: PASS，且能看到：
- 两页都只渲染一个统一控制卡
- 来源摘要符合 spec
- 来源展开区在同卡内出现
- 搜索、排序、来源切换仍然保持原有回第一页语义

- [ ] **Step 6: Commit**

```bash
git add src/client/pages/content/AiNewPage.vue src/client/pages/content/AiHotPage.vue tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts
git commit -m "feat: 接入内容页统一控制卡"
```

### Task 3: 做最终验证并确认这轮只改结构不改语义

**Files:**
- Verify only:
  - `src/client/components/content/ContentToolbarCard.vue`
  - `src/client/components/content/ContentSourceFilterBar.vue`
  - `src/client/components/content/ContentSortControl.vue`
  - `src/client/components/content/ContentSearchControl.vue`
  - `src/client/pages/content/AiNewPage.vue`
  - `src/client/pages/content/AiHotPage.vue`
  - `tests/client/contentToolbarCard.test.ts`
  - `tests/client/contentSourceFilterBar.test.ts`
  - `tests/client/contentSearchControl.test.ts`
  - `tests/client/aiNewPage.test.ts`
  - `tests/client/aiHotPage.test.ts`

- [ ] **Step 1: 跑统一控制卡的最相关前端测试集合**

Run: `npx vitest run tests/client/contentToolbarCard.test.ts tests/client/contentSourceFilterBar.test.ts tests/client/contentSearchControl.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts`

Expected: PASS，且新增控制卡不会破坏来源筛选、排序和搜索既有交互。

- [ ] **Step 2: 跑一次构建，确认统一控制卡没有引入类型或打包回归**

Run: `npm run build`

Expected: PASS，输出 `✓ built` 和 TypeScript 构建通过。

- [ ] **Step 3: 做一次手动 smoke check，确认视觉和交互同时成立**

Run:

```bash
npm run dev:local
```

Then verify in browser:

1. 打开 `/` 或 `/ai-new`
2. 确认顶部只看到一张统一控制卡
3. 确认默认只显示来源摘要、排序和搜索
4. 点击摘要或按钮后，来源区在同卡内展开
5. 连续勾选多个来源后，展开层不会自动收起
6. 切换排序后，结果回到第一页
7. 搜索和清空后，结果回到第一页
8. 打开 `/ai-hot`，确认与 `AI 新讯` 一致
9. 在窄屏下确认控制区仍然只有一个容器，而不是三张独立卡片

Expected: 所有交互成立，且顶部控制区默认高度明显低于旧版三段结构。

- [ ] **Step 4: Commit**

```bash
git status --short
```

Expected: 只剩本轮统一控制卡相关修改，且没有额外 README / AGENTS diff。

> Task 3 不需要额外提交；如果前两条功能提交都已存在且验证通过，直接交给 `review` 或 `ship`。

## Self-Review Checklist

- Spec coverage
  - `统一控制卡`：Task 1 / Task 2 覆盖
  - `来源摘要规则`：Task 1 覆盖
  - `来源展开区在同卡内展开`：Task 1 / Task 2 覆盖
  - `勾选后保持展开`：Task 1 覆盖
  - `桌面端 / 移动端仍是一张卡`：Task 1 样式实现 + Task 3 手动验证覆盖
  - `行为语义不变`：Task 2 / Task 3 覆盖
- Placeholder scan
  - 已避免 `TODO/TBD/类似 Task N` 之类占位描述
- Type consistency
  - 统一事件名固定为 `source-change` / `sort-change` / `search` / `clear`
  - 统一属性名固定为 `sourceOptions` / `selectedSourceKinds` / `visibleResultCount` / `sortMode` / `searchKeyword`
