<script setup lang="ts">
import type { SettingsAiTimelineSourceHealth } from "../../../services/settingsApi";
import { editorialContentCardClass, readSafeUrl } from "../../content/contentCardShared";

defineProps<{
  sources: readonly SettingsAiTimelineSourceHealth[];
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

function readSourceStatusLabel(status: SettingsAiTimelineSourceHealth["latestStatus"]): string {
  switch (status) {
    case "success":
      return "正常";
    case "failed":
      return "失败";
    case "empty":
      return "空结果";
    case "stale":
      return "已过期";
    default:
      return "未采集";
  }
}
</script>

<template>
  <a-card
    :class="editorialContentCardClass"
    title="官方源健康"
    size="small"
    data-ai-timeline-source-health
  >
    <div class="overflow-x-auto">
      <table class="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
        <thead class="text-xs text-editorial-text-muted">
          <tr>
            <th class="px-3 py-2 font-semibold">来源</th>
            <th class="px-3 py-2 font-semibold">状态</th>
            <th class="px-3 py-2 font-semibold">最近采集</th>
            <th class="px-3 py-2 font-semibold">最新官方发布时间</th>
            <th class="px-3 py-2 font-semibold">候选 / 重要</th>
            <th class="px-3 py-2 font-semibold">异常</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="source in sources"
            :key="source.sourceId"
            class="rounded-editorial-card bg-editorial-panel/55 text-editorial-text-body"
            data-ai-timeline-source-health-row
          >
            <td class="rounded-l-editorial-card px-3 py-3">
              <div class="font-semibold text-editorial-text-main">{{ source.companyName }}</div>
              <a
                v-if="readSafeUrl(source.sourceUrl)"
                class="block max-w-[280px] truncate text-xs text-editorial-accent hover:underline"
                :href="readSafeUrl(source.sourceUrl) ?? undefined"
                target="_blank"
                rel="noreferrer"
              >
                {{ source.sourceLabel }}
              </a>
            </td>
            <td class="px-3 py-3">
              <span class="rounded-editorial-pill bg-editorial-link px-2.5 py-1 text-xs">
                {{ readSourceStatusLabel(source.latestStatus) }}
              </span>
            </td>
            <td class="px-3 py-3 text-xs">{{ formatTime(source.latestStartedAt) }}</td>
            <td class="px-3 py-3 text-xs">{{ formatTime(source.latestOfficialPublishedAt) }}</td>
            <td class="px-3 py-3 text-xs">{{ source.candidateEventCount }} / {{ source.importantEventCount }}</td>
            <td class="rounded-r-editorial-card px-3 py-3 text-xs">
              {{ source.errorMessage || "无" }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </a-card>
</template>
