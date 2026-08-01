<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import MonitorStatsCards from "../../components/monitor/MonitorStatsCards.vue";
import MonitorRunsTable from "../../components/monitor/MonitorRunsTable.vue";
import MonitorItemsTable from "../../components/monitor/MonitorItemsTable.vue";
import MonitorSwitches from "../../components/monitor/MonitorSwitches.vue";
import CodexTaskQueue from "../../components/monitor/CodexTaskQueue.vue";
import CodexConsumption from "../../components/monitor/CodexConsumption.vue";
import SourceItemDetailModal from "../../components/creative/SourceItemDetailModal.vue";
import ArticleDetailDrawer from "../../components/creative/ArticleDetailDrawer.vue";
import {
  fetchCreativeAutomationStatus,
  fetchWriteQueueStatus,
  readCreativeFinishedArticle,
  updateCreativeAutomationEnabled,
  type CreativeAutomationStatus,
  type WriteQueueStatus,
  type CreativeFinishedArticle,
} from "../../services/creativeApi.js";

// ─── 写作队列状态 ───
const queueData = ref<WriteQueueStatus | null>(null);
let queueTimer: ReturnType<typeof setInterval> | null = null;
let queueRefreshRequest: Promise<void> | null = null;
const automationData = ref<CreativeAutomationStatus | null>(null);
let automationUpdating = false;

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

/** 合并重叠的队列刷新；请求失败时保留最后一次可用状态。 */
/** 本地队列与 Hermes 队列分别读取，避免将外部内存状态误当作恢复依据。 */
async function refreshAutomation(): Promise<void> {
  try {
    automationData.value = await fetchCreativeAutomationStatus();
  } catch {
    // Hermes 监控短暂不可用时，本地自动化状态仍可独立失败，不清空上次结果。
  }
}

async function setAutomationEnabled(kind: "evaluate" | "write", enabled: boolean): Promise<void> {
  if (automationUpdating) return;
  automationUpdating = true;
  try {
    automationData.value = await updateCreativeAutomationEnabled(kind, enabled);
  } finally {
    automationUpdating = false;
  }
}

function refreshQueue(): Promise<void> {
  if (queueRefreshRequest) return queueRefreshRequest;
  queueRefreshRequest = fetchWriteQueueStatus()
    .then((status) => {
      queueData.value = status;
    })
    .catch(() => {
      // 服务端无法提供降级状态时保留当前显示，避免监控页误报空闲。
    })
    .finally(() => {
      queueRefreshRequest = null;
    });
  return queueRefreshRequest;
}

/** 页面隐藏时停止队列轮询，避免后台请求占用同源连接。 */
function refreshQueueWhenVisible(): void {
  if (!document.hidden) {
    void refreshQueue();
    void refreshAutomation();
  }
}

/** 用户回到监控页时立即刷新队列状态。 */
function handleQueueVisibilityChange(): void {
  if (!document.hidden) {
    void refreshQueue();
    void refreshAutomation();
  }
}

// 素材详情弹窗
const sourceModalVisible = ref(false);
const sourceModalId = ref<number | null>(null);

function openSourceModal(id: number): void {
  sourceModalId.value = id;
  sourceModalVisible.value = true;
}

// ─── 成品文章详情弹窗 ───
const articleDetailOpen = ref(false);
const articleDetailData = ref<CreativeFinishedArticle | null>(null);
const articleDetailLoading = ref(false);

async function openArticleDetail(articleId: number): Promise<void> {
  articleDetailLoading.value = true;
  try {
    // 先拿到数据再开弹窗，确保 ArticleDetailDrawer 的 watch(open) 触发时 article 已就绪
    articleDetailData.value = await readCreativeFinishedArticle(articleId);
    articleDetailOpen.value = true;
  } catch {
    articleDetailData.value = null;
  } finally {
    articleDetailLoading.value = false;
  }
}

function closeArticleDetail(): void {
  articleDetailOpen.value = false;
  articleDetailData.value = null;
}

onMounted(() => {
  void refreshQueue();
  void refreshAutomation();
  queueTimer = setInterval(refreshQueueWhenVisible, 15_000);
  document.addEventListener("visibilitychange", handleQueueVisibilityChange);
  elapsedTimer = setInterval(() => { elapsedNow.value = Date.now(); }, 1000);
});
onBeforeUnmount(() => {
  if (queueTimer) clearInterval(queueTimer);
  if (elapsedTimer) clearInterval(elapsedTimer);
  document.removeEventListener("visibilitychange", handleQueueVisibilityChange);
});
</script>

