<script setup lang="ts">
import { message } from "ant-design-vue";
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";

import {
  editorialContentCardClass,
  editorialContentIntroSectionClass,
  editorialContentPageClass
} from "../../components/content/contentCardShared";
import { HttpError } from "../../services/http";
import {
  createBilibiliQuery,
  createHackerNewsQuery,
  createTwitterAccount,
  createTwitterSearchKeyword,
  createSource,
  deleteBilibiliQuery,
  deleteHackerNewsQuery,
  deleteTwitterAccount,
  deleteTwitterSearchKeyword,
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
  type SaveTwitterAccountPayload,
  type SaveTwitterSearchKeywordPayload
} from "../../services/settingsApi";

type AlertTone = "success" | "info" | "warning" | "error";
type PageNotice = { tone: AlertTone; message: string };
type SourceModalMode = "create" | "update";
type TwitterAccountModalMode = "create" | "update";
type TwitterKeywordModalMode = "create" | "update";
type HackerNewsQueryModalMode = "create" | "update";
type BilibiliQueryModalMode = "create" | "update";
type SourceFormState = {
  kind: string;
  sourceType: "rss" | "wechat_bridge";
  rssUrl: string;
  wechatName: string;
  articleUrl: string;
};
type TwitterAccountFormState = {
  id: number | null;
  username: string;
  displayName: string;
  category: string;
  priority: number;
  includeReplies: boolean;
  notes: string;
};
type TwitterKeywordFormState = {
  id: number | null;
  keyword: string;
  category: string;
  priority: number;
  isCollectEnabled: boolean;
  isVisible: boolean;
  notes: string;
};
type HackerNewsQueryFormState = {
  id: number | null;
  query: string;
  priority: number;
  isEnabled: boolean;
  notes: string;
};
type BilibiliQueryFormState = {
  id: number | null;
  query: string;
  priority: number;
  isEnabled: boolean;
  notes: string;
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
  { title: "RSS", key: "rssUrl", align: "center" as const },
  { title: "操作", key: "actions", align: "center" as const }
];
const twitterAccountColumns = [
  { title: "账号", key: "account", align: "center" as const },
  { title: "分类", key: "category", align: "center" as const },
  { title: "优先级", key: "priority", align: "center" as const },
  { title: "启用", key: "enabled", align: "center" as const },
  { title: "最近成功", key: "lastSuccessAt", align: "center" as const },
  { title: "最近结果", key: "lastError", align: "center" as const },
  { title: "操作", key: "actions", align: "center" as const }
];
const twitterKeywordColumns = [
  { title: "关键词", key: "keyword", align: "center" as const },
  { title: "分类", key: "category", align: "center" as const },
  { title: "优先级", key: "priority", align: "center" as const },
  { title: "采集启用", key: "collectEnabled", align: "center" as const },
  { title: "展示启用", key: "visible", align: "center" as const },
  { title: "最近成功", key: "lastSuccessAt", align: "center" as const },
  { title: "最近结果", key: "lastResult", align: "center" as const },
  { title: "操作", key: "actions", align: "center" as const }
];
const hackerNewsQueryColumns = [
  { title: "查询词", key: "query", align: "center" as const },
  { title: "优先级", key: "priority", align: "center" as const },
  { title: "采集启用", key: "enabled", align: "center" as const },
  { title: "最近成功", key: "lastSuccessAt", align: "center" as const },
  { title: "最近结果", key: "lastResult", align: "center" as const },
  { title: "操作", key: "actions", align: "center" as const }
];
const bilibiliQueryColumns = [
  { title: "查询词", key: "query", align: "center" as const },
  { title: "优先级", key: "priority", align: "center" as const },
  { title: "采集启用", key: "enabled", align: "center" as const },
  { title: "最近成功", key: "lastSuccessAt", align: "center" as const },
  { title: "最近结果", key: "lastResult", align: "center" as const },
  { title: "操作", key: "actions", align: "center" as const }
];
const twitterAccountCategoryOptions = [
  { label: "官方厂商", value: "official_vendor" },
  { label: "产品账号", value: "product" },
  { label: "关键人物", value: "person" },
  { label: "媒体", value: "media" },
  { label: "其他", value: "other" }
];
const twitterKeywordCategoryOptions = [
  { label: "官方厂商", value: "official_vendor" },
  { label: "产品", value: "product" },
  { label: "关键人物", value: "person" },
  { label: "主题", value: "topic" },
  { label: "媒体", value: "media" },
  { label: "其他", value: "other" }
];

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
const sourceForm = reactive<SourceFormState>(createEmptySourceForm());
const twitterAccountForm = reactive<TwitterAccountFormState>(createEmptyTwitterAccountForm());
const twitterKeywordForm = reactive<TwitterKeywordFormState>(createEmptyTwitterKeywordForm());
const hackerNewsQueryForm = reactive<HackerNewsQueryFormState>(createEmptyHackerNewsQueryForm());
const bilibiliQueryForm = reactive<BilibiliQueryFormState>(createEmptyBilibiliQueryForm());
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
const fixedWeiboKeywordCount = computed(() => sourcesModel.value?.weiboTrending?.fixedKeywords.length ?? 0);
const wechatArticleUrlAvailable = computed(
  () => sourcesModel.value?.capability.wechatArticleUrlEnabled ?? false
);
const wechatArticleUrlMessage = computed(
  () =>
    sourcesModel.value?.capability.wechatArticleUrlMessage ??
    "当前环境未启用公众号来源解析；RSS 仍可直接新增。"
);
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
    sourceType: "rss",
    rssUrl: "",
    wechatName: "",
    articleUrl: ""
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

