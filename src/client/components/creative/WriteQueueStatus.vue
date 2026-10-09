<!--
  WriteQueueStatus.vue — 全局写作队列浮窗；桌面端可嵌入页面右侧
  折叠态：悬浮模式显示状态圆点，嵌入模式显示右侧窄标签
  展开态：当前任务 + 排队列表 + 统计，素材 ID 可点击弹出详情
  15 秒自动刷新 + 手动刷新
-->
<script setup lang="ts">
import { Modal as AModal } from "ant-design-vue";
import ArticleDetailDrawer from "./LazyArticleDetailDrawer.vue";
import SourceItemDetailModal from "./LazySourceItemDetailModal.vue";
import { useWriteQueueStatus } from "./useWriteQueueStatus.js";
import { writeQueueWidths } from "../../../core/auth/userPreferences.js";
const {
  forceRewriteTarget,
  forceRewriting,
  requestForceRewrite,
  confirmForceRewrite,
  cancellingTaskId,
  retainedResultOpen,
  retainedResultText,
  cancelTask,
  viewRetainedResult,
  data,
  statusReceivedAt,
  loading,
  expanded,
  embedded,
  queueWidth,
  preferencesReady,
  elapsedNow,
  formatElapsed,
  modalVisible,
  modalSourceItemId,
  hasActiveWork,
  refresh,
  toggleExpand,
  toggleEmbedded,
  setQueueWidth,
  openSourceItem,
  articleDetailOpen,
  articleDetail,
  articleDetailLoading,
  openArticleDetail,
  closeArticleDetail,
  historyGroups,
  formatHistoryDate,
  shortWriteSchedule,
  shortWriteScheduleDelayed,
  pendingShortWriteCandidates,
  shortWritePeriodGroups,
  visibleCurrentTask,
  visibleQueueTasks,
  formatShortBatchPeriod,
  statusLabel,
  describeLunaStatus,
  describeQueuedTask,
  describeCurrentTask,
} = useWriteQueueStatus();

</script>

