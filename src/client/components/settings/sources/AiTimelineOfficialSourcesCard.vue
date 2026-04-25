<script setup lang="ts">
import type { SettingsAiTimelineAdminResponse, SettingsSourcesOperations } from "../../../services/settingsApi";
import { editorialContentCardClass } from "../../content/contentCardShared";

type OfficialSourceView = {
  id: string;
  companyName: string;
  sourceLabel: string;
  sourceKindLabel: string;
};

defineProps<{
  sources: readonly OfficialSourceView[];
  adminModel: SettingsAiTimelineAdminResponse | null;
  summaryLoading: boolean;
  operations: SettingsSourcesOperations;
  isActionPending: (actionKey: string) => boolean;
}>();

const emit = defineEmits<{
  collect: [];
}>();

function formatTime(value: string | null | undefined): string {
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
    title="AI 时间线官方源摘要"
    size="small"
    data-sources-section="ai-timeline"
  >
    <a-spin :spinning="summaryLoading">
      <div class="flex flex-col gap-5">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="space-y-3">
            <p class="m-0 text-sm leading-6 text-editorial-text-body">
              这里仅保留官方源摘要和手动采集入口；候选事件、证据链和人工修正已经拆到独立管理页，避免数据收集页继续膨胀。
            </p>
            <div class="flex flex-wrap gap-2 text-xs text-editorial-text-muted">
              <span class="rounded-editorial-pill bg-editorial-link px-2.5 py-1">官方源 {{ sources.length }}</span>
              <span class="rounded-editorial-pill bg-editorial-link px-2.5 py-1">
                最近采集 {{ formatTime(adminModel?.overview.latestCollectStartedAt) }}
              </span>
              <span class="rounded-editorial-pill bg-editorial-link px-2.5 py-1">
                失败源 {{ adminModel?.overview.failedSourceCount ?? 0 }}
              </span>
              <span class="rounded-editorial-pill bg-editorial-link px-2.5 py-1">
                过期源 {{ adminModel?.overview.staleSourceCount ?? 0 }}
              </span>
              <span class="rounded-editorial-pill bg-editorial-link px-2.5 py-1">
                7 天 S/A {{ adminModel?.overview.visibleImportantCount7d ?? 0 }}
              </span>
            </div>
          </div>

          <div class="flex shrink-0 flex-wrap gap-2">
            <a-button
              type="primary"
              data-action="manual-ai-timeline-collect"
              :disabled="operations.isRunning"
              :loading="isActionPending('manual:ai-timeline-collect')"
              @click="emit('collect')"
            >
              {{ operations.isRunning ? "任务执行中..." : "手动采集官方事件" }}
            </a-button>
            <a-button href="/settings/ai-timeline" data-action="open-ai-timeline-admin">
              进入 AI 时间线管理
            </a-button>
          </div>
        </div>

        <div class="grid gap-2 md:grid-cols-3">
          <div
            v-for="source in sources.slice(0, 6)"
            :key="source.id"
            class="rounded-editorial-card border border-editorial-border bg-editorial-panel/45 p-3 text-sm"
            data-ai-timeline-source-summary
          >
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-editorial-text-main">{{ source.companyName }}</span>
              <span class="rounded-editorial-pill bg-editorial-link px-2 py-0.5 text-[11px] text-editorial-text-body">
                {{ source.sourceLabel }}
              </span>
            </div>
            <p class="m-0 mt-1 text-xs text-editorial-text-muted">{{ source.sourceKindLabel }}</p>
          </div>
        </div>
      </div>
    </a-spin>
  </a-card>
</template>
