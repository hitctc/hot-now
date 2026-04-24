import { message } from "ant-design-vue";
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";

import { HttpError } from "../../../services/http";
import {
  createBilibiliQuery,
  createHackerNewsQuery,
  createTwitterAccount,
  createTwitterSearchKeyword,
  createWechatRssSources,
  createSource,
  deleteBilibiliQuery,
  deleteHackerNewsQuery,
  deleteTwitterAccount,
  deleteTwitterSearchKeyword,
  deleteWechatRssSource,
  deleteSource,
  readSettingsSources,
  toggleBilibiliQuery,
  toggleHackerNewsQuery,
  toggleTwitterAccount,
  toggleTwitterSearchKeywordCollect,
  toggleTwitterSearchKeywordVisible,
  toggleSource,
  triggerManualBilibiliCollect,
  triggerManualHackerNewsCollect,
  triggerManualTwitterCollect,
  triggerManualTwitterKeywordCollect,
  triggerManualWeiboTrendingCollect,
  triggerManualWechatRssCollect,
  updateTwitterAccount,
  updateTwitterSearchKeyword,
  updateBilibiliQuery,
  updateHackerNewsQuery,
  updateSource,
  updateSourceDisplayMode,
  triggerManualCollect,
  triggerManualSendLatestEmail,
  type ManualBilibiliCollectResponse,
  type ManualHackerNewsCollectResponse,
  type ManualCollectResponse,
  type ManualTwitterCollectResponse,
  type ManualTwitterKeywordCollectResponse,
  type ManualWeiboTrendingCollectResponse,
  type ManualWechatRssCollectResponse,
  type ManualSendLatestEmailResponse,
  type SaveBilibiliQueryPayload,
  type SaveHackerNewsQueryPayload,
  type SaveSourcePayload,
  type SettingsBilibiliQuery,
  type SettingsHackerNewsQuery,
  type SettingsSourceItem,
  type SettingsSourcesResponse,
  type SettingsTwitterAccount,
  type SettingsTwitterSearchKeyword,
  type SettingsWechatRssSource,
  type SaveTwitterAccountPayload,
  type SaveTwitterSearchKeywordPayload
} from "../../../services/settingsApi";
import type {
  BilibiliQueryFormState,
  BilibiliQueryModalMode,
  HackerNewsQueryFormState,
  HackerNewsQueryModalMode,
  SourceFormState,
  SourceModalMode,
  TwitterAccountFormState,
  TwitterAccountModalMode,
  TwitterKeywordFormState,
  TwitterKeywordModalMode,
  WechatRssFormState
} from "./sourcesPageShared";

type AlertTone = "success" | "info" | "warning" | "error";
type PageNotice = { tone: AlertTone; message: string };


