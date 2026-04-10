<script setup lang="ts">
import { message } from "ant-design-vue";
import { computed, onMounted, reactive, ref } from "vue";

import EditorialEmptyState from "../../components/content/EditorialEmptyState.vue";
import {
  editorialContentCardClass,
  editorialContentControlButtonClass,
  editorialContentControlButtonDangerClass,
  editorialContentControlButtonIdleClass,
  editorialContentPageClass
} from "../../components/content/contentCardShared";
import { HttpError } from "../../services/http";
import {
  clearFeedbackPool,
  deleteFeedbackEntry,
  deleteProviderSettings,
  readSettingsViewRules,
  saveContentFilterRule,
  saveProviderSettings,
  updateProviderSettingsActivation,
  type SettingsContentFilterRule,
  type SettingsContentFilterToggles,
  type SettingsContentFilterWeights,
  type SettingsFeedbackPoolItem,
  type SettingsProviderKind,
  type SettingsProviderSettingsSummary,
  type SettingsViewRulesResponse
} from "../../services/settingsApi";
import { BUILTIN_SOURCES } from "../../../core/source/sourceCatalog";

type AlertTone = "success" | "info" | "warning" | "error";
type PageNotice = { tone: AlertTone; message: string };
type FilterRuleKey = "ai" | "hot";
type FilterWeightKey = keyof SettingsContentFilterWeights;
const weightDisplayScale = 100;

const providerKindOptions = [
  { label: "DeepSeek", value: "deepseek" },
  { label: "MiniMax", value: "minimax" },
  { label: "Kimi", value: "kimi" }
] as const;

const isLoading = ref(true);
const isRefreshing = ref(false);
const loadError = ref<string | null>(null);
const pageNotice = ref<PageNotice | null>(null);
const workbench = ref<SettingsViewRulesResponse | null>(null);
const pendingActions = reactive<Record<string, boolean>>({});
const filterForms = reactive<Record<FilterRuleKey, SettingsContentFilterToggles>>({
  ai: createFilterToggleDraft(),
  hot: createFilterToggleDraft()
});
const filterWeightForms = reactive<Record<FilterRuleKey, SettingsContentFilterWeights>>({
  ai: createFilterWeightDraft(),
  hot: createFilterWeightDraft()
});
const providerForm = reactive({
  providerKind: "deepseek" as SettingsProviderKind | string,
  apiKey: ""
});

const aiFilterRule = computed(() => workbench.value?.filterWorkbench.aiRule ?? null);
const hotFilterRule = computed(() => workbench.value?.filterWorkbench.hotRule ?? null);
const aiPrioritySourceNames = Object.values(BUILTIN_SOURCES)
  .filter((source) => source.navigationViews.includes("ai"))
  .map((source) => source.name);
const hotPrioritySourceNames = Object.values(BUILTIN_SOURCES)
  .filter((source) => source.navigationViews.includes("hot"))
  .map((source) => source.name);
const aiSignalExamples = ["AI", "LLM", "GPT", "Agent", "Model", "OpenAI", "Claude", "DeepSeek", "大模型", "智能体"];
const heatSignalExamples = ["发布", "上线", "更新", "快讯", "周报", "热点", "洞察", "launch", "release", "update", "analysis"];

const providerCapabilityTone = computed<AlertTone>(() => {
  if (!workbench.value) {
    return "info";
  }

  if (!workbench.value.providerCapability.hasMasterKey) {
    return "warning";
  }

  return "info";
});

const enabledProviderSettings = computed(
  () => (workbench.value?.providerSettings ?? []).find((settings) => settings.isEnabled) ?? null
);

const selectedProviderSettings = computed(() => {
  return (
    (workbench.value?.providerSettings ?? []).find((settings) => settings.providerKind === providerForm.providerKind) ?? null
  );
});

const selectedProviderStatus = computed(() => {
  const selectedProviderLabel = formatProviderLabel(providerForm.providerKind);
  const statusLabel = readProviderStatusLabel(selectedProviderSettings.value);
  const enabledProviderLabel = formatProviderLabel(enabledProviderSettings.value?.providerKind);

  if (statusLabel === "已配置并启用") {
    return {
      tone: "success",
      message: `${selectedProviderLabel} 当前已配置并启用，但当前版本还不会把它接入反馈池或筛选逻辑。`
    } as const;
  }

  if (statusLabel === "已保存未启用") {
    return {
      tone: "warning",
      message: `${selectedProviderLabel} 当前已保存，但还没有启用。即使启用后，当前版本也只会保留配置，不会参与页面筛选。`
    } as const;
  }

  return {
    tone: "info",
    message: enabledProviderSettings.value
      ? `${selectedProviderLabel} 当前未配置；先保存 API Key，之后可以单独启用。当前已启用厂商是 ${enabledProviderLabel}。`
      : `${selectedProviderLabel} 当前未配置；先保存 API Key，之后可以单独启用。`
  } as const;
});

const feedbackCopyText = computed(() =>
  (workbench.value?.feedbackPool ?? []).map((entry) => buildFeedbackCopyText(entry)).join("\n\n---\n\n")
);

function createFilterToggleDraft(): SettingsContentFilterToggles {
  return {
    enableTimeWindow: false,
    enableSourceViewBonus: true,
    enableAiKeywordWeight: true,
    enableHeatKeywordWeight: true,
    enableFreshnessWeight: true,
    enableScoreRanking: true
  };
}

