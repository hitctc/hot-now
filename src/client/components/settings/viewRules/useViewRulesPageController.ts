import { message } from "ant-design-vue";
import { computed, onMounted, reactive, ref } from "vue";

import { BUILTIN_SOURCES } from "../../../../core/source/sourceCatalog";
import {
  clearFeedbackPool,
  deleteFeedbackEntry,
  deleteProviderSettings,
  readSettingsViewRules,
  saveContentFilterRule,
  saveProviderSettings,
  updateProviderSettingsActivation,
  type SettingsContentFilterToggles,
  type SettingsContentFilterWeights,
  type SettingsProviderKind,
  type SettingsProviderSettingsSummary,
  type SettingsViewRulesResponse
} from "../../../services/settingsApi";
import {
  buildFeedbackCopyText,
  convertPointsToStoredWeight,
  createFilterToggleDraft,
  createFilterWeightDraft,
  formatProviderLabel,
  readProviderStatusLabel,
  resolveActionErrorMessage,
  type AlertTone,
  type FilterRuleKey,
  type FilterToggleKey,
  type FilterWeightKey,
  type PageNotice
} from "./viewRulesPageShared";

export function useViewRulesPageController() {
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

  function syncFilterForms(nextWorkbench: SettingsViewRulesResponse | null): void {
    if (!nextWorkbench) {
      return;
    }

    filterForms.ai = { ...nextWorkbench.filterWorkbench.aiRule.toggles };
    filterForms.hot = { ...nextWorkbench.filterWorkbench.hotRule.toggles };
    filterWeightForms.ai = { ...nextWorkbench.filterWorkbench.aiRule.weights };
    filterWeightForms.hot = { ...nextWorkbench.filterWorkbench.hotRule.weights };
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

  function handleFilterToggleChange(
    ruleKey: FilterRuleKey,
    payload: { key: FilterToggleKey; value: boolean }
  ): void {
    filterForms[ruleKey][payload.key] = payload.value;
  }

  function handleWeightInput(ruleKey: FilterRuleKey, payload: { key: FilterWeightKey; value: number | null }): void {
    const nextPoints = typeof payload.value === "number" && Number.isFinite(payload.value) && payload.value >= 0 ? payload.value : 0;
    filterWeightForms[ruleKey][payload.key] = convertPointsToStoredWeight(nextPoints);
  }

  function handleProviderKindChange(value: string): void {
    providerForm.providerKind = value;
  }

  function handleProviderApiKeyChange(value: string): void {
    providerForm.apiKey = value;
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

  return {
    aiFilterRule,
    aiPrioritySourceNames,
    filterForms,
    filterWeightForms,
    handleClearFeedback,
    handleCopyFeedbackPool,
    handleDeleteFeedback,
    handleDeleteProvider,
    handleFilterToggleChange,
    handleProviderApiKeyChange,
    handleProviderKindChange,
    handleProviderSave,
    handleSaveContentFilterRule,
    handleToggleProviderActivation,
    handleWeightInput,
    hotFilterRule,
    hotPrioritySourceNames,
    isActionPending,
    isLoading,
    isRefreshing,
    loadError,
    loadWorkbench,
    pageNotice,
    providerCapabilityTone,
    providerForm,
    selectedProviderStatus,
    workbench
  };
}
