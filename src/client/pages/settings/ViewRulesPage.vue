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
  saveProviderSettings,
  updateProviderSettingsActivation,
  type SettingsFeedbackPoolItem,
  type SettingsProviderKind,
  type SettingsProviderSettingsSummary,
  type SettingsViewRulesResponse
} from "../../services/settingsApi";

type AlertTone = "success" | "info" | "warning" | "error";
type PageNotice = { tone: AlertTone; message: string };

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
const providerForm = reactive({
  providerKind: "deepseek" as SettingsProviderKind | string,
  apiKey: ""
});

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
  } catch (error) {
    const failureMessage = resolveActionErrorMessage(error, "反馈池页面加载失败，请稍后再试。");

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
        title="反馈池页面加载失败"
        :sub-title="loadError"
      >
        <template #extra>
          <a-button type="primary" @click="loadWorkbench()">重新加载</a-button>
        </template>
      </a-result>

      <template v-else-if="workbench">
        <section class="grid gap-3 md:grid-cols-3" data-settings-section="overview">
          <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">反馈池</p>
            <p class="mt-2 mb-0 text-xl font-medium text-editorial-text-main">{{ workbench.feedbackPool.length }}</p>
            <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-muted">内容页写入的反馈词会集中保留在这里。</p>
          </article>
          <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">已保存厂商</p>
            <p class="mt-2 mb-0 text-xl font-medium text-editorial-text-main">{{ workbench.providerSettings.length }}</p>
            <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-muted">
              {{ enabledProviderSettings ? `当前启用：${formatProviderLabel(enabledProviderSettings.providerKind)}` : "当前没有启用中的厂商" }}
            </p>
          </article>
          <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">LLM 设置</p>
            <p class="mt-2 mb-0 text-xl font-medium text-editorial-text-main">暂未使用</p>
            <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-muted">
              当前只保留厂商配置入口，后续真正接入时会复用这里的设置。
            </p>
          </article>
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
