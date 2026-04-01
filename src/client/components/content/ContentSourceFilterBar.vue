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
    :class="[editorialContentFloatingPanelClass, 'sticky top-0 z-10 backdrop-blur-xl']"
    data-content-source-filter
  >
    <div class="flex items-center gap-3">
      <div class="shrink-0">
        <p class="m-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-editorial-text-muted">
          来源筛选
        </p>
        <p class="m-0 text-sm font-medium text-editorial-text-body">
          已选 {{ selectedCount }} / {{ options.length }}
        </p>
      </div>

      <div class="min-w-0 flex-1 overflow-x-auto">
        <div class="flex w-max items-center gap-3 pr-1">
          <label
            v-for="option in options"
            :key="option.kind"
            :class="[
              'inline-flex shrink-0 cursor-pointer items-center gap-3 rounded-editorial-pill border px-3 py-2 text-sm font-semibold transition',
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
      </div>

      <div class="flex shrink-0 items-center gap-2">
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
  </a-card>
</template>
