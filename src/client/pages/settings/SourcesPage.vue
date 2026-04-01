<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";

import {
  editorialContentCardClass,
  editorialContentIntroSectionClass,
  editorialContentPageClass
} from "../../components/content/contentCardShared";
import { HttpError } from "../../services/http";
import {
  readSettingsSources,
  toggleSource,
  updateSourceDisplayMode,
  triggerManualCollect,
  triggerManualSendLatestEmail,
  type ManualCollectResponse,
  type ManualSendLatestEmailResponse,
  type SettingsSourceItem,
  type SettingsSourcesResponse
} from "../../services/settingsApi";

type AlertTone = "success" | "info" | "warning" | "error";
type PageNotice = { tone: AlertTone; message: string };

const analyticsColumns = [
  { title: "来源", key: "name" },
  { title: "总条数", key: "totalCount", align: "right" as const },
  { title: "今天发布", key: "publishedTodayCount", align: "right" as const },
  { title: "今天抓取", key: "collectedTodayCount", align: "right" as const },
  { title: "AI 热点入池 / 展示", key: "hotStats", align: "right" as const },
  { title: "AI 新讯入池 / 展示", key: "aiStats", align: "right" as const }
];
const inventoryColumns = [
  { title: "来源", key: "name" },
  { title: "启用", key: "enabled", align: "center" as const },
  { title: "选中时全量", key: "displayMode", align: "center" as const },
  { title: "最近抓取时间", key: "lastCollectedAt" },
  { title: "最近抓取状态", key: "lastCollectionStatus" },
  { title: "RSS", key: "rssUrl" }
];

const isLoading = ref(true);
const isRefreshing = ref(false);
const loadError = ref<string | null>(null);
const pageNotice = ref<PageNotice | null>(null);
const sourcesModel = ref<SettingsSourcesResponse | null>(null);
const pendingActions = reactive<Record<string, boolean>>({});

const enabledSourceCount = computed(
  () => sourcesModel.value?.sources.filter((source) => source.isEnabled).length ?? 0
);
const totalSourceCount = computed(() => sourcesModel.value?.sources.length ?? 0);

// 页面提示统一通过一层 notice 管理，避免操作结果分散到表格各处。
function showNotice(tone: AlertTone, message: string): void {
  pageNotice.value = { tone, message };
}

// source 切换和手动动作都需要独立 loading，按 action key 细分最直接。
function setPendingAction(actionKey: string, pending: boolean): void {
  pendingActions[actionKey] = pending;
}

// 模板只需要知道某个动作是不是 pending，不需要接触底层状态对象。
function isActionPending(actionKey: string): boolean {
  return pendingActions[actionKey] === true;
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
  stats: { candidateCount: number; visibleCount: number } | undefined
): string {
  if (!stats) {
    return "0 / 0";
  }

  return `${stats.candidateCount} / ${stats.visibleCount}`;
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

onMounted(() => {
  void loadSources();
});
</script>

<template>
  <a-spin :spinning="isRefreshing">
    <div :class="editorialContentPageClass" data-settings-page="sources">
      <section :class="editorialContentIntroSectionClass" data-settings-intro="sources">
        <p class="m-0 text-xs font-semibold uppercase tracking-[0.24em] text-editorial-text-muted">
          Sources Workbench
        </p>
        <h1 class="mt-3 text-3xl font-semibold tracking-tight text-editorial-text-main">
          在一个页面里看采集入口、来源库存和多源统计
        </h1>
        <p class="mt-3 max-w-3xl text-base leading-7 text-editorial-text-body">
          手动采集、手动发信和 source 开关逻辑保持不变，这里只把系统页外层切到 Tailwind panel，和统一壳层保持同一套节奏。
        </p>
      </section>

      <a-alert
        v-if="pageNotice"
        :message="pageNotice.message"
        :type="pageNotice.tone"
        show-icon
        closable
        @close="pageNotice = null"
      />

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
        <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <a-card :class="editorialContentCardClass" size="small">
            <a-statistic title="接入来源" :value="totalSourceCount" />
          </a-card>
          <a-card :class="editorialContentCardClass" size="small">
            <a-statistic title="已启用来源" :value="enabledSourceCount" />
          </a-card>
          <a-card :class="editorialContentCardClass" size="small">
            <a-statistic
              title="最近采集"
              :value="formatDateTime(sourcesModel.operations.lastCollectionRunAt)"
            />
          </a-card>
          <a-card :class="editorialContentCardClass" size="small">
            <a-statistic
              title="最近发信"
              :value="formatDateTime(sourcesModel.operations.lastSendLatestEmailAt)"
            />
          </a-card>
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
              <template v-else-if="column.key === 'publishedTodayCount'">
                {{ record.publishedTodayCount ?? 0 }}
              </template>
              <template v-else-if="column.key === 'collectedTodayCount'">
                {{ record.collectedTodayCount ?? 0 }}
              </template>
              <template v-else-if="column.key === 'hotStats'">
                {{ formatViewStats(record.viewStats?.hot) }}
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
                <a-space direction="vertical" size="small">
                  <a-typography-text strong>{{ record.name }}</a-typography-text>
                  <a-typography-text type="secondary">{{ record.kind }}</a-typography-text>
                </a-space>
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
              <template v-else-if="column.key === 'lastCollectedAt'">
                {{ formatDateTime(record.lastCollectedAt) }}
              </template>
              <template v-else-if="column.key === 'lastCollectionStatus'">
                <a-tag :color="record.lastCollectionStatus === 'completed' ? 'green' : 'gold'">
                  {{ record.lastCollectionStatus || "unknown" }}
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
    </div>
  </a-spin>
</template>
