<script setup lang="ts">
import type { AiTimelineEventRecord } from "../../services/aiTimelineApi";
import {
  editorialContentBadgeClass,
  editorialContentCardClass,
  editorialContentMetaClass,
  readSafeUrl
} from "./contentCardShared";
import { formatAiTimelineDateTime } from "../../utils/formatAiTimelineDateTime";

const props = defineProps<{
  event: AiTimelineEventRecord;
  displayIndex: number;
}>();

// 官方证据链接只允许 http(s)，避免把异常协议从数据层直接渲染成可点击入口。
const safeEvidenceLinks = props.event.evidenceLinks
  .map((evidence) => ({
    ...evidence,
    safeUrl: readSafeUrl(evidence.officialUrl)
  }))
  .filter((evidence) => evidence.safeUrl);

// 时间轴节点显示统一短时间，兼顾 PC 和移动端的扫读效率。
function formatTimelineTime(): string {
  return formatAiTimelineDateTime(props.event.publishedAt);
}

function readNodeAccentClass(): string {
  switch (props.event.importanceLevel) {
    case "S":
      return "border-red-200/80 bg-red-500 text-white shadow-[0_0_30px_rgba(248,113,113,0.42)]";
    case "A":
      return "border-sky-200/80 bg-sky-500 text-white shadow-[0_0_30px_rgba(56,189,248,0.42)]";
    case "B":
      return "border-amber-200/80 bg-amber-500 text-white shadow-[0_0_30px_rgba(251,191,36,0.36)]";
    case "C":
      return "border-slate-200/70 bg-slate-500 text-white shadow-[0_0_24px_rgba(100,116,139,0.32)]";
  }
}

function readImportanceBadgeClass(): string {
  switch (props.event.importanceLevel) {
    case "S":
      return "border-red-200/80 bg-red-500 text-white";
    case "A":
      return "border-sky-200/80 bg-sky-500 text-white";
    case "B":
      return "border-amber-200/80 bg-amber-500 text-white";
    case "C":
      return "border-slate-200/70 bg-slate-500 text-white";
  }
}

function readReleaseStatusLabel(): string {
  switch (props.event.releaseStatus) {
    case "official_preview":
      return "官方前瞻，尚未正式发布";
    case "open_sourced":
      return "已开源";
    case "updated":
      return "重要更新";
    case "released":
      return "已正式发布";
  }
}

function readReliabilityLabel(): string {
  switch (props.event.reliabilityStatus) {
    case "multi_source":
      return "多官方证据确认";
    case "source_degraded":
      return "来源近期异常，已保留官方事件";
    case "manual_verified":
      return "人工确认可靠";
    case "single_source":
      return "单一官方证据";
  }
}
</script>

<template>
  <article
    class="grid grid-cols-[68px_32px_minmax(0,1fr)] gap-2 py-3 sm:grid-cols-[112px_52px_minmax(0,1fr)] sm:gap-4"
    data-ai-timeline-event-card
  >
    <div
      class="flex h-8 items-center justify-end text-right font-mono text-[10px] font-semibold leading-4 text-editorial-text-body sm:h-11 sm:whitespace-nowrap sm:text-xs sm:leading-5"
      data-ai-timeline-time
      :title="formatTimelineTime()"
    >
      {{ formatTimelineTime() }}
    </div>

    <div class="relative flex min-h-full self-stretch justify-center" aria-hidden="true">
      <div
        :class="[
          'relative z-[1] flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-black backdrop-blur-xl ring-4 ring-editorial-panel sm:h-11 sm:w-11 sm:text-sm',
          readNodeAccentClass()
        ]"
        data-ai-timeline-display-index
      >
        {{ displayIndex }}
      </div>
    </div>

    <div :class="[editorialContentCardClass, 'min-w-0 px-4 py-4 sm:px-5']">
      <div class="grid gap-4">
        <div class="min-w-0 space-y-3">
          <div :class="editorialContentMetaClass">
            <span>{{ event.companyName }}</span>
            <span>{{ event.sourceLabel }}</span>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span
              :class="[
                'inline-flex items-center rounded-editorial-pill border px-2.5 py-1 text-[11px] font-black tracking-[0.12em]',
                readImportanceBadgeClass()
              ]"
              data-ai-timeline-importance-level
            >
              {{ event.importanceLevel }} 级
            </span>
            <span :class="editorialContentBadgeClass" data-ai-timeline-event-type>
              {{ event.eventType }}
            </span>
            <span :class="editorialContentBadgeClass">
              {{ readReleaseStatusLabel() }}
            </span>
            <span :class="editorialContentBadgeClass" data-ai-timeline-evidence-badge>
              {{ event.evidenceCount }} 条官方证据
            </span>
            <span :class="editorialContentBadgeClass" data-ai-timeline-reliability-badge>
              {{ readReliabilityLabel() }}
            </span>
          </div>

          <h3 class="m-0 text-lg font-semibold leading-7 text-editorial-text-main" data-ai-timeline-event-title>
            {{ event.displayTitle }}
          </h3>

          <p
            v-if="event.displaySummaryZh"
            class="m-0 text-sm leading-6 text-editorial-text-body"
            data-ai-timeline-event-summary
          >
            {{ event.displaySummaryZh }}
          </p>

          <div
            v-if="event.detectedEntities.length > 0"
            class="flex flex-wrap gap-1.5"
            data-ai-timeline-detected-entities
          >
            <span
              v-for="entity in event.detectedEntities"
              :key="entity"
              class="rounded-editorial-pill border border-editorial-border bg-editorial-link px-2 py-0.5 text-[11px] font-semibold text-editorial-text-body"
            >
              {{ entity }}
            </span>
          </div>

          <div
            v-if="safeEvidenceLinks.length > 0"
            class="rounded-editorial-card border border-editorial-border bg-editorial-panel/55 p-3"
            data-ai-timeline-evidence-links
          >
            <p class="m-0 text-xs font-semibold text-editorial-text-muted">官方证据</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <a
                v-for="evidence in safeEvidenceLinks"
                :key="`${evidence.sourceId}:${evidence.officialUrl}`"
                :href="evidence.safeUrl ?? undefined"
                target="_blank"
                rel="noreferrer"
                class="rounded-editorial-pill border border-editorial-border bg-editorial-link px-2.5 py-1 text-xs font-semibold text-editorial-text-main no-underline hover:bg-editorial-link-active hover:no-underline"
                data-ai-timeline-evidence-link
              >
                {{ evidence.sourceLabel }}
              </a>
            </div>
          </div>
        </div>

      </div>
    </div>
  </article>
</template>