<template>
  <Teleport to="body" :disabled="embedded">
    <div
      v-if="data && preferencesReady"
      class="write-queue-float"
      :class="{ 'write-queue-float--embedded': embedded, 'write-queue-float--collapsed': !expanded }"
      :style="embedded ? { '--write-queue-width': `${queueWidth}px` } : undefined"
    >
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
          <div class="write-queue-header-actions">
            <button type="button" class="write-queue-control write-queue-dock-toggle" :aria-label="embedded ? '取消右侧嵌入' : '嵌入到页面右侧'" :title="embedded ? '取消右侧嵌入' : '嵌入到页面右侧'" :aria-pressed="embedded" @click.stop="toggleEmbedded">{{ embedded ? "⇥" : "⇤" }}</button>
            <button type="button" class="write-queue-control write-queue-refresh" aria-label="刷新文章队列" :aria-busy="loading" :disabled="loading" @click.stop="refresh">{{ loading ? "…" : "↻" }}</button>
            <button type="button" class="write-queue-control write-queue-close" aria-label="收起文章队列" @click="toggleExpand">✕</button>
          </div>
        </div>

        <div v-if="embedded" class="write-queue-width-picker" aria-label="文章队列侧栏宽度">
          <span>宽度</span>
          <button
            v-for="width in writeQueueWidths"
            :key="width"
            type="button"
            :data-queue-width="width"
            :aria-pressed="queueWidth === width"
            @click.stop="setQueueWidth(width)"
          >{{ width }}px</button>
        </div>

        <!-- 只滚动任务内容，刷新、收起和统计不随长记录移出可视区。 -->
        <div class="write-queue-body">
        <!-- 当前任务 -->
        <div v-if="visibleCurrentTask" class="write-queue-current">
          <div class="flex flex-wrap items-center gap-x-1 gap-y-0">
            <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500 shrink-0" />
            <button v-if="visibleCurrentTask.source_item_id" type="button" class="write-queue-link write-queue-id" @click.stop="openSourceItem(visibleCurrentTask.source_item_id)">素材 #{{ visibleCurrentTask.source_item_id }}</button>
            <span class="text-[11px] text-blue-800 break-all">{{ visibleCurrentTask.source_item_title || visibleCurrentTask.label }}</span>
          </div>
          <div v-if="visibleCurrentTask.source_item_source_name" class="mt-0.5 text-[10px] text-blue-400 truncate">{{ visibleCurrentTask.source_item_source_name }}</div>
          <div class="mt-1 text-[11px] font-medium text-blue-700" data-testid="queue-current-state">
            {{ describeCurrentTask(visibleCurrentTask, data.luna, elapsedNow, statusReceivedAt) }}
          </div>
          <div v-if="visibleCurrentTask.phase_name && visibleCurrentTask.phase_name !== '等待 Luna'" class="mt-1 text-[11px] font-medium text-blue-700">
            当前阶段：{{ visibleCurrentTask.phase_name }}
            <template v-if="visibleCurrentTask.image_total"> · 图片 {{ visibleCurrentTask.image_index || 0 }}/{{ visibleCurrentTask.image_total }}</template>
            <template v-if="visibleCurrentTask.retry_count"> · 重试 {{ visibleCurrentTask.retry_count }}/1</template>
          </div>
          <div v-if="visibleCurrentTask.started_at" class="mt-0.5 text-[10px] font-medium tabular-nums text-blue-500">
            任务已耗时 {{ formatElapsed(visibleCurrentTask.started_at) }}（含等待）<template v-if="data.run_started_at"> · 队列 {{ formatElapsed(data.run_started_at) }}</template>
          </div>
          <button type="button" class="write-queue-link write-queue-cancel-current" :disabled="Boolean(cancellingTaskId) || visibleCurrentTask.cancel_requested" @click.stop="cancelTask(visibleCurrentTask)">
            {{ visibleCurrentTask.cancel_requested ? '等待安全取消' : '取消任务' }}
          </button>
        </div>

        <div v-if="data.status_delayed" class="write-queue-delay">
          {{ data.status_message || "写作队列状态延迟" }}
        </div>

        <!-- 排队列表 -->
        <div v-if="visibleQueueTasks.length > 0" class="write-queue-list">
          <div v-for="task in visibleQueueTasks" :key="task.task_id">
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

        <!-- 自动短写按 Hermes 采集周期分组；人工和其他实际队列任务仍留在上方。 -->
        <div v-if="shortWriteSchedule || shortWriteScheduleDelayed" class="write-queue-candidates" data-testid="queue-short-write-candidates">
          <div v-if="shortWriteScheduleDelayed" class="write-queue-candidate-delay">
            {{ shortWriteSchedule ? "排期状态延迟，保留上次候选快照" : "自动候选状态暂不可用" }}
          </div>
          <template v-if="shortWriteSchedule">
            <section v-for="group in shortWritePeriodGroups" :key="group.batchStartedAt" class="write-queue-period-group" data-testid="queue-short-write-period">
              <div class="write-queue-candidate-heading">
                <span>{{ group.isCurrent ? "当前自动短写周期" : "自动短写周期" }}</span>
                <span>{{ formatShortBatchPeriod(group.batchStartedAt, group.collectionIntervalMinutes, group.periodEndsAt) }}</span>
              </div>
              <div v-if="group.isCurrent && shortWriteSchedule.cycle_write_limit != null" class="write-queue-period-count">
                本周期已受理 {{ shortWriteSchedule.cycle_submitted_count ?? 0 }}/{{ shortWriteSchedule.cycle_write_limit }} 篇
                <template v-if="shortWriteSchedule.cycle_remaining_slots === 0 && group.candidates.length">· 已达上限，剩余候选按下批次替换规则处理</template>
              </div>
              <div v-for="entry in group.tasks" :key="entry.task.task_id" class="write-queue-candidate">
                <div class="write-queue-candidate-row">
                  <button v-if="entry.task.source_item_id" type="button" class="write-queue-link write-queue-id" @click.stop="openSourceItem(entry.task.source_item_id)">素材 #{{ entry.task.source_item_id }}</button>
                  <span class="write-queue-candidate-title">{{ entry.task.source_item_title || entry.task.label }}</span>
                  <span class="write-queue-candidate-position">
                    {{ entry.task.status === "writing" ? "正在写作" : entry.queuePosition ? `实际队列第 ${entry.queuePosition} 位` : "实际队列中 · 待写作" }}
                  </span>
                  <button class="write-queue-link" :disabled="Boolean(cancellingTaskId)" @click.stop="cancelTask(entry.task)">取消</button>
                </div>
                <div v-if="entry.task.source_item_source_name" class="write-queue-candidate-source">{{ entry.task.source_item_source_name }}</div>
                <div class="write-queue-candidate-source">{{ entry.task.status === "writing" ? describeCurrentTask(entry.task, data?.luna, elapsedNow, statusReceivedAt) : describeQueuedTask(entry.task, data?.luna, elapsedNow) }}</div>
              </div>
              <div v-for="candidate in group.candidates" :key="candidate.source_external_id || candidate.item_id" class="write-queue-candidate">
                <div class="write-queue-candidate-row">
                  <button v-if="candidate.hotnow_source_item_id" type="button" class="write-queue-link write-queue-id" @click.stop="openSourceItem(candidate.hotnow_source_item_id)">素材 #{{ candidate.hotnow_source_item_id }}</button>
                  <span class="write-queue-candidate-title">{{ candidate.source_item_title || "素材标题暂不可用" }}</span>
                  <span class="write-queue-candidate-position">
                    {{ (candidate.source_external_id && candidate.source_external_id === shortWriteSchedule.pending_source_external_id)
                      || (shortWriteSchedule.pending_item_id != null && candidate.item_id === shortWriteSchedule.pending_item_id)
                      ? `投递确认中 · 候选第 ${candidate.position} 位`
                      : `自动候选 · 第 ${candidate.position} 位` }}
                  </span>
                </div>
                <div v-if="candidate.source_item_source_name" class="write-queue-candidate-source">{{ candidate.source_item_source_name }}</div>
                <div v-else-if="!candidate.hotnow_source_item_id && candidate.source_external_id" class="write-queue-candidate-source">素材关联暂不可用 · {{ candidate.source_external_id }}</div>
              </div>
              <div v-if="group.tasks.length === 0 && group.candidates.length === 0" class="write-queue-candidate-empty">
                <template v-if="group.isCurrent && !shortWriteSchedule.prepared">当前批次候选仍在整理中</template>
                <template v-else-if="group.isCurrent && shortWriteSchedule.candidates.length > 0">本批次候选已进入上方实际队列</template>
                <template v-else-if="group.isCurrent">当前周期暂无待写或正在写作的自动短写任务</template>
              </div>
            </section>
            <div v-if="shortWritePeriodGroups.length === 0" class="write-queue-candidate-empty">当前没有待写作或正在写作的自动短内容</div>
          </template>
          <div v-else class="write-queue-candidate-empty">尚未读取到自动候选</div>
        </div>

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
                <button v-if="task.can_force_rewrite" class="write-queue-link" @click.stop="requestForceRewrite(task)">强制重写</button>
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

        </div>

        <!-- 固定统计栏 -->
        <div class="write-queue-footer">
          <span class="text-[10px] text-editorial-text-muted">完成 {{ data.stats.total_completed }} · 失败 {{ data.stats.total_failed }}</span>
        </div>
      </template>

      <a-modal :open="Boolean(forceRewriteTarget)" title="确认强制重写" ok-text="确认风险并重写" :confirm-loading="forceRewriting" :z-index="2000" @ok="confirmForceRewrite" @cancel="forceRewriteTarget = null">
        <p>原阻断：{{ forceRewriteTarget?.reason_text || forceRewriteTarget?.error }}</p>
        <p>事实核验和质检仍执行；未通过也会生成新稿并保留“人工强制重写 · 待人工审核”标记。技术错误仍停止，原任务和已有成品不覆盖。</p>
        <p>不会自动推送；推送到公众号草稿箱前需在现有浮窗确认风险。</p>
      </a-modal>
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
  bottom: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  max-height: 100vh;
  max-height: 100dvh;
  overflow: hidden;
  z-index: 1900;
  min-width: 32px;
  max-width: min(320px, 100vw);
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
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 4px;
  border-bottom: 1px solid #f0f0f0;
}
.write-queue-header-actions {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
}
.write-queue-width-picker {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid #f0f0f0;
  padding: 4px 8px;
  color: #6b7280;
  font-size: 10px;
}
.write-queue-width-picker button {
  flex: 1 1 0;
  min-width: 0;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #fff;
  padding: 3px 1px;
  color: #6b7280;
  font-size: 10px;
  cursor: pointer;
}
.write-queue-width-picker button[aria-pressed="true"] {
  border-color: #1677ff;
  background: #eff6ff;
  color: #1677ff;
}
.write-queue-width-picker button:hover { background: #f3f4f6; }
/* 两个头部操作共用尺寸、边框和交互样式，只保留不同图标与行为。 */
.write-queue-control {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: none;
  font-size: 18px;
  color: #6b7280;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.write-queue-control:hover:not(:disabled) { background: #f3f4f6; color: #374151; }
.write-queue-control:disabled { opacity: 0.5; cursor: not-allowed; }
/* 必须允许中间弹性项缩小到内容高度以下，否则长记录仍会撑破整个浮窗。 */
.write-queue-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
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
.write-queue-candidates {
  max-height: 220px;
  overflow-y: auto;
  border-top: 1px solid #f3f4f6;
  padding: 5px 8px 2px;
}
.write-queue-period-group + .write-queue-period-group {
  margin-top: 6px;
  border-top: 1px solid #e5e7eb;
  padding-top: 5px;
}
.write-queue-candidate-heading {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 3px;
  color: #6b7280;
  font-size: 10px;
  font-weight: 600;
}
.write-queue-period-count {
  margin-bottom: 4px;
  color: #6b7280;
  font-size: 9px;
  overflow-wrap: anywhere;
}
.write-queue-candidate {
  margin-bottom: 4px;
  border-radius: 4px;
  background: #f9fafb;
  padding: 4px 5px;
}
.write-queue-candidate-row {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 3px 5px;
  font-size: 10px;
}
.write-queue-candidate-title {
  min-width: 0;
  flex: 1 1 100%;
  color: #374151;
  overflow-wrap: anywhere;
  white-space: normal;
}
.write-queue-candidate-position,
.write-queue-candidate-source,
.write-queue-candidate-empty,
.write-queue-candidate-delay {
  color: #6b7280;
  font-size: 9px;
  overflow-wrap: anywhere;
}
.write-queue-candidate-delay {
  margin-bottom: 4px;
  color: #b45309;
}
.write-queue-candidate-empty {
  padding: 4px 0;
  text-align: center;
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
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 6px;
  border-top: 1px solid #f5f5f5;
}
@media (min-width: 901px) {
  .write-queue-float--embedded {
    position: sticky;
    top: 0;
    right: auto;
    bottom: auto;
    flex: 0 0 var(--write-queue-width);
    width: var(--write-queue-width);
    max-width: none;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 8px 0 0 8px;
  }
  .write-queue-float--embedded.write-queue-float--collapsed {
    position: fixed;
    top: 50%;
    right: 0;
    bottom: auto;
    flex: none;
    width: 32px;
    height: 40px;
    transform: translateY(-50%);
  }
  .write-queue-float--embedded .write-queue-width-picker button { white-space: nowrap; }
}
@media (max-width: 900px) {
  .write-queue-dock-toggle,
  .write-queue-width-picker { display: none; }
}
@media (max-width: 768px) {
  /* 动态视口适应浏览器工具栏伸缩，安全区给刘海和底部手势条留出空间。 */
  .write-queue-float {
    bottom: env(safe-area-inset-bottom, 0px);
    max-height: calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 8px);
    max-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 8px);
  }
  /* 手机只保留中间一个滚动区，避免队列、候选和历史嵌套滚动导致后续内容难以到达。 */
  .write-queue-list,
  .write-queue-candidates,
  .write-queue-history {
    max-height: none;
    overflow-y: visible;
  }
}

/* 浮窗内的 Modal 弹窗 z-index 必须高于浮窗自身(1900) */
.source-item-detail-modal .ant-modal-wrap { z-index: 1950 !important; }
.source-item-detail-modal .ant-modal-mask { z-index: 1950 !important; }
</style>
