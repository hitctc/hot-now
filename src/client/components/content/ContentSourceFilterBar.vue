<script setup lang="ts">
import { computed } from "vue";

import {
  editorialContentControlButtonClass,
  editorialContentControlButtonIdleClass,
  editorialContentFloatingPanelClass
} from "./contentCardShared";

const props = withDefaults(
  defineProps<{
    options: { kind: string; name: string; currentPageVisibleCount: number }[];
    selectedSourceKinds: string[];
    visibleResultCount: number;
    compact?: boolean;
  }>(),
  {
    compact: false
  }
);

const emit = defineEmits<{
  change: [selectedSourceKinds: string[]];
}>();

const selectedSet = computed(() => new Set(props.selectedSourceKinds));
const selectedCount = computed(() => props.selectedSourceKinds.length);
const hasSelectedAllSources = computed(
  () => props.options.length > 0 && props.selectedSourceKinds.length === props.options.length
);
const rootClass = computed(() =>
  props.compact
    ? "flex flex-col gap-3"
    : `${editorialContentFloatingPanelClass} flex flex-col gap-3 px-4 py-4`
);
const headerClass = computed(() =>
  props.compact
    ? "flex flex-col gap-2"
    : "flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
);

function emitSelection(nextKinds: string[]): void {
  emit("change", nextKinds);
}

// 勾选某个来源时顺手去重，避免父层传回重复值后把按钮状态算歪。
function handleOptionToggle(kind: string, checked: boolean): void {
  const nextKinds = checked
    ? [...props.selectedSourceKinds, kind]
    : props.selectedSourceKinds.filter((value) => value !== kind);

  emitSelection([...new Set(nextKinds)]);
}

function selectAll(): void {
  emitSelection(props.options.map((option) => option.kind));
}

function clearAll(): void {
  emitSelection([]);
}

// 全选和全不选现在共用一个入口，避免右侧堆两个重复语义的按钮。
function handleToggleAll(): void {
  if (hasSelectedAllSources.value) {
    clearAll();
    return;
  }

  selectAll();
}
</script>

<template>
  <section
    :class="rootClass"
    data-content-source-filter
    data-content-toolbar
  >
    <div :class="headerClass">
      <div class="shrink-0">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">
          来源筛选
        </p>
        <p class="m-0 text-sm font-medium text-editorial-text-body">
          已选 {{ selectedCount }} / {{ options.length }} · 共 {{ visibleResultCount }} 条
        </p>
      </div>

      <div class="min-w-0 flex-1 overflow-x-auto">
        <div class="flex w-max items-center gap-2 pr-1">
          <label
            v-for="option in options"
            :key="option.kind"
            :data-source-option="option.kind"
            :class="[
              'inline-flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-editorial-sm px-3 py-2 text-sm transition',
              selectedSet.has(option.kind)
                ? 'border border-editorial-border-strong bg-editorial-link-active text-editorial-text-main shadow-editorial-accent'
                : 'border border-transparent text-editorial-text-body hover:border-editorial-border hover:bg-editorial-link-active hover:text-editorial-text-main'
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
          </label>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <a-button
          data-content-filter-action="toggle-all"
          size="small"
          :class="[editorialContentControlButtonClass, editorialContentControlButtonIdleClass]"
          @click="handleToggleAll"
        >
          {{ hasSelectedAllSources ? "全不选" : "全选" }}
        </a-button>
      </div>
    </div>
  </section>
</template>
