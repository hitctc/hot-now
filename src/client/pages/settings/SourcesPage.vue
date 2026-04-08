<script setup lang="ts">
import { message } from "ant-design-vue";
import { computed, onMounted, reactive, ref } from "vue";

import {
  editorialContentCardClass,
  editorialContentPageClass
} from "../../components/content/contentCardShared";
import { HttpError } from "../../services/http";
import {
  createSource,
  deleteSource,
  readSettingsSources,
  toggleSource,
  updateSource,
  updateSourceDisplayMode,
  triggerManualCollect,
  triggerManualSendLatestEmail,
  type ManualCollectResponse,
  type ManualSendLatestEmailResponse,
  type SaveSourcePayload,
  type SettingsSourceItem,
  type SettingsSourcesResponse
} from "../../services/settingsApi";

type AlertTone = "success" | "info" | "warning" | "error";
type PageNotice = { tone: AlertTone; message: string };
type SourceModalMode = "create" | "update";
type SourceFormState = {
  kind: string;
  name: string;
  siteUrl: string;
  sourceType: "rss" | "wechat_bridge";
  rssUrl: string;
  bridgeInputMode: "feed_url" | "article_url";
  feedUrl: string;
  articleUrl: string;
};

const analyticsColumns = [
  { title: "来源", key: "name", align: "center" as const },
  { title: "选中时全量", key: "displayMode", align: "center" as const },
  { title: "总条数", key: "totalCount", align: "center" as const },
  { title: "今天发布", key: "publishedTodayCount", align: "center" as const },
  { title: "今天抓取", key: "collectedTodayCount", align: "center" as const },
  { title: "AI 新讯24小时候选 / 24小时展示", key: "aiStats", align: "center" as const },
  { title: "AI 新讯独立展示占比", key: "aiShare", align: "center" as const },
  { title: "AI 热点候选 / 展示", key: "hotStats", align: "center" as const },
  { title: "AI 热点独立展示占比", key: "hotShare", align: "center" as const }
];
const inventoryColumns = [
  { title: "来源", key: "name", align: "center" as const },
  { title: "启用", key: "enabled", align: "center" as const },
  { title: "最近抓取时间", key: "lastCollectedAt", align: "center" as const },
  { title: "最近抓取状态", key: "lastCollectionStatus", align: "center" as const },
  { title: "RSS", key: "rssUrl", align: "center" as const }
];

const isLoading = ref(true);
const isRefreshing = ref(false);
const loadError = ref<string | null>(null);
const pageNotice = ref<PageNotice | null>(null);
const sourcesModel = ref<SettingsSourcesResponse | null>(null);
const pendingActions = reactive<Record<string, boolean>>({});
const isSourceModalOpen = ref(false);
const sourceModalMode = ref<SourceModalMode>("create");
const sourceFormError = ref<string | null>(null);
const sourceForm = reactive<SourceFormState>(createEmptySourceForm());

const enabledSourceCount = computed(
  () => sourcesModel.value?.sources.filter((source) => source.isEnabled).length ?? 0
);
const totalSourceCount = computed(() => sourcesModel.value?.sources.length ?? 0);
const wechatArticleUrlAvailable = computed(
  () => sourcesModel.value?.capability.wechatArticleUrlEnabled ?? false
);
const wechatArticleUrlMessage = computed(
  () =>
    sourcesModel.value?.capability.wechatArticleUrlMessage ??
    "当前未配置 bridge 服务；你仍可新增 RSS 或填写现成 feed URL，但“公众号文章链接”模式暂不可用。"
);

// 页面提示统一通过一层 notice 管理，操作后同时保留页内 Alert 和全局 toast。
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

// source 切换和手动动作都需要独立 loading，按 action key 细分最直接。
function setPendingAction(actionKey: string, pending: boolean): void {
  pendingActions[actionKey] = pending;
}

// 模板只需要知道某个动作是不是 pending，不需要接触底层状态对象。
function isActionPending(actionKey: string): boolean {
  return pendingActions[actionKey] === true;
}

// 新增/编辑来源共用一个轻量表单，避免 sources 工作台长出第二套页面状态。
function createEmptySourceForm(): SourceFormState {
  return {
    kind: "",
    name: "",
    siteUrl: "",
    sourceType: "rss",
    rssUrl: "",
    bridgeInputMode: "article_url",
    feedUrl: "",
    articleUrl: ""
  };
}

