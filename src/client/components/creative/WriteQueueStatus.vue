<!--
  WriteQueueStatus.vue — 全局写作队列状态浮标
  折叠态：仅显示呼吸圆点（蓝色=有任务，灰色=空闲）
  展开态：当前任务 + 排队列表 + 统计，素材 ID 可点击弹出详情
  15 秒自动刷新 + 手动刷新
-->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from "vue";
import {
  fetchWriteQueueStatus,
  readCreativeFinishedArticle,
  type WriteQueueStatus as WriteQueueStatusType,
  type WriteQueueTask,
  type CreativeFinishedArticle,
} from "../../services/creativeApi.js";
import ArticleDetailDrawer from "./ArticleDetailDrawer.vue";
import SourceItemDetailModal from "./SourceItemDetailModal.vue";

const data = ref<WriteQueueStatusType | null>(null);
const loading = ref(false);
const expanded = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let refreshRequest: Promise<void> | null = null;

// 实时耗时计时驱动（每秒刷新）
const elapsedNow = ref(Date.now());
let elapsedTimer: ReturnType<typeof setInterval> | null = null;

/** 将 ISO 时间戳格式化为已耗时 "X分X秒" */
function formatElapsed(iso: string | null | undefined): string {
  if (!iso) return "-";
  const started = new Date(iso).getTime();
  const diff = elapsedNow.value - started;
  if (diff < 0) return "0秒";
  const totalSec = Math.floor(diff / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min}分${sec}秒`;
  return `${sec}秒`;
}

// 素材详情弹窗
const modalVisible = ref(false);
const modalSourceItemId = ref<number | null>(null);

const hasActiveWork = computed(() => {
  if (!data.value) return false;
  return data.value.current !== null || data.value.queue_length > 0;
});

/** 合并重叠刷新；页面隐藏时由轮询入口直接跳过，不占用后台连接。 */
function refresh(): Promise<void> {
  if (refreshRequest) return refreshRequest;
  loading.value = true;
  refreshRequest = fetchWriteQueueStatus()
    .then((status) => {
      data.value = status;
    })
    .catch(() => {
      // 服务端无法提供降级状态时保留当前显示，避免浮标闪烁。
    })
    .finally(() => {
      loading.value = false;
      refreshRequest = null;
    });
  return refreshRequest;
}

/** 仅在页面可见时执行定时刷新。 */
function refreshWhenVisible(): void {
  if (!document.hidden) void refresh();
}

/** 从后台切回页面时立即刷新一次状态。 */
function handleVisibilityChange(): void {
  if (!document.hidden) void refresh();
}

function toggleExpand(): void {
  expanded.value = !expanded.value;
}

function openSourceItem(id: number): void {
  modalSourceItemId.value = id;
  modalVisible.value = true;
}

// 成品详情抽屉
const articleDetailOpen = ref(false);
const articleDetail = ref<CreativeFinishedArticle | null>(null);
const articleDetailLoading = ref(false);

/** 读取队列终态对应的完整成品，打开只读详情抽屉。 */
async function openArticleDetail(id: number): Promise<void> {
  if (articleDetailLoading.value) return;
  articleDetailLoading.value = true;
  try {
    articleDetail.value = await readCreativeFinishedArticle(id);
    articleDetailOpen.value = true;
  } catch {
    articleDetail.value = null;
  } finally {
    articleDetailLoading.value = false;
  }
}

/** 将 ISO 时间按北京时间切成自然日，避免浏览器本地时区造成跨日错分。 */
function beijingDateKey(value: string | null | undefined): string {
  if (!value) return "unknown";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function historyTime(task: WriteQueueTask): string {
  return task.finished_at || task.started_at || task.submitted_at;
}

const historyGroups = computed(() => {
  const tasks = data.value?.history?.length ? data.value.history : (data.value?.recent ?? []);
  const groups = new Map<string, WriteQueueTask[]>();
  for (const task of tasks) {
    const key = beijingDateKey(historyTime(task));
    const items = groups.get(key) ?? [];
    items.push(task);
    groups.set(key, items);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, items]) => ({ date, items }));
});

function formatHistoryDate(date: string): string {
  if (date === "unknown") return "日期未知";
  const weekday = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short" })
    .format(new Date(`${date}T00:00:00+08:00`));
  return `${date}（${weekday}）`;
}

function statusLabel(status: WriteQueueTask["status"]): string {
  return status === "done" ? "成功" : status === "stopped" ? "已阻断" : "失败";
}

onMounted(() => {
  void refresh();
  pollTimer = setInterval(refreshWhenVisible, 15_000);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  elapsedTimer = setInterval(() => { elapsedNow.value = Date.now(); }, 1000);
});
onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (elapsedTimer) clearInterval(elapsedTimer);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="data" class="write-queue-float">
      <!-- 折叠态：呼吸圆点 -->
      <button
        v-if="!expanded"
        class="write-queue-dot-btn"
        :title="data.status_message"
        @click="toggleExpand"
      >
        <span
          class="write-queue-dot"
          :class="data.status_delayed ? 'write-queue-dot--delayed' : (hasActiveWork ? 'write-queue-dot--active' : 'write-queue-dot--idle')"
        />
      </button>

      <!-- 展开态 -->
      <template v-else>
        <div class="write-queue-header">
          <span class="text-xs font-semibold text-editorial-text-body">Luna 文章队列</span>
          <button class="write-queue-close" @click="toggleExpand">✕</button>
        </div>

        <!-- 当前任务 -->
        <div v-if="data.current" class="write-queue-current">
          <div class="flex flex-wrap items-center gap-x-1 gap-y-0">
            <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500 shrink-0" />
            <span v-if="data.current.source_item_id" class="write-queue-id" @click.stop="openSourceItem(data.current.source_item_id)">#{{ data.current.source_item_id }}</span>
            <span class="text-[11px] text-blue-800 break-all">{{ data.current.source_item_title || data.current.label }}</span>
          </div>
          <div v-if="data.current.source_item_source_name" class="mt-0.5 text-[10px] text-blue-400 truncate">{{ data.current.source_item_source_name }}</div>
          <div v-if="data.current.phase_name" class="mt-1 text-[11px] font-medium text-blue-700">
            当前阶段：{{ data.current.phase_name }}
            <template v-if="data.current.image_total"> · 图片 {{ data.current.image_index || 0 }}/{{ data.current.image_total }}</template>
            <template v-if="data.current.retry_count"> · 重试 {{ data.current.retry_count }}/1</template>
          </div>
          <div v-if="data.current.started_at" class="mt-0.5 text-[10px] font-medium tabular-nums text-blue-500">
            本文 {{ formatElapsed(data.current.started_at) }}<template v-if="data.run_started_at"> · 队列 {{ formatElapsed(data.run_started_at) }}</template>
          </div>
        </div>

        <div v-if="data.status_delayed" class="write-queue-delay">
          {{ data.status_message || "写作队列状态延迟" }}
        </div>

        <!-- 排队列表 -->
        <div v-if="data.queue.length > 0" class="write-queue-list">
          <div v-for="task in data.queue" :key="task.task_id" class="write-queue-task">
            <span v-if="task.source_item_id" class="write-queue-id" @click.stop="openSourceItem(task.source_item_id)">#{{ task.source_item_id }}</span>
            <span class="flex-1 truncate text-[11px] text-editorial-text-body">{{ task.source_item_title || task.label }}</span>
            <span v-if="task.source_item_source_name" class="shrink-0 text-[10px] text-editorial-text-muted">· {{ task.source_item_source_name }}</span>
            <span class="text-[10px]" :class="task.priority === 'high' ? 'text-yellow-600' : 'text-gray-400'">{{ task.priority }}</span>
          </div>
        </div>

        <!-- 空闲 -->
        <div
          v-if="!data.status_unavailable && !data.current && data.queue.length === 0"
          class="write-queue-idle"
        >队列空闲</div>

        <div v-if="data.luna" class="mt-2 rounded bg-gray-50 px-2 py-1 text-[10px] text-editorial-text-muted">
          Luna：{{ data.luna.paused ? `暂停 · ${data.luna.reason || "等待恢复探测"}` : (data.luna.active ? `执行中 · ${data.luna.label || data.luna.kind || "任务"}` : "空闲") }}
        </div>

        <!-- 持久化终态历史：按北京时间 00:00–23:59 分组，服务重启后仍可查看。 -->
        <div v-if="historyGroups.length" class="write-queue-history mt-2 border-t border-gray-100 pt-1" data-testid="write-queue-history">
          <div class="mb-1 flex items-center justify-between text-[10px] font-medium text-editorial-text-muted">
            <span>写作记录（最近结果）</span>
            <span>北京时间 00:00–23:59</span>
          </div>
          <section v-for="group in historyGroups" :key="group.date" class="write-queue-day-group">
            <h4 class="write-queue-day-label">{{ formatHistoryDate(group.date) }}</h4>
            <div v-for="task in group.items" :key="`${task.task_id}-${task.finished_at}`" class="write-queue-history-item">
              <div class="flex items-center gap-1">
                <span :class="task.status === 'done' ? 'text-green-600' : task.status === 'stopped' ? 'text-amber-600' : 'text-red-600'">
                  {{ statusLabel(task.status) }}
                </span>
                <button v-if="task.source_item_id" class="write-queue-link" @click.stop="openSourceItem(task.source_item_id)">素材 #{{ task.source_item_id }}</button>
                <button v-if="task.finished_article_id" class="write-queue-link" :disabled="articleDetailLoading" @click.stop="openArticleDetail(task.finished_article_id)">成品 #{{ task.finished_article_id }}</button>
                <span class="min-w-0 flex-1 truncate">{{ task.source_item_title || task.label }}</span>
              </div>
              <div class="mt-0.5 text-[9px] text-editorial-text-muted">
                {{ task.finished_at ? new Date(task.finished_at).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" }) : "时间未知" }}
              </div>
              <div v-if="task.status !== 'done'" class="mt-0.5 break-words text-red-500">
                {{ task.stop_step_name || task.phase_name || "执行" }}：{{ task.reason_text || task.error || "未提供失败原因" }}
              </div>
            </div>
          </section>
        </div>

        <!-- 统计 + 刷新 -->
        <div class="write-queue-footer">
          <span class="text-[10px] text-editorial-text-muted">完成 {{ data.stats.total_completed }} · 失败 {{ data.stats.total_failed }}</span>
          <button class="write-queue-refresh" :disabled="loading" @click.stop="refresh">{{ loading ? "…" : "↻" }}</button>
        </div>
      </template>

      <!-- 素材详情弹窗 -->
      <SourceItemDetailModal v-model:visible="modalVisible" :source-item-id="modalSourceItemId" />
      <!-- 成品详情抽屉：队列终态中的成品编号必须可直接打开。 -->
      <ArticleDetailDrawer
        :open="articleDetailOpen"
        :article="articleDetail"
        :readonly="true"
        @update:open="(value: boolean) => { articleDetailOpen = value; if (!value) articleDetail = null; }"
        @open-source-item="openSourceItem"
      />
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
  min-width: 32px;
  max-width: 320px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.write-queue-dot-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 8px;
}
.write-queue-dot-btn:hover {
  background: #f3f4f6;
}
.write-queue-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.write-queue-dot--active {
  background: #1677ff;
  animation: wq-pulse 2s infinite;
}
.write-queue-dot--idle {
  background: #d1d5db;
}
.write-queue-dot--delayed {
  background: #f59e0b;
}
@keyframes wq-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.write-queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 4px;
  border-bottom: 1px solid #f0f0f0;
}
.write-queue-close {
  border: none;
  background: none;
  font-size: 11px;
  color: #9ca3af;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}
.write-queue-close:hover { color: #374151; }
.write-queue-current {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 4px 8px;
  padding: 6px 8px;
  border-radius: 4px;
  background: #eff6ff;
}
.write-queue-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 2px 8px;
}
.write-queue-history {
  max-height: 360px;
  overflow-y: auto;
  padding: 2px 8px 0;
}
.write-queue-day-group + .write-queue-day-group {
  margin-top: 8px;
}
.write-queue-day-label {
  margin: 0 -2px 3px;
  border-left: 3px solid #f59e0b;
  background: #fffbeb;
  padding: 3px 5px;
  color: #92400e;
  font-size: 10px;
  font-weight: 600;
}
.write-queue-history-item {
  margin-bottom: 3px;
  border-radius: 4px;
  background: #f9fafb;
  padding: 4px 5px;
  font-size: 10px;
}
.write-queue-link {
  border: 0;
  background: none;
  padding: 0;
  color: #1677ff;
  cursor: pointer;
  font-size: inherit;
}
.write-queue-link:hover { text-decoration: underline; }
.write-queue-link:disabled { cursor: wait; opacity: 0.5; }
.write-queue-task {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 0;
}
.write-queue-id {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  color: #1677ff;
  cursor: pointer;
}
.write-queue-id:hover { text-decoration: underline; }
.write-queue-idle {
  text-align: center;
  font-size: 11px;
  color: #9ca3af;
  padding: 8px 0;
}
.write-queue-delay {
  margin: 5px 8px;
  border-radius: 4px;
  background: #fffbeb;
  padding: 5px 7px;
  color: #b45309;
  font-size: 10px;
}
.write-queue-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 6px;
  border-top: 1px solid #f5f5f5;
}
.write-queue-refresh {
  border: 1px solid #e5e7eb;
  background: none;
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 11px;
  cursor: pointer;
  color: #6b7280;
  line-height: 1;
}
.write-queue-refresh:hover:not(:disabled) { background: #f3f4f6; }
.write-queue-refresh:disabled { opacity: 0.5; cursor: not-allowed; }

/* 浮窗内的 Modal 弹窗 z-index 必须高于浮窗自身(1900) */
.source-item-detail-modal .ant-modal-wrap { z-index: 1950 !important; }
.source-item-detail-modal .ant-modal-mask { z-index: 1950 !important; }
</style>
