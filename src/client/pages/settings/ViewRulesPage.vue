<script setup lang="ts">
import { message } from "ant-design-vue";
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";

import EditorialEmptyState from "../../components/content/EditorialEmptyState.vue";
import {
  editorialContentCardClass,
  editorialContentControlButtonClass,
  editorialContentControlButtonDangerClass,
  editorialContentControlButtonIdleClass,
  editorialContentPageClass,
  editorialContentSubpanelClass
} from "../../components/content/contentCardShared";
import { HttpError } from "../../services/http";
import {
  cancelNlEvaluation,
  clearFeedbackPool,
  createDraftFromFeedback,
  deleteFeedbackEntry,
  deleteProviderSettings,
  deleteStrategyDraft,
  readSettingsViewRules,
  saveNlRules,
  saveProviderSettings,
  saveStrategyDraft,
  updateProviderSettingsActivation,
  type SaveNlRulesResponse,
  type SettingsFeedbackPoolItem,
  type SettingsProviderSettingsSummary,
  type SettingsProviderKind,
  type SettingsStrategyGateScope,
  type SettingsStrategyDraftItem,
  type SettingsStrategyDraftScope,
  type SettingsViewRulesResponse
} from "../../services/settingsApi";

type AlertTone = "success" | "info" | "warning" | "error";
type PageNotice = { tone: AlertTone; message: string };
type EditableNlRuleGate = { enabled: boolean; ruleText: string };
type EditableDraftForm = {
  suggestedScope: SettingsStrategyDraftScope;
  draftText: string;
  draftEffectSummary: string;
  positiveKeywordsInput: string;
  negativeKeywordsInput: string;
};

const providerKindOptions = [
  { label: "DeepSeek", value: "deepseek" },
  { label: "MiniMax", value: "minimax" },
  { label: "Kimi", value: "kimi" }
] as const;
const RUN_STATUS_REFRESH_INTERVAL_MS = 15_000;
const draftScopeOptions = [
  { label: "未指定", value: "unspecified" },
  { label: "基础入池门", value: "base" },
  { label: "AI 新讯入池门", value: "ai_new" },
  { label: "AI 热点入池门", value: "ai_hot" }
] as const;
const scopeLabels: Record<SettingsStrategyDraftScope, string> = {
  unspecified: "未指定",
  base: "基础入池门",
  ai_new: "AI 新讯入池门",
  ai_hot: "AI 热点入池门"
};

const isLoading = ref(true);
const isRefreshing = ref(false);
const loadError = ref<string | null>(null);
const pageNotice = ref<PageNotice | null>(null);
const workbench = ref<SettingsViewRulesResponse | null>(null);
const nowTimestamp = ref(Date.now());
const pendingActions = reactive<Record<string, boolean>>({});
const draftForms = ref<Record<number, EditableDraftForm>>({});
const providerForm = reactive({
  providerKind: "deepseek" as SettingsProviderKind | string,
  apiKey: ""
});
const nlRuleForm = reactive<Record<SettingsStrategyGateScope, EditableNlRuleGate>>({
  base: { enabled: true, ruleText: "" },
  ai_new: { enabled: true, ruleText: "" },
  ai_hot: { enabled: true, ruleText: "" }
});

const providerCapabilityTone = computed<AlertTone>(() => {
  if (!workbench.value?.providerCapability) {
    return "info";
  }

  if (workbench.value.providerCapability.featureAvailable) {
    return "success";
  }

  if (!workbench.value.providerCapability.hasMasterKey) {
    return "warning";
  }

  return "info";
});

const enabledProviderSettings = computed(() =>
  (workbench.value?.providerSettings ?? []).find((settings) => settings.isEnabled) ?? null
);

const selectedProviderSettings = computed(() => {
  const selectedProviderKind = providerForm.providerKind.trim() as SettingsProviderKind;
  return (workbench.value?.providerSettings ?? []).find((settings) => settings.providerKind === selectedProviderKind) ?? null;
});

const selectedProviderStatus = computed(() => {
  const selectedProviderKind = providerForm.providerKind.trim() as SettingsProviderKind;
  const selectedProviderLabel = formatProviderLabel(selectedProviderKind);
  const statusLabel = readProviderStatusLabel(selectedProviderSettings.value);
  const enabledProviderLabel = formatProviderLabel(enabledProviderSettings.value?.providerKind);

  const message =
    statusLabel === "已配置并启用"
      ? `${selectedProviderLabel} 当前已配置并启用。`
      : statusLabel === "已保存未启用"
        ? `${selectedProviderLabel} 当前已保存，但还未启用。`
        : enabledProviderSettings.value
          ? `${selectedProviderLabel} 当前未配置；先保存 API Key，之后再单独启用。当前启用厂商是 ${enabledProviderLabel}。`
          : `${selectedProviderLabel} 当前未配置；先保存 API Key，之后再单独启用。`;

  return {
    label: selectedProviderLabel,
    statusLabel,
    message,
    tone:
      statusLabel === "已配置并启用"
        ? "success"
        : statusLabel === "已保存未启用"
          ? "warning"
          : "info"
  } as const;
});

const feedbackCopyText = computed(() =>
  (workbench.value?.feedbackPool ?? []).map((entry) => buildFeedbackCopyText(entry)).join("\n\n---\n\n")
);
let runStatusRefreshTimer: number | null = null;

