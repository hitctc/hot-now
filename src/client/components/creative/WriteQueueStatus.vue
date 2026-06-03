<!--
  WriteQueueStatus.vue — 全局写作队列状态浮标
  固定在页面右侧中间位置，显示当前写作任务和排队情况。
  30 秒自动刷新 + 手动刷新按钮。
-->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from "vue";
import {
  fetchWriteQueueStatus,
  type WriteQueueStatus as WriteQueueStatusType,
} from "../../services/creativeApi.js";

const data = ref<WriteQueueStatusType | null>(null);
const loading = ref(false);
const expanded = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const hasActiveWork = computed(() => {
  if (!data.value) return false;
  return data.value.current !== null || data.value.queue_length > 0;
});

// 队列状态摘要文案
const summaryText = computed(() => {
  if (!data.value) return "队列状态未知";
  const d = data.value;
  if (!d.current && d.queue_length === 0) return "写作队列空闲";
  const parts: string[] = [];
  if (d.current) {
    const label = d.current.label || `素材#${d.current.source_item_id}`;
    parts.push(`正在写：${label.length > 20 ? label.slice(0, 20) + "…" : label}`);
  }
  if (d.queue_length > 0) {
    parts.push(`${d.queue_length} 篇排队`);
  }
  return parts.join(" · ");
});

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    data.value = await fetchWriteQueueStatus();
  } catch {
    // 静默失败，保留上次数据
  } finally {
    loading.value = false;
  }
}

function startPoll(): void {
  if (pollTimer) return;
  refresh();
  pollTimer = setInterval(() => refresh(), 30_000);
}

function stopPoll(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function toggleExpand(): void {
  expanded.value = !expanded.value;
}

onMounted(() => startPoll());
onBeforeUnmount(() => stopPoll());
</script>

<template>
  <Teleport to="body">
    <div
      v-if="data"
      class="write-queue-float"
      :class="{ 'write-queue-float--active': hasActiveWork, 'write-queue-float--expanded': expanded }"
    >
      <!-- 折叠态：状态摘要 -->
      <button class="write-queue-header" @click="toggleExpand">
        <span v-if="hasActiveWork" class="write-queue-dot write-queue-dot--active" />
        <span v-else class="write-queue-dot write-queue-dot--idle" />
        <span class="write-queue-summary">{{ summaryText }}</span>
        <span class="write-queue-arrow">{{ expanded ? "▶" : "◀" }}</span>
      </button>

      <!-- 展开态：详细信息 -->
      <div v-if="expanded" class="write-queue-detail">
        <!-- 当前任务 -->
        <div v-if="data.current" class="write-queue-section">
          <div class="write-queue-label">正在写作</div>
          <div class="write-queue-task">
            <span class="write-queue-task-id">{{ data.current.task_id }}</span>
            <span class="write-queue-task-label">{{ data.current.label }}</span>
            <span class="write-queue-task-badge write-queue-task-badge--writing">writing</span>
          </div>
        </div>

        <!-- 排队任务 -->
        <div v-if="data.queue.length > 0" class="write-queue-section">
          <div class="write-queue-label">排队中（{{ data.queue.length }}）</div>
          <div v-for="task in data.queue" :key="task.task_id" class="write-queue-task">
            <span class="write-queue-task-id">{{ task.task_id }}</span>
            <span class="write-queue-task-label">{{ task.label }}</span>
            <span class="write-queue-task-badge" :class="task.priority === 'high' ? 'write-queue-task-badge--high' : 'write-queue-task-badge--normal'">
              {{ task.priority }}
            </span>
          </div>
        </div>

        <!-- 空闲 -->
        <div v-if="!data.current && data.queue.length === 0" class="write-queue-section">
          <div class="write-queue-idle">队列空闲，暂无写作任务</div>
        </div>

        <!-- 统计 + 刷新 -->
        <div class="write-queue-footer">
          <span class="write-queue-stats">
            已完成 {{ data.stats.total_completed }} · 失败 {{ data.stats.total_failed }}
          </span>
          <button class="write-queue-refresh" :disabled="loading" @click.stop="refresh">
            {{ loading ? "…" : "↻" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.write-queue-float {
  position: fixed;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1900;
  min-width: 120px;
  max-width: 320px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  font-size: 12px;
  transition: box-shadow 0.2s;
}
.write-queue-float--active {
  border-color: #91caff;
  box-shadow: 0 2px 12px rgba(24, 144, 255, 0.15);
}
.write-queue-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 10px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font-size: 12px;
  color: #374151;
}
.write-queue-header:hover {
  background: #f9fafb;
  border-radius: 8px;
}
.write-queue-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.write-queue-dot--active {
  background: #1677ff;
  animation: write-queue-pulse 2s infinite;
}
.write-queue-dot--idle {
  background: #d1d5db;
}
@keyframes write-queue-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.write-queue-summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}
.write-queue-arrow {
  flex-shrink: 0;
  font-size: 10px;
  color: #9ca3af;
}
.write-queue-detail {
  border-top: 1px solid #f0f0f0;
  padding: 8px 10px;
}
.write-queue-section {
  margin-bottom: 8px;
}
.write-queue-section:last-of-type {
  margin-bottom: 0;
}
.write-queue-label {
  font-weight: 600;
  font-size: 11px;
  color: #6b7280;
  margin-bottom: 4px;
}
.write-queue-task {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  line-height: 1.4;
}
.write-queue-task-id {
  flex-shrink: 0;
  font-weight: 600;
  color: #9ca3af;
  font-size: 10px;
  min-width: 20px;
}
.write-queue-task-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #374151;
}
.write-queue-task-badge {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 500;
}
.write-queue-task-badge--writing {
  background: #e6f4ff;
  color: #1677ff;
}
.write-queue-task-badge--high {
  background: #fff7e6;
  color: #d48806;
}
.write-queue-task-badge--normal {
  background: #f0f0f0;
  color: #8c8c8c;
}
.write-queue-idle {
  color: #9ca3af;
  padding: 4px 0;
  text-align: center;
}
.write-queue-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid #f5f5f5;
}
.write-queue-stats {
  font-size: 10px;
  color: #9ca3af;
}
.write-queue-refresh {
  background: none;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 12px;
  cursor: pointer;
  color: #6b7280;
  line-height: 1;
}
.write-queue-refresh:hover:not(:disabled) {
  background: #f3f4f6;
}
.write-queue-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
