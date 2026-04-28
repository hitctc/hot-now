<script setup lang="ts">
import type { SettingsAiTimelineAdminResponse } from "../../../services/settingsApi";
import { editorialContentCardClass } from "../../content/contentCardShared";
import { formatAiTimelineDateTime } from "../../../utils/formatAiTimelineDateTime";

defineProps<{
  adminModel: SettingsAiTimelineAdminResponse | null;
  summaryLoading: boolean;
}>();

// feed 摘要只关心给人看的发布时间格式，原始时间字段仍由 API 保持不变。
const formatTime = formatAiTimelineDateTime;
</script>

<template>
  <a-card
    :class="editorialContentCardClass"
    title="AI 时间线 feed 摘要"
    size="small"
    data-sources-section="ai-timeline"
  >
    <a-spin :spinning="summaryLoading">
      <div class="flex flex-col gap-5">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="space-y-3">
            <p class="m-0 text-sm leading-6 text-editorial-text-body">
              AI 时间线已经切换为外部 Markdown feed 驱动；Codex 自动化负责生成并上传，项目只解析 `json ai-timeline-feed` 数据块，不再在应用内维护官方源采集规则。
            </p>
            <div class="flex flex-wrap gap-2 text-xs text-editorial-text-muted">
              <span class="rounded-editorial-pill bg-editorial-link px-2.5 py-1">外部 Markdown feed</span>
              <span class="rounded-editorial-pill bg-editorial-link px-2.5 py-1">
                最新事件 {{ formatTime(adminModel?.overview.latestVisiblePublishedAt) }}
              </span>
              <span class="rounded-editorial-pill bg-editorial-link px-2.5 py-1">
                7 天事件 {{ adminModel?.overview.visibleImportantCount7d ?? 0 }}
              </span>
            </div>
          </div>

          <div class="flex shrink-0 flex-wrap gap-2">
            <a-button href="/settings/ai-timeline" data-action="open-ai-timeline-admin">
              查看 feed
            </a-button>
          </div>
        </div>

        <div class="rounded-editorial-card border border-editorial-border bg-editorial-panel/45 p-3 text-sm text-editorial-text-body">
          公网 feed：<a
            href="https://now.achuan.cc/feeds/ai-timeline-feed.md"
            target="_blank"
            rel="noreferrer"
            class="font-semibold text-editorial-text-main"
          >now.achuan.cc/feeds/ai-timeline-feed.md</a>
        </div>
      </div>
    </a-spin>
  </a-card>
</template>
