<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";

import {
  viewRuleFieldDefinitions,
  type ViewRuleConfigValues
} from "../../../core/viewRules/viewRuleConfig";
import { HttpError } from "../../services/http";
import {
  clearFeedbackPool,
  createDraftFromFeedback,
  deleteFeedbackEntry,
  deleteProviderSettings,
  deleteStrategyDraft,
  readSettingsViewRules,
  saveNlRules,
  saveProviderSettings,
  saveStrategyDraft,
  saveViewRuleConfig,
  type SaveNlRulesResponse,
  type SettingsFeedbackPoolItem,
  type SettingsNlRuleScope,
  type SettingsProviderKind,
  type SettingsStrategyDraftItem,
  type SettingsStrategyDraftScope,
  type SettingsViewRulesResponse
} from "../../services/settingsApi";

type AlertTone = "success" | "info" | "warning" | "error";
type PageNotice = { tone: AlertTone; message: string };
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
const draftScopeOptions = [
  { label: "未指定", value: "unspecified" },
  { label: "全局", value: "global" },
  { label: "Hot", value: "hot" },
  { label: "Articles", value: "articles" },
  { label: "AI", value: "ai" }
] as const;
const scopeLabels: Record<SettingsStrategyDraftScope, string> = {
  unspecified: "未指定",
  global: "全局",
  hot: "Hot",
  articles: "Articles",
  ai: "AI"
};

