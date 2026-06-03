<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { fetchMonitorStats, type MonitorStats } from "../../services/monitorApi.js";

const data = ref<MonitorStats | null>(null);
const loading = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

async function refresh(): Promise<void> {
  loading.value = true;
  try { data.value = await fetchMonitorStats(); }
  catch { /* 静默 */ }
  finally { loading.value = false; }
}

// 解析 steps_summary JSON
function parseStepsSummary(raw: string): Record<string, unknown> | null {
  try { return JSON.parse(raw); }
  catch { return null; }
}

// 最近运行耗时
function runDuration(started: string, finished: string | null): string {
  if (!finished) return "-";
  const ms = new Date(finished + "Z").getTime() - new Date(started + "Z").getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`;
}

const statusColorMap: Record<string, string> = {
  done: "green",
  error: "red",
  running: "blue",
};

onMounted(() => { refresh(); timer = setInterval(refresh, 30_000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<template>
  <section class="rounded-lg border border-editorial-border bg-white p-4">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">今日统计</h3>
      <a-button type="link" size="small" class="!p-0 !text-[11px]" :loading="loading" @click="refresh">刷新</a-button>
    </div>
    <a-spin :spinning="loading && !data">
      <template v-if="data">
        <!-- 统计数字 -->
        <div class="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-3">
          <div v-for="item in [
            { label: '采集', value: data.today_collected },
            { label: '评分', value: data.today_scored },
            { label: '写作', value: data.today_written },
            { label: '草稿', value: data.today_drafted },
            { label: '封面✓', value: data.today_cover_ok },
            { label: '封面✗', value: data.today_cover_fail },
            { label: '待评分', value: data.pending_score, highlight: true },
            { label: '待趋势', value: data.pending_trend, highlight: true },
            { label: '待写作', value: data.pending_write, highlight: true },
          ]" :key="item.label" class="rounded border px-3 py-2 text-center" :class="item.highlight ? 'border-orange-200 bg-orange-50' : 'border-gray-100 bg-gray-50'">
            <div class="text-lg font-bold" :class="item.highlight ? 'text-orange-600' : 'text-editorial-text-main'">{{ item.value }}</div>
            <div class="text-[11px] text-editorial-text-muted">{{ item.label }}</div>
          </div>
        </div>

        <!-- 最近运行 -->
        <div v-if="data.last_run" class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2">
          <div class="mb-1 flex items-center gap-2 text-xs">
            <span class="text-editorial-text-muted">最近运行 #{{ data.last_run.id }}</span>
            <a-tag :color="statusColorMap[data.last_run.status] ?? 'default'" class="!m-0 !text-[11px] !py-0">{{ data.last_run.status }}</a-tag>
            <span class="text-editorial-text-muted">{{ data.last_run.started_at }}</span>
            <span class="ml-auto text-editorial-text-muted">{{ runDuration(data.last_run.started_at, data.last_run.finished_at) }}</span>
          </div>
          <div v-if="data.last_run.error" class="text-xs text-red-500">{{ data.last_run.error }}</div>
          <div v-if="parseStepsSummary(data.last_run.steps_summary)" class="mt-1 text-[11px] text-editorial-text-muted">
            <details>
              <summary class="cursor-pointer">步骤摘要</summary>
              <pre class="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[11px]">{{ JSON.stringify(parseStepsSummary(data.last_run.steps_summary), null, 2) }}</pre>
            </details>
          </div>
        </div>
        <div v-else class="text-xs text-editorial-text-muted">暂无运行记录</div>
      </template>
    </a-spin>
  </section>
</template>
