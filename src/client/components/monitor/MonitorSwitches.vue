<script setup lang="ts">

import { useMonitorSwitches, type MonitorSwitchesEvents } from "./useMonitorSwitches.js";
const emit = defineEmits<MonitorSwitchesEvents>();
const {
  automation,
  loading,
  saving,
  modeOptions,
  stageDefinitions,
  longConfigDefinitions,
  shortConfigDefinitions,
  configDraft,
  imageMode,
  imageProvider,
  imageModeOptions,
  imageProviderOptions,
  isProviderAuto,
  statusSummary,
  stageState,
  draftValue,
  dailyPlan,
  slotSummary,
  currentPlanItems,
  lastRunItems,
  planStatusLabels,
  itemStatusLabel,
  triggerKindLabel,
  formatDateTime,
  refresh,
  changeMode,
  changeStage,
  saveConfig,
  runDailyPlanNow,
  changeImageMode,
  changeImageProvider,
} = useMonitorSwitches();

</script>

<template>
  <section class="rounded-lg border border-editorial-border bg-white p-4">
    <div class="mb-3 flex items-center justify-between">
      <div>
        <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">统一自动化控制</h3>
        <p class="m-0 mt-1 text-[10px] text-editorial-text-muted/70">Hermes 是状态、队列、调度和重试的唯一真源；HotNow 只展示并发送控制意图。</p>
      </div>
      <a-button type="link" size="small" class="!p-0 !text-[11px]" :loading="loading" @click="refresh">刷新</a-button>
    </div>

    <a-spin :spinning="loading && !automation">
      <a-alert :type="statusSummary.type" :message="statusSummary.text" show-icon class="!mb-3 !py-1.5 !text-xs" />
      <div class="mb-3 rounded border border-editorial-border bg-editorial-bg-page px-2.5 py-1.5 text-[10px] leading-4 text-editorial-text-muted" data-testid="model-resource-status">
        <div v-if="automation?.queue?.luna?.active">模型资源占用：{{ automation.queue.luna.label || automation.queue.luna.kind || "模型任务" }}<span v-if="automation.queue.luna.task_type"> · {{ automation.queue.luna.task_type }}</span></div>
        <div v-else>模型资源当前空闲</div>
        <div v-if="(automation?.queue?.luna?.waiting_count ?? 0) > 0">等待模型资源 {{ automation?.queue?.luna?.waiting_count }} 项</div>
        <div v-for="waiter in automation?.queue?.luna?.waiters ?? []" :key="waiter.request_id">{{ waiter.label || waiter.kind || waiter.task_type || "模型任务" }} · {{ waiter.priority === "manual" ? "手动优先" : waiter.priority === "model_operation" ? "评分/模型操作优先于自动写作" : "自动短写等待" }}</div>
      </div>

      <div class="mb-2 text-[10px] font-medium uppercase tracking-wider text-editorial-text-muted">总模式</div>
      <div class="mb-4 flex items-center gap-2 rounded border border-editorial-border px-2.5 py-2">
        <div class="min-w-0 flex-1">
          <span class="text-xs font-medium text-editorial-text-body">自动化总模式</span>
          <span class="ml-1 text-[10px] text-editorial-text-muted/70">普通暂停允许人工写作；紧急停止取消未开始的自动任务</span>
        </div>
        <a-select :value="automation?.mode" :options="modeOptions" class="!w-28" size="small" :loading="saving === 'mode'" @change="changeMode" />
      </div>

      <div class="mb-2 text-[10px] font-medium uppercase tracking-wider text-editorial-text-muted">独立自动阶段</div>
      <div class="mb-4 space-y-1.5">
        <div v-for="definition in stageDefinitions" :key="definition.key" class="flex items-center gap-2 rounded border border-editorial-border px-2.5 py-1.5">
          <div class="min-w-0 flex-1">
            <span class="text-xs font-medium text-editorial-text-body">{{ automation?.stages[definition.key]?.label ?? definition.key }}</span>
            <span class="ml-1 text-[10px] text-editorial-text-muted/70">{{ definition.description }}</span>
          </div>
          <span class="shrink-0 text-[10px] text-editorial-text-muted/70">{{ stageState(definition.key).effective ? '当前生效' : stageState(definition.key).enabled ? '已配置，暂不生效' : '关闭' }}</span>
          <a-switch :checked="stageState(definition.key).enabled" :loading="saving === definition.key" size="small" @change="(checked: boolean) => changeStage(definition.key, checked)" />
        </div>
      </div>

      <div class="mb-2 text-[10px] font-medium uppercase tracking-wider text-editorial-text-muted">长内容计划</div>
      <div class="mb-4 space-y-1.5 rounded border border-editorial-border p-2" data-testid="long-write-config">
        <div v-for="definition in longConfigDefinitions" :key="definition.key" class="flex items-center gap-2 rounded border border-editorial-border px-2.5 py-1.5">
          <div class="min-w-0 flex-1">
            <div class="text-xs font-medium text-editorial-text-body">{{ definition.label }}</div>
            <div class="text-[10px] text-editorial-text-muted/70">{{ definition.description }}</div>
          </div>
          <a-input v-if="definition.type === 'time'" :value="draftValue(definition.key)" type="time" size="small" class="!w-24" :disabled="saving === definition.key" @input="(event: Event) => { configDraft[definition.key] = (event.target as HTMLInputElement).value; }" />
          <a-input-number v-else :value="draftValue(definition.key)" :min="definition.min" :max="definition.max" size="small" class="!w-20" :disabled="saving === definition.key" @change="(value: number | null) => { if (value !== null) configDraft[definition.key] = value; }" />
          <a-button size="small" :loading="saving === definition.key" @click="saveConfig(definition)">保存</a-button>
        </div>
        <div class="rounded border border-editorial-border bg-editorial-bg-page px-2.5 py-1.5 text-[10px] text-editorial-text-muted" data-testid="daily-plan-summary">
          <div class="flex items-center gap-2">
            <span class="min-w-0 flex-1">
              当前周期 {{ dailyPlan?.cycle.planDate ?? "-" }} · 执行边界 {{ formatDateTime(dailyPlan?.cycle.scheduledAt) }}
            </span>
            <a-button size="small" :loading="saving === 'daily-plan'" @click="runDailyPlanNow">立即执行本轮计划</a-button>
          </div>
          <div class="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-4">
            <span>槽位占用 <strong>{{ slotSummary.occupied }}/{{ slotSummary.capacity }}</strong></span>
            <span>空位 <strong>{{ slotSummary.vacant }}</strong></span>
            <span>待执行 <strong>{{ slotSummary.selected }}</strong></span>
            <span>提交中 <strong>{{ slotSummary.dispatching }}</strong></span>
            <span>待重试 <strong>{{ slotSummary.retry_waiting }}</strong></span>
          </div>
          <div class="mt-0.5">周期状态 {{ planStatusLabels[dailyPlan?.status ?? ""] ?? dailyPlan?.status ?? "-" }} · 模型快照 {{ dailyPlan?.model_snapshot ?? "-" }}</div>
        </div>
        <div class="rounded border border-editorial-border bg-white px-2.5 py-1.5 text-[10px] text-editorial-text-muted" data-testid="daily-plan-items">
          <div class="mb-1 flex items-center justify-between">
            <span class="font-medium text-editorial-text-body">当前槽位任务</span>
            <span>成功 {{ dailyPlan?.results.succeeded ?? 0 }} · 阻断 {{ dailyPlan?.results.blocked ?? 0 }} · 重试耗尽 {{ dailyPlan?.results.retryExhausted ?? 0 }}</span>
          </div>
          <div v-if="currentPlanItems.length === 0" class="py-1 text-editorial-text-muted/70">当前没有占用槽位的任务；后续五分钟复核会继续补充合格候选。</div>
          <div v-for="item in currentPlanItems" :key="item.sourceItemId" class="border-t border-editorial-border/70 py-1.5 first:border-t-0" data-testid="daily-plan-item">
            <div class="flex items-start gap-2">
              <span class="shrink-0 font-semibold text-editorial-text-body">#{{ item.sourceItemId }}</span>
              <span class="min-w-0 flex-1 break-words text-editorial-text-body">{{ item.title || "未读取标题" }}</span>
              <span class="shrink-0 rounded bg-editorial-bg-page px-1.5 py-0.5" :class="item.status === 'retry_waiting' || item.status === 'retry_exhausted' || item.status === 'blocked' ? 'text-amber-700' : 'text-editorial-text-muted'">{{ itemStatusLabel(item) }}</span>
            </div>
            <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-editorial-text-muted/80">
              <span>执行 {{ item.executionAttempts }}/{{ item.maxExecutionAttempts }}</span>
              <span>{{ item.occupiesSlot ? "占用槽位" : "已释放槽位" }}</span>
              <span v-if="item.updatedAt">更新于 {{ formatDateTime(item.updatedAt) }}</span>
              <a-button v-if="item.finishedArticleId" type="link" size="small" class="!h-auto !p-0 !text-[10px]" @click="emit('openArticle', item.finishedArticleId)">查看成品 #{{ item.finishedArticleId }}</a-button>
            </div>
            <details v-if="item.lastError" class="mt-0.5 text-editorial-text-muted/80">
              <summary class="cursor-pointer">查看失败原因（{{ item.failureStepName || item.failureKind || "执行" }}）</summary>
              <div class="mt-0.5 whitespace-pre-wrap break-words rounded bg-editorial-bg-page px-1.5 py-1">{{ item.lastError }}</div>
            </details>
          </div>
        </div>
        <div v-if="dailyPlan?.lastRun" class="rounded border border-editorial-border bg-editorial-bg-page px-2.5 py-1.5 text-[10px] leading-5 text-editorial-text-muted" data-testid="daily-plan-last-run">
          <div class="font-medium text-editorial-text-body">最近一次执行：{{ triggerKindLabel(dailyPlan.lastRun.triggerKind) }} · {{ formatDateTime(dailyPlan.lastRun.triggeredAt) }}</div>
          <div v-for="item in lastRunItems" :key="`last-${dailyPlan.lastRun.planDate}-${item.sourceItemId}`" class="flex flex-wrap items-center gap-x-2 border-t border-editorial-border/60 py-0.5 first:border-t-0">
            <span>#{{ item.sourceItemId }} {{ item.title || "未读取标题" }}</span>
            <span>{{ itemStatusLabel(item) }}</span>
            <span>执行 {{ item.executionAttempts }}/{{ item.maxExecutionAttempts }}</span>
            <a-button v-if="item.finishedArticleId" type="link" size="small" class="!h-auto !p-0 !text-[10px]" @click="emit('openArticle', item.finishedArticleId)">查看成品 #{{ item.finishedArticleId }}</a-button>
            <span v-if="item.lastError" class="w-full whitespace-pre-wrap break-words text-amber-700">原因：{{ item.lastError }}</span>
          </div>
        </div>
        <div class="rounded border border-editorial-border bg-editorial-bg-page px-2.5 py-1.5 text-[10px] leading-5 text-editorial-text-muted">
          五分钟复核只补空槽，不投递写作；手动或定时触发只执行点击/到点瞬间的待执行与待重试快照。自动写作入列条件：账号适配必须为 <strong>high（高适配）</strong>，同时基础评分 ≥ {{ automation?.config.baseScoreThreshold ?? 80 }}、趋势评分 ≥ {{ automation?.config.trendScoreThreshold ?? 80 }}；另受 48 小时窗口、已写作/已占用排除和同主题去重约束。
        </div>
      </div>

      <div class="mb-2 text-[10px] font-medium uppercase tracking-wider text-editorial-text-muted">短内容节奏</div>
      <div class="mb-4 space-y-1.5 rounded border border-editorial-border p-2" data-testid="short-write-config">
        <div v-for="definition in shortConfigDefinitions" :key="definition.key" :data-testid="`config-${definition.key}`" class="flex items-center gap-2 rounded border border-editorial-border px-2.5 py-1.5">
          <div class="min-w-0 flex-1">
            <div class="text-xs font-medium text-editorial-text-body">{{ definition.label }}</div>
            <div class="text-[10px] text-editorial-text-muted/70">{{ definition.description }}</div>
          </div>
          <a-input-number :value="draftValue(definition.key)" :min="definition.min" :max="definition.max" :step="definition.key.includes('Interval') ? 0.5 : 1" size="small" class="!w-20" :disabled="saving === definition.key || (definition.key.includes('Interval') && !automation?.config.shortWritePacingSupported) || (definition.key === 'shortWriteCycleCount' && automation?.config.shortWriteCycleCount == null)" @change="(value: number | null) => { if (value !== null) configDraft[definition.key] = value; }" />
          <a-button size="small" :loading="saving === definition.key" :disabled="(definition.key.includes('Interval') && !automation?.config.shortWritePacingSupported) || (definition.key === 'shortWriteCycleCount' && automation?.config.shortWriteCycleCount == null)" @click="saveConfig(definition)">保存</a-button>
        </div>
        <div class="rounded bg-editorial-bg-page px-2.5 py-1.5 text-[10px] leading-5 text-editorial-text-muted">
          <template v-if="automation?.config.shortWriteMode === 'paced'">逐篇调度已启用：每个采集周期最多受理 {{ automation.config.shortWriteCycleCount ?? '—' }} 篇热搜；随后处理 AI HOT 与 Juya RSS，RSS 不计入热搜上限。热搜与 RSS 各自从上一同类任务结束后计时，冷却结束仍须等待手动任务和已排队模型操作。未写完的 RSS 素材跨周期结转；失败与阻断单独记录，不计为写成。</template>
          <template v-else-if="automation?.config.shortWritePacingSupported">当前仍为批量模式。保存任一写作间隔后启用逐篇调度；旧任务不取消。</template>
          <template v-else>Hermes 逐篇调度版本尚未生效，旧批量规则继续运行；请在确认活动任务安全后完成 Hermes 服务更新。</template>
        </div>
      </div>

      <div class="mb-2 text-[10px] font-medium uppercase tracking-wider text-editorial-text-muted">旧图片实现参数（不承载自动调度）</div>
      <div class="space-y-1.5">
        <div class="flex items-center gap-2 rounded border border-editorial-border px-2.5 py-1.5">
          <div class="min-w-0 flex-1"><span class="text-xs font-medium text-editorial-text-body">旧自动生图实现</span><span class="ml-1 text-[10px] text-editorial-text-muted/70">仅选择旧服务商/Codex-auto实现；是否执行由上方“自动图片生成”阶段控制</span></div>
          <a-select :value="imageMode" :options="imageModeOptions" size="small" class="!w-28" :loading="saving === 'image_gen_mode'" @change="changeImageMode" />
        </div>
        <div class="flex items-center gap-2 rounded border border-editorial-border px-2.5 py-1.5" :class="{ 'opacity-50': !isProviderAuto }">
          <div class="min-w-0 flex-1"><span class="text-xs font-medium text-editorial-text-body">图片服务商</span><span class="ml-1 text-[10px] text-editorial-text-muted/70">仅在服务商自动模式下生效</span></div>
          <a-select :value="imageProvider" :options="imageProviderOptions.map(value => ({ value, label: value }))" size="small" class="!w-28" :disabled="!isProviderAuto" :loading="saving === 'image_provider'" @change="changeImageProvider" />
        </div>
        <div class="rounded border border-editorial-border bg-editorial-bg-page px-2.5 py-1.5 text-[10px] text-editorial-text-muted">自动任务只由 Hermes automation_tick 统一调度；如需立即推进，请使用统一控制 API，不再从此处启动独立管线。</div>
      </div>
    </a-spin>
  </section>
</template>