// 编辑模式只回填当前来源已有配置，kind 继续锁定，避免把“编辑”做成“重命名来源主键”。
function openEditSourceModal(source: SettingsSourceItem): void {
  sourceModalMode.value = "update";
  resetSourceForm();
  sourceForm.kind = source.kind;
  sourceForm.sourceType = source.sourceType === "wechat_bridge" ? "wechat_bridge" : "rss";

  if (sourceForm.sourceType === "rss") {
    sourceForm.rssUrl = source.rssUrl ?? "";
  } else {
    sourceForm.wechatName = source.name;
    sourceForm.articleUrl = source.bridgeInputMode === "article_url" ? source.bridgeInputValue ?? "" : "";
  }

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

// 关闭弹窗时顺手清掉局部错误，避免旧的公众号解析失败提示粘在下一次操作里。
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

// 类型切换只负责收口当前可见字段，真正的 payload 仍由提交时统一构建。
function selectSourceType(sourceType: "rss" | "wechat_bridge"): void {
  if (sourceType === "wechat_bridge" && !wechatArticleUrlAvailable.value) {
    return;
  }

  sourceForm.sourceType = sourceType;
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

// 下一次采集统一展示成“绝对时间 + 剩余分钟”，让工作台既能看节奏也能看实时感。
function formatNextCollectionText(value: string | null | undefined): string {
  if (!value?.trim()) {
    return "未启用定时采集";
  }

  const nextDate = new Date(value);

  if (Number.isNaN(nextDate.getTime())) {
    return "暂时无法计算";
  }

  const diffMinutes = Math.floor((nextDate.getTime() - relativeNow.value) / 60_000);
  const timeLabel = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(nextDate);

  if (diffMinutes <= 0) {
    return `${timeLabel}（即将执行）`;
  }

  return `${timeLabel}（还有 ${diffMinutes} 分钟）`;
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

function formatTwitterCategoryLabel(value: string): string {
  if (value === "official_vendor") {
    return "官方厂商";
  }

  if (value === "product") {
    return "产品";
  }

  if (value === "person") {
    return "关键人物";
  }

  if (value === "topic") {
    return "主题";
  }

  if (value === "media") {
    return "媒体";
  }

  return "其他";
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
  if (sourceForm.sourceType === "rss") {
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

  const wechatName = sourceForm.wechatName.trim();

  if (!wechatName) {
    return { ok: false, message: "请填写公众号名称。" };
  }

  const articleUrl = sourceForm.articleUrl.trim();

  return {
    ok: true,
    payload:
      sourceModalMode.value === "update"
        ? {
            kind: sourceForm.kind,
            sourceType: "wechat_bridge",
            wechatName,
            ...(articleUrl ? { articleUrl } : {})
          }
        : {
            sourceType: "wechat_bridge",
            wechatName,
            ...(articleUrl ? { articleUrl } : {})
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

// 来源保存沿用现有 notice + toast 约定，同时把公众号解析失败原因翻译成工作台可读提示。
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
        "invalid-rss-feed": "这个 RSS 地址暂时无法识别，请检查链接是否正确。",
        "wechat-resolver-disabled": "当前环境未启用公众号来源解析，暂时无法新增公众号来源。",
        "wechat-resolver-not-found": "没有找到这个公众号的可用来源，请检查名称或补一篇文章链接。",
        "resolver-unavailable": "公众号解析服务暂时不可用，请稍后再试。"
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
        <section :class="editorialContentIntroSectionClass" data-settings-intro="sources">
          <div
            class="pointer-events-none absolute right-[-56px] top-[-72px] h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(81,220,255,0.22),_transparent_72%)] blur-3xl"
            aria-hidden="true"
          />
          <div class="relative z-[1] flex flex-col gap-4">
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-editorial-pill border border-editorial-border bg-editorial-panel/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-editorial-text-muted">
                Source Inventory
              </span>
              <span class="text-xs leading-6 text-editorial-text-muted">来源接入、手动采集和库存巡检都在这一页完成。</span>
            </div>
            <div class="flex flex-col gap-2">
              <h2 class="m-0 text-[28px] font-semibold tracking-[-0.04em] text-editorial-text-main">
                数据来源工作台
              </h2>
              <p class="m-0 max-w-3xl text-sm leading-7 text-editorial-text-body">
                这里负责管理 RSS 与公众号桥接来源、查看调度节奏、执行手动采集和人工发信，同时保持库存表和统计表在同一屏里可比对。
              </p>
            </div>
          </div>
        </section>

        <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-5" data-sources-section="overview">
          <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/84 px-4 py-4 shadow-editorial-card backdrop-blur-xl">
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">接入来源</p>
            <p class="mt-2 mb-0 text-xl font-medium text-editorial-text-main">{{ totalSourceCount }}</p>
          </article>
          <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/84 px-4 py-4 shadow-editorial-card backdrop-blur-xl">
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">已启用来源</p>
            <p class="mt-2 mb-0 text-xl font-medium text-editorial-text-main">{{ enabledSourceCount }}</p>
          </article>
          <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/84 px-4 py-4 shadow-editorial-card backdrop-blur-xl">
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">最近采集</p>
            <p class="mt-2 mb-0 text-sm text-editorial-text-main">{{ formatDateTime(sourcesModel.operations.lastCollectionRunAt) }}</p>
          </article>
          <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/84 px-4 py-4 shadow-editorial-card backdrop-blur-xl">
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">最近发信</p>
            <p class="mt-2 mb-0 text-sm text-editorial-text-main">{{ formatDateTime(sourcesModel.operations.lastSendLatestEmailAt) }}</p>
          </article>
          <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/84 px-4 py-4 shadow-editorial-card backdrop-blur-xl">
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">下一次采集</p>
            <p class="mt-2 mb-0 text-sm text-editorial-text-main">
              {{ formatNextCollectionText(sourcesModel.operations.nextCollectionRunAt) }}
            </p>
          </article>
        </section>

        <section class="grid gap-4 xl:grid-cols-2">
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
          title="Twitter 账号"
          size="small"
          data-sources-section="twitter-accounts"
        >
          <div class="mb-4 grid gap-3 md:grid-cols-3">
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">账号总数</p>
              <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ totalTwitterAccountCount }}</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">已启用</p>
              <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ enabledTwitterAccountCount }}</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">API 状态</p>
              <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">{{ twitterAccountCollectionMessage }}</p>
            </article>
          </div>

          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <a-typography-paragraph class="!mb-0" type="secondary">
              Twitter 账号采集已从默认定时采集里拆出，只会在这里手动执行。
            </a-typography-paragraph>
            <div class="flex flex-wrap gap-2">
              <a-button data-action="add-twitter-account" @click="openCreateTwitterAccountModal">
                新增 Twitter 账号
              </a-button>
              <a-button
                type="primary"
                data-action="manual-twitter-collect"
                :disabled="!sourcesModel.operations.canTriggerManualTwitterCollect || sourcesModel.operations.isRunning"
                :loading="isActionPending('manual:twitter-collect')"
                @click="handleManualTwitterCollect"
              >
                {{ sourcesModel.operations.isRunning ? "任务执行中..." : "手动采集 Twitter 账号" }}
              </a-button>
            </div>
          </div>

          <a-table
            :data-source="sourcesModel.twitterAccounts ?? []"
            :columns="twitterAccountColumns"
            row-key="id"
            :pagination="false"
            size="small"
          >
            <template #emptyText>
              暂无 Twitter 账号
            </template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'account'">
                <a-space direction="vertical" size="small">
                  <a-typography-text strong>{{ record.displayName }}</a-typography-text>
                  <a-typography-text type="secondary" :data-twitter-account-username="record.id">@{{ record.username }}</a-typography-text>
                </a-space>
              </template>
              <template v-else-if="column.key === 'category'">
                <a-tag>{{ formatTwitterCategoryLabel(record.category) }}</a-tag>
              </template>
              <template v-else-if="column.key === 'priority'">
                {{ record.priority }}
              </template>
              <template v-else-if="column.key === 'enabled'">
                <a-switch
                  :checked="record.isEnabled"
                  :loading="isActionPending(`twitter-toggle:${record.id}`)"
                  :checked-children="'启用'"
                  :un-checked-children="'停用'"
                  :data-twitter-account-toggle="record.id"
                  @change="handleToggleTwitterAccount(record)"
                />
              </template>
              <template v-else-if="column.key === 'lastSuccessAt'">
                {{ formatDateTime(record.lastSuccessAt) }}
              </template>
              <template v-else-if="column.key === 'lastError'">
                <span
                  class="inline-block max-w-[220px] truncate align-middle"
                  :title="record.lastError ?? '暂无结果'"
                  :data-twitter-account-error="record.id"
                >
                  {{ record.lastError ?? "暂无结果" }}
                </span>
              </template>
              <template v-else-if="column.key === 'actions'">
                <div class="flex flex-wrap justify-center gap-2" :data-twitter-account-actions="record.id">
                  <a-button
                    type="link"
                    size="small"
                    :data-twitter-account-edit="record.id"
                    @click="openEditTwitterAccountModal(record)"
                  >
                    编辑
                  </a-button>
                  <a-popconfirm
                    title="确认删除这个 Twitter 账号吗？"
                    ok-text="确认删除"
                    cancel-text="取消"
                    @confirm="handleDeleteTwitterAccount(record)"
                  >
                    <a-button
                      type="link"
                      size="small"
                      danger
                      :loading="isActionPending(`twitter-delete:${record.id}`)"
                      :data-twitter-account-delete="record.id"
                    >
                      删除
                    </a-button>
                  </a-popconfirm>
                </div>
              </template>
            </template>
          </a-table>
        </a-card>

        <a-card
          :class="editorialContentCardClass"
          title="Twitter 关键词搜索"
          size="small"
          data-sources-section="twitter-keywords"
        >
          <div class="mb-4 grid gap-3 md:grid-cols-4">
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">关键词总数</p>
              <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ totalTwitterKeywordCount }}</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">采集启用</p>
              <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ enabledTwitterKeywordCollectCount }}</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">展示启用</p>
              <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ enabledTwitterKeywordVisibleCount }}</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">API 状态</p>
              <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">{{ twitterKeywordCollectionMessage }}</p>
            </article>
          </div>

          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <a-typography-paragraph class="!mb-0" type="secondary">
              关键词搜索仅支持手动执行，默认按 5 个关键词、每词最多 10 条结果控住 credits。
            </a-typography-paragraph>
            <div class="flex flex-wrap gap-2">
              <a-button data-action="add-twitter-keyword" @click="openCreateTwitterKeywordModal">
                新增 Twitter 关键词
              </a-button>
              <a-button
                type="primary"
                data-action="manual-twitter-keyword-collect"
                :disabled="!sourcesModel.operations.canTriggerManualTwitterKeywordCollect || sourcesModel.operations.isRunning"
                :loading="isActionPending('manual:twitter-keyword-collect')"
                @click="handleManualTwitterKeywordCollect"
              >
                {{ sourcesModel.operations.isRunning ? "任务执行中..." : "手动采集 Twitter 关键词" }}
              </a-button>
            </div>
          </div>

          <a-table
            :data-source="sourcesModel.twitterSearchKeywords ?? []"
            :columns="twitterKeywordColumns"
            row-key="id"
            :pagination="false"
            size="small"
          >
            <template #emptyText>
              暂无 Twitter 关键词
            </template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'keyword'">
                <a-space direction="vertical" size="small">
                  <a-typography-text strong>{{ record.keyword }}</a-typography-text>
                  <a-typography-text type="secondary" :data-twitter-keyword-note="record.id">
                    {{ record.notes || "暂无备注" }}
                  </a-typography-text>
                </a-space>
              </template>
              <template v-else-if="column.key === 'category'">
                <a-tag>{{ formatTwitterCategoryLabel(record.category) }}</a-tag>
              </template>
              <template v-else-if="column.key === 'priority'">
                {{ record.priority }}
              </template>
              <template v-else-if="column.key === 'collectEnabled'">
                <a-switch
                  :checked="record.isCollectEnabled"
                  :loading="isActionPending(`twitter-keyword-collect-toggle:${record.id}`)"
                  :checked-children="'启用'"
                  :un-checked-children="'停用'"
                  :data-twitter-keyword-collect-toggle="record.id"
                  @change="handleToggleTwitterKeywordCollect(record)"
                />
              </template>
              <template v-else-if="column.key === 'visible'">
                <a-switch
                  :checked="record.isVisible"
                  :loading="isActionPending(`twitter-keyword-visible-toggle:${record.id}`)"
                  :checked-children="'展示'"
                  :un-checked-children="'隐藏'"
                  :data-twitter-keyword-visible-toggle="record.id"
                  @change="handleToggleTwitterKeywordVisible(record)"
                />
              </template>
              <template v-else-if="column.key === 'lastSuccessAt'">
                {{ formatDateTime(record.lastSuccessAt) }}
              </template>
              <template v-else-if="column.key === 'lastResult'">
                <span
                  class="inline-block max-w-[240px] truncate align-middle"
                  :title="record.lastResult ?? '暂无结果'"
                  :data-twitter-keyword-result="record.id"
                >
                  {{ record.lastResult ?? "暂无结果" }}
                </span>
              </template>
              <template v-else-if="column.key === 'actions'">
                <div class="flex flex-wrap justify-center gap-2" :data-twitter-keyword-actions="record.id">
                  <a-button
                    type="link"
                    size="small"
                    :data-twitter-keyword-edit="record.id"
                    @click="openEditTwitterKeywordModal(record)"
                  >
                    编辑
                  </a-button>
                  <a-popconfirm
                    title="确认删除这个 Twitter 关键词吗？"
                    ok-text="确认删除"
                    cancel-text="取消"
                    @confirm="handleDeleteTwitterKeyword(record)"
                  >
                    <a-button
                      type="link"
                      size="small"
                      danger
                      :loading="isActionPending(`twitter-keyword-delete:${record.id}`)"
                      :data-twitter-keyword-delete="record.id"
                    >
                      删除
                    </a-button>
                  </a-popconfirm>
                </div>
              </template>
            </template>
          </a-table>
        </a-card>

        <a-card
          :class="editorialContentCardClass"
          title="Hacker News 搜索"
          size="small"
          data-sources-section="hackernews"
        >
          <div class="mb-4 grid gap-3 md:grid-cols-4">
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">Query 总数</p>
              <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ totalHackerNewsQueryCount }}</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">采集启用</p>
              <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ enabledHackerNewsQueryCount }}</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">时间窗口</p>
              <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">固定最近 7 天</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">API 状态</p>
              <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">{{ hackerNewsCollectionMessage }}</p>
            </article>
          </div>

          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <a-typography-paragraph class="!mb-0" type="secondary">
              第一版只做手动搜索，固定按最近 7 天、每轮最多 5 个 query、每词最多 10 条结果控住范围。
            </a-typography-paragraph>
            <div class="flex flex-wrap gap-2">
              <a-button data-action="add-hackernews-query" @click="openCreateHackerNewsQueryModal">
                新增 Hacker News query
              </a-button>
              <a-button
                type="primary"
                data-action="manual-hackernews-collect"
                :disabled="!sourcesModel.operations.canTriggerManualHackerNewsCollect || sourcesModel.operations.isRunning"
                :loading="isActionPending('manual:hackernews-collect')"
                @click="handleManualHackerNewsCollect"
              >
                {{ sourcesModel.operations.isRunning ? "任务执行中..." : "手动采集 Hacker News" }}
              </a-button>
            </div>
          </div>

          <a-table
            :data-source="sourcesModel.hackerNewsQueries ?? []"
            :columns="hackerNewsQueryColumns"
            row-key="id"
            :pagination="false"
            size="small"
          >
            <template #emptyText>
              暂无 Hacker News query
            </template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'query'">
                <a-space direction="vertical" size="small">
                  <a-typography-text strong>{{ record.query }}</a-typography-text>
                  <a-typography-text type="secondary" :data-hackernews-query-note="record.id">
                    {{ record.notes || "暂无备注" }}
                  </a-typography-text>
                </a-space>
              </template>
              <template v-else-if="column.key === 'priority'">
                {{ record.priority }}
              </template>
              <template v-else-if="column.key === 'enabled'">
                <a-switch
                  :checked="record.isEnabled"
                  :loading="isActionPending(`hackernews-toggle:${record.id}`)"
                  :checked-children="'启用'"
                  :un-checked-children="'停用'"
                  :data-hackernews-query-toggle="record.id"
                  @change="handleToggleHackerNewsQuery(record)"
                />
              </template>
              <template v-else-if="column.key === 'lastSuccessAt'">
                {{ formatDateTime(record.lastSuccessAt) }}
              </template>
              <template v-else-if="column.key === 'lastResult'">
                <span
                  class="inline-block max-w-[240px] truncate align-middle"
                  :title="record.lastResult ?? '暂无结果'"
                  :data-hackernews-query-result="record.id"
                >
                  {{ record.lastResult ?? "暂无结果" }}
                </span>
              </template>
              <template v-else-if="column.key === 'actions'">
                <div class="flex flex-wrap justify-center gap-2" :data-hackernews-query-actions="record.id">
                  <a-button
                    type="link"
                    size="small"
                    :data-hackernews-query-edit="record.id"
                    @click="openEditHackerNewsQueryModal(record)"
                  >
                    编辑
                  </a-button>
                  <a-popconfirm
                    title="确认删除这个 Hacker News query 吗？"
                    ok-text="确认删除"
                    cancel-text="取消"
                    @confirm="handleDeleteHackerNewsQuery(record)"
                  >
                    <a-button
                      type="link"
                      size="small"
                      danger
                      :loading="isActionPending(`hackernews-delete:${record.id}`)"
                      :data-hackernews-query-delete="record.id"
                    >
                      删除
                    </a-button>
                  </a-popconfirm>
                </div>
              </template>
            </template>
          </a-table>
        </a-card>

        <a-card
          :class="editorialContentCardClass"
          title="B 站搜索"
          size="small"
          data-sources-section="bilibili"
        >
          <div class="mb-4 grid gap-3 md:grid-cols-4">
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">Query 总数</p>
              <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ totalBilibiliQueryCount }}</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">采集启用</p>
              <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ enabledBilibiliQueryCount }}</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">搜索范围</p>
              <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">固定只搜视频，结果进入 AI 新讯和 AI 热点</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">API 状态</p>
              <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">{{ bilibiliCollectionMessage }}</p>
            </article>
          </div>

          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <a-typography-paragraph class="!mb-0" type="secondary">
              第一版只做手动搜索，固定按最近发布排序、每轮最多 5 个 query、每词最多 10 条视频结果。
            </a-typography-paragraph>
            <div class="flex flex-wrap gap-2">
              <a-button data-action="add-bilibili-query" @click="openCreateBilibiliQueryModal">
                新增 B 站 query
              </a-button>
              <a-button
                type="primary"
                data-action="manual-bilibili-collect"
                :disabled="!sourcesModel.operations.canTriggerManualBilibiliCollect || sourcesModel.operations.isRunning"
                :loading="isActionPending('manual:bilibili-collect')"
                @click="handleManualBilibiliCollect"
              >
                {{ sourcesModel.operations.isRunning ? "任务执行中..." : "手动采集 B 站搜索" }}
              </a-button>
            </div>
          </div>

          <a-table
            :data-source="sourcesModel.bilibiliQueries ?? []"
            :columns="bilibiliQueryColumns"
            row-key="id"
            :pagination="false"
            size="small"
          >
            <template #emptyText>
              暂无 B 站 query
            </template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'query'">
                <a-space direction="vertical" size="small">
                  <a-typography-text strong>{{ record.query }}</a-typography-text>
                  <a-typography-text type="secondary" :data-bilibili-query-note="record.id">
                    {{ record.notes || "暂无备注" }}
                  </a-typography-text>
                </a-space>
              </template>
              <template v-else-if="column.key === 'priority'">
                {{ record.priority }}
              </template>
              <template v-else-if="column.key === 'enabled'">
                <a-switch
                  :checked="record.isEnabled"
                  :loading="isActionPending(`bilibili-toggle:${record.id}`)"
                  :checked-children="'启用'"
                  :un-checked-children="'停用'"
                  :data-bilibili-query-toggle="record.id"
                  @change="handleToggleBilibiliQuery(record)"
                />
              </template>
              <template v-else-if="column.key === 'lastSuccessAt'">
                {{ formatDateTime(record.lastSuccessAt) }}
              </template>
              <template v-else-if="column.key === 'lastResult'">
                <span
                  class="inline-block max-w-[240px] truncate align-middle"
                  :title="record.lastResult ?? '暂无结果'"
                  :data-bilibili-query-result="record.id"
                >
                  {{ record.lastResult ?? "暂无结果" }}
                </span>
              </template>
              <template v-else-if="column.key === 'actions'">
                <div class="flex flex-wrap justify-center gap-2" :data-bilibili-query-actions="record.id">
                  <a-button
                    type="link"
                    size="small"
                    :data-bilibili-query-edit="record.id"
                    @click="openEditBilibiliQueryModal(record)"
                  >
                    编辑
                  </a-button>
                  <a-popconfirm
                    title="确认删除这个 B 站 query 吗？"
                    ok-text="确认删除"
                    cancel-text="取消"
                    @confirm="handleDeleteBilibiliQuery(record)"
                  >
                    <a-button
                      type="link"
                      size="small"
                      danger
                      :loading="isActionPending(`bilibili-delete:${record.id}`)"
                      :data-bilibili-query-delete="record.id"
                    >
                      删除
                    </a-button>
                  </a-popconfirm>
                </div>
              </template>
            </template>
          </a-table>
        </a-card>

        <a-card
          :class="editorialContentCardClass"
          title="微博热搜榜匹配（固定 AI 关键词，只进入 AI 热点，不做微博全文搜索）"
          size="small"
          data-sources-section="weibo-trending"
        >
          <div class="mb-4 grid gap-3 md:grid-cols-4">
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">固定关键词数</p>
              <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ fixedWeiboKeywordCount }}</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">最近成功</p>
              <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">
                {{ formatDateTime(sourcesModel.weiboTrending?.lastSuccessAt ?? null) }}
              </p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">结果去向</p>
              <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">固定只进入 AI 热点，不进入 AI 新讯</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">API 状态</p>
              <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">{{ weiboTrendingMessage }}</p>
            </article>
          </div>

          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-wrap gap-2">
              <a-tag
                v-for="keyword in sourcesModel.weiboTrending?.fixedKeywords ?? []"
                :key="keyword"
                color="default"
                :data-weibo-keyword="keyword"
              >
                {{ keyword }}
              </a-tag>
            </div>
            <a-button
              type="primary"
              data-action="manual-weibo-trending-collect"
              :disabled="!sourcesModel.operations.canTriggerManualWeiboTrendingCollect || sourcesModel.operations.isRunning"
              :loading="isActionPending('manual:weibo-trending-collect')"
              @click="handleManualWeiboTrendingCollect"
            >
              {{ sourcesModel.operations.isRunning ? "任务执行中..." : "手动匹配微博热搜榜" }}
            </a-button>
          </div>

          <div class="grid gap-3 md:grid-cols-3">
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">最近抓取</p>
              <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body" data-weibo-last-fetched-at>
                {{ formatDateTime(sourcesModel.weiboTrending?.lastFetchedAt ?? null) }}
              </p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3 md:col-span-2">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">最近结果</p>
              <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body" data-weibo-last-result>
                {{ sourcesModel.weiboTrending?.lastResult ?? "暂无结果" }}
              </p>
            </article>
          </div>
        </a-card>

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
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <a-typography-paragraph class="!mb-1" type="secondary">
                管理 RSS 与公众号桥接来源，手动采集会处理所有已启用 source。
              </a-typography-paragraph>
              <p class="m-0 text-xs leading-5 text-editorial-text-muted">
                下一次自动采集：{{ formatNextCollectionText(sourcesModel.operations.nextCollectionRunAt) }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <a-button data-action="add-source" @click="openCreateSourceModal">
                新增来源
              </a-button>
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
          </div>

          <a-table
            :data-source="sourcesModel.sources"
            :columns="inventoryColumns"
            row-key="kind"
            :pagination="false"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <div
                  :data-source-cell="record.kind"
                  class="flex flex-col items-center gap-2"
                >
                  <a-space
                    direction="vertical"
                    size="small"
                    :data-source-meta="record.kind"
                  >
                    <a-typography-text strong>{{ record.name }}</a-typography-text>
                    <a-typography-text type="secondary">{{ record.kind }}</a-typography-text>
                  </a-space>
                  <a-space
                    wrap
                    size="small"
                    class="justify-center"
                    :data-source-badges="record.kind"
                  >
                    <a-tag :color="record.sourceType === 'wechat_bridge' ? 'blue' : 'default'">
                      {{ record.sourceType === "wechat_bridge" ? "公众号" : "RSS" }}
                    </a-tag>
                  </a-space>
                </div>
              </template>
              <template v-else-if="column.key === 'actions'">
                <div
                  v-if="!record.isBuiltIn"
                  :data-source-actions="record.kind"
                  class="flex flex-wrap justify-center gap-2"
                >
                    <a-button
                      type="link"
                      size="small"
                      :data-source-edit="record.kind"
                      @click="openEditSourceModal(record)"
                    >
                      编辑
                    </a-button>
                    <a-popconfirm
                      title="确认删除这个自定义来源吗？"
                      ok-text="确认删除"
                      cancel-text="取消"
                      @confirm="handleDeleteSource(record)"
                    >
                      <a-button
                        type="link"
                        size="small"
                        danger
                        :loading="isActionPending(`delete:${record.kind}`)"
                        :data-source-delete="record.kind"
                      >
                        删除
                      </a-button>
                    </a-popconfirm>
                </div>
                <span v-else class="text-editorial-text-muted">-</span>
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
                  :title="record.rssUrl"
                  target="_blank"
                  rel="noreferrer"
                  :data-source-rss-link="record.kind"
                  class="inline-block max-w-[240px] truncate align-middle text-left"
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
            message="这里只收用户输入：RSS 只填链接，公众号只填名称，可选再补一篇文章链接。"
            data-source-modal-intro
          />

          <a-alert
            v-if="!wechatArticleUrlAvailable"
            class="editorial-inline-alert editorial-inline-alert--info"
            type="info"
            show-icon
            :message="wechatArticleUrlMessage"
            data-source-wechat-capability
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
                :disabled="!wechatArticleUrlAvailable"
                @click="selectSourceType('wechat_bridge')"
              >
                微信公众号
              </a-button>
            </div>
          </div>

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

            <label class="flex flex-col gap-2">
              <span class="text-sm font-medium text-editorial-text-main">公众号名称</span>
              <input
                v-model="sourceForm.wechatName"
                data-source-form="wechat-name"
                class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
              />
            </label>

            <label class="flex flex-col gap-2">
              <span class="text-sm font-medium text-editorial-text-main">公众号文章链接</span>
              <input
                v-model="sourceForm.articleUrl"
                data-source-form="article-url"
                class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
                placeholder="可选，建议填写一篇文章链接帮助系统更快定位来源"
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

      <a-modal
        :open="isTwitterAccountModalOpen"
        :title="twitterAccountModalMode === 'create' ? '新增 Twitter 账号' : '编辑 Twitter 账号'"
        :footer="null"
        centered
        :width="680"
        destroy-on-close
        @cancel="closeTwitterAccountModal"
      >
        <div class="flex flex-col gap-4" data-twitter-account-modal="twitter-account">
          <a-alert
            v-if="twitterAccountFormError"
            class="editorial-inline-alert editorial-inline-alert--error"
            type="error"
            show-icon
            :message="twitterAccountFormError"
          />

          <a-alert
            class="editorial-inline-alert editorial-inline-alert--info"
            type="info"
            show-icon
            :message="twitterAccountCollectionMessage"
            data-twitter-account-capability
          />

          <label class="flex flex-col gap-2">
            <span class="text-sm font-medium text-editorial-text-main">Username</span>
            <input
              v-model="twitterAccountForm.username"
              data-twitter-account-form="username"
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
              placeholder="例如 openai，不需要填写 @"
            />
          </label>

          <label class="flex flex-col gap-2">
            <span class="text-sm font-medium text-editorial-text-main">展示名称</span>
            <input
              v-model="twitterAccountForm.displayName"
              data-twitter-account-form="display-name"
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
            />
          </label>

          <label class="flex flex-col gap-2">
            <span class="text-sm font-medium text-editorial-text-main">分类</span>
            <select
              v-model="twitterAccountForm.category"
              data-twitter-account-form="category"
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
            >
              <option
                v-for="option in twitterAccountCategoryOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="flex flex-col gap-2">
            <span class="text-sm font-medium text-editorial-text-main">优先级</span>
            <input
              v-model.number="twitterAccountForm.priority"
              data-twitter-account-form="priority"
              type="number"
              min="0"
              max="100"
              step="1"
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
            />
          </label>

          <label class="flex items-center gap-2 text-sm text-editorial-text-main">
            <input
              v-model="twitterAccountForm.includeReplies"
              data-twitter-account-form="include-replies"
              type="checkbox"
              class="h-4 w-4"
            />
            采集回复
          </label>

          <label class="flex flex-col gap-2">
            <span class="text-sm font-medium text-editorial-text-main">备注</span>
            <textarea
              v-model="twitterAccountForm.notes"
              data-twitter-account-form="notes"
              rows="3"
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
            />
          </label>

          <div class="flex justify-end gap-2">
            <a-button @click="closeTwitterAccountModal">取消</a-button>
            <a-button
              type="primary"
              data-twitter-account-form="submit"
              :loading="isActionPending('twitter-account:submit')"
              @click="handleSubmitTwitterAccount"
            >
              {{ twitterAccountModalMode === "create" ? "新增账号" : "保存更新" }}
            </a-button>
          </div>
        </div>
      </a-modal>

      <a-modal
        :open="isHackerNewsQueryModalOpen"
        :title="hackerNewsQueryModalMode === 'create' ? '新增 Hacker News query' : '编辑 Hacker News query'"
        :footer="null"
        centered
        :width="680"
        destroy-on-close
        @cancel="closeHackerNewsQueryModal"
      >
        <div class="flex flex-col gap-4" data-hackernews-query-modal="hackernews-query">
          <a-alert
            v-if="hackerNewsQueryFormError"
            class="editorial-inline-alert editorial-inline-alert--error"
            type="error"
            show-icon
            :message="hackerNewsQueryFormError"
          />

          <a-alert
            class="editorial-inline-alert editorial-inline-alert--info"
            type="info"
            show-icon
            :message="hackerNewsCollectionMessage"
            data-hackernews-query-capability
          />

          <label class="flex flex-col gap-2">
            <span class="text-sm font-medium text-editorial-text-main">查询词</span>
            <input
              v-model="hackerNewsQueryForm.query"
              data-hackernews-query-form="query"
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
              placeholder="例如 openai、anthropic、cursor、ai agents"
            />
          </label>

          <label class="flex flex-col gap-2">
            <span class="text-sm font-medium text-editorial-text-main">优先级</span>
            <input
              v-model.number="hackerNewsQueryForm.priority"
              data-hackernews-query-form="priority"
              type="number"
              min="0"
              max="100"
              step="1"
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
            />
          </label>

          <label class="flex items-center gap-2 text-sm text-editorial-text-main">
            <input
              v-model="hackerNewsQueryForm.isEnabled"
              data-hackernews-query-form="is-enabled"
              type="checkbox"
              class="h-4 w-4"
            />
            默认启用采集
          </label>

          <label class="flex flex-col gap-2">
            <span class="text-sm font-medium text-editorial-text-main">备注</span>
            <textarea
              v-model="hackerNewsQueryForm.notes"
              data-hackernews-query-form="notes"
              rows="3"
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
            />
          </label>

          <div class="flex justify-end gap-2">
            <a-button @click="closeHackerNewsQueryModal">取消</a-button>
            <a-button
              type="primary"
              data-hackernews-query-form="submit"
              :loading="isActionPending('hackernews-query:submit')"
              @click="handleSubmitHackerNewsQuery"
            >
              {{ hackerNewsQueryModalMode === "create" ? "新增 query" : "保存更新" }}
            </a-button>
          </div>
        </div>
      </a-modal>

      <a-modal
        :open="isBilibiliQueryModalOpen"
        :title="bilibiliQueryModalMode === 'create' ? '新增 B 站 query' : '编辑 B 站 query'"
        :footer="null"
        centered
        :width="680"
        destroy-on-close
        @cancel="closeBilibiliQueryModal"
      >
        <div class="flex flex-col gap-4" data-bilibili-query-modal="bilibili-query">
          <a-alert
            v-if="bilibiliQueryFormError"
            class="editorial-inline-alert editorial-inline-alert--error"
            type="error"
            show-icon
            :message="bilibiliQueryFormError"
          />

          <a-alert
            class="editorial-inline-alert editorial-inline-alert--info"
            type="info"
            show-icon
            :message="bilibiliCollectionMessage"
            data-bilibili-query-capability
          />

          <label class="flex flex-col gap-2">
            <span class="text-sm font-medium text-editorial-text-main">查询词</span>
            <input
              v-model="bilibiliQueryForm.query"
              data-bilibili-query-form="query"
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
              placeholder="例如 openai、anthropic、cursor、ai agent"
            />
          </label>

          <label class="flex flex-col gap-2">
            <span class="text-sm font-medium text-editorial-text-main">优先级</span>
            <input
              v-model.number="bilibiliQueryForm.priority"
              data-bilibili-query-form="priority"
              type="number"
              min="0"
              max="100"
              step="1"
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
            />
          </label>

          <label class="flex items-center gap-2 text-sm text-editorial-text-main">
            <input
              v-model="bilibiliQueryForm.isEnabled"
              data-bilibili-query-form="is-enabled"
              type="checkbox"
              class="h-4 w-4"
            />
            默认启用采集
          </label>

          <label class="flex flex-col gap-2">
            <span class="text-sm font-medium text-editorial-text-main">备注</span>
            <textarea
              v-model="bilibiliQueryForm.notes"
              data-bilibili-query-form="notes"
              rows="3"
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
            />
          </label>

          <div class="flex justify-end gap-2">
            <a-button @click="closeBilibiliQueryModal">取消</a-button>
            <a-button
              type="primary"
              data-bilibili-query-form="submit"
              :loading="isActionPending('bilibili-query:submit')"
              @click="handleSubmitBilibiliQuery"
            >
              {{ bilibiliQueryModalMode === "create" ? "新增 query" : "保存更新" }}
            </a-button>
          </div>
        </div>
      </a-modal>

      <a-modal
        :open="isTwitterKeywordModalOpen"
        :title="twitterKeywordModalMode === 'create' ? '新增 Twitter 关键词' : '编辑 Twitter 关键词'"
        :footer="null"
        centered
        :width="680"
        destroy-on-close
        @cancel="closeTwitterKeywordModal"
      >
        <div class="flex flex-col gap-4" data-twitter-keyword-modal="twitter-keyword">
          <a-alert
            v-if="twitterKeywordFormError"
            class="editorial-inline-alert editorial-inline-alert--error"
            type="error"
            show-icon
            :message="twitterKeywordFormError"
          />

          <a-alert
            class="editorial-inline-alert editorial-inline-alert--info"
            type="info"
            show-icon
            :message="twitterKeywordCollectionMessage"
            data-twitter-keyword-capability
          />

          <label class="flex flex-col gap-2">
            <span class="text-sm font-medium text-editorial-text-main">关键词</span>
            <input
              v-model="twitterKeywordForm.keyword"
              data-twitter-keyword-form="keyword"
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
              placeholder="例如 OpenAI、Anthropic、Agents SDK"
            />
          </label>

          <label class="flex flex-col gap-2">
            <span class="text-sm font-medium text-editorial-text-main">分类</span>
            <select
              v-model="twitterKeywordForm.category"
              data-twitter-keyword-form="category"
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
            >
              <option
                v-for="option in twitterKeywordCategoryOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="flex flex-col gap-2">
            <span class="text-sm font-medium text-editorial-text-main">优先级</span>
            <input
              v-model.number="twitterKeywordForm.priority"
              data-twitter-keyword-form="priority"
              type="number"
              min="0"
              max="100"
              step="1"
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
            />
          </label>

          <label class="flex items-center gap-2 text-sm text-editorial-text-main">
            <input
              v-model="twitterKeywordForm.isCollectEnabled"
              data-twitter-keyword-form="is-collect-enabled"
              type="checkbox"
              class="h-4 w-4"
            />
            默认启用采集
          </label>

          <label class="flex items-center gap-2 text-sm text-editorial-text-main">
            <input
              v-model="twitterKeywordForm.isVisible"
              data-twitter-keyword-form="is-visible"
              type="checkbox"
              class="h-4 w-4"
            />
            默认启用展示
          </label>

          <label class="flex flex-col gap-2">
            <span class="text-sm font-medium text-editorial-text-main">备注</span>
            <textarea
              v-model="twitterKeywordForm.notes"
              data-twitter-keyword-form="notes"
              rows="3"
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
            />
          </label>

          <div class="flex justify-end gap-2">
            <a-button @click="closeTwitterKeywordModal">取消</a-button>
            <a-button
              type="primary"
              data-twitter-keyword-form="submit"
              :loading="isActionPending('twitter-keyword:submit')"
              @click="handleSubmitTwitterKeyword"
            >
              {{ twitterKeywordModalMode === "create" ? "新增关键词" : "保存更新" }}
            </a-button>
          </div>
        </div>
      </a-modal>
    </div>
  </a-spin>
</template>
