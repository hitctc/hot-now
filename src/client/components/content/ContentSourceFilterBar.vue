<script setup lang="ts">
import { computed } from "vue";

import {
  editorialContentControlButtonClass,
  editorialContentControlButtonIdleClass,
  editorialContentFloatingPanelClass
} from "./contentCardShared";

const props = defineProps<{
  options: { kind: string; name: string }[];
  selectedSourceKinds: string[];
}>();

const emit = defineEmits<{
  change: [selectedSourceKinds: string[]];
}>();

const selectedSet = computed(() => new Set(props.selectedSourceKinds));
const selectedCount = computed(() => props.selectedSourceKinds.length);

function emitSelection(nextKinds: string[]): void {
  emit("change", nextKinds);
}

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
</script>

<template>
  <a-card
    :bordered="false"
    :class="[editorialContentFloatingPanelClass, 'backdrop-blur-xl']"
    data-content-source-filter
  >
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div class="space-y-2">
        <p class="m-0 text-xs font-semibold uppercase tracking-[0.24em] text-editorial-text-muted">
          来源筛选
        </p>
        <div class="space-y-1">
          <h3 class="m-0 text-lg font-semibold text-editorial-text-main">当前只看这些来源</h3>
          <p class="m-0 text-sm leading-6 text-editorial-text-body">
            浏览偏好只影响当前内容页；已选 {{ selectedCount }} / {{ options.length }}。
          </p>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <a-button
          data-content-filter-action="select-all"
          size="small"
          :class="[editorialContentControlButtonClass, editorialContentControlButtonIdleClass]"
          @click="selectAll"
        >
          全选
        </a-button>
        <a-button
          data-content-filter-action="clear-all"
          size="small"
          :class="[editorialContentControlButtonClass, editorialContentControlButtonIdleClass]"
          @click="clearAll"
        >
          全不选
        </a-button>
      </div>
    </div>

    <div class="mt-4 flex flex-wrap gap-3">
      <label
        v-for="option in options"
        :key="option.kind"
        :class="[
          'inline-flex cursor-pointer items-center gap-3 rounded-editorial-pill border px-3 py-2 text-sm font-semibold transition',
          selectedSet.has(option.kind)
            ? 'border-transparent bg-editorial-link-active text-editorial-text-on-accent shadow-editorial-accent'
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
      </label>
    </div>
  </a-card>
</template>
