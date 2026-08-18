import { message } from "ant-design-vue";
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";

import { HttpError } from "../../../services/http";
import { readAiTimelineAdminWorkbench } from "../../../services/aiTimelineAdminApi";
import {
  readSettingsSources,
  type SettingsAiTimelineAdminResponse,
  type SettingsSourcesResponse,
} from "../../../services/settingsApi";
import { useSourcesPageForms } from "./useSourcesPageForms";
import { useSourcesCollectionActions } from "./useSourcesCollectionActions";
import { useSourcesManagementActions } from "./useSourcesManagementActions";

type AlertTone = "success" | "info" | "warning" | "error";
type PageNotice = { tone: AlertTone; message: string };


export function useSourcesPageController() {
  const isLoading = ref(true);
  const isRefreshing = ref(false);
  const loadError = ref<string | null>(null);
  const pageNotice = ref<PageNotice | null>(null);
  const sourcesModel = ref<SettingsSourcesResponse | null>(null);
  const aiTimelineAdminModel = ref<SettingsAiTimelineAdminResponse | null>(null);
  const isAiTimelineSummaryLoading = ref(false);
  const pendingActions = reactive<Record<string, boolean>>({});
  const relativeNow = ref(Date.now());
  let nextCollectionTimer: number | null = null;

  const forms = useSourcesPageForms({
    onUnsupportedSourceEdit: (noticeMessage) => showNotice("info", noticeMessage)
  });

  const enabledSourceCount = computed(
    () => sourcesModel.value?.sources.filter((source) => source.isEnabled).length ?? 0
  );
  const totalSourceCount = computed(() => sourcesModel.value?.sources.length ?? 0);
  const totalTwitterAccountCount = computed(() => sourcesModel.value?.twitterAccounts?.length ?? 0);
  const enabledTwitterAccountCount = computed(
    () => sourcesModel.value?.twitterAccounts?.filter((account) => account.isEnabled).length ?? 0
  );
  const totalTwitterKeywordCount = computed(() => sourcesModel.value?.twitterSearchKeywords?.length ?? 0);
  const enabledTwitterKeywordCollectCount = computed(
    () => sourcesModel.value?.twitterSearchKeywords?.filter((keyword) => keyword.isCollectEnabled).length ?? 0
  );
  const enabledTwitterKeywordVisibleCount = computed(
    () => sourcesModel.value?.twitterSearchKeywords?.filter((keyword) => keyword.isVisible).length ?? 0
  );
  const totalHackerNewsQueryCount = computed(() => sourcesModel.value?.hackerNewsQueries?.length ?? 0);
  const enabledHackerNewsQueryCount = computed(
    () => sourcesModel.value?.hackerNewsQueries?.filter((query) => query.isEnabled).length ?? 0
  );
  const totalBilibiliQueryCount = computed(() => sourcesModel.value?.bilibiliQueries?.length ?? 0);
  const enabledBilibiliQueryCount = computed(
    () => sourcesModel.value?.bilibiliQueries?.filter((query) => query.isEnabled).length ?? 0
  );
  const totalWechatRssSourceCount = computed(() => sourcesModel.value?.wechatRssSources?.length ?? 0);
  const enabledWechatRssSourceCount = computed(
    () => sourcesModel.value?.wechatRssSources?.filter((source) => source.isEnabled).length ?? 0
  );
  const fixedWeiboKeywordCount = computed(() => sourcesModel.value?.weiboTrending?.fixedKeywords.length ?? 0);
  const twitterAccountCollectionMessage = computed(
    () =>
      sourcesModel.value?.capability.twitterAccountCollectionMessage ??
      "当前环境未配置 TWITTER_API_KEY；Twitter 账号可先维护，采集时会跳过。"
  );
  const twitterKeywordCollectionMessage = computed(
    () =>
      sourcesModel.value?.capability.twitterKeywordSearchMessage ??
      "当前环境未配置 TWITTER_API_KEY；Twitter 关键词可先维护，采集时会跳过。"
  );
  const hackerNewsCollectionMessage = computed(
    () =>
      sourcesModel.value?.capability.hackerNewsSearchMessage ??
      "Hacker News 搜索已就绪，可维护 query 并手动采集。"
  );
  const bilibiliCollectionMessage = computed(
    () =>
      sourcesModel.value?.capability.bilibiliSearchMessage ??
      "B 站搜索已就绪，可维护 query 并手动采集。"
  );
  const wechatRssCollectionMessage = computed(
    () =>
      sourcesModel.value?.capability.wechatRssMessage ??
      "微信公众号 RSS 已就绪，可批量维护 RSS 链接并手动采集。"
  );
  const weiboTrendingMessage = computed(
    () =>
      sourcesModel.value?.capability.weiboTrendingMessage ??
      "微博热搜榜匹配已就绪，固定 AI 关键词只进入 AI 热点。"
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

  // 表单提交前先统一整理 payload；当前普通来源弹窗只负责 RSS。

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

  // 数据收集页只读取 AI 时间线摘要；完整候选治理已拆到 /settings/ai-timeline。
  async function loadAiTimelineSummary(options: { silent?: boolean } = {}): Promise<boolean> {
    if (!options.silent) {
      isAiTimelineSummaryLoading.value = true;
    }

    try {
      aiTimelineAdminModel.value = await readAiTimelineAdminWorkbench({
        visibility: ["auto_visible", "manual_visible"],
        recentDays: 7,
        page: 1
      });
      return true;
    } catch (error) {
      showNotice("error", readActionErrorMessage(error, "AI 时间线摘要加载失败，请稍后重试。"));
      return false;
    } finally {
      if (!options.silent) {
        isAiTimelineSummaryLoading.value = false;
      }
    }
  }

  const { runSourcesAction, ...collectionActionHandlers } = useSourcesCollectionActions({
    sourcesModel,
    loadSources,
    showNotice,
    isActionPending,
    setPendingAction,
    readActionErrorMessage,
  });
  const managementActionHandlers = useSourcesManagementActions({
    forms,
    loadSources,
    showNotice,
    isActionPending,
    setPendingAction,
    readActionErrorMessage,
    runSourcesAction,
  });

  onMounted(() => {
    // 只做分钟级刷新，避免把 sources 工作台做成秒级跳动的监控面板。
    relativeNow.value = Date.now();
    nextCollectionTimer = window.setInterval(() => {
      relativeNow.value = Date.now();
    }, 60_000);
    void loadSources();
    void loadAiTimelineSummary();
  });

  onUnmounted(() => {
    if (nextCollectionTimer !== null) {
      window.clearInterval(nextCollectionTimer);
      nextCollectionTimer = null;
    }
  });

  return {
    isLoading,
    isRefreshing,
    loadError,
    pageNotice,
    sourcesModel,
    aiTimelineAdminModel,
    isAiTimelineSummaryLoading,
    ...forms,
    relativeNow,
    enabledSourceCount,
    totalSourceCount,
    totalTwitterAccountCount,
    enabledTwitterAccountCount,
    totalTwitterKeywordCount,
    enabledTwitterKeywordCollectCount,
    enabledTwitterKeywordVisibleCount,
    totalHackerNewsQueryCount,
    enabledHackerNewsQueryCount,
    totalBilibiliQueryCount,
    enabledBilibiliQueryCount,
    totalWechatRssSourceCount,
    enabledWechatRssSourceCount,
    fixedWeiboKeywordCount,
    twitterAccountCollectionMessage,
    twitterKeywordCollectionMessage,
    hackerNewsCollectionMessage,
    bilibiliCollectionMessage,
    wechatRssCollectionMessage,
    weiboTrendingMessage,
    isActionPending,
    loadSources,
    loadAiTimelineSummary,
    ...collectionActionHandlers,
    ...managementActionHandlers
  };
}
