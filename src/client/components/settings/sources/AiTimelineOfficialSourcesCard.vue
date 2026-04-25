<script setup lang="ts">
import { reactive, watch } from "vue";

import type {
  AiTimelineEventRecord,
  AiTimelineImportanceLevel,
  AiTimelineVisibilityStatus
} from "../../../services/aiTimelineApi";
import type { SettingsAiTimelineEventsResponse, SettingsSourcesOperations } from "../../../services/settingsApi";
import { editorialContentCardClass, readSafeUrl } from "../../content/contentCardShared";

type OfficialSourceView = {
  id: string;
  companyName: string;
  sourceLabel: string;
  sourceKindLabel: string;
  sourceUrl: string;
  allowedScope: string;
};

type EventDraft = {
  manualTitle: string;
  manualSummaryZh: string;
  manualImportanceLevel: AiTimelineImportanceLevel | null;
};

const props = defineProps<{
  sources: readonly OfficialSourceView[];
  eventsModel: SettingsAiTimelineEventsResponse | null;
  eventsLoading: boolean;
  operations: SettingsSourcesOperations;
  isActionPending: (actionKey: string) => boolean;
}>();

const emit = defineEmits<{
  collect: [];
  refreshEvents: [];
  setVisibility: [event: AiTimelineEventRecord, visibilityStatus: AiTimelineVisibilityStatus];
  saveManualText: [event: AiTimelineEventRecord, values: EventDraft];
}>();

const drafts = reactive<Record<number, EventDraft>>({});
const importanceOptions: AiTimelineImportanceLevel[] = ["S", "A", "B", "C"];

watch(
  () => props.eventsModel?.events ?? [],
  (events) => {
    for (const event of events) {
      if (drafts[event.id]) {
        continue;
      }

      drafts[event.id] = {
        manualTitle: event.manualTitle ?? "",
        manualSummaryZh: event.manualSummaryZh ?? "",
        manualImportanceLevel: event.manualImportanceLevel ?? event.importanceLevel
      };
    }
  },
  { immediate: true }
);

function formatPublishedTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "发布时间未知";
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
      return "人工确认展示";
    case "hidden":
      return "已隐藏";
  }
}

function readReleaseLabel(event: AiTimelineEventRecord): string {
  return event.releaseStatus === "official_preview" ? "官方前瞻，尚未正式发布" : "已正式发布";
}
</script>