const latestRunInsight = computed(() => {
  const latestRun = workbench.value?.latestEvaluationRun;

  if (!latestRun) {
    return null;
  }

  const processedCount = latestRun.successCount + latestRun.failureCount;
  const startedAtMs = Date.parse(latestRun.startedAt);
  const elapsedMs = Number.isNaN(startedAtMs) ? null : Math.max(0, nowTimestamp.value - startedAtMs);
  const isStaleRunning = latestRun.status === "running" && !workbench.value?.isEvaluationRunning;
  const remainingCount = Math.max(0, latestRun.itemCount - processedCount);
  const remainingMs =
    elapsedMs !== null && latestRun.itemCount > 0 && processedCount > 0 && remainingCount > 0
      ? Math.round((elapsedMs / processedCount) * remainingCount)
      : null;

  return {
    processedCount,
    elapsedMs,
    remainingMs,
    isStaleRunning
  };
});

const latestRunSummary = computed(() => {
  const latestRun = workbench.value?.latestEvaluationRun;
  const insight = latestRunInsight.value;
  const isStopRequested = workbench.value?.isEvaluationRunning && workbench.value?.isEvaluationStopRequested;

  if (!latestRun || !insight) {
    return "暂无重算记录";
  }

  const runStatusLabel = isStopRequested ? "正在停止" : formatRunStatusLabel(latestRun.status, insight.isStaleRunning);

  return `${formatProviderLabel(latestRun.providerKind)} · ${runStatusLabel} · ${formatDateTime(
    latestRun.finishedAt ?? latestRun.startedAt
  )}`;
});

const runStatusTagLabel = computed(() => {
  const insight = latestRunInsight.value;
  const latestRun = workbench.value?.latestEvaluationRun;
  const isStopRequested = workbench.value?.isEvaluationRunning && workbench.value?.isEvaluationStopRequested;

  if (isStopRequested) {
    return "正在停止";
  }

  if (workbench.value?.isEvaluationRunning) {
    return "重算进行中";
  }

  if (latestRun?.status === "cancelled") {
    return "已中断";
  }

  if (insight?.isStaleRunning) {
    return "上次重算中断";
  }

  return "等待下一次重算";
});

const runStatusTagTone = computed(() => {
  const insight = latestRunInsight.value;
  const latestRun = workbench.value?.latestEvaluationRun;
  const isStopRequested = workbench.value?.isEvaluationRunning && workbench.value?.isEvaluationStopRequested;

  if (isStopRequested) {
    return "interrupted";
  }

  if (workbench.value?.isEvaluationRunning) {
    return "running";
  }

  if (latestRun?.status === "cancelled") {
    return "interrupted";
  }

  if (insight?.isStaleRunning) {
    return "interrupted";
  }

  return "idle";
});

const runStatusOverviewText = computed(() => {
  const insight = latestRunInsight.value;
  const latestRun = workbench.value?.latestEvaluationRun;
  const isStopRequested = workbench.value?.isEvaluationRunning && workbench.value?.isEvaluationStopRequested;

  if (isStopRequested) {
    return "停止中";
  }

  if (workbench.value?.isEvaluationRunning) {
    return "进行中";
  }

  if (latestRun?.status === "cancelled") {
    return "已中断";
  }

  if (insight?.isStaleRunning) {
    return "中断";
  }

  return "空闲";
});

const latestRunDetailTone = computed<AlertTone>(() => {
  if (workbench.value?.isEvaluationRunning && workbench.value?.isEvaluationStopRequested) {
    return "warning";
  }

  if (workbench.value?.isEvaluationRunning) {
    return "info";
  }

  if (workbench.value?.latestEvaluationRun?.status === "cancelled") {
    return "warning";
  }

  if (latestRunInsight.value?.isStaleRunning) {
    return "warning";
  }

  if (workbench.value?.latestEvaluationRun?.status === "failed") {
    return "error";
  }

  return "success";
});

const latestRunDetailText = computed(() => {
  const latestRun = workbench.value?.latestEvaluationRun;
  const insight = latestRunInsight.value;

  if (!latestRun || !insight) {
    return "保存后会立即尝试重算当前内容库。";
  }

  if (workbench.value?.isEvaluationRunning && workbench.value?.isEvaluationStopRequested) {
    if (insight.processedCount <= 0) {
      return "已发送中断请求，当前正在处理的第一条内容完成后会停止重算。";
    }

    return `已发送中断请求，当前正在处理的这一条完成后会停止重算。已处理 ${insight.processedCount} / ${latestRun.itemCount} 条内容，已跑的结果保持生效。`;
  }

  if (workbench.value?.isEvaluationRunning) {
    if (insight.processedCount <= 0) {
      return `已运行 ${formatDurationMs(insight.elapsedMs)}，当前正在建立首批进度，处理完第一条内容后会开始预估剩余时间。`;
    }

    if (insight.remainingMs !== null) {
      return `已运行 ${formatDurationMs(insight.elapsedMs)}，已处理 ${insight.processedCount} / ${latestRun.itemCount} 条，预计还需约 ${formatDurationMs(insight.remainingMs)}。`;
    }

    return `已运行 ${formatDurationMs(insight.elapsedMs)}，已处理 ${insight.processedCount} / ${latestRun.itemCount} 条。`;
  }

  if (insight.isStaleRunning) {
    return `上次重算开始于 ${formatDateTime(latestRun.startedAt)}，但当前没有活跃任务，可重新保存正式规则触发一次新的重算。`;
  }

  if (latestRun.status === "cancelled") {
    return `上次重算已中断，共处理 ${insight.processedCount} / ${latestRun.itemCount} 条内容；已跑的结果保持生效。`;
  }

  if (latestRun.status === "completed") {
    return `上次重算已完成，共处理 ${insight.processedCount} / ${latestRun.itemCount} 条内容。`;
  }

  if (latestRun.status === "failed") {
    return `上次重算失败，共处理 ${insight.processedCount} / ${latestRun.itemCount} 条内容。${summarizeRunNotes(latestRun.notes)}`;
  }

  if (latestRun.status === "skipped") {
    return `上次重算未执行。${summarizeRunNotes(latestRun.notes)}`;
  }

  return "保存后会立即尝试重算当前内容库。";
});

