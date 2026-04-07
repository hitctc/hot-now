<script setup lang="ts">
import type { ContentSortMode } from "../../services/contentApi";
import {
  editorialContentControlButtonActiveClass,
  editorialContentControlButtonClass,
  editorialContentControlButtonIdleClass,
  editorialContentFloatingPanelClass
} from "./contentCardShared";

const props = defineProps<{
  sortMode: ContentSortMode;
}>();

const emit = defineEmits<{
  change: [sortMode: ContentSortMode];
}>();

function emitChange(nextSortMode: ContentSortMode): void {
  if (nextSortMode === props.sortMode) {
    return;
  }

  emit("change", nextSortMode);
}
</script>

<template>
  <section
    :class="[editorialContentFloatingPanelClass, 'flex flex-col gap-3 px-4 py-4']"
    data-content-sort-control
  >
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="space-y-1">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">排序方式</p>
        <p class="m-0 text-sm leading-6 text-editorial-text-body">
          三个内容页共享这一组浏览顺序偏好。
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
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
