<script setup lang="ts">
import type { AiTimelineEventRecord } from "../../services/aiTimelineApi";
import {
  editorialContentBadgeClass,
  editorialContentCardClass,
  editorialContentMetaClass,
  readSafeUrl
} from "./contentCardShared";

const props = defineProps<{
  event: AiTimelineEventRecord;
  displayIndex: number;
}>();

// 官方来源链接只允许 http(s)，避免把异常协议从数据层直接渲染成可点击入口。
const safeOfficialUrl = readSafeUrl(props.event.officialUrl);

function readPublishedDate(): Date | null {
  const date = new Date(props.event.publishedAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

// 时间轴左侧需要把日期和时间拆开，便于用户按节点扫描发布节奏。
function formatTimelineDate(): string {
  const date = readPublishedDate();

  if (!date) {
    return "日期未知";
  }

  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  });
}

function formatTimelineTime(): string {
  const date = readPublishedDate();

  if (!date) {
    return "时间未知";
  }

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function readNodeAccentClass(): string {
  switch (props.event.eventType) {
    case "要闻":
      return "border-red-300/70 bg-red-500/18 text-red-100 shadow-[0_0_28px_rgba(248,113,113,0.28)]";
    case "模型发布":
      return "border-sky-300/70 bg-sky-500/18 text-sky-100 shadow-[0_0_28px_rgba(56,189,248,0.28)]";
    case "开发生态":
      return "border-emerald-300/70 bg-emerald-500/18 text-emerald-100 shadow-[0_0_28px_rgba(52,211,153,0.26)]";
    case "产品应用":
      return "border-violet-300/70 bg-violet-500/18 text-violet-100 shadow-[0_0_28px_rgba(167,139,250,0.26)]";
    case "行业动态":
      return "border-amber-300/70 bg-amber-500/18 text-amber-100 shadow-[0_0_28px_rgba(251,191,36,0.24)]";
    case "官方前瞻":
      return "border-cyan-300/70 bg-cyan-500/18 text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.24)]";
    default:
      return "border-editorial-border-strong bg-editorial-link-active text-editorial-text-main shadow-editorial-accent";
  }
}
</script>

<template>
  <article
    class="grid grid-cols-[52px_32px_minmax(0,1fr)] gap-3 py-3 sm:grid-cols-[76px_52px_minmax(0,1fr)] sm:gap-4"
    data-ai-timeline-event-card
  >
    <div
      class="pt-1 text-right font-mono text-[11px] leading-5 text-editorial-text-muted sm:text-xs"
      data-ai-timeline-time
    >
      <div class="font-semibold text-editorial-text-body">{{ formatTimelineTime() }}</div>
      <div class="text-[10px] text-editorial-text-muted sm:text-[11px]">{{ formatTimelineDate() }}</div>
    </div>

    <div class="relative flex min-h-full justify-center" aria-hidden="true">
      <div class="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-editorial-border-strong/70" />
      <div
        :class="[
          'relative z-[1] flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold backdrop-blur-xl sm:h-11 sm:w-11 sm:text-sm',
          readNodeAccentClass()
        ]"
        data-ai-timeline-display-index
      >
        {{ displayIndex }}
      </div>
    </div>

    <div :class="[editorialContentCardClass, 'min-w-0 px-4 py-4 sm:px-5']">
      <div class="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div class="min-w-0 space-y-3">
          <div :class="editorialContentMetaClass">
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
      </div>
    </div>
  </article>
</template>
