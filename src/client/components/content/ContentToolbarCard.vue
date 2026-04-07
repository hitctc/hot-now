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

const isSourceExpanded = ref(true);

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
  <section :class="[editorialContentCardClass, 'flex flex-col gap-4 px-4 py-4']" data-content-toolbar-card>
    <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <button
        type="button"
        class="flex min-w-0 flex-1 flex-col gap-1 text-left"
        :aria-expanded="isSourceExpanded"
        :aria-controls="sourcePanelId"
        data-content-toolbar-summary
        @click="toggleSourcePanel"
      >
        <span class="text-sm font-medium leading-6 text-editorial-text-main">
          {{ sourceSummaryText }}
        </span>
        <span class="text-[11px] leading-5 text-editorial-text-muted">
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

    <div class="flex flex-col gap-3 lg:flex-row lg:items-start">
      <div class="lg:flex-none">
        <ContentSortControl
          :sort-mode="sortMode"
          compact
          @change="handleSortChange"
        />
      </div>

      <div class="lg:min-w-0 lg:flex-1">
        <ContentSearchControl
          :keyword="keyword"
          :is-loading="isLoading"
          compact
          @search="handleSearch"
          @clear="handleClear"
        />
      </div>
    </div>

    <div
      :id="sourcePanelId"
      v-show="isSourceExpanded"
      class="flex flex-col gap-3 pt-1"
      data-content-toolbar-source-panel
    >
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
