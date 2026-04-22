<script setup lang="ts">
import { computed } from "vue";

import type { ContentSortMode } from "../../services/contentApi";
import {
  editorialContentControlButtonActiveClass,
  editorialContentControlButtonClass,
  editorialContentControlButtonIdleClass,
  editorialContentFloatingPanelClass
} from "./contentCardShared";

const props = withDefaults(
  defineProps<{
    sortMode: ContentSortMode;
    compact?: boolean;
  }>(),
  {
    compact: false
  }
);

const emit = defineEmits<{
  change: [sortMode: ContentSortMode];
}>();

const rootClass = computed(() =>
  props.compact
    ? "flex flex-col gap-2 rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-3 py-2 shadow-none lg:rounded-editorial-lg"
    : `${editorialContentFloatingPanelClass} flex flex-col gap-3 px-4 py-4`
);
const contentClass = computed(() =>
  props.compact
    ? "flex flex-row items-center justify-between gap-2"
    : "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
);

function emitChange(nextSortMode: ContentSortMode): void {
  if (nextSortMode === props.sortMode) {
    return;
  }

  emit("change", nextSortMode);
}
</script>

<template>
  <section
    :class="rootClass"
    data-content-sort-control
  >
    <div :class="contentClass">
      <div class="min-w-0 space-y-1">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">排序方式</p>
        <p v-if="!compact" class="m-0 text-sm leading-6 text-editorial-text-body">
          三个内容页共享这一组浏览顺序偏好。
        </p>
        <p v-else class="m-0 hidden text-[11px] leading-5 text-editorial-text-muted lg:block">
          Shared order
        </p>
      </div>

      <div class="flex shrink-0 flex-wrap justify-end gap-2">
        <a-button
          data-content-sort-mode="published_at"
          size="small"
          :class="[
            editorialContentControlButtonClass,
            sortMode === 'published_at' ? editorialContentControlButtonActiveClass : editorialContentControlButtonIdleClass
          ]"
          @click="emitChange('published_at')"
        >
          按发布时间
        </a-button>
        <a-button
          data-content-sort-mode="content_score"
          size="small"
          :class="[
            editorialContentControlButtonClass,
            sortMode === 'content_score' ? editorialContentControlButtonActiveClass : editorialContentControlButtonIdleClass
          ]"
          @click="emitChange('content_score')"
        >
          按评分
        </a-button>
      </div>
    </div>
  </section>
</template>
