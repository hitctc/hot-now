<script setup lang="ts">
import type { AiTimelineEventRecord, AiTimelineVisibilityStatus } from "../../../services/aiTimelineApi";
import type { SettingsAiTimelineEventsResponse } from "../../../services/settingsApi";
import { editorialContentCardClass, readSafeUrl } from "../../content/contentCardShared";

defineProps<{
  eventsModel: SettingsAiTimelineEventsResponse;
}>();

function formatTime(value: string): string {
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

function readVisibilityLabel(status: AiTimelineVisibilityStatus): string {
  switch (status) {
    case "auto_visible":
      return "自动展示";
    case "manual_visible":
      return "人工展示";
    case "hidden":
      return "已隐藏";
  }
}

function readReliabilityLabel(event: AiTimelineEventRecord): string {
  switch (event.reliabilityStatus) {
    case "multi_source":
      return `多证据 ${event.evidenceCount}`;
    case "source_degraded":
      return "来源需检查";
    case "manual_verified":
      return "人工确认";
    case "single_source":
      return `单证据 ${event.evidenceCount}`;
  }
}
</script>

<template>
  <a-card
    :class="editorialContentCardClass"
    title="feed 事件"
    size="small"
    data-ai-timeline-candidate-events
  >
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span class="font-semibold text-editorial-text-main">当前 feed 事件 {{ eventsModel.totalResults }} 条</span>
        <span class="text-xs text-editorial-text-muted">这里直接展示 Markdown feed 中通过质量门禁的事件，页面不再提供本地编辑。</span>
      </div>

      <a-empty
        v-if="eventsModel.events.length === 0"
        description="当前 feed 中没有可展示的 AI 时间线事件"
      />

      <article
        v-for="event in eventsModel.events"
        :key="event.id"
        class="rounded-editorial-card border border-editorial-border bg-editorial-panel/55 p-4"
        data-ai-timeline-candidate-event
      >
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0 space-y-2">
            <div class="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-editorial-text-muted">
              <span class="rounded-editorial-pill bg-editorial-link px-2 py-0.5">{{ event.importanceLevel }} 级</span>
              <span class="rounded-editorial-pill bg-editorial-link px-2 py-0.5">{{ event.eventType }}</span>
              <span class="rounded-editorial-pill bg-editorial-link px-2 py-0.5">{{ readVisibilityLabel(event.visibilityStatus) }}</span>
              <span class="rounded-editorial-pill bg-editorial-link px-2 py-0.5">{{ readReliabilityLabel(event) }}</span>
              <span>{{ formatTime(event.publishedAt) }}</span>
            </div>
            <h4 class="m-0 text-base font-semibold leading-6 text-editorial-text-main">
              {{ event.displayTitle }}
            </h4>
            <p v-if="event.displaySummaryZh" class="m-0 text-sm leading-6 text-editorial-text-body">
              {{ event.displaySummaryZh }}
            </p>
            <div class="flex flex-wrap gap-2 text-xs text-editorial-text-muted">
              <span>{{ event.companyName }}</span>
              <span>{{ event.sourceLabel }}</span>
              <a
                v-if="readSafeUrl(event.officialUrl)"
                class="max-w-[520px] truncate text-editorial-accent hover:underline"
                :href="readSafeUrl(event.officialUrl) ?? undefined"
                target="_blank"
                rel="noreferrer"
              >
                官方原文
              </a>
            </div>
          </div>

          <div class="flex shrink-0 flex-wrap gap-2 text-xs text-editorial-text-muted">
            <span class="rounded-editorial-pill border border-editorial-border bg-editorial-panel/70 px-2.5 py-1">
              read-only feed
            </span>
          </div>
        </div>
      </article>
    </div>
  </a-card>
</template>