export function useSourcesPageController() {
  const isLoading = ref(true);
  const isRefreshing = ref(false);
  const loadError = ref<string | null>(null);
  const pageNotice = ref<PageNotice | null>(null);
  const sourcesModel = ref<SettingsSourcesResponse | null>(null);
  const pendingActions = reactive<Record<string, boolean>>({});
  const isSourceModalOpen = ref(false);
  const isTwitterAccountModalOpen = ref(false);
  const isTwitterKeywordModalOpen = ref(false);
  const isHackerNewsQueryModalOpen = ref(false);
  const isBilibiliQueryModalOpen = ref(false);
  const isWechatRssModalOpen = ref(false);
  const sourceModalMode = ref<SourceModalMode>("create");
  const twitterAccountModalMode = ref<TwitterAccountModalMode>("create");
  const twitterKeywordModalMode = ref<TwitterKeywordModalMode>("create");
  const hackerNewsQueryModalMode = ref<HackerNewsQueryModalMode>("create");
  const bilibiliQueryModalMode = ref<BilibiliQueryModalMode>("create");
  const sourceFormError = ref<string | null>(null);
  const twitterAccountFormError = ref<string | null>(null);
  const twitterKeywordFormError = ref<string | null>(null);
  const hackerNewsQueryFormError = ref<string | null>(null);
  const bilibiliQueryFormError = ref<string | null>(null);
  const wechatRssFormError = ref<string | null>(null);
  const sourceForm = reactive<SourceFormState>(createEmptySourceForm());
  const twitterAccountForm = reactive<TwitterAccountFormState>(createEmptyTwitterAccountForm());
  const twitterKeywordForm = reactive<TwitterKeywordFormState>(createEmptyTwitterKeywordForm());
  const hackerNewsQueryForm = reactive<HackerNewsQueryFormState>(createEmptyHackerNewsQueryForm());
  const bilibiliQueryForm = reactive<BilibiliQueryFormState>(createEmptyBilibiliQueryForm());
  const wechatRssForm = reactive<WechatRssFormState>(createEmptyWechatRssForm());
  const relativeNow = ref(Date.now());
  let nextCollectionTimer: number | null = null;

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
  function createEmptySourceForm(): SourceFormState {
    return {
      kind: "",
      rssUrl: ""
    };
  }

  // 每次打开弹窗都从同一套初始值开始，避免上一次编辑残留到下一次新增。
  function resetSourceForm(): void {
    Object.assign(sourceForm, createEmptySourceForm());
    sourceFormError.value = null;
  }

  function createEmptyTwitterAccountForm(): TwitterAccountFormState {
    return {
      id: null,
      username: "",
      displayName: "",
      category: "official_vendor",
      priority: 90,
      includeReplies: false,
      notes: ""
    };
  }

  function resetTwitterAccountForm(): void {
    Object.assign(twitterAccountForm, createEmptyTwitterAccountForm());
    twitterAccountFormError.value = null;
  }

  function createEmptyTwitterKeywordForm(): TwitterKeywordFormState {
    return {
      id: null,
      keyword: "",
      category: "topic",
      priority: 60,
      isCollectEnabled: true,
      isVisible: true,
      notes: ""
    };
  }

  function resetTwitterKeywordForm(): void {
    Object.assign(twitterKeywordForm, createEmptyTwitterKeywordForm());
    twitterKeywordFormError.value = null;
  }

  function createEmptyHackerNewsQueryForm(): HackerNewsQueryFormState {
    return {
      id: null,
      query: "",
      priority: 60,
      isEnabled: true,
      notes: ""
    };
  }

  function resetHackerNewsQueryForm(): void {
    Object.assign(hackerNewsQueryForm, createEmptyHackerNewsQueryForm());
    hackerNewsQueryFormError.value = null;
  }

  function createEmptyBilibiliQueryForm(): BilibiliQueryFormState {
    return {
      id: null,
      query: "",
      priority: 60,
      isEnabled: true,
      notes: ""
    };
  }

  function resetBilibiliQueryForm(): void {
    Object.assign(bilibiliQueryForm, createEmptyBilibiliQueryForm());
    bilibiliQueryFormError.value = null;
  }

  function createEmptyWechatRssForm(): WechatRssFormState {
    return {
      rssUrls: ""
    };
  }

  function resetWechatRssForm(): void {
    Object.assign(wechatRssForm, createEmptyWechatRssForm());
    wechatRssFormError.value = null;
  }

  // 新增模式只需要清空表单并打开弹窗，不再引入额外的临时草稿状态。
  function openCreateSourceModal(): void {
    sourceModalMode.value = "create";
    resetSourceForm();
    isSourceModalOpen.value = true;
  }

  function openCreateTwitterAccountModal(): void {
    twitterAccountModalMode.value = "create";
    resetTwitterAccountForm();
    isTwitterAccountModalOpen.value = true;
  }

  function openCreateTwitterKeywordModal(): void {
    twitterKeywordModalMode.value = "create";
    resetTwitterKeywordForm();
    isTwitterKeywordModalOpen.value = true;
  }

  function openCreateHackerNewsQueryModal(): void {
    hackerNewsQueryModalMode.value = "create";
    resetHackerNewsQueryForm();
    isHackerNewsQueryModalOpen.value = true;
  }

  function openCreateBilibiliQueryModal(): void {
    bilibiliQueryModalMode.value = "create";
    resetBilibiliQueryForm();
    isBilibiliQueryModalOpen.value = true;
  }

  function openCreateWechatRssModal(): void {
    resetWechatRssForm();
    isWechatRssModalOpen.value = true;
  }

  // 编辑模式只回填 RSS 来源已有配置，kind 继续锁定，避免把“编辑”做成“重命名来源主键”。
  function openEditSourceModal(source: SettingsSourceItem): void {
    if (source.sourceType !== "rss") {
      showNotice("info", "该来源后续会迁移到单独配置表，这里暂不再编辑。");
      return;
    }

    sourceModalMode.value = "update";
    resetSourceForm();
    sourceForm.kind = source.kind;
    sourceForm.rssUrl = source.rssUrl ?? "";
    isSourceModalOpen.value = true;
  }

  function openEditTwitterAccountModal(account: SettingsTwitterAccount): void {
    twitterAccountModalMode.value = "update";
    resetTwitterAccountForm();
    twitterAccountForm.id = account.id;
    twitterAccountForm.username = account.username;
    twitterAccountForm.displayName = account.displayName;
    twitterAccountForm.category = account.category;
    twitterAccountForm.priority = account.priority;
    twitterAccountForm.includeReplies = account.includeReplies;
    twitterAccountForm.notes = account.notes ?? "";
    isTwitterAccountModalOpen.value = true;
  }

  function openEditTwitterKeywordModal(keyword: SettingsTwitterSearchKeyword): void {
    twitterKeywordModalMode.value = "update";
    resetTwitterKeywordForm();
    twitterKeywordForm.id = keyword.id;
    twitterKeywordForm.keyword = keyword.keyword;
    twitterKeywordForm.category = keyword.category;
    twitterKeywordForm.priority = keyword.priority;
    twitterKeywordForm.isCollectEnabled = keyword.isCollectEnabled;
    twitterKeywordForm.isVisible = keyword.isVisible;
    twitterKeywordForm.notes = keyword.notes ?? "";
    isTwitterKeywordModalOpen.value = true;
  }

  function openEditHackerNewsQueryModal(query: SettingsHackerNewsQuery): void {
    hackerNewsQueryModalMode.value = "update";
    resetHackerNewsQueryForm();
    hackerNewsQueryForm.id = query.id;
    hackerNewsQueryForm.query = query.query;
    hackerNewsQueryForm.priority = query.priority;
    hackerNewsQueryForm.isEnabled = query.isEnabled;
    hackerNewsQueryForm.notes = query.notes ?? "";
    isHackerNewsQueryModalOpen.value = true;
  }

  function openEditBilibiliQueryModal(query: SettingsBilibiliQuery): void {
    bilibiliQueryModalMode.value = "update";
    resetBilibiliQueryForm();
    bilibiliQueryForm.id = query.id;
    bilibiliQueryForm.query = query.query;
    bilibiliQueryForm.priority = query.priority;
    bilibiliQueryForm.isEnabled = query.isEnabled;
    bilibiliQueryForm.notes = query.notes ?? "";
    isBilibiliQueryModalOpen.value = true;
  }

  // 关闭弹窗时顺手清掉局部错误，避免旧错误粘在下一次操作里。
  function closeSourceModal(): void {
    isSourceModalOpen.value = false;
    sourceFormError.value = null;
  }

  function closeTwitterAccountModal(): void {
    isTwitterAccountModalOpen.value = false;
    twitterAccountFormError.value = null;
  }

  function closeTwitterKeywordModal(): void {
    isTwitterKeywordModalOpen.value = false;
    twitterKeywordFormError.value = null;
  }

  function closeHackerNewsQueryModal(): void {
    isHackerNewsQueryModalOpen.value = false;
    hackerNewsQueryFormError.value = null;
  }

  function closeBilibiliQueryModal(): void {
    isBilibiliQueryModalOpen.value = false;
    bilibiliQueryFormError.value = null;
  }

  function closeWechatRssModal(): void {
    isWechatRssModalOpen.value = false;
    wechatRssFormError.value = null;
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

  // 表单提交前先统一整理 payload；当前普通来源弹窗只负责 RSS。
  function buildSourceSavePayload(): { ok: true; payload: SaveSourcePayload } | { ok: false; message: string } {
    const rssUrl = sourceForm.rssUrl.trim();

    if (!rssUrl) {
      return { ok: false, message: "请填写 RSS 地址。" };
    }

    return {
      ok: true,
      payload:
        sourceModalMode.value === "update"
          ? {
              kind: sourceForm.kind,
              sourceType: "rss",
              rssUrl
            }
          : {
              sourceType: "rss",
              rssUrl
            }
    };
  }

  function buildTwitterAccountSavePayload(): { ok: true; payload: SaveTwitterAccountPayload } | { ok: false; message: string } {
    const username = twitterAccountForm.username.trim();

    if (!username) {
      return { ok: false, message: "请填写 Twitter username。" };
    }

    if (!Number.isInteger(twitterAccountForm.priority) || twitterAccountForm.priority < 0 || twitterAccountForm.priority > 100) {
      return { ok: false, message: "优先级需要是 0 到 100 之间的整数。" };
    }

    return {
      ok: true,
      payload: {
        ...(twitterAccountModalMode.value === "update" && twitterAccountForm.id ? { id: twitterAccountForm.id } : {}),
        username,
        displayName: twitterAccountForm.displayName.trim() || null,
        category: twitterAccountForm.category,
        priority: twitterAccountForm.priority,
        includeReplies: twitterAccountForm.includeReplies,
        notes: twitterAccountForm.notes.trim() || null
      }
    };
  }

  function buildTwitterKeywordSavePayload(): { ok: true; payload: SaveTwitterSearchKeywordPayload } | { ok: false; message: string } {
    const keyword = twitterKeywordForm.keyword.trim();

    if (!keyword) {
      return { ok: false, message: "请填写 Twitter 关键词。" };
    }

    if (!Number.isInteger(twitterKeywordForm.priority) || twitterKeywordForm.priority < 0 || twitterKeywordForm.priority > 100) {
      return { ok: false, message: "优先级需要是 0 到 100 之间的整数。" };
    }

    return {
      ok: true,
      payload: {
        ...(twitterKeywordModalMode.value === "update" && twitterKeywordForm.id ? { id: twitterKeywordForm.id } : {}),
        keyword,
        category: twitterKeywordForm.category,
        priority: twitterKeywordForm.priority,
        isCollectEnabled: twitterKeywordForm.isCollectEnabled,
        isVisible: twitterKeywordForm.isVisible,
        notes: twitterKeywordForm.notes.trim() || null
      }
    };
  }

  function buildHackerNewsQuerySavePayload(): { ok: true; payload: SaveHackerNewsQueryPayload } | { ok: false; message: string } {
    const query = hackerNewsQueryForm.query.trim();

    if (!query) {
      return { ok: false, message: "请填写 Hacker News 查询词。" };
    }

    if (!Number.isInteger(hackerNewsQueryForm.priority) || hackerNewsQueryForm.priority < 0 || hackerNewsQueryForm.priority > 100) {
      return { ok: false, message: "优先级需要是 0 到 100 之间的整数。" };
    }

    return {
      ok: true,
      payload: {
        ...(hackerNewsQueryModalMode.value === "update" && hackerNewsQueryForm.id ? { id: hackerNewsQueryForm.id } : {}),
        query,
        priority: hackerNewsQueryForm.priority,
        isEnabled: hackerNewsQueryForm.isEnabled,
        notes: hackerNewsQueryForm.notes.trim() || null
      }
    };
  }

  function buildBilibiliQuerySavePayload(): { ok: true; payload: SaveBilibiliQueryPayload } | { ok: false; message: string } {
    const query = bilibiliQueryForm.query.trim();

    if (!query) {
      return { ok: false, message: "请填写 B 站查询词。" };
    }

    if (!Number.isInteger(bilibiliQueryForm.priority) || bilibiliQueryForm.priority < 0 || bilibiliQueryForm.priority > 100) {
      return { ok: false, message: "优先级需要是 0 到 100 之间的整数。" };
    }

    return {
      ok: true,
      payload: {
        ...(bilibiliQueryModalMode.value === "update" && bilibiliQueryForm.id ? { id: bilibiliQueryForm.id } : {}),
        query,
        priority: bilibiliQueryForm.priority,
        isEnabled: bilibiliQueryForm.isEnabled,
        notes: bilibiliQueryForm.notes.trim() || null
      }
    };
  }

  function buildWechatRssCreatePayload(): { ok: true; payload: { rssUrls: string } } | { ok: false; message: string } {
    const rssUrls = wechatRssForm.rssUrls.trim();

    if (!rssUrls) {
      return { ok: false, message: "请至少填写一个微信公众号 RSS 链接。" };
    }

    return {
      ok: true,
      payload: { rssUrls }
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

  // Twitter 账号采集单独执行，并把启用账号数、入库条数和失败数直接回显给操作人。
  async function handleManualTwitterCollect(): Promise<void> {
    await runSourcesAction("manual:twitter-collect", () => triggerManualTwitterCollect(), {
      fallbackMessage: "Twitter 账号采集启动失败，请稍后再试。",
      successMessage: (result: ManualTwitterCollectResponse) =>
        result.accepted
          ? `Twitter 账号采集已完成：启用 ${result.enabledAccountCount} 个账号，入库 ${result.persistedContentItemCount} 条内容，失败 ${result.failureCount} 个。`
          : "Twitter 账号采集未成功启动。",
      reasonMessages: {
        "already-running": "当前已有任务执行中，请稍后再试。",
        "twitter-api-key-missing": "当前环境未配置 TWITTER_API_KEY，暂时无法采集 Twitter 账号。",
        "no-enabled-twitter-accounts": "当前没有启用中的 Twitter 账号，请先启用至少一个账号。",
        unauthorized: "请先登录后再操作。"
      }
    });
  }

  // 关键词搜索只保留手动执行，成功提示会直接回显本轮处理关键词数与复用条数，便于控制 credits。
  async function handleManualTwitterKeywordCollect(): Promise<void> {
    await runSourcesAction("manual:twitter-keyword-collect", () => triggerManualTwitterKeywordCollect(), {
      fallbackMessage: "Twitter 关键词采集启动失败，请稍后再试。",
      successMessage: (result: ManualTwitterKeywordCollectResponse) =>
        result.accepted
          ? `Twitter 关键词采集已完成：处理 ${result.processedKeywordCount} 个关键词，新入库 ${result.persistedContentItemCount} 条，复用 ${result.reusedContentItemCount} 条，失败 ${result.failureCount} 个。`
          : "Twitter 关键词采集未成功启动。",
      reasonMessages: {
        "already-running": "当前已有任务执行中，请稍后再试。",
        "twitter-api-key-missing": "当前环境未配置 TWITTER_API_KEY，暂时无法采集 Twitter 关键词。",
        "no-enabled-twitter-keywords": "当前没有启用中的 Twitter 关键词，请先启用至少一个关键词。",
        unauthorized: "请先登录后再操作。"
      }
    });
  }

  // HN 搜索第一版只走手动执行，成功提示直接回显处理 query 数、入库条数和复用条数。
  async function handleManualHackerNewsCollect(): Promise<void> {
    await runSourcesAction("manual:hackernews-collect", () => triggerManualHackerNewsCollect(), {
      fallbackMessage: "Hacker News 搜索启动失败，请稍后再试。",
      successMessage: (result: ManualHackerNewsCollectResponse) =>
        result.accepted
          ? `Hacker News 搜索已完成：处理 ${result.processedQueryCount} 个 query，新入库 ${result.persistedContentItemCount} 条，复用 ${result.reusedContentItemCount} 条，失败 ${result.failureCount} 个。`
          : "Hacker News 搜索未成功启动。",
      reasonMessages: {
        "already-running": "当前已有任务执行中，请稍后再试。",
        "no-enabled-hackernews-queries": "当前没有启用中的 Hacker News query，请先启用至少一个 query。",
        unauthorized: "请先登录后再操作。"
      }
    });
  }

  // B 站第一版也只保留手动采集，并把 query 数、入库数和复用数直接展示出来。
  async function handleManualBilibiliCollect(): Promise<void> {
    await runSourcesAction("manual:bilibili-collect", () => triggerManualBilibiliCollect(), {
      fallbackMessage: "B 站搜索启动失败，请稍后再试。",
      successMessage: (result: ManualBilibiliCollectResponse) =>
        result.accepted
          ? `B 站搜索已完成：处理 ${result.processedQueryCount} 个 query，新入库 ${result.persistedContentItemCount} 条，复用 ${result.reusedContentItemCount} 条，失败 ${result.failureCount} 个。`
          : "B 站搜索未成功启动。",
      reasonMessages: {
        "already-running": "当前已有任务执行中，请稍后再试。",
        "no-enabled-bilibili-queries": "当前没有启用中的 B 站 query，请先启用至少一个 query。",
        unauthorized: "请先登录后再操作。"
      }
    });
  }

  // 公众号 RSS 只在用户明确点击时抓取，成功提示直接回显本轮写入和失败情况。
  async function handleManualWechatRssCollect(): Promise<void> {
    await runSourcesAction("manual:wechat-rss-collect", () => triggerManualWechatRssCollect(), {
      fallbackMessage: "微信公众号 RSS 采集启动失败，请稍后再试。",
      successMessage: (result: ManualWechatRssCollectResponse) =>
        result.accepted
          ? `微信公众号 RSS 采集已完成：启用 ${result.enabledSourceCount} 个 RSS，抓取 ${result.fetchedItemCount} 条，写入/更新 ${result.persistedContentItemCount} 条，失败 ${result.failureCount} 个。`
          : "微信公众号 RSS 采集未成功启动。",
      reasonMessages: {
        "already-running": "当前已有任务执行中，请稍后再试。",
        "no-enabled-wechat-rss-sources": "当前没有可采集的微信公众号 RSS，请先新增至少一个 RSS 链接。",
        unauthorized: "请先登录后再操作。"
      }
    });
  }

  // 微博热搜榜只做固定 AI 关键词匹配，因此这里只有单一手动入口，没有额外 CRUD。
  async function handleManualWeiboTrendingCollect(): Promise<void> {
    await runSourcesAction("manual:weibo-trending-collect", () => triggerManualWeiboTrendingCollect(), {
      fallbackMessage: "微博热搜榜匹配启动失败，请稍后再试。",
      successMessage: (result: ManualWeiboTrendingCollectResponse) =>
        result.accepted
          ? `微博热搜榜匹配已完成：命中 ${result.matchedTopicCount} 个话题，新入库 ${result.persistedContentItemCount} 条，复用 ${result.reusedContentItemCount} 条，失败 ${result.failureCount} 次。`
          : "微博热搜榜匹配未成功启动。",
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

  // 来源保存沿用现有 notice + toast 约定；普通来源弹窗只提交 RSS payload。
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
          "already-exists": "系统生成的来源标识已存在，请换一个链接或名称后重试。",
          "not-found": "对应来源不存在，可能已被移除。",
          "built-in": "内置来源不允许编辑。",
          "invalid-input": "来源配置不合法，请检查后重试。",
          "invalid-rss-feed": "这个 RSS 地址暂时无法识别，请检查链接是否正确。"
        }
      );

      sourceFormError.value = message;
      showNotice("error", message);
    } finally {
      setPendingAction("source:submit", false);
    }
  }

  async function handleSubmitTwitterAccount(): Promise<void> {
    if (isActionPending("twitter-account:submit")) {
      return;
    }

    const payload = buildTwitterAccountSavePayload();

    if (!payload.ok) {
      twitterAccountFormError.value = payload.message;
      return;
    }

    twitterAccountFormError.value = null;
    setPendingAction("twitter-account:submit", true);

    try {
      if (twitterAccountModalMode.value === "create") {
        await createTwitterAccount(payload.payload);
      } else {
        await updateTwitterAccount(payload.payload);
      }

      const refreshed = await loadSources({ silent: true });
      closeTwitterAccountModal();
      showNotice(
        "success",
        refreshed
          ? twitterAccountModalMode.value === "create"
            ? "已新增 Twitter 账号。"
            : "已更新 Twitter 账号。"
          : twitterAccountModalMode.value === "create"
            ? "已新增 Twitter 账号，但最新数据刷新失败，请稍后手动刷新。"
            : "已更新 Twitter 账号，但最新数据刷新失败，请稍后手动刷新。"
      );
    } catch (error) {
      const message = readActionErrorMessage(
        error,
        twitterAccountModalMode.value === "create" ? "Twitter 账号保存失败，请稍后再试。" : "Twitter 账号更新失败，请稍后再试。",
        {
          "invalid-username": "Twitter username 不合法，请检查后重试。",
          "invalid-category": "Twitter 账号分类不合法。",
          "invalid-priority": "Twitter 账号优先级不合法。",
          "duplicate-username": "这个 Twitter username 已存在。",
          "not-found": "对应 Twitter 账号不存在，可能已被移除。"
        }
      );

      twitterAccountFormError.value = message;
      showNotice("error", message);
    } finally {
      setPendingAction("twitter-account:submit", false);
    }
  }

  async function handleSubmitTwitterKeyword(): Promise<void> {
    if (isActionPending("twitter-keyword:submit")) {
      return;
    }

    const payload = buildTwitterKeywordSavePayload();

    if (!payload.ok) {
      twitterKeywordFormError.value = payload.message;
      return;
    }

    twitterKeywordFormError.value = null;
    setPendingAction("twitter-keyword:submit", true);

    try {
      if (twitterKeywordModalMode.value === "create") {
        await createTwitterSearchKeyword(payload.payload);
      } else {
        await updateTwitterSearchKeyword(payload.payload);
      }

      const refreshed = await loadSources({ silent: true });
      closeTwitterKeywordModal();
      showNotice(
        "success",
        refreshed
          ? twitterKeywordModalMode.value === "create"
            ? "已新增 Twitter 关键词。"
            : "已更新 Twitter 关键词。"
          : twitterKeywordModalMode.value === "create"
            ? "已新增 Twitter 关键词，但最新数据刷新失败，请稍后手动刷新。"
            : "已更新 Twitter 关键词，但最新数据刷新失败，请稍后手动刷新。"
      );
    } catch (error) {
      const message = readActionErrorMessage(
        error,
        twitterKeywordModalMode.value === "create" ? "Twitter 关键词保存失败，请稍后再试。" : "Twitter 关键词更新失败，请稍后再试。",
        {
          "invalid-keyword": "Twitter 关键词不合法，请检查后重试。",
          "invalid-category": "Twitter 关键词分类不合法。",
          "invalid-priority": "Twitter 关键词优先级不合法。",
          "duplicate-keyword": "这个 Twitter 关键词已存在。",
          "not-found": "对应 Twitter 关键词不存在，可能已被移除。"
        }
      );

      twitterKeywordFormError.value = message;
      showNotice("error", message);
    } finally {
      setPendingAction("twitter-keyword:submit", false);
    }
  }

  async function handleSubmitHackerNewsQuery(): Promise<void> {
    if (isActionPending("hackernews-query:submit")) {
      return;
    }

    const payload = buildHackerNewsQuerySavePayload();

    if (!payload.ok) {
      hackerNewsQueryFormError.value = payload.message;
      return;
    }

    hackerNewsQueryFormError.value = null;
    setPendingAction("hackernews-query:submit", true);

    try {
      if (hackerNewsQueryModalMode.value === "create") {
        await createHackerNewsQuery(payload.payload);
      } else {
        await updateHackerNewsQuery(payload.payload);
      }

      const refreshed = await loadSources({ silent: true });
      closeHackerNewsQueryModal();
      showNotice(
        "success",
        refreshed
          ? hackerNewsQueryModalMode.value === "create"
            ? "已新增 Hacker News query。"
            : "已更新 Hacker News query。"
          : hackerNewsQueryModalMode.value === "create"
            ? "已新增 Hacker News query，但最新数据刷新失败，请稍后手动刷新。"
            : "已更新 Hacker News query，但最新数据刷新失败，请稍后手动刷新。"
      );
    } catch (error) {
      const message = readActionErrorMessage(
        error,
        hackerNewsQueryModalMode.value === "create" ? "Hacker News query 保存失败，请稍后再试。" : "Hacker News query 更新失败，请稍后再试。",
        {
          "invalid-hackernews-query": "Hacker News 查询词不合法，请检查后重试。",
          "invalid-priority": "Hacker News query 优先级不合法。",
          "duplicate-query": "这个 Hacker News query 已存在。",
          "invalid-hackernews-query-payload": "Hacker News query 配置不完整，请检查后重试。",
          "hackernews-disabled": "当前环境未启用 Hacker News 搜索。",
          "not-found": "对应 Hacker News query 不存在，可能已被移除。"
        }
      );

      hackerNewsQueryFormError.value = message;
      showNotice("error", message);
    } finally {
      setPendingAction("hackernews-query:submit", false);
    }
  }

  async function handleSubmitBilibiliQuery(): Promise<void> {
    if (isActionPending("bilibili-query:submit")) {
      return;
    }

    const payload = buildBilibiliQuerySavePayload();

    if (!payload.ok) {
      bilibiliQueryFormError.value = payload.message;
      return;
    }

    bilibiliQueryFormError.value = null;
    setPendingAction("bilibili-query:submit", true);

    try {
      if (bilibiliQueryModalMode.value === "create") {
        await createBilibiliQuery(payload.payload);
      } else {
        await updateBilibiliQuery(payload.payload);
      }

      const refreshed = await loadSources({ silent: true });
      closeBilibiliQueryModal();
      showNotice(
        "success",
        refreshed
          ? bilibiliQueryModalMode.value === "create"
            ? "已新增 B 站 query。"
            : "已更新 B 站 query。"
          : bilibiliQueryModalMode.value === "create"
            ? "已新增 B 站 query，但最新数据刷新失败，请稍后手动刷新。"
            : "已更新 B 站 query，但最新数据刷新失败，请稍后手动刷新。"
      );
    } catch (error) {
      const message = readActionErrorMessage(
        error,
        bilibiliQueryModalMode.value === "create" ? "B 站 query 保存失败，请稍后再试。" : "B 站 query 更新失败，请稍后再试。",
        {
          "invalid-bilibili-query": "B 站查询词不合法，请检查后重试。",
          "invalid-priority": "B 站 query 优先级不合法。",
          "duplicate-query": "这个 B 站 query 已存在。",
          "invalid-bilibili-query-payload": "B 站 query 配置不完整，请检查后重试。",
          "bilibili-disabled": "当前环境未启用 B 站搜索。",
          "not-found": "对应 B 站 query 不存在，可能已被移除。"
        }
      );

      bilibiliQueryFormError.value = message;
      showNotice("error", message);
    } finally {
      setPendingAction("bilibili-query:submit", false);
    }
  }

  async function handleSubmitWechatRssSources(): Promise<void> {
    if (isActionPending("wechat-rss:submit")) {
      return;
    }

    const payload = buildWechatRssCreatePayload();

    if (!payload.ok) {
      wechatRssFormError.value = payload.message;
      return;
    }

    wechatRssFormError.value = null;
    setPendingAction("wechat-rss:submit", true);

    try {
      const result = await createWechatRssSources(payload.payload);
      const refreshed = await loadSources({ silent: true });
      closeWechatRssModal();
      const skippedText = result.skippedDuplicateUrls.length > 0
        ? `，跳过重复 ${result.skippedDuplicateUrls.length} 条`
        : "";
      showNotice(
        "success",
        refreshed
          ? `已新增 ${result.created.length} 条微信公众号 RSS${skippedText}。`
          : `已新增 ${result.created.length} 条微信公众号 RSS${skippedText}，但最新数据刷新失败，请稍后手动刷新。`
      );
    } catch (error) {
      const notice = readActionErrorMessage(
        error,
        "微信公众号 RSS 保存失败，请稍后再试。",
        {
          "empty-rss-url-list": "请至少填写一个微信公众号 RSS 链接。",
          "invalid-rss-url": "存在不合法的 RSS 链接，请检查后重试。",
          "invalid-wechat-rss-payload": "微信公众号 RSS 配置不完整，请检查后重试。",
          "wechat-rss-disabled": "当前环境未启用微信公众号 RSS。"
        }
      );

      wechatRssFormError.value = notice;
      showNotice("error", notice);
    } finally {
      setPendingAction("wechat-rss:submit", false);
    }
  }

  async function handleToggleTwitterAccount(account: SettingsTwitterAccount): Promise<void> {
    const nextEnable = !account.isEnabled;

    await runSourcesAction(
      `twitter-toggle:${account.id}`,
      () => toggleTwitterAccount(account.id, nextEnable),
      {
        fallbackMessage: "Twitter 账号状态切换失败，请稍后再试。",
        successMessage: nextEnable ? "已启用 Twitter 账号。" : "已停用 Twitter 账号。",
        reasonMessages: {
          "invalid-twitter-account-id": "Twitter 账号 ID 不合法。",
          "invalid-twitter-account-enable": "Twitter 账号启用状态参数不合法。",
          "not-found": "对应 Twitter 账号不存在，可能已被移除。"
        }
      }
    );
  }

  async function handleDeleteTwitterAccount(account: SettingsTwitterAccount): Promise<void> {
    await runSourcesAction(`twitter-delete:${account.id}`, () => deleteTwitterAccount(account.id), {
      fallbackMessage: "删除 Twitter 账号失败，请稍后再试。",
      successMessage: "已删除 Twitter 账号。",
      reasonMessages: {
        "invalid-twitter-account-id": "Twitter 账号 ID 不合法。",
        "not-found": "对应 Twitter 账号不存在，可能已被移除。"
      }
    });
  }

  async function handleToggleTwitterKeywordCollect(keyword: SettingsTwitterSearchKeyword): Promise<void> {
    const nextEnable = !keyword.isCollectEnabled;

    await runSourcesAction(
      `twitter-keyword-collect-toggle:${keyword.id}`,
      () => toggleTwitterSearchKeywordCollect(keyword.id, nextEnable),
      {
        fallbackMessage: "Twitter 关键词采集开关更新失败，请稍后再试。",
        successMessage: nextEnable ? "已启用 Twitter 关键词采集。" : "已停用 Twitter 关键词采集。",
        reasonMessages: {
          "invalid-twitter-keyword-id": "Twitter 关键词 ID 不合法。",
          "invalid-twitter-keyword-collect-enable": "Twitter 关键词采集开关参数不合法。",
          "not-found": "对应 Twitter 关键词不存在，可能已被移除。"
        }
      }
    );
  }

  async function handleToggleTwitterKeywordVisible(keyword: SettingsTwitterSearchKeyword): Promise<void> {
    const nextEnable = !keyword.isVisible;

    await runSourcesAction(
      `twitter-keyword-visible-toggle:${keyword.id}`,
      () => toggleTwitterSearchKeywordVisible(keyword.id, nextEnable),
      {
        fallbackMessage: "Twitter 关键词展示开关更新失败，请稍后再试。",
        successMessage: nextEnable ? "已开启 Twitter 关键词展示。" : "已关闭 Twitter 关键词展示。",
        reasonMessages: {
          "invalid-twitter-keyword-id": "Twitter 关键词 ID 不合法。",
          "invalid-twitter-keyword-visible-enable": "Twitter 关键词展示开关参数不合法。",
          "not-found": "对应 Twitter 关键词不存在，可能已被移除。"
        }
      }
    );
  }

  async function handleDeleteTwitterKeyword(keyword: SettingsTwitterSearchKeyword): Promise<void> {
    await runSourcesAction(`twitter-keyword-delete:${keyword.id}`, () => deleteTwitterSearchKeyword(keyword.id), {
      fallbackMessage: "删除 Twitter 关键词失败，请稍后再试。",
      successMessage: "已删除 Twitter 关键词。",
      reasonMessages: {
        "invalid-twitter-keyword-id": "Twitter 关键词 ID 不合法。",
        "not-found": "对应 Twitter 关键词不存在，可能已被移除。"
      }
    });
  }

  async function handleToggleHackerNewsQuery(query: SettingsHackerNewsQuery): Promise<void> {
    const nextEnable = !query.isEnabled;

    await runSourcesAction(
      `hackernews-toggle:${query.id}`,
      () => toggleHackerNewsQuery(query.id, nextEnable),
      {
        fallbackMessage: "Hacker News query 开关更新失败，请稍后再试。",
        successMessage: nextEnable ? "已启用 Hacker News query。" : "已停用 Hacker News query。",
        reasonMessages: {
          "invalid-hackernews-query-id": "Hacker News query ID 不合法。",
          "invalid-hackernews-query-enable": "Hacker News query 开关参数不合法。",
          "hackernews-disabled": "当前环境未启用 Hacker News 搜索。",
          "not-found": "对应 Hacker News query 不存在，可能已被移除。"
        }
      }
    );
  }

  async function handleDeleteHackerNewsQuery(query: SettingsHackerNewsQuery): Promise<void> {
    await runSourcesAction(`hackernews-delete:${query.id}`, () => deleteHackerNewsQuery(query.id), {
      fallbackMessage: "删除 Hacker News query 失败，请稍后再试。",
      successMessage: "已删除 Hacker News query。",
      reasonMessages: {
        "invalid-hackernews-query-id": "Hacker News query ID 不合法。",
        "hackernews-disabled": "当前环境未启用 Hacker News 搜索。",
        "not-found": "对应 Hacker News query 不存在，可能已被移除。"
      }
    });
  }

  async function handleToggleBilibiliQuery(query: SettingsBilibiliQuery): Promise<void> {
    const nextEnable = !query.isEnabled;

    await runSourcesAction(
      `bilibili-toggle:${query.id}`,
      () => toggleBilibiliQuery(query.id, nextEnable),
      {
        fallbackMessage: "B 站 query 开关更新失败，请稍后再试。",
        successMessage: nextEnable ? "已启用 B 站 query。" : "已停用 B 站 query。",
        reasonMessages: {
          "invalid-bilibili-query-id": "B 站 query ID 不合法。",
          "invalid-bilibili-query-enable": "B 站 query 开关参数不合法。",
          "bilibili-disabled": "当前环境未启用 B 站搜索。",
          "not-found": "对应 B 站 query 不存在，可能已被移除。"
        }
      }
    );
  }

  async function handleDeleteBilibiliQuery(query: SettingsBilibiliQuery): Promise<void> {
    await runSourcesAction(`bilibili-delete:${query.id}`, () => deleteBilibiliQuery(query.id), {
      fallbackMessage: "删除 B 站 query 失败，请稍后再试。",
      successMessage: "已删除 B 站 query。",
      reasonMessages: {
        "invalid-bilibili-query-id": "B 站 query ID 不合法。",
        "bilibili-disabled": "当前环境未启用 B 站搜索。",
        "not-found": "对应 B 站 query 不存在，可能已被移除。"
      }
    });
  }

  async function handleDeleteWechatRssSource(source: SettingsWechatRssSource): Promise<void> {
    await runSourcesAction(`wechat-rss-delete:${source.id}`, () => deleteWechatRssSource(source.id), {
      fallbackMessage: "删除微信公众号 RSS 失败，请稍后再试。",
      successMessage: "已删除微信公众号 RSS 配置。",
      reasonMessages: {
        "invalid-wechat-rss-source-id": "微信公众号 RSS ID 不合法。",
        "wechat-rss-disabled": "当前环境未启用微信公众号 RSS。",
        "not-found": "对应微信公众号 RSS 不存在，可能已被移除。"
      }
    });
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
    // 只做分钟级刷新，避免把 sources 工作台做成秒级跳动的监控面板。
    relativeNow.value = Date.now();
    nextCollectionTimer = window.setInterval(() => {
      relativeNow.value = Date.now();
    }, 60_000);
    void loadSources();
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
    isSourceModalOpen,
    isTwitterAccountModalOpen,
    isTwitterKeywordModalOpen,
    isHackerNewsQueryModalOpen,
    isBilibiliQueryModalOpen,
    isWechatRssModalOpen,
    sourceModalMode,
    twitterAccountModalMode,
    twitterKeywordModalMode,
    hackerNewsQueryModalMode,
    bilibiliQueryModalMode,
    sourceFormError,
    twitterAccountFormError,
    twitterKeywordFormError,
    hackerNewsQueryFormError,
    bilibiliQueryFormError,
    wechatRssFormError,
    sourceForm,
    twitterAccountForm,
    twitterKeywordForm,
    hackerNewsQueryForm,
    bilibiliQueryForm,
    wechatRssForm,
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
    openCreateSourceModal,
    openCreateTwitterAccountModal,
    openCreateTwitterKeywordModal,
    openCreateHackerNewsQueryModal,
    openCreateBilibiliQueryModal,
    openCreateWechatRssModal,
    openEditSourceModal,
    openEditTwitterAccountModal,
    openEditTwitterKeywordModal,
    openEditHackerNewsQueryModal,
    openEditBilibiliQueryModal,
    closeSourceModal,
    closeTwitterAccountModal,
    closeTwitterKeywordModal,
    closeHackerNewsQueryModal,
    closeBilibiliQueryModal,
    closeWechatRssModal,
    handleToggleSource,
    handleToggleSourceDisplayMode,
    handleManualCollect,
    handleManualTwitterCollect,
    handleManualTwitterKeywordCollect,
    handleManualHackerNewsCollect,
    handleManualBilibiliCollect,
    handleManualWechatRssCollect,
    handleManualWeiboTrendingCollect,
    handleManualSendLatestEmail,
    handleSubmitSource,
    handleSubmitTwitterAccount,
    handleSubmitTwitterKeyword,
    handleSubmitHackerNewsQuery,
    handleSubmitBilibiliQuery,
    handleSubmitWechatRssSources,
    handleToggleTwitterAccount,
    handleDeleteTwitterAccount,
    handleToggleTwitterKeywordCollect,
    handleToggleTwitterKeywordVisible,
    handleDeleteTwitterKeyword,
    handleToggleHackerNewsQuery,
    handleDeleteHackerNewsQuery,
    handleToggleBilibiliQuery,
    handleDeleteBilibiliQuery,
    handleDeleteWechatRssSource,
    handleDeleteSource
  };
}