// 每次打开弹窗都从同一套初始值开始，避免上一次编辑残留到下一次新增。
function resetSourceForm(): void {
  Object.assign(sourceForm, createEmptySourceForm());
  // 未配置 bridge 时直接回到可用的 feed URL 模式，避免用户一打开公众号模式就落在必失败的分支上。
  if (!wechatArticleUrlAvailable.value) {
    sourceForm.bridgeInputMode = "feed_url";
  }
  sourceFormError.value = null;
}

// 新增模式只需要清空表单并打开弹窗，不再引入额外的临时草稿状态。
function openCreateSourceModal(): void {
  sourceModalMode.value = "create";
  resetSourceForm();
  isSourceModalOpen.value = true;
}

// 编辑模式只回填当前来源已有配置，kind 继续锁定，避免把“编辑”做成“重命名来源主键”。
function openEditSourceModal(source: SettingsSourceItem): void {
  sourceModalMode.value = "update";
  resetSourceForm();
  sourceForm.kind = source.kind;
  sourceForm.name = source.name;
  sourceForm.siteUrl = source.siteUrl;
  sourceForm.sourceType = source.sourceType === "wechat_bridge" ? "wechat_bridge" : "rss";

  if (sourceForm.sourceType === "rss") {
    sourceForm.rssUrl = source.rssUrl ?? "";
  } else {
    sourceForm.bridgeInputMode = source.bridgeInputMode ?? "article_url";

    if (sourceForm.bridgeInputMode === "feed_url") {
      sourceForm.feedUrl = source.bridgeInputValue ?? source.rssUrl ?? "";
    } else {
      sourceForm.articleUrl = source.bridgeInputValue ?? "";
    }
  }

  isSourceModalOpen.value = true;
}

// 关闭弹窗时顺手清掉局部错误，避免旧的 bridge 保存失败提示粘在下一次操作里。
function closeSourceModal(): void {
  isSourceModalOpen.value = false;
  sourceFormError.value = null;
}

// 类型切换只负责收口当前可见字段，真正的 payload 仍由提交时统一构建。
function selectSourceType(sourceType: "rss" | "wechat_bridge"): void {
  sourceForm.sourceType = sourceType;

  if (sourceType === "wechat_bridge" && !wechatArticleUrlAvailable.value) {
    sourceForm.bridgeInputMode = "feed_url";
  }

  sourceFormError.value = null;
}

// 公众号 bridge 录入先只支持“现成 feed”与“文章链接”两种模式，不额外引入 provider id。
function selectBridgeInputMode(inputMode: "feed_url" | "article_url"): void {
  if (inputMode === "article_url" && !wechatArticleUrlAvailable.value) {
    return;
  }

  sourceForm.bridgeInputMode = inputMode;
  sourceFormError.value = null;
}

// 系统页继续统一格式化时间，空值统一回落成“暂无记录”。
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

// 三个内容视图的候选 / 展示统计都用同一格式输出，便于在表格里横向比较。
function formatViewStats(
  stats:
    | { candidateCount: number; visibleCount: number; visibleShare: number }
    | undefined
): string {
  if (!stats) {
    return "0 / 0";
  }

  return `${stats.candidateCount} / ${stats.visibleCount}`;
}

function formatViewShare(
  stats:
    | { candidateCount: number; visibleCount: number; visibleShare: number }
    | undefined
): string {
  if (!stats) {
    return "0.0%";
  }

  return `${(stats.visibleShare * 100).toFixed(1)}%`;
}

// 最近抓取状态保留原始枚举给后端和数据库，页面统一翻译成中文给用户看。
function formatCollectionStatus(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return "未知";
  }

  if (normalized === "completed") {
    return "已完成";
  }

  if (normalized === "running") {
    return "进行中";
  }

  if (normalized === "failed") {
    return "已失败";
  }

  if (normalized === "pending") {
    return "等待中";
  }

  return value ?? "未知";
}

