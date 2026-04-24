<script setup lang="ts">
import { formatDateTime, formatNextCollectionText, type SourcesOperations } from "./sourcesPageShared";

defineProps<{
  totalSourceCount: number;
  enabledSourceCount: number;
  operations: SourcesOperations;
  now: number;
}>();
</script>

<template>
  <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-5" data-sources-section="overview">
    <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/84 px-4 py-4 shadow-editorial-card backdrop-blur-xl">
      <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">接入来源</p>
      <p class="mt-2 mb-0 text-xl font-medium text-editorial-text-main">{{ totalSourceCount }}</p>
    </article>
    <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/84 px-4 py-4 shadow-editorial-card backdrop-blur-xl">
      <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">已启用来源</p>
      <p class="mt-2 mb-0 text-xl font-medium text-editorial-text-main">{{ enabledSourceCount }}</p>
    </article>
    <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/84 px-4 py-4 shadow-editorial-card backdrop-blur-xl">
      <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">最近采集</p>
      <p class="mt-2 mb-0 text-sm text-editorial-text-main">{{ formatDateTime(operations.lastCollectionRunAt) }}</p>
    </article>
    <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/84 px-4 py-4 shadow-editorial-card backdrop-blur-xl">
      <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">最近发信</p>
      <p class="mt-2 mb-0 text-sm text-editorial-text-main">{{ formatDateTime(operations.lastSendLatestEmailAt) }}</p>
    </article>
    <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/84 px-4 py-4 shadow-editorial-card backdrop-blur-xl">
      <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">下一次采集</p>
      <p class="mt-2 mb-0 text-sm text-editorial-text-main">
        {{ formatNextCollectionText(operations.nextCollectionRunAt, now) }}
      </p>
    </article>
  </section>
</template>
