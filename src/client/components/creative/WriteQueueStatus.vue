<!--
  WriteQueueStatus.vue — 全局写作队列状态浮标
  折叠态：仅显示呼吸圆点（蓝色=有任务，灰色=空闲）
  展开态：当前任务 + 排队列表 + 统计，素材 ID 可点击弹出详情
  15 秒自动刷新 + 手动刷新
-->
<script setup lang="ts">
import { Modal as AModal } from "ant-design-vue";
import ArticleDetailDrawer from "./LazyArticleDetailDrawer.vue";
import SourceItemDetailModal from "./LazySourceItemDetailModal.vue";
import { useWriteQueueStatus } from "./useWriteQueueStatus.js";
const {
  cancellingTaskId,
  retainedResultOpen,
  retainedResultText,
  cancelTask,
  viewRetainedResult,
  data,
  statusReceivedAt,
  loading,
  expanded,
  elapsedNow,
  formatElapsed,
  modalVisible,
  modalSourceItemId,
  hasActiveWork,
  refresh,
  toggleExpand,
  openSourceItem,
  articleDetailOpen,
  articleDetail,
  articleDetailLoading,
  openArticleDetail,
  closeArticleDetail,
  historyGroups,
  formatHistoryDate,
  statusLabel,
  describeLunaStatus,
  describeQueuedTask,
  describeCurrentTask,
} = useWriteQueueStatus();

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
          <button type="button" class="write-queue-close" aria-label="收起文章队列" @click="toggleExpand">✕</button>
        </div>

        <!-- 当前任务 -->
        <div v-if="data.current" class="write-queue-current">
          <div class="flex flex-wrap items-center gap-x-1 gap-y-0">
            <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500 shrink-0" />
            <button v-if="data.current.source_item_id" type="button" class="write-queue-link write-queue-id" @click.stop="openSourceItem(data.current.source_item_id)">素材 #{{ data.current.source_item_id }}</button>
            <span class="text-[11px] text-blue-800 break-all">{{ data.current.source_item_title || data.current.label }}</span>
          </div>
          <div v-if="data.current.source_item_source_name" class="mt-0.5 text-[10px] text-blue-400 truncate">{{ data.current.source_item_source_name }}</div>
          <div class="mt-1 text-[11px] font-medium text-blue-700" data-testid="queue-current-state">
            {{ describeCurrentTask(data.current, data.luna, elapsedNow, statusReceivedAt) }}
          </div>
          <div v-if="data.current.phase_name && data.current.phase_name !== '等待 Luna'" class="mt-1 text-[11px] font-medium text-blue-700">
            当前阶段：{{ data.current.phase_name }}
            <template v-if="data.current.image_total"> · 图片 {{ data.current.image_index || 0 }}/{{ data.current.image_total }}</template>
            <template v-if="data.current.retry_count"> · 重试 {{ data.current.retry_count }}/1</template>
          </div>
          <div v-if="data.current.started_at" class="mt-0.5 text-[10px] font-medium tabular-nums text-blue-500">
            任务已耗时 {{ formatElapsed(data.current.started_at) }}（含等待）<template v-if="data.run_started_at"> · 队列 {{ formatElapsed(data.run_started_at) }}</template>
          </div>
          <button type="button" class="write-queue-link write-queue-cancel-current" :disabled="Boolean(cancellingTaskId) || data.current.cancel_requested" @click.stop="cancelTask(data.current)">
            {{ data.current.cancel_requested ? '等待安全取消' : '取消任务' }}
          </button>
        </div>

        <div v-if="data.status_delayed" class="write-queue-delay">
          {{ data.status_message || "写作队列状态延迟" }}
        </div>

        <!-- 排队列表 -->
        <div v-if="data.queue.length > 0" class="write-queue-list">
          <div v-for="task in data.queue" :key="task.task_id">
          <div class="write-queue-task">
            <button v-if="task.source_item_id" type="button" class="write-queue-link write-queue-id" @click.stop="openSourceItem(task.source_item_id)">素材 #{{ task.source_item_id }}</button>
            <span class="flex-1 truncate text-[11px] text-editorial-text-body">{{ task.source_item_title || task.label }}</span>
            <span v-if="task.source_item_source_name" class="shrink-0 text-[10px] text-editorial-text-muted">· {{ task.source_item_source_name }}</span>
            <span class="text-[10px]" :class="task.priority === 'high' ? 'text-yellow-600' : 'text-gray-400'">{{ task.priority === 'high' ? '人工' : '自动' }}</span>
            <span class="text-[10px] text-gray-400">提交后 {{ formatElapsed(task.submitted_at) }}</span>
            <button class="write-queue-link" :disabled="Boolean(cancellingTaskId)" @click.stop="cancelTask(task)">取消</button>
          </div>
          <div class="pb-1 text-[10px] text-editorial-text-muted" data-testid="queue-wait-reason">
            {{ describeQueuedTask(task, data.luna, elapsedNow) }}
          </div>
          </div>
        </div>

        <!-- 空闲 -->
        <div
          v-if="!data.status_unavailable && !data.current && data.queue.length === 0"
          class="write-queue-idle"
        >队列空闲</div>

        <div v-if="data.luna && !(data.current && (data.luna.paused || data.luna.available === false))" class="mt-2 rounded bg-gray-50 px-2 py-1 text-[10px] text-editorial-text-muted" data-testid="queue-luna-state">
          Luna：{{ describeLunaStatus(data.luna, elapsedNow, statusReceivedAt) }}
        </div>

        <!-- 持久化终态历史：按北京时间 00:00–23:59 分组，服务重启后仍可查看。 -->
        <div v-if="historyGroups.length" class="write-queue-history mt-2 border-t border-gray-100 pt-1" data-testid="write-queue-history">
          <div class="mb-1 flex items-center justify-between text-[10px] font-medium text-editorial-text-muted">
            <span>写作记录（最近结果）</span>
            <span>北京时间 00:00–23:59</span>
          </div>
          <section v-for="group in historyGroups" :key="group.date" class="write-queue-day-group">
            <h4 class="write-queue-day-label">{{ formatHistoryDate(group.date, group.items) }}</h4>
            <div v-for="task in group.items" :key="`${task.task_id}-${task.finished_at}`" class="write-queue-history-item">
              <div class="flex items-center gap-1">
                <span :class="task.status === 'done' ? 'text-green-600' : task.status === 'stopped' ? 'text-amber-600' : 'text-red-600'">
                  {{ statusLabel(task.status) }}
                </span>
                <button v-if="task.source_item_id" class="write-queue-link" @click.stop="openSourceItem(task.source_item_id)">素材 #{{ task.source_item_id }}</button>
                <button v-if="task.finished_article_id" class="write-queue-link" :disabled="articleDetailLoading" @click.stop="openArticleDetail(task.finished_article_id)">成品 #{{ task.finished_article_id }}</button>
                <span class="min-w-0 flex-1 truncate">{{ task.source_item_title || task.label }}</span>
                <button v-if="task.result_retained" class="write-queue-link" @click.stop="viewRetainedResult(task)">查看保留结果</button>
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
          <button type="button" class="write-queue-refresh" aria-label="刷新文章队列" :aria-busy="loading" :disabled="loading" @click.stop="refresh">{{ loading ? "…" : "↻" }}</button>
        </div>
      </template>

      <a-modal v-model:open="retainedResultOpen" title="保留的生成结果（只读，不调用模型）" :footer="null" width="min(900px, 95vw)">
        <pre class="max-h-[70dvh] overflow-auto whitespace-pre-wrap break-words text-xs">{{ retainedResultText }}</pre>
      </a-modal>
      <!-- 素材详情弹窗 -->
      <SourceItemDetailModal v-model:visible="modalVisible" :source-item-id="modalSourceItemId" />
      <!-- 成品详情抽屉：队列终态中的成品编号必须可直接打开。 -->
      <ArticleDetailDrawer
        :open="articleDetailOpen"
        :loading="articleDetailLoading"
        :article="articleDetail"
        :readonly="true"
        @update:open="(value: boolean) => { if (!value) closeArticleDetail(); }"
        @open-source-item="openSourceItem"
      />
    </div>
  </Teleport>
</template>

<style>
.write-queue-float {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1900;
  min-width: 32px;
  max-width: 320px;
  /* 与屏幕右边缘接合，只保留左侧圆角，展开态也不留边缘空隙。 */
  border-radius: 8px 0 0 8px;
  border: 1px solid #e5e7eb;
  border-right: 0;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.write-queue-dot-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 8px 0 0 8px;
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
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 6px;
  background: none;
  font-size: 18px;
  color: #6b7280;
  cursor: pointer;
  padding: 0;
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
/* 当前任务容器是纵向弹性布局，取消按钮不拉满宽度，文字才能靠左。 */
.write-queue-cancel-current {
  align-self: flex-start;
  text-align: left;
  margin-top: 4px;
  font-size: 11px;
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
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border: 1px solid #e5e7eb;
  background: none;
  border-radius: 6px;
  padding: 0;
  font-size: 22px;
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