const isLoading = ref(true);
const isRefreshing = ref(false);
const loadError = ref<string | null>(null);
const pageNotice = ref<PageNotice | null>(null);
const workbench = ref<SettingsViewRulesResponse | null>(null);
const pendingActions = reactive<Record<string, boolean>>({});
const ruleForms = ref<Record<string, ViewRuleConfigValues>>({});
const draftForms = ref<Record<number, EditableDraftForm>>({});
const providerForm = reactive({
  providerKind: "deepseek" as SettingsProviderKind | string,
  apiKey: "",
  isEnabled: true
});
const nlRuleForm = reactive<Record<SettingsNlRuleScope, string>>({
  global: "",
  hot: "",
  articles: "",
  ai: ""
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

const feedbackCopyText = computed(() =>
  (workbench.value?.feedbackPool ?? []).map((entry) => buildFeedbackCopyText(entry)).join("\n\n---\n\n")
);
const latestRunSummary = computed(() => {
  const latestRun = workbench.value?.latestEvaluationRun;

  if (!latestRun) {
    return "暂无重算记录";
  }

  return `${formatProviderLabel(latestRun.providerKind)} · ${latestRun.status} · ${formatDateTime(
    latestRun.finishedAt ?? latestRun.startedAt
  )}`;
});

// 页面级提示统一收口在这里，避免每个卡片都再维护一套重复的状态文案。
function showNotice(tone: AlertTone, message: string): void {
  pageNotice.value = { tone, message };
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

// 每次读到新的工作台数据后，都把页面里的可编辑表单重新同步一遍。
function syncWorkbenchForms(nextWorkbench: SettingsViewRulesResponse): void {
  ruleForms.value = Object.fromEntries(
    nextWorkbench.numericRules.map((rule) => [
      rule.ruleKey,
      {
        limit: rule.config.limit,
        freshnessWindowDays: rule.config.freshnessWindowDays,
        freshnessWeight: rule.config.freshnessWeight,
        sourceWeight: rule.config.sourceWeight,
        completenessWeight: rule.config.completenessWeight,
        aiWeight: rule.config.aiWeight,
        heatWeight: rule.config.heatWeight
      }
    ])
  );

  providerForm.providerKind = nextWorkbench.providerSettings?.providerKind ?? "deepseek";
  providerForm.apiKey = "";
  providerForm.isEnabled = nextWorkbench.providerSettings?.isEnabled ?? true;

  const ruleTextByScope = new Map(nextWorkbench.nlRules.map((rule) => [rule.scope, rule.ruleText]));
  nlRuleForm.global = ruleTextByScope.get("global") ?? "";
  nlRuleForm.hot = ruleTextByScope.get("hot") ?? "";
  nlRuleForm.articles = ruleTextByScope.get("articles") ?? "";
  nlRuleForm.ai = ruleTextByScope.get("ai") ?? "";

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

// 规则表单在提交前再做一次前端校验，避免把空值或非法数值直接打给后端。
function readValidatedRuleConfig(ruleKey: string): ViewRuleConfigValues | null {
  const form = ruleForms.value[ruleKey];

  if (!form) {
    showNotice("error", "未找到对应的规则表单。");
    return null;
  }

  if (!Number.isFinite(form.limit) || form.limit < 1 || !Number.isInteger(form.limit)) {
    showNotice("error", "条数限制必须是不小于 1 的整数。");
    return null;
  }

  if (
    !Number.isFinite(form.freshnessWindowDays) ||
    form.freshnessWindowDays < 1 ||
    !Number.isInteger(form.freshnessWindowDays)
  ) {
    showNotice("error", "新鲜度窗口必须是不小于 1 的整数。");
    return null;
  }

  if (
    !Number.isFinite(form.freshnessWeight) ||
    !Number.isFinite(form.sourceWeight) ||
    !Number.isFinite(form.completenessWeight) ||
    !Number.isFinite(form.aiWeight) ||
    !Number.isFinite(form.heatWeight)
  ) {
    showNotice("error", "请先把权重字段填写完整。");
    return null;
  }

  return {
    limit: form.limit,
    freshnessWindowDays: form.freshnessWindowDays,
    freshnessWeight: form.freshnessWeight,
    sourceWeight: form.sourceWeight,
    completenessWeight: form.completenessWeight,
    aiWeight: form.aiWeight,
    heatWeight: form.heatWeight
  };
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

// 数值规则继续逐条保存，保持和原后端接口一致。
async function handleRuleSave(ruleKey: string): Promise<void> {
  const config = readValidatedRuleConfig(ruleKey);

  if (!config) {
    return;
  }

  await runWorkbenchAction(
    `rule:${ruleKey}`,
    () => saveViewRuleConfig(ruleKey, config),
    {
      fallbackMessage: "规则保存失败，请稍后再试。",
      successMessage: "规则已保存。"
    }
  );
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
        apiKey,
        isEnabled: providerForm.isEnabled
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

// 删除当前厂商配置后，工作台会退回未配置状态并沿用最新后端能力说明。
async function handleProviderDelete(): Promise<void> {
  await runWorkbenchAction("provider:delete", () => deleteProviderSettings(), {
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
        global: nlRuleForm.global,
        hot: nlRuleForm.hot,
        articles: nlRuleForm.articles,
        ai: nlRuleForm.ai
      }),
    {
      fallbackMessage: "正式规则保存失败，请稍后再试。",
      successMessage: (result: SaveNlRulesResponse) => {
        const runStatus = result.run?.status;

        if (runStatus === "completed") {
          return "正式规则已保存，当前内容库已完成重算。";
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

  const currentValue = nlRuleForm[form.suggestedScope].trim();
  nlRuleForm[form.suggestedScope] = currentValue ? `${currentValue}\n\n${draftText}` : draftText;
  showNotice("success", "草稿已写入正式策略编辑器，记得保存正式规则。");
}

onMounted(() => {
  void loadWorkbench();
});
</script>

<template>
  <a-spin :spinning="isRefreshing">
    <a-space direction="vertical" size="large" class="view-rules-page">
      <a-alert
        v-if="pageNotice"
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
        title="策略工作台加载失败"
        :sub-title="loadError"
      >
        <template #extra>
          <a-button type="primary" @click="loadWorkbench()">重新加载</a-button>
        </template>
      </a-result>

      <template v-else-if="workbench">
        <a-row :gutter="[16, 16]" class="view-rules-page__stats">
          <a-col :xs="24" :sm="12" :xl="6">
            <a-card size="small">
              <a-statistic title="数值规则" :value="workbench.numericRules.length" />
            </a-card>
          </a-col>
          <a-col :xs="24" :sm="12" :xl="6">
            <a-card size="small">
              <a-statistic title="反馈池" :value="workbench.feedbackPool.length" />
            </a-card>
          </a-col>
          <a-col :xs="24" :sm="12" :xl="6">
            <a-card size="small">
              <a-statistic title="草稿池" :value="workbench.strategyDrafts.length" />
            </a-card>
          </a-col>
          <a-col :xs="24" :sm="12" :xl="6">
            <a-card size="small">
              <a-statistic
                title="重算状态"
                :value="workbench.isEvaluationRunning ? '进行中' : '空闲'"
              />
            </a-card>
          </a-col>
        </a-row>

        <a-row :gutter="[16, 16]">
          <a-col :xs="24" :xl="9">
            <a-card
              title="LLM 设置"
              size="small"
              data-view-rules-section="provider-settings"
            >
              <a-space direction="vertical" size="middle" class="view-rules-page__section-stack">
                <a-alert
                  :type="providerCapabilityTone"
                  :message="workbench.providerCapability.message"
                  show-icon
                />

                <a-descriptions :column="1" size="small" bordered>
                  <a-descriptions-item label="当前厂商">
                    {{ formatProviderLabel(workbench.providerSettings?.providerKind) }}
                  </a-descriptions-item>
                  <a-descriptions-item label="已保存尾号">
                    {{ workbench.providerSettings?.apiKeyLast4 || "未配置" }}
                  </a-descriptions-item>
                  <a-descriptions-item label="最近更新">
                    {{ formatDateTime(workbench.providerSettings?.updatedAt) }}
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
                    />
                  </a-form-item>
                  <a-form-item label="API Key">
                    <a-input-password
                      v-model:value="providerForm.apiKey"
                      placeholder="输入新的 API key 会覆盖当前配置"
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
                      danger
                      data-action="delete-provider-settings"
                      :loading="isActionPending('provider:delete')"
                      @click="handleProviderDelete"
                    >
                      删除当前厂商配置
                    </a-button>
                  </a-space>
                </a-form>
              </a-space>
            </a-card>
          </a-col>

          <a-col :xs="24" :xl="15">
            <a-card
              title="正式自然语言策略"
              size="small"
              data-view-rules-section="nl-rules"
            >
              <template #extra>
                <a-tag :color="workbench.isEvaluationRunning ? 'processing' : 'blue'">
                  {{ workbench.isEvaluationRunning ? "重算进行中" : "等待下一次重算" }}
                </a-tag>
              </template>

              <a-form
                layout="vertical"
                data-view-rules-form="nl-rules"
                @submit.prevent="handleNlRulesSave"
              >
                <a-form-item label="全局规则">
                  <a-textarea
                    v-model:value="nlRuleForm.global"
                    :rows="4"
                    data-nl-rule-scope="global"
                  />
                </a-form-item>
                <a-form-item label="Hot 规则">
                  <a-textarea
                    v-model:value="nlRuleForm.hot"
                    :rows="3"
                    data-nl-rule-scope="hot"
                  />
                </a-form-item>
                <a-form-item label="Articles 规则">
                  <a-textarea
                    v-model:value="nlRuleForm.articles"
                    :rows="3"
                    data-nl-rule-scope="articles"
                  />
                </a-form-item>
                <a-form-item label="AI 规则">
                  <a-textarea
                    v-model:value="nlRuleForm.ai"
                    :rows="3"
                    data-nl-rule-scope="ai"
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
                  <a-typography-text type="secondary">
                    保存后会立即尝试重算当前内容库。
                  </a-typography-text>
                </a-space>
              </a-form>
            </a-card>
          </a-col>
        </a-row>

        <a-card
          title="数值权重规则"
          size="small"
          data-view-rules-section="numeric-rules"
        >
          <a-row v-if="workbench.numericRules.length > 0" :gutter="[16, 16]">
            <a-col
              v-for="rule in workbench.numericRules"
              :key="rule.ruleKey"
              :xs="24"
              :xl="8"
            >
              <a-card size="small" class="view-rules-page__rule-card">
                <template #title>
                  <a-space size="small">
                    <span>{{ rule.displayName }}</span>
                    <a-tag :color="rule.isEnabled ? 'green' : 'default'">
                      {{ rule.isEnabled ? "启用中" : "已禁用" }}
                    </a-tag>
                  </a-space>
                </template>

                <a-form
                  v-if="ruleForms[rule.ruleKey]"
                  layout="vertical"
                  :data-view-rule-form="rule.ruleKey"
                  @submit.prevent="handleRuleSave(rule.ruleKey)"
                >
                  <a-form-item
                    v-for="field in viewRuleFieldDefinitions"
                    :key="field.name"
                    :label="field.label"
                  >
                    <a-input-number
                      v-model:value="ruleForms[rule.ruleKey][field.name]"
                      class="view-rules-page__number-input"
                      :min="Number(field.min)"
                      :step="Number(field.step)"
                      :precision="field.inputMode === 'decimal' ? 2 : 0"
                    />
                    <div class="view-rules-page__field-description">
                      {{ field.description }}
                    </div>
                  </a-form-item>
                  <a-button
                    type="primary"
                    html-type="submit"
                    :loading="isActionPending(`rule:${rule.ruleKey}`)"
                  >
                    保存策略
                  </a-button>
                </a-form>
              </a-card>
            </a-col>
          </a-row>
          <a-empty v-else description="当前还没有可编辑的数值规则。" />
        </a-card>

        <a-card
          title="反馈池"
          size="small"
          data-view-rules-section="feedback-pool"
        >
          <template #extra>
            <a-space wrap>
              <a-button
                data-action="copy-feedback-pool"
                @click="copyText(feedbackCopyText, '反馈内容已复制。')"
              >
                复制全部反馈
              </a-button>
              <a-button
                danger
                data-action="clear-feedback-pool"
                :loading="isActionPending('feedback:clear')"
                @click="handleFeedbackClearAll"
              >
                清空全部反馈
              </a-button>
            </a-space>
          </template>

          <a-empty
            v-if="workbench.feedbackPool.length === 0"
            description="反馈池为空，内容页的新反馈会显示在这里。"
          />

          <a-space v-else direction="vertical" size="middle" class="view-rules-page__section-stack">
            <a-card
              v-for="entry in workbench.feedbackPool"
              :key="entry.id"
              size="small"
              class="view-rules-page__list-card"
            >
              <template #title>
                <a-space size="small" wrap>
                  <span>{{ entry.contentTitle }}</span>
                  <a-tag color="blue">{{ entry.sourceName }}</a-tag>
                  <a-tag>{{ entry.reactionSnapshot }}</a-tag>
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

              <a-space wrap class="view-rules-page__tag-list">
                <a-tag v-for="keyword in entry.positiveKeywords" :key="`positive-${entry.id}-${keyword}`" color="green">
                  + {{ keyword }}
                </a-tag>
                <a-tag v-for="keyword in entry.negativeKeywords" :key="`negative-${entry.id}-${keyword}`" color="red">
                  - {{ keyword }}
                </a-tag>
              </a-space>

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
                <a-button
                  danger
                  :loading="isActionPending(`feedback:${entry.id}:delete`)"
                  @click="handleFeedbackDelete(entry.id)"
                >
                  删除
                </a-button>
              </a-space>
            </a-card>
          </a-space>
        </a-card>

        <a-card
          title="草稿池"
          size="small"
          data-view-rules-section="strategy-drafts"
        >
          <a-empty
            v-if="workbench.strategyDrafts.length === 0"
            description="草稿池为空，可以先把反馈转成草稿。"
          />

          <a-space v-else direction="vertical" size="middle" class="view-rules-page__section-stack">
            <a-card
              v-for="draft in workbench.strategyDrafts"
              :key="draft.id"
              size="small"
              class="view-rules-page__list-card"
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
                  <a-button
                    danger
                    :loading="isActionPending(`draft:${draft.id}:delete`)"
                    @click="handleDraftDelete(draft.id)"
                  >
                    删除草稿
                  </a-button>
                </a-space>
              </a-form>
            </a-card>
          </a-space>
        </a-card>
      </template>
    </a-space>
  </a-spin>
</template>

<style scoped>
.view-rules-page,
.view-rules-page__section-stack {
  width: 100%;
}

.view-rules-page__number-input {
  width: 100%;
}

.view-rules-page__field-description {
  margin-top: 6px;
  color: rgba(100, 116, 139, 0.92);
  font-size: 12px;
  line-height: 1.5;
}

.view-rules-page__rule-card,
.view-rules-page__list-card {
  width: 100%;
}

.view-rules-page__tag-list {
  display: flex;
  margin: 12px 0 16px;
}
</style>