function createFilterWeightDraft(): SettingsContentFilterWeights {
  return {
    freshnessWeight: 0,
    sourceWeight: 0,
    completenessWeight: 0,
    aiWeight: 0,
    heatWeight: 0
  };
}

function syncFilterForms(nextWorkbench: SettingsViewRulesResponse | null): void {
  if (!nextWorkbench) {
    return;
  }

  filterForms.ai = { ...nextWorkbench.filterWorkbench.aiRule.toggles };
  filterForms.hot = { ...nextWorkbench.filterWorkbench.hotRule.toggles };
  filterWeightForms.ai = { ...nextWorkbench.filterWorkbench.aiRule.weights };
  filterWeightForms.hot = { ...nextWorkbench.filterWorkbench.hotRule.weights };
}

function readFilterOverviewItems(rule: SettingsContentFilterRule): string[] {
  return rule.ruleKey === "ai"
    ? [
        `只看最近 24 小时 ${formatToggleText(rule.toggles.enableTimeWindow)}`,
        `AI 新讯重点来源优先 ${formatToggleText(rule.toggles.enableSourceViewBonus)}`,
        `AI 内容优先 ${formatToggleText(rule.toggles.enableAiKeywordWeight)}`,
        `热点词优先 ${formatToggleText(rule.toggles.enableHeatKeywordWeight)}`,
        `按综合分排序 ${formatToggleText(rule.toggles.enableScoreRanking)}`
      ]
    : [
        `AI 热点重点来源优先 ${formatToggleText(rule.toggles.enableSourceViewBonus)}`,
        `AI 内容优先 ${formatToggleText(rule.toggles.enableAiKeywordWeight)}`,
        `热点词优先 ${formatToggleText(rule.toggles.enableHeatKeywordWeight)}`,
        `新内容优先 ${formatToggleText(rule.toggles.enableFreshnessWeight)}`,
        `按综合分排序 ${formatToggleText(rule.toggles.enableScoreRanking)}`
      ];
}

function readFilterWeightItems(rule: SettingsContentFilterRule) {
  return [
    `新内容影响 ${formatWeightPoints(rule.weights.freshnessWeight)} 分`,
    `重点来源影响 ${formatWeightPoints(rule.weights.sourceWeight)} 分`,
    `内容完整度影响 ${formatWeightPoints(rule.weights.completenessWeight)} 分`,
    `AI 内容影响 ${formatWeightPoints(rule.weights.aiWeight)} 分`,
    `热点词影响 ${formatWeightPoints(rule.weights.heatWeight)} 分`
  ];
}

function readEditableWeightItems(ruleKey: FilterRuleKey) {
  return [
    {
      key: "freshnessWeight",
      label: "新内容影响",
      description: "发布时间越近，这一项加分越明显。",
      value: filterWeightForms[ruleKey].freshnessWeight
    },
    {
      key: "sourceWeight",
      label: "重点来源影响",
      description: "越偏向这个页面的重点来源，这一项影响越大。",
      value: filterWeightForms[ruleKey].sourceWeight
    },
    {
      key: "completenessWeight",
      label: "内容完整度影响",
      description: "标题、摘要、正文越完整，这一项影响越大。",
      value: filterWeightForms[ruleKey].completenessWeight
    },
    {
      key: "aiWeight",
      label: "AI 内容影响",
      description: "越像 AI 内容，这一项影响越大。",
      value: filterWeightForms[ruleKey].aiWeight
    },
    {
      key: "heatWeight",
      label: "热点词影响",
      description: "越命中热点词，这一项影响越大。",
      value: filterWeightForms[ruleKey].heatWeight
    }
  ] as const;
}

function readWeightTotal(ruleKey: FilterRuleKey) {
  const weights = filterWeightForms[ruleKey];

  return (
    weights.freshnessWeight +
    weights.sourceWeight +
    weights.completenessWeight +
    weights.aiWeight +
    weights.heatWeight
  );
}

function formatWeightRatio(ruleKey: FilterRuleKey, value: number) {
  const total = readWeightTotal(ruleKey);

  if (total <= 0) {
    return "0%";
  }

  return `${((value / total) * 100).toFixed(0)}%`;
}

function normalizeWeightInput(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Number(value.toFixed(2));
}

function convertStoredWeightToPoints(value: number): number {
  return Math.round(value * weightDisplayScale);
}

function convertPointsToStoredWeight(value: number): number {
  return normalizeWeightInput(value / weightDisplayScale);
}

function formatWeightPoints(value: number): string {
  return convertStoredWeightToPoints(value).toString();
}

function formatWeightTotal(ruleKey: FilterRuleKey) {
  return convertStoredWeightToPoints(readWeightTotal(ruleKey)).toString();
}

function handleWeightInput(ruleKey: FilterRuleKey, weightKey: FilterWeightKey, value: number | null): void {
  const nextPoints = typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  filterWeightForms[ruleKey][weightKey] = convertPointsToStoredWeight(nextPoints);
}

function formatToggleText(enabled: boolean) {
  return enabled ? "开" : "关";
}

// 页内提示统一从这里走，避免每个动作各自拼 message 分支而把交互结果写散。
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

function setPendingAction(actionKey: string, isPending: boolean): void {
  pendingActions[actionKey] = isPending;
}

function isActionPending(actionKey: string): boolean {
  return pendingActions[actionKey] === true;
}

function formatProviderLabel(providerKind: string | null | undefined): string {
  if (providerKind === "deepseek") {
    return "DeepSeek";
  }

  if (providerKind === "minimax") {
    return "MiniMax";
  }

  if (providerKind === "kimi") {
    return "Kimi";
  }

  return providerKind?.trim() ? providerKind : "未设置";
}

