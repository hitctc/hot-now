<script setup lang="ts">
import { computed } from "vue";

import {
  editorialContentControlButtonClass,
  editorialContentControlButtonIdleClass,
  editorialContentFloatingPanelClass
} from "./contentCardShared";

const props = withDefaults(
	  defineProps<{
	    filterKey: "twitter-accounts" | "twitter-keywords" | "wechat-rss";
    title: string;
    options: { id: number; label: string; hint?: string }[];
    selectedIds: number[];
    compact?: boolean;
  }>(),
  {
    compact: false
  }
);

const emit = defineEmits<{
  change: [selectedIds: number[]];
}>();

const selectedIdSet = computed(() => new Set(props.selectedIds));
const selectedCount = computed(() => props.selectedIds.length);
const hasSelectedAllOptions = computed(
  () => props.options.length > 0 && props.selectedIds.length === props.options.length
);
const rootClass = computed(() =>
  props.compact
    ? "flex flex-col gap-3"
    : `${editorialContentFloatingPanelClass} flex flex-col gap-3 px-4 py-4`
);

function emitSelection(nextIds: number[]): void {
  emit("change", nextIds);
}

// 第二层筛选和第一层一样保持多选 + 去重，避免父层回传重复 id 后把按钮状态算歪。
function handleOptionToggle(id: number, checked: boolean): void {
  const nextIds = checked
    ? [...props.selectedIds, id]
    : props.selectedIds.filter((value) => value !== id);

  emitSelection([...new Set(nextIds)]);
}

function handleToggleAll(): void {
  if (hasSelectedAllOptions.value) {
    emitSelection([]);
    return;
  }

  emitSelection(props.options.map((option) => option.id));
}
</script>

<template>
  <section
    :class="rootClass"
    :data-content-entity-filter="filterKey"
  >
    <div class="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
      <div class="shrink-0">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">
          {{ title }}
        </p>
        <p class="m-0 text-sm font-medium text-editorial-text-body">
          已选 {{ selectedCount }} / {{ options.length }}
        </p>
      </div>

      <div class="min-w-0 flex-1 overflow-x-auto">
        <div class="flex w-max items-center gap-2 pr-1">
          <label
            v-for="option in options"
            :key="option.id"
            :data-entity-option="`${filterKey}:${option.id}`"
            :class="[
              'inline-flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-editorial-sm px-3 py-2 text-sm transition',
              selectedIdSet.has(option.id)
                ? 'border border-editorial-border-strong bg-editorial-link-active text-editorial-text-main shadow-editorial-accent'
                : 'border border-transparent text-editorial-text-body hover:border-editorial-border hover:bg-editorial-link-active hover:text-editorial-text-main'
            ]"
          >
            <input
              class="m-0 size-4 cursor-pointer accent-[var(--editorial-accent)]"
              :data-entity-id="`${filterKey}:${option.id}`"
              type="checkbox"
              :checked="selectedIdSet.has(option.id)"
              @change="handleOptionToggle(option.id, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ option.label }}</span>
            <span
              v-if="option.hint"
              class="text-[11px] leading-5 text-editorial-text-muted"
            >
              {{ option.hint }}
            </span>
          </label>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <a-button
          :data-content-filter-action="`${filterKey}-toggle-all`"
          size="small"
          :class="[editorialContentControlButtonClass, editorialContentControlButtonIdleClass]"
          @click="handleToggleAll"
        >
          {{ hasSelectedAllOptions ? "全不选" : "全选" }}
        </a-button>
      </div>
    </div>
  </section>
</template>
