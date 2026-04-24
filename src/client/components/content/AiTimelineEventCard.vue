<script setup lang="ts">
import type { AiTimelineEventRecord } from "../../services/aiTimelineApi";
import {
  editorialContentBadgeClass,
  editorialContentCardClass,
  editorialContentMetaClass,
  formatPublishedAt,
  readSafeUrl
} from "./contentCardShared";

const props = defineProps<{
  event: AiTimelineEventRecord;
  displayIndex: number;
}>();

// 官方来源链接只允许 http(s)，避免把异常协议从数据层直接渲染成可点击入口。
const safeOfficialUrl = readSafeUrl(props.event.officialUrl);
</script>

<template>
  <article
    :class="[editorialContentCardClass, 'grid gap-4 px-4 py-4 sm:grid-cols-[auto_1fr_auto] sm:items-start sm:px-5']"
    data-ai-timeline-event-card
  >
    <div
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-editorial-border bg-editorial-link text-sm font-semibold text-editorial-text-main"
      data-ai-timeline-display-index
    >
      {{ displayIndex }}
    </div>

    <div class="min-w-0 space-y-3">
      <div :class="editorialContentMetaClass">
        <span>{{ formatPublishedAt(event.publishedAt) }}</span>
        <span>{{ event.companyName }}</span>
        <span>{{ event.sourceLabel }}</span>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span :class="editorialContentBadgeClass" data-ai-timeline-event-type>
          {{ event.eventType }}
        </span>
        <span :class="editorialContentBadgeClass">
          官方来源
        </span>
      </div>

      <h3 class="m-0 text-lg font-semibold leading-7 text-editorial-text-main" data-ai-timeline-event-title>
        {{ event.title }}
      </h3>

      <p v-if="event.summary" class="m-0 text-sm leading-6 text-editorial-text-body" data-ai-timeline-event-summary>
        {{ event.summary }}
      </p>
    </div>

    <a
      v-if="safeOfficialUrl"
      :href="safeOfficialUrl"
      target="_blank"
      rel="noreferrer"
      class="inline-flex shrink-0 items-center justify-center rounded-editorial-pill border border-editorial-border bg-editorial-panel px-3.5 py-2 text-xs font-semibold text-editorial-text-main no-underline transition hover:bg-editorial-link-active hover:text-editorial-text-main hover:no-underline"
      data-ai-timeline-official-link
    >
      官方来源
    </a>
  </article>
</template>