function readProviderStatusLabel(settings: SettingsProviderSettingsSummary | null): string {
  if (!settings) {
    return "未配置";
  }

  return settings.isEnabled ? "已配置并启用" : "已保存未启用";
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "暂无记录";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "暂无记录";
  }

  return parsedDate.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatFeedbackKeywords(label: string, keywords: string[]): string | null {
  return keywords.length > 0 ? `${label}：${keywords.join("、")}` : null;
}

function buildFeedbackCopyText(entry: SettingsFeedbackPoolItem): string {
  const lines = [
    `标题：${entry.contentTitle}`,
    `来源：${entry.sourceName}`,
    `链接：${entry.canonicalUrl}`,
    `反馈词：${entry.freeText?.trim() || "未填写"}`
  ];
  const effectLine = entry.suggestedEffect?.trim() ? `建议效果：${entry.suggestedEffect.trim()}` : null;
  const strengthLine = entry.strengthLevel?.trim() ? `强度：${entry.strengthLevel.trim()}` : null;
  const positiveLine = formatFeedbackKeywords("正向关键词", entry.positiveKeywords);
  const negativeLine = formatFeedbackKeywords("负向关键词", entry.negativeKeywords);

  return [effectLine, strengthLine, positiveLine, negativeLine]
    .reduce((allLines, line) => (line ? [...allLines, line] : allLines), lines)
    .join("\n");
}

