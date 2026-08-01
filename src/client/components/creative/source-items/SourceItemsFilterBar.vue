<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

type SourceDirection = "article" | "short_content";
type FilterOption = { label: string; value: string };

const props = defineProps<{
  mode: SourceDirection;
  writingStatusFilter: string | undefined;
  writingStatusOptions: FilterOption[];
  accountFitFilter?: string | undefined;
  accountFitOptions?: FilterOption[];
  sourceNameFilter: string;
  writableOnly: boolean;
  minTrendScore: number | null;
  searchText: string;
  searchHistory: string[];
}>();

const emit = defineEmits<{
  (event: "update:writing-status-filter", value: string | undefined): void;
  (event: "update:account-fit-filter", value: string | undefined): void;
  (event: "update:source-name-filter", value: string): void;
  (event: "update:writable-only", value: boolean): void;
  (event: "update:min-trend-score", value: number | null): void;
  (event: "update:search-text", value: string): void;
  (event: "search", value: string): void;
  (event: "apply-source-name"): void;
  (event: "apply-trend-score"): void;
  (event: "remove-history", value: string): void;
  (event: "manual-write"): void;
}>();

const searchDropdownRef = ref<HTMLElement | null>(null);
const showSearchDropdown = ref(false);

/** 点击下拉区域外时关闭搜索历史，避免历史浮层遮挡表格。 */
function onDocumentClick(event: MouseEvent): void {
  if (searchDropdownRef.value && !searchDropdownRef.value.contains(event.target as Node)) {
    showSearchDropdown.value = false;
  }
}

/** 提交标题搜索并关闭历史浮层。 */
function handleSearch(value: string): void {
  emit("update:search-text", value);
  emit("search", value);
  showSearchDropdown.value = false;
}

onMounted(() => document.addEventListener("click", onDocumentClick));
onBeforeUnmount(() => document.removeEventListener("click", onDocumentClick));
</script>

<template>
  <div class="flex flex-wrap items-center gap-3">
    <a-select
      :value="props.writingStatusFilter"
      :options="props.writingStatusOptions"
      placeholder="写作状态"
      class="!w-[140px]"
      @update:value="emit('update:writing-status-filter', $event)"
    />
    <a-select
      v-if="props.mode === 'article'"
      :value="props.accountFitFilter"
      :options="props.accountFitOptions"
      placeholder="账号适配度"
      class="!w-[140px]"
      @update:value="emit('update:account-fit-filter', $event)"
    />
    <a-input-search
      :value="props.sourceNameFilter"
      placeholder="搜索来源"
      class="!w-[160px]"
      allow-clear
      @update:value="emit('update:source-name-filter', $event)"
      @search="emit('apply-source-name')"
      @change="(value: string) => { if (!value) emit('apply-source-name'); }"
    />
    <a-checkbox
      :checked="props.writableOnly"
      @update:checked="emit('update:writable-only', $event)"
    >只看可写</a-checkbox>
    <div class="flex items-center gap-1.5">
      <span class="whitespace-nowrap text-xs text-editorial-text-muted">爆文分≥</span>
      <a-input-number
        :value="props.minTrendScore"
        :min="0"
        :max="100"
        :step="1"
        :precision="0"
        placeholder="不限"
        class="!w-[96px]"
        @update:value="emit('update:min-trend-score', $event)"
        @press-enter="emit('apply-trend-score')"
      />
      <a-button type="primary" size="small" @click="emit('apply-trend-score')">搜索</a-button>
    </div>
    <div ref="searchDropdownRef" class="relative">
      <a-input-search
        :value="props.searchText"
        placeholder="搜索标题"
        class="!w-[280px]"
        allow-clear
        @update:value="emit('update:search-text', $event)"
        @search="handleSearch"
        @change="(value: string) => { if (!value) handleSearch(''); }"
        @focus="showSearchDropdown = props.searchHistory.length > 0"
      />
      <div
        v-if="showSearchDropdown && props.searchHistory.length > 0"
        class="absolute left-0 top-full z-50 mt-1 min-w-[280px] rounded-md border border-editorial-border bg-white shadow-lg"
      >
        <div
          v-for="item in props.searchHistory"
          :key="item"
          class="group flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-gray-50"
          @click="handleSearch(item)"
        >
          <span class="truncate text-editorial-text-body">{{ item }}</span>
          <span
            class="ml-2 flex-shrink-0 text-xs text-editorial-text-muted opacity-0 hover:text-red-500 group-hover:opacity-100"
            @click.stop="emit('remove-history', item)"
          >✕</span>
        </div>
      </div>
    </div>
    <a-button type="primary" size="small" @click="emit('manual-write')">
      <span class="mr-1">✏️</span>自定义写作
    </a-button>
  </div>
</template>