// 页面级提示统一收口在这里，保留页内 Alert 的同时补一层全局 toast，避免操作结果只停留在首屏顶部。
function showNotice(tone: AlertTone, noticeMessage: string): void {
  pageNotice.value = { tone, message: noticeMessage };

  if (tone === "success") {
    void message.success(noticeMessage);
    return;
  }

  if (tone === "warning") {
    void message.warning(noticeMessage);
    return;
  }

  if (tone === "error") {
    void message.error(noticeMessage);
    return;
  }

  void message.info(noticeMessage);
}

// 待处理状态按动作 key 细分，避免不同卡片的 loading 相互影响。
function setPendingAction(actionKey: string, pending: boolean): void {
  pendingActions[actionKey] = pending;
}

// 模板里统一通过这个函数判断按钮 loading，减少直接读响应式字典的噪音。
function isActionPending(actionKey: string): boolean {
  return pendingActions[actionKey] === true;
}

// 展示层统一格式化时间戳，空值或脏值都回退成一段可读文本。
function formatDateTime(value: string | null | undefined): string {
  if (!value?.trim()) {
    return "暂无记录";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

// 重算状态统一转成中文，避免页面里同时出现英文枚举和值得误解的技术状态。
function formatRunStatusLabel(status: string, isStaleRunning: boolean): string {
  if (isStaleRunning) {
    return "已中断";
  }

  if (status === "cancelled") {
    return "已中断";
  }

  if (status === "completed") {
    return "已完成";
  }

  if (status === "running") {
    return "进行中";
  }

  if (status === "failed") {
    return "失败";
  }

  if (status === "skipped") {
    return "已跳过";
  }

  return status.trim() || "未知";
}

// 时长展示按分钟和小时收口，优先给用户直观预估，不暴露毫秒这类技术细节。
function formatDurationMs(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return "不到 1 分钟";
  }

  const totalMinutes = Math.max(1, Math.round(value / 60_000));

  if (totalMinutes < 60) {
    return `${totalMinutes} 分钟`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `${hours} 小时`;
  }

  return `${hours} 小时 ${minutes} 分钟`;
}

// 失败或跳过时只展示首条说明，避免把后端聚合的整段 notes 全量塞进 UI。
function summarizeRunNotes(notes: string | null | undefined): string {
  const trimmed = notes?.trim();

  if (!trimmed) {
    return "";
  }

  const firstNote = trimmed.split(";")[0]?.trim() || trimmed;
  return ` 最近说明：${firstNote}`;
}

// 厂商标识在多个卡片都会复用，这里统一转成人更容易扫读的标签。
function formatProviderLabel(value: string | null | undefined): string {
  if (value === "deepseek") {
    return "DeepSeek";
  }

  if (value === "minimax") {
    return "MiniMax";
  }

  if (value === "kimi") {
    return "Kimi";
  }

  return value?.trim() || "未配置";
}

// 选择器切换后，页面要立刻告诉用户“这个厂商有没有保存、有没有启用”，所以状态翻译基于当前选中的摘要项。
function readProviderStatusLabel(currentProviderSettings: SettingsProviderSettingsSummary | null): string {
  if (!currentProviderSettings) {
    return "未配置";
  }

  return currentProviderSettings.isEnabled ? "已配置并启用" : "已保存未启用";
}

// 服务端错误都从同一个出口翻译，页面只需要补动作级别的兜底文案。
function readActionErrorMessage(
  error: unknown,
  fallbackMessage: string,
  reasonMessages: Record<string, string> = {}
): string {
  if (error instanceof HttpError) {
    if (error.status === 401) {
      return "请先登录后再操作。";
    }

    if (error.status === 404) {
      return "目标项不存在，可能已被删除。";
    }

    const reason =
      typeof error.body === "object" && error.body !== null && "reason" in error.body
        ? String((error.body as { reason?: unknown }).reason ?? "")
        : "";

    if (reason && reasonMessages[reason]) {
      return reasonMessages[reason];
    }
  }

  return fallbackMessage;
}

// 反馈复制文本沿用旧系统页语义，方便继续喂给草稿池或外部笔记工具。
function buildFeedbackCopyText(entry: SettingsFeedbackPoolItem): string {
  return [
    `标题：${entry.contentTitle}`,
    `来源：${entry.sourceName}`,
    `链接：${entry.canonicalUrl}`,
    `反馈说明：${entry.freeText?.trim() || "未填写"}`,
    `建议动作：${entry.suggestedEffect?.trim() || "未设置"}`,
    `强度：${entry.strengthLevel?.trim() || "未设置"}`,
    `关键词加分：${entry.positiveKeywords.join(", ") || "未设置"}`,
    `关键词减分：${entry.negativeKeywords.join(", ") || "未设置"}`
  ].join("\n");
}

// 草稿复制优先带上当前编辑态内容，避免用户复制到的还是旧值。
function buildDraftCopyText(draftId: number): string {
  const form = draftForms.value[draftId];

  if (!form) {
    return "";
  }

  return [
    `目标范围：${scopeLabels[form.suggestedScope]}`,
    `草稿内容：${form.draftText}`,
    `效果摘要：${form.draftEffectSummary.trim() || "未设置"}`,
    `关键词加分：${form.positiveKeywordsInput.trim() || "未设置"}`,
    `关键词减分：${form.negativeKeywordsInput.trim() || "未设置"}`
  ].join("\n");
}

// 关键词输入继续使用逗号分隔，和旧页面保持同一套心智模型。
function parseKeywordInput(rawValue: string): string[] {
  return rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

// 厂商选择器只允许三家固定厂商，刷新后要优先对齐真正启用中的厂商，避免下拉框和系统生效状态脱节。
function isSupportedProviderKind(value: string): value is SettingsProviderKind {
  return providerKindOptions.some((option) => option.value === value);
}

// 每次读到新的工作台数据后，都把页面里的可编辑表单重新同步一遍。
function syncWorkbenchForms(nextWorkbench: SettingsViewRulesResponse): void {
  const currentProviderKind = providerForm.providerKind.trim();
  const enabledProviderKind = nextWorkbench.providerSettings.find((settings) => settings.isEnabled)?.providerKind ?? null;
  const fallbackProviderKind = nextWorkbench.providerSettings[0]?.providerKind ?? "deepseek";

  providerForm.providerKind =
    enabledProviderKind ??
    (isSupportedProviderKind(currentProviderKind) ? currentProviderKind : fallbackProviderKind);
  providerForm.apiKey = "";

  const ruleByScope = new Map(nextWorkbench.nlRules.map((rule) => [rule.scope, rule]));
  nlRuleForm.base.enabled = ruleByScope.get("base")?.enabled ?? true;
  nlRuleForm.base.ruleText = ruleByScope.get("base")?.ruleText ?? "";
  nlRuleForm.ai_new.enabled = ruleByScope.get("ai_new")?.enabled ?? true;
  nlRuleForm.ai_new.ruleText = ruleByScope.get("ai_new")?.ruleText ?? "";
  nlRuleForm.ai_hot.enabled = ruleByScope.get("ai_hot")?.enabled ?? true;
  nlRuleForm.ai_hot.ruleText = ruleByScope.get("ai_hot")?.ruleText ?? "";

  draftForms.value = Object.fromEntries(
    nextWorkbench.strategyDrafts.map((draft) => [
      draft.id,
      {
        suggestedScope: draft.suggestedScope,
        draftText: draft.draftText,
        draftEffectSummary: draft.draftEffectSummary?.trim() || "",
        positiveKeywordsInput: draft.positiveKeywords.join(", "),
        negativeKeywordsInput: draft.negativeKeywords.join(", ")
      }
    ])
  );
}

// 文本复制优先走 Clipboard API，失败时只提示，不打断页面主流程。
async function copyText(text: string, successMessage: string): Promise<void> {
  if (!text.trim()) {
    showNotice("warning", "当前没有可复制的内容。");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showNotice("success", successMessage);
  } catch {
    showNotice("error", "复制失败，请手动复制。");
  }
}

// 数据加载区分首屏加载和静默刷新，保存动作后不会把整页再次切回骨架屏。
async function loadWorkbench(options: { silent?: boolean } = {}): Promise<boolean> {
  if (options.silent) {
    isRefreshing.value = true;
  } else {
    isLoading.value = true;
    loadError.value = null;
  }

  try {
    const nextWorkbench = await readSettingsViewRules();
    workbench.value = nextWorkbench;
    nowTimestamp.value = Date.now();
    syncWorkbenchForms(nextWorkbench);
    loadError.value = null;
    return true;
  } catch (error) {
    const message = readActionErrorMessage(error, "策略工作台加载失败，请稍后重试。");

    if (!workbench.value || !options.silent) {
      loadError.value = message;
    } else {
      showNotice("error", message);
    }

    return false;
  } finally {
    if (options.silent) {
      isRefreshing.value = false;
    } else {
      isLoading.value = false;
    }
  }
}

// 运行中状态需要周期性刷新，才能把已处理数量和剩余时间估算同步到当前页面。
function refreshRunStatusHeartbeat(): void {
  nowTimestamp.value = Date.now();

  if (workbench.value?.isEvaluationRunning && !isRefreshing.value) {
    void loadWorkbench({ silent: true });
  }
}

// 心跳定时器和页面生命周期绑定，避免离开页面后继续轮询。
function startRunStatusHeartbeat(): void {
  stopRunStatusHeartbeat();
  runStatusRefreshTimer = window.setInterval(refreshRunStatusHeartbeat, RUN_STATUS_REFRESH_INTERVAL_MS);
}

// 定时器清理单独抽出来，保证 mounted / unmounted 之间的行为可读且稳定。
function stopRunStatusHeartbeat(): void {
  if (runStatusRefreshTimer !== null) {
    window.clearInterval(runStatusRefreshTimer);
    runStatusRefreshTimer = null;
  }
}

// 页面写操作共用这层包装，统一 pending、错误翻译、成功提示和静默刷新。
async function runWorkbenchAction<T>(
  actionKey: string,
  action: () => Promise<T>,
  options: {
    fallbackMessage: string;
    successMessage: string | ((result: T) => string);
    reasonMessages?: Record<string, string>;
    refresh?: boolean;
  }
): Promise<void> {
  if (isActionPending(actionKey)) {
    return;
  }

  setPendingAction(actionKey, true);

  try {
    const result = await action();
    const shouldRefresh = options.refresh !== false;
    const refreshed = shouldRefresh ? await loadWorkbench({ silent: true }) : true;
    const message = typeof options.successMessage === "function" ? options.successMessage(result) : options.successMessage;
    showNotice("success", refreshed ? message : `${message} 但最新工作台数据刷新失败，请稍后手动刷新。`);
  } catch (error) {
    showNotice(
      "error",
      readActionErrorMessage(error, options.fallbackMessage, options.reasonMessages ?? {})
    );
  } finally {
    setPendingAction(actionKey, false);
  }
}

// 厂商配置保存需要先拿到 providerKind 和 API key，避免把空 key 保存成脏配置。
async function handleProviderSave(): Promise<void> {
  const providerKind = providerForm.providerKind.trim();
  const apiKey = providerForm.apiKey.trim();

  if (!providerKind || !apiKey) {
    showNotice("error", "请先填写厂商和 API Key。");
    return;
  }

  await runWorkbenchAction(
    "provider:save",
    () =>
      saveProviderSettings({
        providerKind,
        apiKey
      }),
    {
      fallbackMessage: "厂商配置保存失败，请稍后再试。",
      successMessage: "厂商配置已保存。",
      reasonMessages: {
        "master-key-required": "缺少 LLM_SETTINGS_MASTER_KEY，当前无法保存厂商配置。",
        "invalid-provider-settings": "厂商配置不合法，请检查厂商和 API Key。"
      }
    }
  );
}

// 启用和停用分开后，用户可以先保存多个厂商，再单独切换当前真正生效的厂商。
async function handleProviderActivation(enable: boolean): Promise<void> {
  const providerKind = providerForm.providerKind.trim();

  if (!providerKind) {
    showNotice("error", "请先选择一个厂商。");
    return;
  }

  await runWorkbenchAction(
    `provider:${providerKind}:${enable ? "enable" : "disable"}`,
    () =>
      updateProviderSettingsActivation({
        providerKind,
        enable
      }),
    {
      fallbackMessage: enable ? "启用厂商失败，请稍后再试。" : "停用厂商失败，请稍后再试。",
      successMessage: enable
        ? `${formatProviderLabel(providerKind)} 已启用。`
        : `${formatProviderLabel(providerKind)} 已停用。`,
      reasonMessages: {
        "invalid-provider-activation": "厂商启用状态不合法，请刷新后重试。",
        "provider-settings-not-found": "请先保存当前厂商的 API Key，再执行启用。"
      }
    }
  );
}

// 删除动作要显式带上当前选中的厂商，避免多厂商模式下误删其他配置。
async function handleProviderDelete(): Promise<void> {
  const providerKind = providerForm.providerKind.trim();

  if (!providerKind) {
    showNotice("error", "请先选择一个厂商。");
    return;
  }

  await runWorkbenchAction("provider:delete", () => deleteProviderSettings(providerKind), {
    fallbackMessage: "厂商配置删除失败，请稍后再试。",
    successMessage: "厂商配置已删除。"
  });
}

// 正式自然语言策略保存后，成功提示要根据后端重算状态给出不同反馈。
async function handleNlRulesSave(): Promise<void> {
  await runWorkbenchAction(
    "nl-rules:save",
    () =>
      saveNlRules({
        base: { enabled: nlRuleForm.base.enabled, ruleText: nlRuleForm.base.ruleText },
        ai_new: { enabled: nlRuleForm.ai_new.enabled, ruleText: nlRuleForm.ai_new.ruleText },
        ai_hot: { enabled: nlRuleForm.ai_hot.enabled, ruleText: nlRuleForm.ai_hot.ruleText }
      }),
    {
      fallbackMessage: "正式规则保存失败，请稍后再试。",
      successMessage: (result: SaveNlRulesResponse) => {
        const runStatus = result.run?.status;

        if (runStatus === "completed") {
          return "正式规则已保存，当前内容库已完成重算。";
        }

        if (runStatus === "running") {
          return "正式规则已保存，重算已转入后台运行。";
        }

        if (runStatus === "skipped") {
          return "正式规则已保存，但当前未执行自然语言重算。";
        }

        return "正式规则已保存。";
      },
      reasonMessages: {
        "invalid-nl-rules-payload": "正式规则内容不合法，请检查输入。",
        "master-key-required": "缺少 LLM_SETTINGS_MASTER_KEY，当前无法执行自然语言重算。"
      }
    }
  );
}

// 中断重算只会阻止后续内容继续评估，当前已经完成的结果和当前项的持久化结果都会继续保留。
async function handleNlEvaluationCancel(): Promise<void> {
  await runWorkbenchAction("nl-rules:cancel", () => cancelNlEvaluation(), {
    fallbackMessage: "中断重算失败，请稍后再试。",
    successMessage: (result) =>
      result.accepted ? "已发送中断请求，当前正在处理的这一条完成后会停止重算。" : "当前没有正在运行的重算任务。"
  });
}

// 反馈转草稿后直接刷新整页，确保反馈池和草稿池同时拿到新状态。
async function handleFeedbackDraftCreate(feedbackId: number): Promise<void> {
  await runWorkbenchAction(
    `feedback:${feedbackId}:draft`,
    () => createDraftFromFeedback(feedbackId),
    {
      fallbackMessage: "转草稿失败，请稍后再试。",
      successMessage: "已转成草稿。"
    }
  );
}

// 删除单条反馈后刷新工作台，避免列表和统计信息留着旧数据。
async function handleFeedbackDelete(feedbackId: number): Promise<void> {
  await runWorkbenchAction(
    `feedback:${feedbackId}:delete`,
    () => deleteFeedbackEntry(feedbackId),
    {
      fallbackMessage: "删除反馈失败，请稍后再试。",
      successMessage: "反馈已删除。"
    }
  );
}

// 清空反馈池属于批量动作，成功提示会带上后端返回的清理数量。
async function handleFeedbackClearAll(): Promise<void> {
  await runWorkbenchAction("feedback:clear", () => clearFeedbackPool(), {
    fallbackMessage: "清空反馈失败，请稍后再试。",
    successMessage: (result) => `反馈池已清空，共清理 ${result.cleared} 条反馈。`
  });
}

// 草稿保存前会把逗号分隔的关键词重新切成数组，再沿用后端原接口结构提交。
async function handleDraftSave(draftId: number): Promise<void> {
  const form = draftForms.value[draftId];

  if (!form) {
    showNotice("error", "未找到对应的草稿表单。");
    return;
  }

  if (!form.draftText.trim()) {
    showNotice("error", "草稿内容不能为空。");
    return;
  }

  await runWorkbenchAction(
    `draft:${draftId}:save`,
    () =>
      saveStrategyDraft(draftId, {
        suggestedScope: form.suggestedScope,
        draftText: form.draftText,
        draftEffectSummary: form.draftEffectSummary,
        positiveKeywords: parseKeywordInput(form.positiveKeywordsInput),
        negativeKeywords: parseKeywordInput(form.negativeKeywordsInput)
      }),
    {
      fallbackMessage: "保存草稿失败，请稍后再试。",
      successMessage: "草稿已保存。"
    }
  );
}

// 草稿删除成功后刷新整页，让列表和正式策略辅助操作保持同步。
async function handleDraftDelete(draftId: number): Promise<void> {
  await runWorkbenchAction(
    `draft:${draftId}:delete`,
    () => deleteStrategyDraft(draftId),
    {
      fallbackMessage: "删除草稿失败，请稍后再试。",
      successMessage: "草稿已删除。"
    }
  );
}

// 草稿写入正式策略编辑器只改当前页面表单，不直接触发保存，避免误提交。
function handleDraftApply(draftId: number): void {
  const form = draftForms.value[draftId];

  if (!form) {
    showNotice("error", "未找到对应的草稿表单。");
    return;
  }

  const draftText = form.draftText.trim();

  if (!draftText) {
    showNotice("error", "草稿内容为空，无法写入。");
    return;
  }

  if (form.suggestedScope === "unspecified") {
    showNotice("warning", "请先选择目标范围，再写入正式策略编辑器。");
    return;
  }

  const currentValue = nlRuleForm[form.suggestedScope].ruleText.trim();
  nlRuleForm[form.suggestedScope].ruleText = currentValue ? `${currentValue}\n\n${draftText}` : draftText;
  showNotice("success", "草稿已写入正式策略编辑器，记得保存正式规则。");
}

onMounted(() => {
  startRunStatusHeartbeat();
  void loadWorkbench();
});

onUnmounted(() => {
  stopRunStatusHeartbeat();
});
</script>

<template>
  <a-spin :spinning="isRefreshing">
    <div :class="editorialContentPageClass" data-settings-page="view-rules">
      <a-alert
        v-if="pageNotice"
        :class="['editorial-inline-alert', `editorial-inline-alert--${pageNotice.tone}`]"
        :message="pageNotice.message"
        :type="pageNotice.tone"
        show-icon
        closable
        data-view-rules-page-notice
        @close="pageNotice = null"
      />

      <a-skeleton v-if="isLoading" active :paragraph="{ rows: 10 }" />

      <a-result
        v-else-if="loadError"
        status="error"
        title="策略工作台加载失败"
        :sub-title="loadError"
      >
        <template #extra>
          <a-button type="primary" @click="loadWorkbench()">重新加载</a-button>
        </template>
      </a-result>

      <template v-else-if="workbench">
        <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-settings-section="overview">
          <a-card :class="editorialContentCardClass" size="small">
            <a-statistic title="策略门" :value="workbench.nlRules.length" />
          </a-card>
          <a-card :class="editorialContentCardClass" size="small">
            <a-statistic title="反馈池" :value="workbench.feedbackPool.length" />
          </a-card>
          <a-card :class="editorialContentCardClass" size="small">
            <a-statistic title="草稿池" :value="workbench.strategyDrafts.length" />
          </a-card>
          <a-card :class="editorialContentCardClass" size="small">
            <a-statistic
              title="重算状态"
              :value="runStatusOverviewText"
            />
          </a-card>
        </section>

        <section class="grid gap-4 xl:grid-cols-5" data-settings-section="nl-rules">
          <a-card
            :class="[editorialContentCardClass, 'xl:col-span-2']"
            title="LLM 设置"
            size="small"
            data-view-rules-section="provider-settings"
          >
              <div class="flex w-full flex-col gap-4">
                <a-alert
                  :class="['editorial-inline-alert', `editorial-inline-alert--${providerCapabilityTone}`]"
                  :type="providerCapabilityTone"
                  :message="workbench.providerCapability.message"
                  show-icon
                  data-view-rules-provider-alert
                />

                <a-descriptions :column="1" size="small" bordered>
                  <a-descriptions-item label="已启用厂商">
                    {{ formatProviderLabel(enabledProviderSettings?.providerKind) }}
                  </a-descriptions-item>
                  <a-descriptions-item label="当前厂商尾号">
                    {{ selectedProviderSettings?.apiKeyLast4 || "未配置" }}
                  </a-descriptions-item>
                  <a-descriptions-item label="当前厂商更新">
                    {{ formatDateTime(selectedProviderSettings?.updatedAt) }}
                  </a-descriptions-item>
                  <a-descriptions-item label="最近重算">
                    {{ latestRunSummary }}
                  </a-descriptions-item>
                </a-descriptions>

                <a-form
                  layout="vertical"
                  data-view-rules-form="provider-settings"
                  @submit.prevent="handleProviderSave"
                >
                  <a-form-item label="厂商">
                    <a-select
                      v-model:value="providerForm.providerKind"
                      :options="providerKindOptions"
                      data-provider-kind-select
                    />
                    <a-alert
                      :class="['mt-3 editorial-inline-alert', `editorial-inline-alert--${selectedProviderStatus.tone}`]"
                      :type="selectedProviderStatus.tone"
                      :message="selectedProviderStatus.message"
                      show-icon
                      data-view-rules-selected-provider-status
                    />
                    <p class="mb-0 mt-2 text-xs leading-5 text-editorial-text-muted" data-view-rules-provider-status-note>
                      每个厂商会分别保存 API key；启用动作独立控制，系统同一时间只会启用一个厂商。
                    </p>
                  </a-form-item>
                  <a-form-item label="API Key">
                    <a-input-password
                      v-model:value="providerForm.apiKey"
                      placeholder="输入新的 API key 会更新当前厂商配置"
                      data-provider-api-key
                    />
                  </a-form-item>
                  <a-space wrap>
                    <a-button
                      type="primary"
                      html-type="submit"
                      data-action="save-provider-settings"
                      :loading="isActionPending('provider:save')"
                    >
                      保存厂商设置
                    </a-button>
                    <a-button
                      v-if="selectedProviderSettings && !selectedProviderSettings.isEnabled"
                      data-action="enable-provider-settings"
                      :loading="isActionPending(`provider:${providerForm.providerKind}:enable`)"
                      @click="handleProviderActivation(true)"
                    >
                      启用当前厂商
                    </a-button>
                    <a-button
                      v-else-if="selectedProviderSettings?.isEnabled"
                      data-action="disable-provider-settings"
                      :loading="isActionPending(`provider:${providerForm.providerKind}:disable`)"
                      @click="handleProviderActivation(false)"
                    >
                      停用当前厂商
                    </a-button>
                    <a-popconfirm
                      v-if="selectedProviderSettings"
                      title="确认删除当前选择的厂商配置吗？"
                      ok-text="确认删除"
                      cancel-text="取消"
                      @confirm="handleProviderDelete"
                    >
                      <a-button
                        danger
                        data-action="delete-provider-settings"
                        :loading="isActionPending('provider:delete')"
                      >
                        删除当前厂商配置
                      </a-button>
                    </a-popconfirm>
                    <a-button
                      v-else
                      danger
                      disabled
                      data-action="delete-provider-settings"
                    >
                      删除当前厂商配置
                    </a-button>
                  </a-space>
                </a-form>
              </div>
          </a-card>

          <a-card
            :class="[editorialContentCardClass, 'xl:col-span-3']"
            title="正式自然语言策略"
            size="small"
            data-view-rules-section="nl-rules"
          >
            <template #extra>
              <a-tag
                :class="['editorial-status-tag', `editorial-status-tag--${runStatusTagTone}`]"
                data-view-rules-run-status
              >
                {{ runStatusTagLabel }}
              </a-tag>
            </template>

            <a-form
              layout="vertical"
              data-view-rules-form="nl-rules"
              @submit.prevent="handleNlRulesSave"
            >
              <a-alert
                class="editorial-inline-alert editorial-inline-alert--info mb-4"
                type="info"
                show-icon
                message="AI 新讯固定按最近 24 小时窗口构建结果集；AI 热点继续按热点形成逻辑筛选，不会被额外压成 24 小时。"
                data-view-rules-window-alert
              />
              <a-alert
                :class="['editorial-inline-alert', `editorial-inline-alert--${latestRunDetailTone}`, 'mb-4']"
                :type="latestRunDetailTone"
                show-icon
                :message="latestRunDetailText"
                data-view-rules-run-detail
              />
              <a-form-item label="基础入池门">
                <a-switch v-model:checked="nlRuleForm.base.enabled" class="mb-3" />
                <a-textarea
                  v-model:value="nlRuleForm.base.ruleText"
                  :rows="4"
                  data-nl-rule-scope="base"
                />
              </a-form-item>
              <a-form-item label="AI 新讯入池门">
                <a-switch v-model:checked="nlRuleForm.ai_new.enabled" class="mb-3" />
                <a-textarea
                  v-model:value="nlRuleForm.ai_new.ruleText"
                  :rows="3"
                  data-nl-rule-scope="ai_new"
                />
              </a-form-item>
              <a-form-item label="AI 热点入池门">
                <a-switch v-model:checked="nlRuleForm.ai_hot.enabled" class="mb-3" />
                <a-textarea
                  v-model:value="nlRuleForm.ai_hot.ruleText"
                  :rows="3"
                  data-nl-rule-scope="ai_hot"
                />
              </a-form-item>
              <a-space wrap>
                <a-button
                  type="primary"
                  html-type="submit"
                  data-action="save-nl-rules"
                  :loading="isActionPending('nl-rules:save')"
                >
                  保存正式规则
                </a-button>
                <a-button
                  v-if="workbench.isEvaluationRunning"
                  danger
                  data-action="cancel-nl-evaluation"
                  :loading="isActionPending('nl-rules:cancel')"
                  :disabled="workbench.isEvaluationStopRequested"
                  @click="handleNlEvaluationCancel"
                >
                  {{ workbench.isEvaluationStopRequested ? "停止中…" : "中断重算" }}
                </a-button>
                <a-typography-text type="secondary">
                  保存后会立即尝试重算当前内容库。
                </a-typography-text>
              </a-space>
            </a-form>
          </a-card>
        </section>

        <section data-settings-section="feedback-pool">
        <a-card
          :class="editorialContentCardClass"
          title="反馈池"
          size="small"
          data-view-rules-section="feedback-pool"
        >
          <template #extra>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <a-button
                size="small"
                data-action="copy-feedback-pool"
                :class="[editorialContentControlButtonClass, editorialContentControlButtonIdleClass]"
                @click="copyText(feedbackCopyText, '反馈内容已复制。')"
              >
                复制全部反馈
              </a-button>
              <a-popconfirm
                title="确认清空全部反馈吗？"
                ok-text="确认清空"
                cancel-text="取消"
                @confirm="handleFeedbackClearAll"
              >
                <a-button
                  size="small"
                  data-action="clear-feedback-pool"
                  :class="[editorialContentControlButtonClass, editorialContentControlButtonDangerClass]"
                  :loading="isActionPending('feedback:clear')"
                >
                  清空全部反馈
                </a-button>
              </a-popconfirm>
            </div>
          </template>

          <EditorialEmptyState
            v-if="workbench.feedbackPool.length === 0"
            data-empty-state="feedback-pool"
            title="反馈池为空"
            description="内容页的新反馈会显示在这里。"
          />

          <div v-else class="flex w-full flex-col gap-4">
            <a-card
              v-for="entry in workbench.feedbackPool"
              :key="entry.id"
              size="small"
              :class="[editorialContentSubpanelClass, 'w-full shadow-editorial-card']"
              data-feedback-row
            >
              <template #title>
                <a-space size="small" wrap>
                  <span>{{ entry.contentTitle }}</span>
                  <a-tag color="blue">{{ entry.sourceName }}</a-tag>
                </a-space>
              </template>

              <a-descriptions :column="1" size="small" bordered>
                <a-descriptions-item label="链接">
                  <a :href="entry.canonicalUrl" target="_blank" rel="noreferrer">
                    {{ entry.canonicalUrl }}
                  </a>
                </a-descriptions-item>
                <a-descriptions-item label="反馈说明">
                  {{ entry.freeText?.trim() || "未填写" }}
                </a-descriptions-item>
                <a-descriptions-item label="建议动作">
                  {{ entry.suggestedEffect?.trim() || "未设置" }}
                </a-descriptions-item>
                <a-descriptions-item label="强度">
                  {{ entry.strengthLevel?.trim() || "未设置" }}
                </a-descriptions-item>
              </a-descriptions>

              <div class="my-3 flex flex-wrap gap-2">
                <a-tag v-for="keyword in entry.positiveKeywords" :key="`positive-${entry.id}-${keyword}`" color="green">
                  + {{ keyword }}
                </a-tag>
                <a-tag v-for="keyword in entry.negativeKeywords" :key="`negative-${entry.id}-${keyword}`" color="red">
                  - {{ keyword }}
                </a-tag>
              </div>

              <a-space wrap>
                <a-button @click="copyText(buildFeedbackCopyText(entry), '反馈内容已复制。')">
                  复制
                </a-button>
                <a-button
                  type="primary"
                  :loading="isActionPending(`feedback:${entry.id}:draft`)"
                  @click="handleFeedbackDraftCreate(entry.id)"
                >
                  转成草稿
                </a-button>
                <a-popconfirm
                  title="确认删除这条反馈吗？"
                  ok-text="确认删除"
                  cancel-text="取消"
                  @confirm="handleFeedbackDelete(entry.id)"
                >
                  <a-button
                    danger
                    :loading="isActionPending(`feedback:${entry.id}:delete`)"
                    :data-action="`delete-feedback-${entry.id}`"
                  >
                    删除
                  </a-button>
                </a-popconfirm>
              </a-space>
            </a-card>
          </div>
        </a-card>
        </section>

        <section data-settings-section="strategy-drafts">
        <a-card
          :class="editorialContentCardClass"
          title="草稿池"
          size="small"
          data-view-rules-section="strategy-drafts"
        >
          <EditorialEmptyState
            v-if="workbench.strategyDrafts.length === 0"
            data-empty-state="strategy-drafts"
            title="草稿池为空"
            description="可以先把反馈转成草稿。"
          />

          <div v-else class="flex w-full flex-col gap-4">
            <a-card
              v-for="draft in workbench.strategyDrafts"
              :key="draft.id"
              size="small"
              :class="[editorialContentSubpanelClass, 'w-full shadow-editorial-card']"
              data-draft-row
            >
              <template #title>
                <a-space size="small" wrap>
                  <span>草稿 #{{ draft.id }}</span>
                  <a-tag>{{ scopeLabels[draft.suggestedScope] }}</a-tag>
                  <a-tag v-if="draft.sourceFeedbackId">来源反馈 #{{ draft.sourceFeedbackId }}</a-tag>
                </a-space>
              </template>

              <a-form
                v-if="draftForms[draft.id]"
                layout="vertical"
                :data-draft-form="draft.id"
                @submit.prevent="handleDraftSave(draft.id)"
              >
                <a-form-item label="目标范围">
                  <a-select
                    v-model:value="draftForms[draft.id].suggestedScope"
                    :options="draftScopeOptions"
                  />
                </a-form-item>
                <a-form-item label="草稿内容">
                  <a-textarea
                    v-model:value="draftForms[draft.id].draftText"
                    :rows="4"
                  />
                </a-form-item>
                <a-form-item label="效果摘要">
                  <a-input v-model:value="draftForms[draft.id].draftEffectSummary" />
                </a-form-item>
                <a-form-item label="关键词加分">
                  <a-input v-model:value="draftForms[draft.id].positiveKeywordsInput" />
                </a-form-item>
                <a-form-item label="关键词减分">
                  <a-input v-model:value="draftForms[draft.id].negativeKeywordsInput" />
                </a-form-item>
                <a-space wrap>
                  <a-button
                    type="primary"
                    html-type="submit"
                    :loading="isActionPending(`draft:${draft.id}:save`)"
                  >
                    保存草稿
                  </a-button>
                  <a-button
                    :data-action="'apply-draft'"
                    :data-draft-id="draft.id"
                    @click="handleDraftApply(draft.id)"
                  >
                    写入正式策略编辑器
                  </a-button>
                  <a-button @click="copyText(buildDraftCopyText(draft.id), '草稿内容已复制。')">
                    复制
                  </a-button>
                  <a-popconfirm
                    title="确认删除这条草稿吗？"
                    ok-text="确认删除"
                    cancel-text="取消"
                    @confirm="handleDraftDelete(draft.id)"
                  >
                    <a-button
                      danger
                      :loading="isActionPending(`draft:${draft.id}:delete`)"
                      :data-action="`delete-draft-${draft.id}`"
                    >
                      删除草稿
                    </a-button>
                  </a-popconfirm>
                </a-space>
              </a-form>
            </a-card>
          </div>
        </a-card>
        </section>
      </template>
    </div>
  </a-spin>
</template>