<template>
  <div class="flex flex-col gap-6" data-page="monitor">
    <!-- 顶部两栏：左侧统计 + 右侧开关 -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <MonitorStatsCards />
      <MonitorSwitches />
    </div>

    <!-- HotNow 本地准入队列：任务重试、过期和日配额均以 SQLite 为准。 -->
    <section v-if="automationData" class="rounded-lg border border-editorial-border bg-white p-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">账号适配自动化</h3>
        <div class="flex items-center gap-2 text-xs">
          <a-switch :checked="automationData.autoEvaluateEnabled" :loading="automationUpdating" checked-children="自动评估" un-checked-children="评估暂停" @change="setAutomationEnabled('evaluate', $event)" />
          <a-switch :checked="automationData.autoWriteEnabled" :loading="automationUpdating" checked-children="自动写作" un-checked-children="写作暂停" @change="setAutomationEnabled('write', $event)" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div class="rounded border border-gray-100 bg-gray-50 px-3 py-2 text-center"><div class="text-lg font-bold">{{ automationData.pendingEvaluationCount }}</div><div class="text-[11px] text-editorial-text-muted">待评估</div></div>
        <div class="rounded border border-gray-100 bg-gray-50 px-3 py-2 text-center"><div class="text-lg font-bold">{{ automationData.pendingWriteCount }}</div><div class="text-[11px] text-editorial-text-muted">待写作</div></div>
        <div class="rounded border border-gray-100 bg-gray-50 px-3 py-2 text-center"><div class="text-lg font-bold">{{ automationData.retryingJobCount }}</div><div class="text-[11px] text-editorial-text-muted">重试中</div></div>
        <div class="rounded border border-gray-100 bg-gray-50 px-3 py-2 text-center"><div class="text-lg font-bold">{{ automationData.expiredAutomaticWriteCount }}</div><div class="text-[11px] text-editorial-text-muted">自动过期</div></div>
        <div class="rounded border border-gray-100 bg-gray-50 px-3 py-2 text-center"><div class="text-lg font-bold">{{ automationData.automaticWriteDispatchedToday }}/10</div><div class="text-[11px] text-editorial-text-muted">今日自动投递</div></div>
        <div class="rounded border border-gray-100 bg-gray-50 px-3 py-2 text-center"><div class="text-lg font-bold">{{ automationData.latestErrors.length }}</div><div class="text-[11px] text-editorial-text-muted">最近异常</div></div>
      </div>
      <div v-if="automationData.latestErrors.length" class="mt-3 space-y-1 text-xs text-orange-700">
        <div v-for="error in automationData.latestErrors" :key="`${error.jobType}-${error.sourceItemId}-${error.updatedAt}`">{{ error.jobType === 'evaluate' ? '评估' : '写作' }} #{{ error.sourceItemId }}：{{ error.error }}</div>
      </div>
    </section>

    <!-- 写作队列 -->
    <section class="rounded-lg border border-editorial-border bg-white p-4">
      <h3 class="m-0 mb-3 text-sm font-semibold text-editorial-text-muted">写作队列</h3>
      <template v-if="queueData">
        <!-- 当前任务 -->
        <div v-if="queueData.current" class="mb-2 rounded border border-blue-200 bg-blue-50 px-3 py-1.5">
          <div class="flex items-center gap-2">
            <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500 shrink-0" />
            <span v-if="queueData.current.source_item_id" class="shrink-0 text-[11px] font-semibold text-blue-600 cursor-pointer hover:underline" @click="openSourceModal(queueData.current.source_item_id)">#{{ queueData.current.source_item_id }}</span>
            <span class="truncate text-[11px] text-blue-800">{{ queueData.current.source_item_title || queueData.current.label }}</span>
            <span v-if="queueData.current.source_item_source_name" class="shrink-0 text-[10px] text-blue-400">· {{ queueData.current.source_item_source_name }}</span>
          </div>
          <div v-if="queueData.current.started_at" class="mt-0.5 text-[10px] font-medium tabular-nums text-blue-500">
            本文 {{ formatElapsed(queueData.current.started_at) }}<template v-if="queueData.run_started_at"> · 队列 {{ formatElapsed(queueData.run_started_at) }}</template>
          </div>
        </div>
        <!-- 排队列表 -->
        <div v-if="queueData.queue.length > 0" class="mb-2 space-y-1">
          <div v-for="task in queueData.queue" :key="task.task_id" class="flex items-center gap-2 rounded border border-gray-100 bg-gray-50 px-3 py-1">
            <span v-if="task.source_item_id" class="shrink-0 text-[11px] font-semibold text-blue-600 cursor-pointer hover:underline" @click="openSourceModal(task.source_item_id)">#{{ task.source_item_id }}</span>
            <span class="flex-1 truncate text-[11px] text-editorial-text-body">{{ task.source_item_title || task.label }}</span>
            <span v-if="task.source_item_source_name" class="shrink-0 text-[10px] text-editorial-text-muted">· {{ task.source_item_source_name }}</span>
            <span class="shrink-0 text-[10px]" :class="task.priority === 'high' ? 'text-yellow-600' : 'text-gray-400'">{{ task.priority }}</span>
          </div>
        </div>
        <div v-if="queueData.status_delayed" class="mb-2 rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
          {{ queueData.status_message || "写作队列状态延迟" }}
        </div>
        <div v-if="!queueData.status_unavailable && !queueData.current && queueData.queue.length === 0" class="text-xs text-editorial-text-muted">队列空闲</div>
        <div class="mt-2 text-[10px] text-editorial-text-muted">
          完成 {{ queueData.stats.total_completed }} · 失败 {{ queueData.stats.total_failed }} · 总提交 {{ queueData.stats.total_submitted }}
        </div>
      </template>
      <div v-else class="text-xs text-editorial-text-muted">加载中…</div>
    </section>

    <!-- Codex 生图任务 + 结果消费：左右布局 -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <CodexTaskQueue @open-article="openArticleDetail" />
      <CodexConsumption @open-article="openArticleDetail" />
    </div>

    <!-- 流水线运行记录 -->
    <MonitorRunsTable />

    <!-- 素材列表 -->
    <MonitorItemsTable />

    <!-- 素材详情弹窗 -->
    <SourceItemDetailModal v-model:visible="sourceModalVisible" :source-item-id="sourceModalId" />

    <!-- 成品文章详情弹窗（只读，从 Codex 打开） -->
    <ArticleDetailDrawer
      :open="articleDetailOpen"
      :article="articleDetailData"
      :readonly="true"
      @update:open="(val: boolean) => { if (!val) closeArticleDetail(); }"
      @saved="articleDetailData && openArticleDetail(articleDetailData.id)"
      @open-source-item="openSourceModal"
    />
  </div>
</template>
