<script setup lang="ts">
import type { SettingsAiTimelineHealthOverview } from "../../../services/settingsApi";
import { editorialContentCardClass } from "../../content/contentCardShared";

defineProps<{
  overview: SettingsAiTimelineHealthOverview;
}>();

function formatTime(value: string | null): string {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "时间无效";
  }

  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
</script>

<template>
  <a-card
    :class="editorialContentCardClass"
    title="主时间线状态"
    size="small"
    data-ai-timeline-admin-overview
  >
    <div class="grid gap-3 md:grid-cols-5">
      <article class="rounded-editorial-card border border-editorial-border bg-editorial-panel/55 p-4">
        <p class="m-0 text-xs text-editorial-text-muted">7 天 feed 事件</p>
        <strong class="mt-2 block text-2xl text-editorial-text-main">{{ overview.visibleImportantCount7d }}</strong>
      </article>
      <article class="rounded-editorial-card border border-editorial-border bg-editorial-panel/55 p-4">
        <p class="m-0 text-xs text-editorial-text-muted">最新事件发布时间</p>
        <strong class="mt-2 block text-base text-editorial-text-main">{{ formatTime(overview.latestVisiblePublishedAt) }}</strong>
      </article>
      <article class="rounded-editorial-card border border-editorial-border bg-editorial-panel/55 p-4">
        <p class="m-0 text-xs text-editorial-text-muted">最近采集时间</p>
        <strong class="mt-2 block text-base text-editorial-text-main">{{ formatTime(overview.latestCollectStartedAt) }}</strong>
      </article>
      <article class="rounded-editorial-card border border-editorial-border bg-editorial-panel/55 p-4">
        <p class="m-0 text-xs text-editorial-text-muted">失败源</p>
        <strong class="mt-2 block text-2xl text-editorial-text-main">{{ overview.failedSourceCount }}</strong>
      </article>
      <article class="rounded-editorial-card border border-editorial-border bg-editorial-panel/55 p-4">
        <p class="m-0 text-xs text-editorial-text-muted">过期源</p>
        <strong class="mt-2 block text-2xl text-editorial-text-main">{{ overview.staleSourceCount }}</strong>
      </article>
    </div>
  </a-card>
</template>