// sources 页错误提示沿用后端 reason 映射，避免把接口细节直接暴露给用户。
function readActionErrorMessage(
  error: unknown,
  fallbackMessage: string,
  reasonMessages: Record<string, string> = {}
): string {
  if (error instanceof HttpError) {
    if (error.status === 401) {
      return "请先登录后再操作。";
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

// 表单提交前先统一整理 payload，这样 create / update 共用一条来源保存路径。
function buildSourceSavePayload(): { ok: true; payload: SaveSourcePayload } | { ok: false; message: string } {
  const kind = sourceForm.kind.trim();
  const name = sourceForm.name.trim();
  const siteUrl = sourceForm.siteUrl.trim();

  if (!kind || !name || !siteUrl) {
    return { ok: false, message: "请先完整填写来源 kind、名称和主页地址。" };
  }

  if (sourceForm.sourceType === "rss") {
    const rssUrl = sourceForm.rssUrl.trim();

    if (!rssUrl) {
      return { ok: false, message: "请填写 RSS 地址。" };
    }

    return {
      ok: true,
      payload: {
        sourceType: "rss",
        kind,
        name,
        siteUrl,
        rssUrl
      }
    };
  }

  if (sourceForm.bridgeInputMode === "feed_url") {
    const feedUrl = sourceForm.feedUrl.trim();

    if (!feedUrl) {
      return { ok: false, message: "请填写现成 bridge feed URL。" };
    }

    return {
      ok: true,
      payload: {
        sourceType: "wechat_bridge",
        kind,
        name,
        siteUrl,
        bridgeKind: "wechat2rss",
        inputMode: "feed_url",
        feedUrl
      }
    };
  }

  const articleUrl = sourceForm.articleUrl.trim();

  if (!articleUrl) {
    return { ok: false, message: "请填写公众号文章链接。" };
  }

  return {
    ok: true,
    payload: {
      sourceType: "wechat_bridge",
      kind,
      name,
      siteUrl,
      bridgeKind: "wechat2rss",
      inputMode: "article_url",
      articleUrl
    }
  };
}

// 数据加载区分首屏和静默刷新，切换 source 时不需要把整页退回骨架屏。
async function loadSources(options: { silent?: boolean } = {}): Promise<boolean> {
  if (options.silent) {
    isRefreshing.value = true;
  } else {
    isLoading.value = true;
    loadError.value = null;
  }

  try {
    sourcesModel.value = await readSettingsSources();
    loadError.value = null;
    return true;
  } catch (error) {
    const message = readActionErrorMessage(error, "数据收集页加载失败，请稍后重试。");

    if (!sourcesModel.value || !options.silent) {
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

// 页内动作都走统一包装，复用 pending、静默刷新和 reason 翻译。
async function runSourcesAction<T>(
  actionKey: string,
  action: () => Promise<T>,
  options: {
    fallbackMessage: string;
    successMessage: string | ((result: T) => string);
    reasonMessages?: Record<string, string>;
  }
): Promise<void> {
  if (isActionPending(actionKey)) {
    return;
  }

  setPendingAction(actionKey, true);

  try {
    const result = await action();
    const refreshed = await loadSources({ silent: true });
    const message = typeof options.successMessage === "function" ? options.successMessage(result) : options.successMessage;
    showNotice("success", refreshed ? message : `${message} 但最新数据刷新失败，请稍后手动刷新。`);
  } catch (error) {
    showNotice(
      "error",
      readActionErrorMessage(error, options.fallbackMessage, options.reasonMessages ?? {})
    );
  } finally {
    setPendingAction(actionKey, false);
  }
}

// source 开关永远基于当前状态反转，再交给后端落地。
async function handleToggleSource(source: SettingsSourceItem): Promise<void> {
  const nextEnable = !source.isEnabled;

  await runSourcesAction(
    `toggle:${source.kind}`,
    () => toggleSource(source.kind, nextEnable),
    {
      fallbackMessage: "source 状态切换失败，请稍后再试。",
      successMessage: nextEnable ? "已启用 source。" : "已停用 source。",
      reasonMessages: {
        "invalid-source-kind": "source kind 不合法，无法切换。",
        "invalid-source-enable": "source 启用状态参数不合法。",
        "not-found": "对应 source 不存在，可能已被移除。"
      }
    }
  );
}

// 展示模式开关只改当前 source 的浏览策略，不影响采集启停或最近抓取状态。
async function handleToggleSourceDisplayMode(source: SettingsSourceItem): Promise<void> {
  const nextShowAllWhenSelected = !source.showAllWhenSelected;

  await runSourcesAction(
    `display-mode:${source.kind}`,
    () => updateSourceDisplayMode(source.kind, nextShowAllWhenSelected),
    {
      fallbackMessage: "source 展示模式切换失败，请稍后再试。",
      successMessage: nextShowAllWhenSelected ? "已开启选中时全量展示。" : "已关闭选中时全量展示。",
      reasonMessages: {
        "invalid-source-kind": "source kind 不合法，无法更新展示模式。",
        "invalid-source-display-mode": "source 展示模式参数不合法。",
        "not-found": "对应 source 不存在，可能已被移除。"
      }
    }
  );
}

// 手动采集只负责发起任务，具体结果依旧由后端流水线处理。
async function handleManualCollect(): Promise<void> {
  await runSourcesAction("manual:collect", () => triggerManualCollect(), {
    fallbackMessage: "采集任务启动失败，请稍后再试。",
    successMessage: (result: ManualCollectResponse) =>
      result.accepted ? "已开始执行采集，请稍后刷新查看结果。" : "采集任务未成功启动。",
    reasonMessages: {
      "already-running": "当前已有任务执行中，请稍后再试。",
      unauthorized: "请先登录后再操作。"
    }
  });
}

// 手动发送最新报告邮件沿用后端错误原因映射，用户能直接看懂当前阻塞点。
async function handleManualSendLatestEmail(): Promise<void> {
  await runSourcesAction("manual:send-latest-email", () => triggerManualSendLatestEmail(), {
    fallbackMessage: "最新报告发送失败，请稍后再试。",
    successMessage: (result: ManualSendLatestEmailResponse) =>
      result.accepted ? "已开始发送最新报告邮件，请稍后检查投递结果。" : "最新报告发送未成功启动。",
    reasonMessages: {
      "already-running": "当前已有任务执行中，请稍后再试。",
      "not-found": "最新报告不存在，请先执行一次采集。",
      "report-unavailable": "最新报告暂不可用，请稍后再试。",
      "send-failed": "最新报告发送失败，请检查 SMTP 配置后重试。"
    }
  });
}

// 来源保存沿用现有 notice + toast 约定，同时把 bridge 失败原因翻译成工作台可读提示。
async function handleSubmitSource(): Promise<void> {
  if (isActionPending("source:submit")) {
    return;
  }

  const payload = buildSourceSavePayload();

  if (!payload.ok) {
    sourceFormError.value = payload.message;
    return;
  }

  sourceFormError.value = null;
  setPendingAction("source:submit", true);

  try {
    if (sourceModalMode.value === "create") {
      await createSource(payload.payload);
    } else {
      await updateSource(payload.payload);
    }

    const refreshed = await loadSources({ silent: true });
    closeSourceModal();
    showNotice(
      "success",
      refreshed
        ? sourceModalMode.value === "create"
          ? "已新增来源。"
          : "已更新来源。"
        : sourceModalMode.value === "create"
          ? "已新增来源，但最新数据刷新失败，请稍后手动刷新。"
          : "已更新来源，但最新数据刷新失败，请稍后手动刷新。"
    );
  } catch (error) {
    const message = readActionErrorMessage(
      error,
      sourceModalMode.value === "create" ? "来源保存失败，请稍后再试。" : "来源更新失败，请稍后再试。",
      {
        "already-exists": "该来源 kind 已存在，请更换后重试。",
        "not-found": "对应来源不存在，可能已被移除。",
        "built-in": "内置来源不允许编辑。",
        "invalid-input": "来源配置不合法，请检查后重试。",
        "wechat-bridge-disabled": "当前未配置公众号 bridge 服务，无法通过文章链接生成 feed。",
        "bridge-registration-failed": "公众号文章链接解析失败，请检查 bridge 服务或改用现成 feed URL。"
      }
    );

    sourceFormError.value = message;
    showNotice("error", message);
  } finally {
    setPendingAction("source:submit", false);
  }
}

// 删除动作只开放给自定义来源，是否允许真正删除仍由后端按 built-in / in-use 决定。
async function handleDeleteSource(source: SettingsSourceItem): Promise<void> {
  await runSourcesAction(`delete:${source.kind}`, () => deleteSource(source.kind), {
    fallbackMessage: "删除来源失败，请稍后再试。",
    successMessage: "已删除自定义来源。",
    reasonMessages: {
      "not-found": "对应来源不存在，可能已被移除。",
      "built-in": "内置来源不允许删除。",
      "in-use": "该来源已有采集内容，当前不允许删除。"
    }
  });
}

onMounted(() => {
  void loadSources();
});
</script>

<template>
  <a-spin :spinning="isRefreshing">
    <div :class="editorialContentPageClass" data-settings-page="sources">
      <a-alert
        v-if="pageNotice"
        :class="['editorial-inline-alert', `editorial-inline-alert--${pageNotice.tone}`]"
        :message="pageNotice.message"
        :type="pageNotice.tone"
        show-icon
        closable
        @close="pageNotice = null"
      />

      <div class="flex justify-start">
        <a-button type="primary" data-action="add-source" @click="openCreateSourceModal">
          新增来源
        </a-button>
      </div>

      <a-skeleton v-if="isLoading" active :paragraph="{ rows: 8 }" />

      <a-result
        v-else-if="loadError"
        status="error"
        title="数据收集页加载失败"
        :sub-title="loadError"
      >
        <template #extra>
          <a-button type="primary" @click="loadSources()">重新加载</a-button>
        </template>
      </a-result>

      <template v-else-if="sourcesModel">
        <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-sources-section="overview">
          <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">接入来源</p>
            <p class="mt-2 mb-0 text-xl font-medium text-editorial-text-main">{{ totalSourceCount }}</p>
          </article>
          <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">已启用来源</p>
            <p class="mt-2 mb-0 text-xl font-medium text-editorial-text-main">{{ enabledSourceCount }}</p>
          </article>
          <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">最近采集</p>
            <p class="mt-2 mb-0 text-sm text-editorial-text-main">{{ formatDateTime(sourcesModel.operations.lastCollectionRunAt) }}</p>
          </article>
          <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">最近发信</p>
            <p class="mt-2 mb-0 text-sm text-editorial-text-main">{{ formatDateTime(sourcesModel.operations.lastSendLatestEmailAt) }}</p>
          </article>
        </section>

        <section class="grid gap-4 xl:grid-cols-2">
          <a-card
            :class="editorialContentCardClass"
            title="手动执行采集"
            size="small"
            data-sources-section="manual-collect"
          >
              <div class="flex w-full flex-col gap-4">
                <a-typography-paragraph type="secondary">
                  当前会对所有已启用 source 发起一次采集，并刷新最新内容库。
                </a-typography-paragraph>
                <a-button
                  type="primary"
                  data-action="manual-collect"
                  :disabled="!sourcesModel.operations.canTriggerManualCollect || sourcesModel.operations.isRunning"
                  :loading="isActionPending('manual:collect')"
                  @click="handleManualCollect"
                >
                  {{ sourcesModel.operations.isRunning ? "采集中..." : "手动执行采集" }}
                </a-button>
              </div>
          </a-card>

          <a-card
            :class="editorialContentCardClass"
            title="发送最新报告"
            size="small"
            data-sources-section="manual-send-latest-email"
          >
              <div class="flex w-full flex-col gap-4">
                <a-typography-paragraph type="secondary">
                  直接读取最新一份报告并尝试发信，适合采集完成后的人工重试。
                </a-typography-paragraph>
                <a-button
                  data-action="manual-send-latest-email"
                  :disabled="!sourcesModel.operations.canTriggerManualSendLatestEmail || sourcesModel.operations.isRunning"
                  :loading="isActionPending('manual:send-latest-email')"
                  @click="handleManualSendLatestEmail"
                >
                  {{ sourcesModel.operations.isRunning ? "任务执行中..." : "发送最新报告" }}
                </a-button>
              </div>
          </a-card>
        </section>

        <a-card
          :class="editorialContentCardClass"
          title="来源统计概览"
          size="small"
          data-sources-section="analytics"
        >
          <a-table
            :data-source="sourcesModel.sources"
            :columns="analyticsColumns"
            row-key="kind"
            :pagination="false"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <a-space direction="vertical" size="small">
                  <a-typography-text strong>{{ record.name }}</a-typography-text>
                  <a-tag :color="record.isEnabled ? 'green' : 'default'">
                    {{ record.isEnabled ? "启用中" : "已停用" }}
                  </a-tag>
                </a-space>
              </template>
              <template v-else-if="column.key === 'totalCount'">
                {{ record.totalCount ?? 0 }}
              </template>
              <template v-else-if="column.key === 'displayMode'">
                <a-switch
                  :checked="record.showAllWhenSelected"
                  :loading="isActionPending(`display-mode:${record.kind}`)"
                  :checked-children="'全量'"
                  :un-checked-children="'截断'"
                  :data-source-display-mode="record.kind"
                  @change="handleToggleSourceDisplayMode(record)"
                />
              </template>
              <template v-else-if="column.key === 'publishedTodayCount'">
                {{ record.publishedTodayCount ?? 0 }}
              </template>
              <template v-else-if="column.key === 'collectedTodayCount'">
                {{ record.collectedTodayCount ?? 0 }}
              </template>
              <template v-else-if="column.key === 'aiShare'">
                {{ formatViewShare(record.viewStats?.ai) }}
              </template>
              <template v-else-if="column.key === 'hotStats'">
                {{ formatViewStats(record.viewStats?.hot) }}
              </template>
              <template v-else-if="column.key === 'hotShare'">
                {{ formatViewShare(record.viewStats?.hot) }}
              </template>
              <template v-else-if="column.key === 'aiStats'">
                {{ formatViewStats(record.viewStats?.ai) }}
              </template>
            </template>
          </a-table>
        </a-card>

        <a-card
          :class="editorialContentCardClass"
          title="来源库存"
          size="small"
          data-sources-section="inventory"
        >
          <a-table
            :data-source="sourcesModel.sources"
            :columns="inventoryColumns"
            row-key="kind"
            :pagination="false"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <div class="flex flex-col items-center gap-2">
                  <a-space direction="vertical" size="small">
                    <a-typography-text strong>{{ record.name }}</a-typography-text>
                    <a-typography-text type="secondary">{{ record.kind }}</a-typography-text>
                  </a-space>
                  <a-space wrap size="small" class="justify-center">
                    <a-tag :color="record.sourceType === 'wechat_bridge' ? 'blue' : 'default'">
                      {{ record.sourceType === "wechat_bridge" ? "公众号桥接" : "RSS" }}
                    </a-tag>
                    <a-typography-text v-if="record.bridgeConfigSummary" type="secondary">
                      {{ record.bridgeConfigSummary }}
                    </a-typography-text>
                  </a-space>
                  <div v-if="!record.isBuiltIn" class="flex flex-wrap justify-center gap-2">
                    <a-button
                      type="link"
                      size="small"
                      :data-source-edit="record.kind"
                      @click="openEditSourceModal(record)"
                    >
                      编辑
                    </a-button>
                    <a-button
                      type="link"
                      size="small"
                      danger
                      :loading="isActionPending(`delete:${record.kind}`)"
                      :data-source-delete="record.kind"
                      @click="handleDeleteSource(record)"
                    >
                      删除
                    </a-button>
                  </div>
                </div>
              </template>
              <template v-else-if="column.key === 'enabled'">
                <a-switch
                  :checked="record.isEnabled"
                  :loading="isActionPending(`toggle:${record.kind}`)"
                  :checked-children="'启用'"
                  :un-checked-children="'停用'"
                  :data-source-toggle="record.kind"
                  @change="handleToggleSource(record)"
                />
              </template>
              <template v-else-if="column.key === 'lastCollectedAt'">
                {{ formatDateTime(record.lastCollectedAt) }}
              </template>
              <template v-else-if="column.key === 'lastCollectionStatus'">
                <a-tag :color="record.lastCollectionStatus === 'completed' ? 'green' : 'gold'">
                  {{ formatCollectionStatus(record.lastCollectionStatus) }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'rssUrl'">
                <a
                  v-if="record.rssUrl"
                  :href="record.rssUrl"
                  target="_blank"
                  rel="noreferrer"
                >
                  {{ record.rssUrl }}
                </a>
                <span v-else>未配置</span>
              </template>
            </template>
          </a-table>
        </a-card>
      </template>

      <a-modal
        :open="isSourceModalOpen"
        :title="sourceModalMode === 'create' ? '新增来源' : '编辑来源'"
        :footer="null"
        centered
        :width="760"
        destroy-on-close
        @cancel="closeSourceModal"
      >
        <div class="flex flex-col gap-4" data-source-modal="source">
          <a-alert
            v-if="sourceFormError"
            class="editorial-inline-alert editorial-inline-alert--error"
            type="error"
            show-icon
            :message="sourceFormError"
          />

          <a-alert
            class="editorial-inline-alert editorial-inline-alert--info"
            type="info"
            show-icon
            message="新增来源统一在这一个弹窗里完成：先选 RSS 或 微信公众号，再填写对应接入信息。"
            data-source-modal-intro
          />

          <div class="flex flex-col gap-2">
            <p class="m-0 text-sm font-medium text-editorial-text-main">来源类型</p>
            <div class="flex flex-wrap gap-2">
              <a-button
                :type="sourceForm.sourceType === 'rss' ? 'primary' : 'default'"
                data-source-type="rss"
                @click="selectSourceType('rss')"
              >
                RSS
              </a-button>
              <a-button
                :type="sourceForm.sourceType === 'wechat_bridge' ? 'primary' : 'default'"
                data-source-type="wechat_bridge"
                @click="selectSourceType('wechat_bridge')"
              >
                微信公众号
              </a-button>
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <label class="flex flex-col gap-2">
              <span class="text-sm font-medium text-editorial-text-main">来源 kind</span>
              <input
                v-model="sourceForm.kind"
                data-source-form="kind"
                class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
                :disabled="sourceModalMode === 'update'"
              />
            </label>
            <label class="flex flex-col gap-2">
              <span class="text-sm font-medium text-editorial-text-main">来源名称</span>
              <input
                v-model="sourceForm.name"
                data-source-form="name"
                class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
              />
            </label>
          </div>

          <label class="flex flex-col gap-2">
            <span class="text-sm font-medium text-editorial-text-main">来源主页</span>
            <input
              v-model="sourceForm.siteUrl"
              data-source-form="site-url"
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
            />
          </label>

          <template v-if="sourceForm.sourceType === 'rss'">
            <label class="flex flex-col gap-2">
              <span class="text-sm font-medium text-editorial-text-main">RSS 地址</span>
              <input
                v-model="sourceForm.rssUrl"
                data-source-form="rss-url"
                class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
              />
            </label>
          </template>

          <template v-else>
            <a-alert
              class="editorial-inline-alert editorial-inline-alert--info"
              type="info"
              show-icon
              :message="wechatArticleUrlMessage"
              data-source-wechat-capability
            />

            <div class="flex flex-col gap-2">
              <p class="m-0 text-sm font-medium text-editorial-text-main">公众号接入方式</p>
              <div class="flex flex-wrap gap-2">
                <a-button
                  :type="sourceForm.bridgeInputMode === 'article_url' ? 'primary' : 'default'"
                  data-bridge-input-mode="article_url"
                  :disabled="!wechatArticleUrlAvailable"
                  @click="selectBridgeInputMode('article_url')"
                >
                  公众号文章链接
                </a-button>
                <a-button
                  :type="sourceForm.bridgeInputMode === 'feed_url' ? 'primary' : 'default'"
                  data-bridge-input-mode="feed_url"
                  @click="selectBridgeInputMode('feed_url')"
                >
                  现成 feed URL
                </a-button>
              </div>
            </div>

            <label v-if="sourceForm.bridgeInputMode === 'article_url'" class="flex flex-col gap-2">
              <span class="text-sm font-medium text-editorial-text-main">公众号文章链接</span>
              <input
                v-model="sourceForm.articleUrl"
                data-source-form="article-url"
                class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
              />
            </label>

            <label v-else class="flex flex-col gap-2">
              <span class="text-sm font-medium text-editorial-text-main">现成 bridge feed URL</span>
              <input
                v-model="sourceForm.feedUrl"
                data-source-form="feed-url"
                class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
              />
            </label>
          </template>

          <div class="flex justify-end gap-2">
            <a-button @click="closeSourceModal">取消</a-button>
            <a-button
              type="primary"
              data-source-form="submit"
              :loading="isActionPending('source:submit')"
              @click="handleSubmitSource"
            >
              {{ sourceModalMode === "create" ? "新增来源" : "保存更新" }}
            </a-button>
          </div>
        </div>
      </a-modal>
    </div>
  </a-spin>
</template>