<template>
  <a-card
    :class="editorialContentCardClass"
    title="AI 时间线官方源"
    size="small"
    data-sources-section="ai-timeline"
  >
    <div class="flex flex-col gap-5">
      <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div class="min-w-0 flex-1 space-y-3">
          <p class="m-0 text-sm leading-6 text-editorial-text-body">
            只采集官方白名单来源，自动规则会把 S / A 级重要事件放进主时间线；这里可以查看候选、隐藏误入内容，也可以人工修正标题和中文摘要。
          </p>
          <div class="grid gap-2 md:grid-cols-2">
            <div
              v-for="source in sources"
              :key="source.id"
              class="rounded-editorial-card border border-editorial-border bg-editorial-panel/45 p-3 text-sm"
              data-ai-timeline-official-source
            >
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-semibold text-editorial-text-main">{{ source.companyName }}</span>
                <span class="rounded-editorial-pill bg-editorial-link px-2 py-0.5 text-[11px] text-editorial-text-body">
                  {{ source.sourceLabel }}
                </span>
                <span class="rounded-editorial-pill bg-editorial-link px-2 py-0.5 text-[11px] text-editorial-text-muted">
                  {{ source.sourceKindLabel }}
                </span>
              </div>
              <a
                class="mt-2 block break-all text-xs text-editorial-accent hover:underline"
                :href="source.sourceUrl"
                target="_blank"
                rel="noreferrer"
              >
                {{ source.sourceUrl }}
              </a>
              <p class="m-0 mt-1 text-xs leading-5 text-editorial-text-muted">
                {{ source.allowedScope }}
              </p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 text-xs text-editorial-text-muted">
            <span class="rounded-editorial-pill bg-editorial-link px-2.5 py-1">独立事件表</span>
            <span class="rounded-editorial-pill bg-editorial-link px-2.5 py-1">主时间线默认最近 7 天 S / A</span>
            <span class="rounded-editorial-pill bg-editorial-link px-2.5 py-1">人工隐藏不会被自动采集覆盖</span>
          </div>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2">
          <a-button
            data-action="refresh-ai-timeline-events"
            :loading="eventsLoading"
            @click="emit('refreshEvents')"
          >
            刷新候选
          </a-button>
          <a-button
            type="primary"
            data-action="manual-ai-timeline-collect"
            :disabled="operations.isRunning"
            :loading="isActionPending('manual:ai-timeline-collect')"
            @click="emit('collect')"
          >
            {{ operations.isRunning ? "任务执行中..." : "手动采集官方事件" }}
          </a-button>
        </div>
      </div>

      <a-spin :spinning="eventsLoading">
        <div class="space-y-3" data-ai-timeline-admin-events>
          <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span class="font-semibold text-editorial-text-main">
              后台候选事件 {{ eventsModel?.totalResults ?? 0 }} 条
            </span>
            <span class="text-xs text-editorial-text-muted">包含隐藏、B/C 级和 7 天外事件，便于排查规则。</span>
          </div>

          <a-empty
            v-if="!eventsModel || eventsModel.events.length === 0"
            description="还没有 AI 时间线候选事件"
          />

          <div
            v-for="event in eventsModel?.events ?? []"
            :key="event.id"
            class="rounded-editorial-card border border-editorial-border bg-editorial-panel/55 p-4"
            data-ai-timeline-admin-event
          >
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0 space-y-2">
                <div class="flex flex-wrap gap-2 text-[11px] font-semibold text-editorial-text-muted">
                  <span class="rounded-editorial-pill bg-editorial-link px-2 py-0.5">{{ event.importanceLevel }} 级</span>
                  <span class="rounded-editorial-pill bg-editorial-link px-2 py-0.5">{{ event.eventType }}</span>
                  <span class="rounded-editorial-pill bg-editorial-link px-2 py-0.5">{{ readVisibilityLabel(event.visibilityStatus) }}</span>
                  <span class="rounded-editorial-pill bg-editorial-link px-2 py-0.5">{{ readReleaseLabel(event) }}</span>
                  <span>{{ formatPublishedTime(event.publishedAt) }}</span>
                </div>
                <h4 class="m-0 text-base font-semibold leading-6 text-editorial-text-main">
                  {{ event.displayTitle }}
                </h4>
                <p v-if="event.displaySummaryZh" class="m-0 text-sm leading-6 text-editorial-text-body">
                  {{ event.displaySummaryZh }}
                </p>
                <a
                  v-if="readSafeUrl(event.officialUrl)"
                  class="break-all text-xs text-editorial-accent hover:underline"
                  :href="readSafeUrl(event.officialUrl) ?? undefined"
                  target="_blank"
                  rel="noreferrer"
                >
                  {{ event.officialUrl }}
                </a>
              </div>

              <div class="flex shrink-0 flex-wrap gap-2">
                <a-button
                  v-if="event.visibilityStatus !== 'hidden'"
                  danger
                  size="small"
                  :loading="isActionPending(`ai-timeline-event:${event.id}`)"
                  @click="emit('setVisibility', event, 'hidden')"
                >
                  隐藏
                </a-button>
                <a-button
                  v-else
                  size="small"
                  :loading="isActionPending(`ai-timeline-event:${event.id}`)"
                  @click="emit('setVisibility', event, 'manual_visible')"
                >
                  恢复展示
                </a-button>
              </div>
            </div>

            <a-collapse class="mt-3" ghost>
              <a-collapse-panel key="manual-edit" header="人工修正标题 / 摘要 / 级别">
                <div class="grid gap-3">
                  <a-input
                    v-model:value="drafts[event.id].manualTitle"
                    placeholder="不填则使用自动标题"
                  />
                  <a-textarea
                    v-model:value="drafts[event.id].manualSummaryZh"
                    :rows="3"
                    placeholder="不填则使用自动中文重要性摘要"
                  />
                  <div class="flex flex-wrap items-center gap-2">
                    <a-select
                      v-model:value="drafts[event.id].manualImportanceLevel"
                      class="min-w-28"
                      allow-clear
                      placeholder="级别"
                    >
                      <a-select-option
                        v-for="level in importanceOptions"
                        :key="level"
                        :value="level"
                      >
                        {{ level }} 级
                      </a-select-option>
                    </a-select>
                    <a-button
                      type="primary"
                      size="small"
                      :loading="isActionPending(`ai-timeline-event:${event.id}`)"
                      @click="emit('saveManualText', event, drafts[event.id])"
                    >
                      保存修正
                    </a-button>
                  </div>
                </div>
              </a-collapse-panel>
            </a-collapse>
          </div>
        </div>
      </a-spin>
    </div>
  </a-card>
</template>