function resolveActionErrorMessage(
  error: unknown,
  fallbackMessage: string,
  reasonMessages: Record<string, string> = {}
): string {
  if (error instanceof HttpError) {
    const responseBody = typeof error.body === "object" && error.body !== null ? (error.body as Record<string, unknown>) : null;
    const reason = responseBody?.reason;

    if (typeof reason === "string" && reasonMessages[reason]) {
      return reasonMessages[reason];
    }

    if (typeof responseBody?.message === "string" && responseBody.message.trim()) {
      return responseBody.message;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallbackMessage;
}

// 读取工作台时同步把 loading / refresh 状态收口，避免页面初次加载和动作后的刷新提示不一致。
async function loadWorkbench(options: { silent?: boolean } = {}): Promise<void> {
  if (options.silent) {
    isRefreshing.value = true;
  } else {
    isLoading.value = true;
    loadError.value = null;
  }

  try {
    const nextWorkbench = await readSettingsViewRules();
    workbench.value = nextWorkbench;
    syncFilterForms(nextWorkbench);
  } catch (error) {
    const failureMessage = resolveActionErrorMessage(error, "筛选策略页面加载失败，请稍后再试。");

    if (options.silent) {
      showNotice("error", failureMessage);
    } else {
      loadError.value = failureMessage;
    }
  } finally {
    isLoading.value = false;
    isRefreshing.value = false;
  }
}

// 工作台里的写操作统一从这里包一层，保持 pending、提示文案和刷新时机一致。
async function runWorkbenchAction<T>(
  actionKey: string,
  action: () => Promise<T>,
  options: {
    successMessage: string;
    fallbackMessage: string;
    reasonMessages?: Record<string, string>;
    refreshAfter?: boolean;
    afterSuccess?: (result: T) => void;
  }
): Promise<void> {
  setPendingAction(actionKey, true);

  try {
    const result = await action();

    options.afterSuccess?.(result);
    showNotice("success", options.successMessage);

    if (options.refreshAfter !== false) {
      await loadWorkbench({ silent: true });
    }
  } catch (error) {
    showNotice("error", resolveActionErrorMessage(error, options.fallbackMessage, options.reasonMessages));
  } finally {
    setPendingAction(actionKey, false);
  }
}

async function handleProviderSave(): Promise<void> {
  const providerKind = providerForm.providerKind.trim();
  const apiKey = providerForm.apiKey.trim();

  if (!providerKind || !apiKey) {
    showNotice("warning", "请选择厂商并填写 API Key。");
    return;
  }

  await runWorkbenchAction(
    `provider:save:${providerKind}`,
    () => saveProviderSettings({ providerKind, apiKey }),
    {
      successMessage: `${formatProviderLabel(providerKind)} 配置已保存。当前版本先只保留配置，不参与筛选策略。`,
      fallbackMessage: "保存厂商配置失败，请稍后再试。",
      afterSuccess: () => {
        providerForm.apiKey = "";
      }
    }
  );
}

async function handleSaveContentFilterRule(ruleKey: FilterRuleKey): Promise<void> {
  await runWorkbenchAction(
    `content-filter:save:${ruleKey}`,
    () =>
      saveContentFilterRule({
        ruleKey,
        toggles: { ...filterForms[ruleKey] },
        weights: { ...filterWeightForms[ruleKey] }
      }),
    {
      successMessage: `${ruleKey === "ai" ? "AI 新讯" : "AI 热点"} 筛选开关已保存。`,
      fallbackMessage: "保存内容筛选开关失败，请稍后再试。"
    }
  );
}

async function handleToggleProviderActivation(settings: SettingsProviderSettingsSummary): Promise<void> {
  const nextEnabled = !settings.isEnabled;

  await runWorkbenchAction(
    `provider:activation:${settings.providerKind}`,
    () =>
      updateProviderSettingsActivation({
        providerKind: settings.providerKind,
        enable: nextEnabled
      }),
    {
      successMessage: nextEnabled
        ? `${formatProviderLabel(settings.providerKind)} 已启用。当前版本仍只会保留这份配置，不会参与反馈池处理。`
        : `${formatProviderLabel(settings.providerKind)} 已停用。`,
      fallbackMessage: "更新厂商启用状态失败，请稍后再试。"
    }
  );
}

async function handleDeleteProvider(providerKind: string): Promise<void> {
  await runWorkbenchAction(
    `provider:delete:${providerKind}`,
    () => deleteProviderSettings(providerKind),
    {
      successMessage: `${formatProviderLabel(providerKind)} 配置已删除。`,
      fallbackMessage: "删除厂商配置失败，请稍后再试。"
    }
  );
}

async function handleCopyFeedbackPool(): Promise<void> {
  if (!feedbackCopyText.value.trim()) {
    showNotice("warning", "反馈池当前为空，没有可复制的反馈词。");
    return;
  }

  try {
    await navigator.clipboard.writeText(feedbackCopyText.value);
    showNotice("success", "已复制全部反馈词。");
  } catch {
    showNotice("error", "复制全部反馈词失败，请稍后再试。");
  }
}

async function handleDeleteFeedback(feedbackId: number): Promise<void> {
  await runWorkbenchAction(
    `feedback:delete:${feedbackId}`,
    () => deleteFeedbackEntry(feedbackId),
    {
      successMessage: "该条反馈词已删除。",
      fallbackMessage: "删除反馈词失败，请稍后再试。"
    }
  );
}

async function handleClearFeedback(): Promise<void> {
  await runWorkbenchAction("feedback:clear", () => clearFeedbackPool(), {
    successMessage: "反馈池已清空。",
    fallbackMessage: "清空反馈池失败，请稍后再试。"
  });
}

onMounted(() => {
  void loadWorkbench();
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
        @close="pageNotice = null"
      />

      <a-skeleton v-if="isLoading" active :paragraph="{ rows: 10 }" />

      <a-result
        v-else-if="loadError"
        status="error"
        title="筛选策略页面加载失败"
        :sub-title="loadError"
      >
        <template #extra>
          <a-button type="primary" @click="loadWorkbench()">重新加载</a-button>
        </template>
      </a-result>

      <template v-else-if="workbench">
        <section class="flex flex-col gap-3" data-settings-section="filter-overview">
          <div class="flex flex-col gap-1">
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">当前筛选总览</p>
            <h2 class="m-0 text-xl font-semibold text-editorial-text-main">先看看现在是怎么排的</h2>
            <p class="m-0 text-sm leading-6 text-editorial-text-body">
              这里先告诉你现在 AI 新讯和 AI 热点是按什么规则排的。你改完下面的开关再保存，系统就会按新设置来排。
            </p>
          </div>

          <div class="grid gap-3 lg:grid-cols-2" data-settings-section="overview">
            <article
              v-if="aiFilterRule"
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4"
              data-filter-overview-card="ai"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">AI 新讯</p>
                  <p class="mt-2 mb-0 text-base font-semibold text-editorial-text-main">{{ aiFilterRule.displayName }}</p>
                </div>
                <a-tag color="blue">现在按这个来</a-tag>
              </div>
              <p class="mt-3 mb-0 text-sm leading-6 text-editorial-text-body">{{ aiFilterRule.summary }}</p>
              <div class="mt-3 flex flex-wrap gap-2">
                <a-tag v-for="item in readFilterOverviewItems(aiFilterRule)" :key="`ai:${item}`">{{ item }}</a-tag>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <a-tag v-for="item in readFilterWeightItems(aiFilterRule)" :key="`ai-weight:${item}`" color="default">{{ item }}</a-tag>
              </div>
            </article>

            <article
              v-if="hotFilterRule"
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4"
              data-filter-overview-card="hot"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">AI 热点</p>
                  <p class="mt-2 mb-0 text-base font-semibold text-editorial-text-main">{{ hotFilterRule.displayName }}</p>
                </div>
                <a-tag color="blue">现在按这个来</a-tag>
              </div>
              <p class="mt-3 mb-0 text-sm leading-6 text-editorial-text-body">{{ hotFilterRule.summary }}</p>
              <div class="mt-3 flex flex-wrap gap-2">
                <a-tag v-for="item in readFilterOverviewItems(hotFilterRule)" :key="`hot:${item}`">{{ item }}</a-tag>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <a-tag v-for="item in readFilterWeightItems(hotFilterRule)" :key="`hot-weight:${item}`" color="default">{{ item }}</a-tag>
              </div>
            </article>
          </div>
        </section>

        <section class="flex flex-col gap-3" data-settings-section="filter-glossary">
          <div class="flex flex-col gap-1">
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">名词解释</p>
            <h2 class="m-0 text-xl font-semibold text-editorial-text-main">这些词到底是什么意思</h2>
            <p class="m-0 text-sm leading-6 text-editorial-text-body">
              下面这些解释就是系统现在真实在用的判断方式。你以后自己调开关时，可以直接照着这里理解，不用再猜术语是什么意思。
            </p>
          </div>

          <div class="grid gap-3 lg:grid-cols-2">
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
              <p class="m-0 text-sm font-semibold text-editorial-text-main">AI 新讯里的重点来源</p>
              <p class="mt-2 mb-0 text-sm leading-6 text-editorial-text-body">
                这不是你手动勾选的来源，而是系统预先认定更适合放在 “AI 新讯” 里的来源。打开相关开关后，这些来源的内容会更容易排前面。
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <a-tag v-for="sourceName in aiPrioritySourceNames" :key="`ai-priority:${sourceName}`">{{ sourceName }}</a-tag>
              </div>
            </article>

            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
              <p class="m-0 text-sm font-semibold text-editorial-text-main">AI 热点里的重点来源</p>
              <p class="mt-2 mb-0 text-sm leading-6 text-editorial-text-body">
                这也是系统预先认定更适合放在 “AI 热点” 里的来源。打开相关开关后，这些来源的内容会更容易排前面。
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <a-tag v-for="sourceName in hotPrioritySourceNames" :key="`hot-priority:${sourceName}`">{{ sourceName }}</a-tag>
              </div>
            </article>

            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
              <p class="m-0 text-sm font-semibold text-editorial-text-main">什么叫 AI 相关内容</p>
              <p class="mt-2 mb-0 text-sm leading-6 text-editorial-text-body">
                系统会看标题、摘要、正文里是不是更像在讲 AI，比如模型、Agent、产品更新、应用案例、大模型、智能体这些内容。越像 AI 内容，越容易排前面。
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <a-tag v-for="keyword in aiSignalExamples" :key="`ai-signal:${keyword}`">{{ keyword }}</a-tag>
              </div>
            </article>

            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
              <p class="m-0 text-sm font-semibold text-editorial-text-main">什么叫热点词</p>
              <p class="mt-2 mb-0 text-sm leading-6 text-editorial-text-body">
                系统会看标题、摘要、正文里有没有一组内置热词，比如发布、上线、更新、快讯、周报、热点、洞察，以及 launch、release、update、analysis 这些词。命中越多，越容易排前面。
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <a-tag v-for="keyword in heatSignalExamples" :key="`heat-signal:${keyword}`">{{ keyword }}</a-tag>
              </div>
            </article>

            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
              <p class="m-0 text-sm font-semibold text-editorial-text-main">什么叫新内容</p>
              <p class="mt-2 mb-0 text-sm leading-6 text-editorial-text-body">
                就是发布时间更近的内容。系统现在主要按发布时间判断，越新越容易排前面；时间越久，这一项的影响会越来越小。
              </p>
            </article>

            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
              <p class="m-0 text-sm font-semibold text-editorial-text-main">什么叫综合分</p>
              <p class="mt-2 mb-0 text-sm leading-6 text-editorial-text-body">
                这不是人工打分，而是系统把重点来源、内容完整度、AI 相关度、热点词、新内容这些因素一起算出来的总分。打开“按综合分排序”后，会优先按这个总分排。
              </p>
            </article>
          </div>
        </section>

        <section data-settings-section="filter-ai">
          <a-card :class="editorialContentCardClass" title="AI 新讯怎么排" size="small">
            <div v-if="aiFilterRule" class="flex flex-col gap-4">
              <p class="m-0 text-sm leading-6 text-editorial-text-body">
                {{ aiFilterRule.summary }}
              </p>
              <p class="m-0 text-xs leading-5 text-editorial-text-muted">
                下面这些数字表示每一项对排序的影响大小。数字越大，这一项越能左右最后的排序结果。
              </p>

              <div class="grid gap-3 md:grid-cols-2">
                <div
                  class="flex items-start justify-between gap-3 rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4"
                  data-filter-toggle-card="ai:timeWindow"
                >
                  <div>
                    <p class="m-0 text-sm font-semibold text-editorial-text-main">只看最近 24 小时</p>
                    <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">打开后，只保留最近 24 小时的内容。</p>
                  </div>
                  <a-switch v-model:checked="filterForms.ai.enableTimeWindow" data-filter-toggle-switch="ai:timeWindow" />
                </div>
                <div
                  class="flex items-start justify-between gap-3 rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4"
                  data-filter-toggle-card="ai:sourceViewBonus"
                >
                  <div>
                    <p class="m-0 text-sm font-semibold text-editorial-text-main">优先显示 AI 新讯的重点来源</p>
                    <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">这里的重点来源，是系统预先认定更适合放在 AI 新讯里的来源，比如 OpenAI、Google AI、TechCrunch AI、爱范儿这些。</p>
                  </div>
                  <a-switch v-model:checked="filterForms.ai.enableSourceViewBonus" data-filter-toggle-switch="ai:sourceViewBonus" />
                </div>
                <div
                  class="flex items-start justify-between gap-3 rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4"
                  data-filter-toggle-card="ai:aiKeywordWeight"
                >
                  <div>
                    <p class="m-0 text-sm font-semibold text-editorial-text-main">更看重 AI 相关内容</p>
                    <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">系统会看标题、摘要、正文里有没有模型、Agent、产品更新、大模型、智能体这类信号。越像 AI 内容，越容易排前面。</p>
                  </div>
                  <a-switch v-model:checked="filterForms.ai.enableAiKeywordWeight" data-filter-toggle-switch="ai:aiKeywordWeight" />
                </div>
                <div
                  class="flex items-start justify-between gap-3 rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4"
                  data-filter-toggle-card="ai:heatKeywordWeight"
                >
                  <div>
                    <p class="m-0 text-sm font-semibold text-editorial-text-main">更看重热点词</p>
                    <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">系统会看标题、摘要、正文里有没有“发布、上线、更新、快讯、周报、launch、release”这类词。命中越多，越容易排前面。</p>
                  </div>
                  <a-switch v-model:checked="filterForms.ai.enableHeatKeywordWeight" data-filter-toggle-switch="ai:heatKeywordWeight" />
                </div>
                <div
                  class="flex items-start justify-between gap-3 rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4 md:col-span-2"
                  data-filter-toggle-card="ai:scoreRanking"
                >
                  <div>
                    <p class="m-0 text-sm font-semibold text-editorial-text-main">按综合分排序</p>
                    <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">综合分会把重点来源、内容完整度、AI 相关度、热点词这些因素一起算进去。打开后按总分排；关闭后改回按发布时间排。</p>
                  </div>
                  <a-switch v-model:checked="filterForms.ai.enableScoreRanking" data-filter-toggle-switch="ai:scoreRanking" />
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                <a-tag v-for="item in readFilterWeightItems(aiFilterRule)" :key="`ai-inline-weight:${item}`">{{ item }}</a-tag>
              </div>

              <div class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4" data-filter-weight-editor="ai">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p class="m-0 text-sm font-semibold text-editorial-text-main">调整排序分值</p>
                    <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">
                      这 5 项加起来的当前总分是 {{ formatWeightTotal("ai") }} 分。总分只是方便你判断占比，不要求必须等于 100 分。
                    </p>
                  </div>
                  <a-tag color="blue">{{ `当前总分 ${formatWeightTotal("ai")} 分` }}</a-tag>
                </div>

                <div class="mt-4 grid gap-3 md:grid-cols-2">
                  <div
                    v-for="item in readEditableWeightItems('ai')"
                    :key="`ai-weight-input:${item.key}`"
                    class="rounded-editorial-md border border-editorial-border bg-editorial-link px-4 py-4"
                  >
                    <div class="flex flex-col gap-3">
                      <div>
                        <p class="m-0 text-sm font-semibold text-editorial-text-main">{{ item.label }}</p>
                        <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">{{ item.description }}</p>
                      </div>
                      <div class="flex flex-wrap items-center gap-3">
                        <span class="text-xs font-medium text-editorial-text-body">直接输入分值</span>
                        <a-input-number
                          :value="convertStoredWeightToPoints(item.value)"
                          :min="0"
                          :step="1"
                          :precision="0"
                          size="small"
                          class="editorial-weight-input"
                          :data-weight-input="`ai:${item.key}`"
                          @update:value="handleWeightInput('ai', item.key, $event)"
                        />
                      </div>
                    </div>
                    <p class="mt-3 mb-0 text-xs leading-5 text-editorial-text-muted">
                      {{ `当前分值 ${formatWeightPoints(item.value)} 分，约占总分 ${formatWeightRatio('ai', item.value)}` }}
                    </p>
                  </div>
                </div>
              </div>

              <div class="flex justify-end">
                <a-button
                  type="primary"
                  data-save-content-filter="ai"
                  :loading="isActionPending('content-filter:save:ai')"
                  @click="handleSaveContentFilterRule('ai')"
                >
                  保存 AI 新讯设置
                </a-button>
              </div>
            </div>
          </a-card>
        </section>

        <section data-settings-section="filter-hot">
          <a-card :class="editorialContentCardClass" title="AI 热点怎么排" size="small">
            <div v-if="hotFilterRule" class="flex flex-col gap-4">
              <p class="m-0 text-sm leading-6 text-editorial-text-body">
                {{ hotFilterRule.summary }}
              </p>
              <p class="m-0 text-xs leading-5 text-editorial-text-muted">
                下面这些数字表示每一项对排序的影响大小。数字越大，这一项越能左右最后的排序结果。
              </p>

              <div class="grid gap-3 md:grid-cols-2">
                <div
                  class="flex items-start justify-between gap-3 rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4"
                  data-filter-toggle-card="hot:sourceViewBonus"
                >
                  <div>
                    <p class="m-0 text-sm font-semibold text-editorial-text-main">优先显示 AI 热点的重点来源</p>
                    <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">这里的重点来源，是系统预先认定更适合放在 AI 热点里的来源，比如 36氪、36氪快讯、虎嗅网、创业邦这些。</p>
                  </div>
                  <a-switch v-model:checked="filterForms.hot.enableSourceViewBonus" data-filter-toggle-switch="hot:sourceViewBonus" />
                </div>
                <div
                  class="flex items-start justify-between gap-3 rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4"
                  data-filter-toggle-card="hot:aiKeywordWeight"
                >
                  <div>
                    <p class="m-0 text-sm font-semibold text-editorial-text-main">更看重 AI 相关内容</p>
                    <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">系统会看标题、摘要、正文里是不是更像在讲模型、Agent、AI 产品更新、AI 应用案例这类内容。</p>
                  </div>
                  <a-switch v-model:checked="filterForms.hot.enableAiKeywordWeight" data-filter-toggle-switch="hot:aiKeywordWeight" />
                </div>
                <div
                  class="flex items-start justify-between gap-3 rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4"
                  data-filter-toggle-card="hot:heatKeywordWeight"
                >
                  <div>
                    <p class="m-0 text-sm font-semibold text-editorial-text-main">更看重热点词</p>
                    <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">系统会看标题、摘要、正文里有没有“发布、上线、更新、快讯、周报、热点、analysis”这类热词。命中越多，越容易排前面。</p>
                  </div>
                  <a-switch v-model:checked="filterForms.hot.enableHeatKeywordWeight" data-filter-toggle-switch="hot:heatKeywordWeight" />
                </div>
                <div
                  class="flex items-start justify-between gap-3 rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4"
                  data-filter-toggle-card="hot:freshnessWeight"
                >
                  <div>
                    <p class="m-0 text-sm font-semibold text-editorial-text-main">更看重新内容</p>
                    <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">这里的新内容，就是发布时间更近的内容。系统主要按发布时间判断，越新越容易排前面。</p>
                  </div>
                  <a-switch v-model:checked="filterForms.hot.enableFreshnessWeight" data-filter-toggle-switch="hot:freshnessWeight" />
                </div>
                <div
                  class="flex items-start justify-between gap-3 rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4 md:col-span-2"
                  data-filter-toggle-card="hot:scoreRanking"
                >
                  <div>
                    <p class="m-0 text-sm font-semibold text-editorial-text-main">按综合分排序</p>
                    <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">综合分会把重点来源、内容完整度、AI 相关度、热点词、新内容这些因素一起算进去。打开后按总分排；关闭后改回按发布时间排。</p>
                  </div>
                  <a-switch v-model:checked="filterForms.hot.enableScoreRanking" data-filter-toggle-switch="hot:scoreRanking" />
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                <a-tag v-for="item in readFilterWeightItems(hotFilterRule)" :key="`hot-inline-weight:${item}`">{{ item }}</a-tag>
              </div>

              <div class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4" data-filter-weight-editor="hot">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p class="m-0 text-sm font-semibold text-editorial-text-main">调整排序分值</p>
                    <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">
                      这 5 项加起来的当前总分是 {{ formatWeightTotal("hot") }} 分。总分只是方便你判断占比，不要求必须等于 100 分。
                    </p>
                  </div>
                  <a-tag color="blue">{{ `当前总分 ${formatWeightTotal("hot")} 分` }}</a-tag>
                </div>

                <div class="mt-4 grid gap-3 md:grid-cols-2">
                  <div
                    v-for="item in readEditableWeightItems('hot')"
                    :key="`hot-weight-input:${item.key}`"
                    class="rounded-editorial-md border border-editorial-border bg-editorial-link px-4 py-4"
                  >
                    <div class="flex flex-col gap-3">
                      <div>
                        <p class="m-0 text-sm font-semibold text-editorial-text-main">{{ item.label }}</p>
                        <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">{{ item.description }}</p>
                      </div>
                      <div class="flex flex-wrap items-center gap-3">
                        <span class="text-xs font-medium text-editorial-text-body">直接输入分值</span>
                        <a-input-number
                          :value="convertStoredWeightToPoints(item.value)"
                          :min="0"
                          :step="1"
                          :precision="0"
                          size="small"
                          class="editorial-weight-input"
                          :data-weight-input="`hot:${item.key}`"
                          @update:value="handleWeightInput('hot', item.key, $event)"
                        />
                      </div>
                    </div>
                    <p class="mt-3 mb-0 text-xs leading-5 text-editorial-text-muted">
                      {{ `当前分值 ${formatWeightPoints(item.value)} 分，约占总分 ${formatWeightRatio('hot', item.value)}` }}
                    </p>
                  </div>
                </div>
              </div>

              <div class="flex justify-end">
                <a-button
                  type="primary"
                  data-save-content-filter="hot"
                  :loading="isActionPending('content-filter:save:hot')"
                  @click="handleSaveContentFilterRule('hot')"
                >
                  保存 AI 热点设置
                </a-button>
              </div>
            </div>
          </a-card>
        </section>

        <section data-settings-section="feedback-pool">
          <a-card :class="editorialContentCardClass" title="反馈池" size="small" data-view-rules-section="feedback-pool">
            <template #extra>
              <div class="flex flex-wrap items-center justify-end gap-2">
                <a-button
                  :class="[editorialContentControlButtonClass, editorialContentControlButtonIdleClass]"
                  data-action="copy-feedback-pool"
                  :disabled="workbench.feedbackPool.length === 0"
                  @click="handleCopyFeedbackPool"
                >
                  复制全部反馈
                </a-button>
                <a-button
                  :class="[editorialContentControlButtonClass, editorialContentControlButtonDangerClass]"
                  data-action="clear-feedback-pool"
                  :disabled="workbench.feedbackPool.length === 0 || isActionPending('feedback:clear')"
                  :loading="isActionPending('feedback:clear')"
                  @click="handleClearFeedback"
                >
                  清空全部反馈
                </a-button>
              </div>
            </template>

            <div class="flex flex-col gap-4">
              <p class="m-0 text-sm leading-6 text-editorial-text-body">
                这里集中查看、整理和清理内容页写入的反馈词。当前版本不会再把这些反馈词转成草稿、正式规则或重算任务。
              </p>

              <EditorialEmptyState
                v-if="workbench.feedbackPool.length === 0"
                data-empty-state="feedback-pool"
                title="反馈池为空"
                description="反馈池为空，内容页提交的新反馈词会显示在这里。"
              />

              <div v-else class="flex flex-col gap-3">
                <article
                  v-for="entry in workbench.feedbackPool"
                  :key="entry.id"
                  data-feedback-row
                  :data-feedback-id="entry.id"
                  class="flex flex-col gap-3 rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="m-0 text-base font-semibold text-editorial-text-main">
                          {{ entry.contentTitle }}
                        </h3>
                        <a-tag>{{ entry.sourceName }}</a-tag>
                      </div>
                      <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-muted">
                        更新时间：{{ formatDateTime(entry.updatedAt) }}
                      </p>
                      <a
                        :href="entry.canonicalUrl"
                        target="_blank"
                        rel="noreferrer"
                        class="mt-2 inline-block break-all text-xs text-editorial-text-muted underline underline-offset-2"
                      >
                        {{ entry.canonicalUrl }}
                      </a>
                    </div>
                    <a-button
                      :class="[editorialContentControlButtonClass, editorialContentControlButtonDangerClass]"
                      data-action="delete-feedback"
                      :data-feedback-delete="entry.id"
                      :loading="isActionPending(`feedback:delete:${entry.id}`)"
                      @click="handleDeleteFeedback(entry.id)"
                    >
                      删除
                    </a-button>
                  </div>

                  <div class="rounded-editorial-md border border-editorial-border bg-editorial-link px-4 py-3">
                    <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">反馈词</p>
                    <p class="mt-2 mb-0 text-sm leading-6 text-editorial-text-main">
                      {{ entry.freeText?.trim() || "这条反馈暂时只保存了结构化信息，还没有补充自由文本。" }}
                    </p>
                  </div>

                  <div class="flex flex-wrap gap-2 text-xs leading-5 text-editorial-text-body">
                    <a-tag v-if="entry.suggestedEffect?.trim()">{{ `建议效果：${entry.suggestedEffect.trim()}` }}</a-tag>
                    <a-tag v-if="entry.strengthLevel?.trim()">{{ `强度：${entry.strengthLevel.trim()}` }}</a-tag>
                    <a-tag v-for="keyword in entry.positiveKeywords" :key="`positive:${entry.id}:${keyword}`">
                      {{ `正向：${keyword}` }}
                    </a-tag>
                    <a-tag v-for="keyword in entry.negativeKeywords" :key="`negative:${entry.id}:${keyword}`">
                      {{ `负向：${keyword}` }}
                    </a-tag>
                  </div>
                </article>
              </div>
            </div>
          </a-card>
        </section>

        <section data-settings-section="provider-settings">
          <a-card
            :class="editorialContentCardClass"
            title="LLM 设置"
            size="small"
            data-view-rules-section="provider-settings"
          >
            <template #extra>
              <a-tag color="default">暂未使用</a-tag>
            </template>

            <div class="flex flex-col gap-4">
              <a-alert
                data-view-rules-provider-alert
                :class="['editorial-inline-alert', `editorial-inline-alert--${providerCapabilityTone}`]"
                :message="'当前版本会继续保存厂商配置，但不会把它用于筛选策略或重算。'"
                :description="workbench.providerCapability.message"
                show-icon
              />

              <div class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
                <p data-view-rules-provider-status-note class="m-0 text-sm leading-6 text-editorial-text-body">
                  当前只保留配置入口，后续真正接入时会直接复用这里的厂商设置；现在保存、启用或删除都不会影响反馈池展示。
                </p>

                <a-alert
                  data-view-rules-selected-provider-status
                  :class="['mt-4 editorial-inline-alert', `editorial-inline-alert--${selectedProviderStatus.tone}`]"
                  :message="selectedProviderStatus.message"
                  :type="selectedProviderStatus.tone"
                  show-icon
                />

                <form
                  class="mt-4 grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto]"
                  data-view-rules-provider-form
                  @submit.prevent="handleProviderSave"
                >
                  <a-select
                    v-model:value="providerForm.providerKind"
                    :options="providerKindOptions"
                    data-provider-kind-input
                  />
                  <a-input-password
                    v-model:value="providerForm.apiKey"
                    placeholder="输入或更新 API Key"
                    data-provider-api-key-input
                  />
                  <a-button
                    type="primary"
                    html-type="submit"
                    data-action="save-provider-settings"
                    :loading="isActionPending(`provider:save:${providerForm.providerKind}`)"
                  >
                    保存设置
                  </a-button>
                </form>
              </div>

              <EditorialEmptyState
                v-if="workbench.providerSettings.length === 0"
                data-empty-state="provider-settings"
                title="还没有保存任何厂商配置"
                description="先保存 API Key，后续真正接入筛选逻辑时会直接复用这里的配置。"
              />

              <div v-else class="flex flex-col gap-3">
                <article
                  v-for="settings in workbench.providerSettings"
                  :key="settings.providerKind"
                  :data-provider-row="settings.providerKind"
                  class="flex flex-col gap-3 rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="m-0 text-base font-semibold text-editorial-text-main">
                          {{ formatProviderLabel(settings.providerKind) }}
                        </h3>
                        <a-tag :color="settings.isEnabled ? 'green' : 'default'">
                          {{ settings.isEnabled ? "已启用" : "未启用" }}
                        </a-tag>
                      </div>
                      <p class="mt-2 mb-0 text-sm leading-6 text-editorial-text-body">
                        已保存 API Key，尾号 {{ settings.apiKeyLast4 }}。
                      </p>
                      <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">
                        最近更新：{{ formatDateTime(settings.updatedAt) }}
                      </p>
                    </div>

                    <div class="flex flex-wrap items-center gap-2">
                      <a-button
                        :class="[editorialContentControlButtonClass, editorialContentControlButtonIdleClass]"
                        :data-provider-activation="settings.providerKind"
                        :loading="isActionPending(`provider:activation:${settings.providerKind}`)"
                        @click="handleToggleProviderActivation(settings)"
                      >
                        {{ settings.isEnabled ? "停用" : "启用" }}
                      </a-button>
                      <a-button
                        :class="[editorialContentControlButtonClass, editorialContentControlButtonDangerClass]"
                        :data-provider-delete="settings.providerKind"
                        :loading="isActionPending(`provider:delete:${settings.providerKind}`)"
                        @click="handleDeleteProvider(settings.providerKind)"
                      >
                        删除
                      </a-button>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </a-card>
        </section>
      </template>
    </div>
  </a-spin>
</template>
