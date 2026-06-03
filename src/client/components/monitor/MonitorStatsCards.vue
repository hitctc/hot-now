<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { fetchMonitorStats, fetchPlatformStats, type MonitorStats, type PlatformStats } from "../../services/monitorApi.js";

const stats = ref<MonitorStats | null>(null);
const platform = ref<PlatformStats | null>(null);
const loading = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const [s, p] = await Promise.allSettled([fetchMonitorStats(), fetchPlatformStats()]);
    if (s.status === "fulfilled") stats.value = s.value;
    if (p.status === "fulfilled") platform.value = p.value;
  } finally { loading.value = false; }
}

function parseStepsSummary(raw: string): Record<string, unknown> | null {
  try { return JSON.parse(raw); }
  catch { return null; }
}

function runDuration(started: string, finished: string | null): string {
  if (!finished) return "-";
  const ms = new Date(finished + "Z").getTime() - new Date(started + "Z").getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`;
}

const statusColorMap: Record<string, string> = { done: "green", error: "red", running: "blue" };

onMounted(() => { refresh(); timer = setInterval(refresh, 30_000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<template>
  <section class="rounded-lg border border-editorial-border bg-white p-4">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">今日统计</h3>
      <a-button type="link" size="small" class="!p-0 !text-[11px]" :loading="loading" @click="refresh">刷新</a-button>
    </div>
    <a-spin :spinning="loading && !stats">
      <template v-if="stats">
        <!-- 今日数字 -->
        <div class="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          <div v-for="item in [
            { label: '采集', value: stats.today_collected },
            { label: '评分', value: stats.today_scored },
            { label: '写作', value: stats.today_written },
            { label: '草稿', value: stats.today_drafted },
            { label: '封面✓', value: stats.today_cover_ok },
            { label: '封面✗', value: stats.today_cover_fail },
          ]" :key="item.label" class="rounded border border-gray-100 bg-gray-50 px-2 py-1.5 text-center">
            <div class="text-base font-bold text-editorial-text-main">{{ item.value }}</div>
            <div class="text-[10px] text-editorial-text-muted">{{ item.label }}</div>
          </div>
        </div>

        <!-- 待处理（Hermes 本地 + 平台全量） -->
        <div class="mb-3 grid grid-cols-3 gap-2">
          <div v-for="item in [
            { label: '待评分', local: stats.pending_score, remote: platform?.pending_score },
            { label: '待趋势', local: stats.pending_trend, remote: platform?.pending_trend },
            { label: '待写作', local: stats.pending_write, remote: platform?.pending_write },
          ]" :key="item.label" class="rounded border border-orange-200 bg-orange-50 px-2 py-1.5 text-center">
            <div class="text-base font-bold text-orange-600">{{ item.local }}</div>
            <div class="text-[10px] text-editorial-text-muted">{{ item.label }}</div>
            <div v-if="item.remote != null && item.remote !== item.local" class="text-[9px] text-editorial-text-muted/60">平台 {{ item.remote }}</div>
          </div>
        </div>

        <!-- 平台总数 -->
        <div v-if="platform" class="mb-3 grid grid-cols-2 gap-2">
          <div class="rounded border border-gray-100 bg-gray-50 px-2 py-1.5 text-center">
            <div class="text-base font-bold text-editorial-text-main">{{ platform.total }}</div>
            <div class="text-[10px] text-editorial-text-muted">总素材</div>
          </div>
          <div class="rounded border border-gray-100 bg-gray-50 px-2 py-1.5 text-center">
            <div class="text-base font-bold text-editorial-text-main">{{ platform.total_articles }}</div>
            <div class="text-[10px] text-editorial-text-muted">总文章</div>
          </div>
        </div>

        <!-- 最近运行 -->
        <div v-if="stats.last_run" class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2">
          <div class="mb-1 flex items-center gap-2 text-xs">
            <span class="text-editorial-text-muted">最近运行 #{{ stats.last_run.id }}</span>
            <a-tag :color="statusColorMap[stats.last_run.status] ?? 'default'" class="!m-0 !text-[11px] !py-0">{{ stats.last_run.status }}</a-tag>
            <span class="text-editorial-text-muted">{{ stats.last_run.started_at }}</span>
            <span class="ml-auto text-editorial-text-muted">{{ runDuration(stats.last_run.started_at, stats.last_run.finished_at) }}</span>
          </div>
          <div v-if="stats.last_run.error" class="text-xs text-red-500">{{ stats.last_run.error }}</div>
          <div v-if="parseStepsSummary(stats.last_run.steps_summary)" class="mt-1 text-[11px] text-editorial-text-muted">
            <details>
              <summary class="cursor-pointer">步骤摘要</summary>
              <pre class="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[11px]">{{ JSON.stringify(parseStepsSummary(stats.last_run.steps_summary), null, 2) }}</pre>
            </details>
          </div>
        </div>
        <div v-else class="text-xs text-editorial-text-muted">暂无运行记录</div>
      </template>
    </a-spin>
  </section>
</template>
