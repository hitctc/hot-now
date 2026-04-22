<script setup lang="ts">
import { computed, ref } from "vue";

import type { ContentSortMode } from "../../services/contentApi";
import ContentSearchControl from "./ContentSearchControl.vue";
import ContentSourceFilterBar from "./ContentSourceFilterBar.vue";
import ContentSortControl from "./ContentSortControl.vue";
import {
  editorialContentCardClass,
  editorialContentControlButtonClass,
  editorialContentControlButtonIdleClass
} from "./contentCardShared";

const props = defineProps<{
  options: { kind: string; name: string; currentPageVisibleCount: number }[];
  selectedSourceKinds: string[];
  visibleResultCount: number;
  sortMode: ContentSortMode;
  keyword: string;
  isLoading?: boolean;
}>();

const emit = defineEmits<{
  changeSource: [selectedSourceKinds: string[]];
  changeSort: [sortMode: ContentSortMode];
  search: [keyword: string];
  clear: [];
}>();

const isSourceExpanded = ref(false);

const selectedSourceNames = computed(() => {
  const selectedKinds = new Set(props.selectedSourceKinds);

  return props.options.filter((option) => selectedKinds.has(option.kind)).map((option) => option.name);
});

const sourceSummaryText = computed(() => summarizeSourceNames(selectedSourceNames.value));
const sourceCountText = computed(
  () => `已选 ${props.selectedSourceKinds.length} / ${props.options.length} · 共 ${props.visibleResultCount} 条`
);
const sourcePanelId = "content-toolbar-source-panel";

// 0 个来源时直接提示未选择，超过两个时只保留前两个名字，避免摘要撑得太长。
function summarizeSourceNames(sourceNames: string[]): string {
  if (sourceNames.length === 0) {
    return "来源：未选择";
  }

  if (sourceNames.length <= 2) {
    return `来源：${sourceNames.join("、")}`;
  }

  return `来源：${sourceNames.slice(0, 2).join("、")} +${sourceNames.length - 2}`;
}

// 摘要区和右侧按钮都要能切换来源展开层，所以这里统一收口到一个切换函数。
function toggleSourcePanel(): void {
  isSourceExpanded.value = !isSourceExpanded.value;
}

function handleSourceChange(nextKinds: string[]): void {
  emit("changeSource", nextKinds);
}

function handleSortChange(nextSortMode: ContentSortMode): void {
  emit("changeSort", nextSortMode);
}

function handleSearch(keyword: string): void {
  emit("search", keyword);
}

function handleClear(): void {
  emit("clear");
}
</script>

<template>
  <section
    :class="[
      editorialContentCardClass,
      'editorial-spotlight-card relative flex flex-col gap-2 overflow-hidden rounded-editorial-lg border border-editorial-border-strong px-3 py-2 sm:gap-4 sm:rounded-editorial-xl sm:px-5 sm:py-4 lg:px-4 lg:py-3'
    ]"
    data-content-toolbar-card
  >
    <div
      class="pointer-events-none absolute right-[-48px] top-[-56px] h-44 w-44 rounded-full bg-[radial-gradient(circle,_rgba(122,162,255,0.34),_transparent_72%)] blur-3xl"
      aria-hidden="true"
    />
    <div
      class="flex flex-col gap-2 sm:gap-3 lg:flex-row lg:items-center lg:justify-between"
      data-content-toolbar-main-row
    >
      <div class="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center">
        <div class="flex min-w-0 items-center gap-2 sm:flex-wrap sm:items-start lg:flex-1 lg:flex-nowrap lg:items-center">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2 rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-3 py-2 text-left shadow-none sm:flex-col sm:items-start sm:gap-1 sm:rounded-editorial-lg sm:px-4 sm:py-3 sm:shadow-editorial-card lg:flex-row lg:items-center lg:px-3 lg:py-2 lg:shadow-none"
            :aria-expanded="isSourceExpanded"
            :aria-controls="sourcePanelId"
            data-content-toolbar-summary
            @click="toggleSourcePanel"
          >
            <span class="hidden text-[11px] font-semibold uppercase tracking-[0.14em] text-editorial-text-muted sm:inline lg:hidden">
              Source Scope
            </span>
            <span class="min-w-0 truncate text-sm font-semibold leading-6 text-editorial-text-main">
              {{ sourceSummaryText }}
            </span>
            <span class="hidden whitespace-nowrap text-[11px] leading-5 text-editorial-text-muted sm:inline lg:hidden xl:inline">
              {{ sourceCountText }}
            </span>
          </button>

          <a-button
            size="small"
            :class="[editorialContentControlButtonClass, editorialContentControlButtonIdleClass]"
            data-content-toolbar-source-toggle
            :aria-expanded="isSourceExpanded"
            :aria-controls="sourcePanelId"
            @click="toggleSourcePanel"
          >
            {{ isSourceExpanded ? "收起来源" : "展开来源" }}
          </a-button>
        </div>
      </div>

      <div class="hidden min-w-0 flex-1 flex-col gap-3 sm:flex sm:flex-row sm:items-center sm:justify-end">
        <div class="sm:flex-none">
          <ContentSortControl
            :sort-mode="sortMode"
            compact
            @change="handleSortChange"
          />
        </div>

        <div class="sm:min-w-0 sm:flex-1">
          <ContentSearchControl
            :keyword="keyword"
            :is-loading="isLoading"
            compact
            @search="handleSearch"
            @clear="handleClear"
          />
        </div>
      </div>
    </div>

    <div
      :id="sourcePanelId"
      v-show="isSourceExpanded"
      class="flex flex-col gap-2 pt-1 sm:gap-3"
      data-content-toolbar-source-panel
    >
      <div
        class="grid gap-2 sm:hidden"
        data-content-toolbar-mobile-controls
      >
        <ContentSortControl
          :sort-mode="sortMode"
          compact
          @change="handleSortChange"
        />
        <ContentSearchControl
          :keyword="keyword"
          :is-loading="isLoading"
          compact
          @search="handleSearch"
          @clear="handleClear"
        />
      </div>
      <ContentSourceFilterBar
        :options="options"
        :selected-source-kinds="selectedSourceKinds"
        :visible-result-count="visibleResultCount"
        compact
        @change="handleSourceChange"
      />
    </div>
  </section>
</template>
