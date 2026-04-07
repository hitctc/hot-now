<script setup lang="ts">
import { editorialContentFloatingPanelClass } from "./contentCardShared";

const props = defineProps<{
  page: number;
  pageSize: number;
  totalResults: number;
  totalPages: number;
}>();

const emit = defineEmits<{
  change: [page: number];
}>();

function emitPageChange(nextPage: number): void {
  if (nextPage === props.page || nextPage < 1 || nextPage > props.totalPages) {
    return;
  }

  emit("change", nextPage);
}
</script>

<template>
  <section
    v-if="totalResults > pageSize"
    :class="[editorialContentFloatingPanelClass, 'flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between']"
    data-content-pagination
  >
    <div class="space-y-1">
      <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">分页浏览</p>
      <p class="m-0 text-sm text-editorial-text-body" data-content-pagination-summary>
        第 {{ page }} / {{ totalPages }} 页 · 共 {{ totalResults }} 条
      </p>
    </div>

    <div class="flex items-center gap-2">
      <a-button
        data-content-pagination-action="prev"
        size="small"
        :disabled="page <= 1"
        @click="emitPageChange(page - 1)"
      >
        上一页
      </a-button>
      <a-button
        data-content-pagination-action="next"
        size="small"
        :disabled="page >= totalPages"
        @click="emitPageChange(page + 1)"
      >
        下一页
      </a-button>
    </div>
  </section>
</template>
