<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import MonitorStatsCards from "../../components/monitor/MonitorStatsCards.vue";
import MonitorPlatformStats from "../../components/monitor/MonitorPlatformStats.vue";
import MonitorRunsTable from "../../components/monitor/MonitorRunsTable.vue";
import MonitorItemsTable from "../../components/monitor/MonitorItemsTable.vue";
import MonitorSwitches from "../../components/monitor/MonitorSwitches.vue";
import { fetchWriteQueueStatus, type WriteQueueStatus } from "../../services/creativeApi.js";

// ─── 写作队列状态（3.7，内联展示，比浮标更详细） ───
const queueData = ref<WriteQueueStatus | null>(null);
let queueTimer: ReturnType<typeof setInterval> | null = null;

async function refreshQueue(): Promise<void> {
  try {
    queueData.value = await fetchWriteQueueStatus();
  } catch { /* 静默 */ }
}

onMounted(() => {
  refreshQueue();
  queueTimer = setInterval(refreshQueue, 15_000);
});
onBeforeUnmount(() => {
  if (queueTimer) clearInterval(queueTimer);
});
</script>

<template>
  <div class="flex flex-col gap-6" data-page="monitor">
    <!-- 3.1 + 3.2 统计卡片 -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <MonitorStatsCards />
      <MonitorPlatformStats />
    </div>

    <!-- 3.7 写作队列状态 -->
    <section class="rounded-lg border border-editorial-border bg-white p-4">
      <h3 class="m-0 mb-3 text-sm font-semibold text-editorial-text-muted">写作队列</h3>
      <template v-if="queueData">
        <div v-if="queueData.current" class="mb-3 flex items-center gap-3 rounded border border-blue-200 bg-blue-50 px-3 py-2">
          <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          <span class="text-xs font-medium text-blue-800">
            正在写：{{ queueData.current.label || `素材#${queueData.current.source_item_id}` }}
          </span>
          <span class="ml-auto text-[11px] text-blue-600">{{ queueData.current.started_at ?? '' }}</span>
        </div>
        <div v-if="queueData.queue.length > 0" class="mb-3 space-y-1">
          <div v-for="task in queueData.queue" :key="task.task_id" class="flex items-center gap-3 rounded border border-gray-100 bg-gray-50 px-3 py-1.5">
            <span class="text-xs text-editorial-text-muted">{{ task.task_id }}</span>
            <span class="flex-1 text-xs text-editorial-text-body">{{ task.label }}</span>
            <span class="text-[11px]" :class="task.priority === 'high' ? 'text-yellow-600' : 'text-gray-400'">{{ task.priority }}</span>
          </div>
        </div>
        <div v-if="!queueData.current && queueData.queue.length === 0" class="text-xs text-editorial-text-muted">队列空闲</div>
        <div class="mt-2 text-[11px] text-editorial-text-muted">
          已完成 {{ queueData.stats.total_completed }} · 失败 {{ queueData.stats.total_failed }} · 总提交 {{ queueData.stats.total_submitted }}
        </div>
      </template>
      <div v-else class="text-xs text-editorial-text-muted">加载中…</div>
    </section>

    <!-- 3.3 + 3.4 流水线运行记录 -->
    <MonitorRunsTable />

    <!-- 3.5 素材列表 -->
    <MonitorItemsTable />

    <!-- 3.6 开关配置 -->
    <MonitorSwitches />
  </div>
</template>
