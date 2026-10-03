<script setup lang="ts">

import { useCodexTaskQueue, type CodexTaskQueueEvents } from "./useCodexTaskQueue.js";
const emit = defineEmits<CodexTaskQueueEvents>();
const {
  tasks,
  loading,
  total,
  refresh,
  statusCounts,
  statusConfig,
  formatDuration,
  timeAgo,
} = useCodexTaskQueue();

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

          <!-- 文章 ID（可点击） -->
          <span
            class="shrink-0 cursor-pointer text-[11px] font-semibold text-blue-600 hover:underline"
            @click="emit('openArticle', task.article_id)"
          >#{{ task.article_id }}</span>

          <!-- 文章标题 -->
          <span class="min-w-0 flex-1 truncate text-editorial-text-body" :title="task.article_title ?? ''">
            {{ task.article_title || `文章 #${task.article_id}` }}
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
