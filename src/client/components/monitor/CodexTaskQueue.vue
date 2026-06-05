<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from "vue";
import { fetchCodexTasks, type CodexTask } from "../../services/monitorApi.js";

const tasks = ref<CodexTask[]>([]);
const loading = ref(false);
const total = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const res = await fetchCodexTasks({ limit: 10 });
    tasks.value = res.tasks;
    total.value = res.total;
  } catch { /* 静默 */ }
  finally { loading.value = false; }
}

// 按状态统计
const statusCounts = computed(() => {
  const counts = { queued: 0, running: 0, completed: 0, failed: 0 };
  for (const t of tasks.value) {
    if (t.status in counts) counts[t.status as keyof typeof counts]++;
  }
  return counts;
});

// 状态颜色和标签
const statusConfig: Record<string, { color: string; label: string }> = {
  queued:   { color: "default", label: "排队中" },
  running:  { color: "blue",    label: "执行中" },
  completed:{ color: "green",   label: "已完成" },
  failed:   { color: "red",     label: "失败" },
};

function formatDuration(ms: number | null): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m${sec % 60}s`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  // 只取时分秒
  return iso.replace(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/, "").replace(/Z$/, "").substring(0, 8);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.round(diff / 1000)}秒前`;
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}分钟前`;
  return `${Math.round(diff / 3600_000)}小时前`;
}

onMounted(() => { refresh(); timer = setInterval(refresh, 30_000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<template>
  <section class="rounded-lg border border-editorial-border bg-white p-4">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">Codex 生图任务</h3>
      <div class="flex items-center gap-3">
        <!-- 状态概览 -->
        <div class="flex items-center gap-1.5 text-[10px]">
          <span v-if="statusCounts.running > 0" class="text-blue-500 font-medium">● 执行中 {{ statusCounts.running }}</span>
          <span v-if="statusCounts.queued > 0" class="text-gray-400">● 排队 {{ statusCounts.queued }}</span>
          <span v-if="statusCounts.failed > 0" class="text-red-500">● 失败 {{ statusCounts.failed }}</span>
          <span class="text-editorial-text-muted">共 {{ total }}</span>
        </div>
        <a-button type="link" size="small" class="!p-0 !text-[11px]" :loading="loading" @click="refresh">刷新</a-button>
      </div>
    </div>

    <a-spin :spinning="loading && tasks.length === 0">
      <div v-if="tasks.length === 0" class="text-xs text-editorial-text-muted py-2">暂无任务</div>
      <div v-else class="space-y-1.5">
        <div
          v-for="task in tasks"
          :key="task.task_id"
          class="flex items-center gap-2 rounded border px-3 py-1.5 text-[11px]"
          :class="{
            'border-blue-200 bg-blue-50': task.status === 'running',
            'border-gray-100 bg-gray-50': task.status === 'queued',
            'border-green-100 bg-green-50/50': task.status === 'completed',
            'border-red-100 bg-red-50/50': task.status === 'failed',
          }"
        >
          <!-- 状态指示 -->
          <span
            class="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            :class="{
              'animate-pulse bg-blue-500': task.status === 'running',
              'bg-gray-300': task.status === 'queued',
              'bg-green-500': task.status === 'completed',
              'bg-red-500': task.status === 'failed',
            }"
          />

          <!-- 任务类型标签 -->
          <span class="shrink-0 rounded px-1 text-[9px] font-medium" :class="task.image_type === 'cover' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'">
            {{ task.image_type === 'cover' ? '封面' : `配图${task.image_index}` }}
          </span>

          <!-- 文章标题 -->
          <span class="min-w-0 flex-1 truncate text-editorial-text-body" :title="task.article_title ?? ''">
            {{ task.article_title || `#${task.article_id}` }}
          </span>

          <!-- 排队位置 -->
          <span v-if="task.queue_position != null" class="shrink-0 text-[10px] text-gray-400">
            #{{ task.queue_position }}
          </span>

          <!-- 状态标签 -->
          <a-tag :color="statusConfig[task.status]?.color ?? 'default'" class="!m-0 !text-[10px] !py-0 !px-1">
            {{ statusConfig[task.status]?.label ?? task.status }}
          </a-tag>

          <!-- 耗时 -->
          <span v-if="task.duration_ms != null" class="shrink-0 text-[10px] text-editorial-text-muted">
            {{ formatDuration(task.duration_ms) }}
          </span>

          <!-- 时间 -->
          <span class="shrink-0 text-[10px] text-editorial-text-muted" :title="task.created_at">
            {{ timeAgo(task.created_at) }}
          </span>
        </div>
      </div>
    </a-spin>
  </section>
</template>
