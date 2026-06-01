import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AiTimelineFeedReadResult } from "../core/aiTimeline/aiTimelineFeedFile.js";
import { LatestReportEmailError, type LatestReportEmailErrorReason } from "../core/pipeline/sendLatestReportEmail.js";
import type { BuildContentPageModelOptions } from "../core/content/buildContentPageModel.js";
import type { ContentSortMode, ContentViewSelectionOptions } from "../core/content/buildContentViewSelection.js";
import type { ContentCardView, ContentViewKey } from "../core/content/listContentView.js";
import {
  aiTimelineEventTypes,
  aiTimelineImportanceLevels,
  aiTimelineReliabilityStatuses,
  aiTimelineVisibilityStatuses,
  isAiTimelineImportanceLevel,
  isAiTimelineVisibilityStatus,
  type AiTimelineHealthOverview,
  type AiTimelineListQuery,
  type AiTimelinePageModel,
  type AiTimelineSourceHealthRecord
} from "../core/aiTimeline/aiTimelineTypes.js";
import type { SaveFeedbackPoolEntryInput, SaveFeedbackPoolEntryResult } from "../core/feedback/feedbackPoolRepository.js";
import type {
  SaveProviderSettingsInput,
  SaveProviderSettingsResult,
  UpdateProviderSettingsActivationInput,
  UpdateProviderSettingsActivationResult
} from "../core/llm/providerSettingsRepository.js";
import type { RatingDimension, SaveRatingsResult } from "../core/ratings/ratingRepository.js";
import type { ContentSourceOption } from "../core/source/listContentSources.js";
import type {
  DeleteSourceResult,
  SaveSourceInput,
  SaveSourceResult,
  ToggleSourceResult,
  UpdateSourceDisplayModeResult
} from "../core/source/sourceMutationRepository.js";
import type {
  DeleteTwitterAccountResult,
  SaveTwitterAccountInput,
  SaveTwitterAccountResult,
  ToggleTwitterAccountResult,
  TwitterAccountRecord
} from "../core/twitter/twitterAccountRepository.js";
import type {
  DeleteTwitterSearchKeywordResult,
  SaveTwitterSearchKeywordInput,
  SaveTwitterSearchKeywordResult,
  ToggleTwitterSearchKeywordResult,
  TwitterSearchKeywordRecord
} from "../core/twitter/twitterSearchKeywordRepository.js";
import type {
  DeleteHackerNewsQueryResult,
  HackerNewsQueryRecord,
  SaveHackerNewsQueryInput,
  SaveHackerNewsQueryResult,
  ToggleHackerNewsQueryResult
} from "../core/hackernews/hackerNewsQueryRepository.js";
import type {
  BilibiliQueryRecord,
  DeleteBilibiliQueryResult,
  SaveBilibiliQueryInput,
  SaveBilibiliQueryResult,
  ToggleBilibiliQueryResult
} from "../core/bilibili/bilibiliQueryRepository.js";
import type {
  CreateWechatRssSourcesInput,
  CreateWechatRssSourcesResult,
  DeleteWechatRssSourceResult,
  UpdateWechatRssSourceInput,
  UpdateWechatRssSourceResult,
  WechatRssSourceRecord
} from "../core/wechatRss/wechatRssSourceRepository.js";
import type { WeiboTrendingRunState } from "../core/weibo/runWeiboTrendingCollection.js";
import type { RuntimeConfig } from "../core/types/appConfig.js";
import type { SqliteDatabase } from "../core/db/openDatabase.js";
import {
  insertCreativeSourceItem,
  findCreativeSourceItemByExternalId,
  listCreativeSourceItems,
  findCreativeSourceItemById,
  updateCreativeSourceItemWritingStatus,
  updateCreativeSourceItemLinkedArticle,
  updateCreativeSourceItemTrendScore,
  updateCreativeSourceItemFields
} from "../core/creative/creativeSourceItemRepository.js";
import {
  insertCreativeFinishedArticle,
  findCreativeFinishedArticleBySourceItemId,
  listCreativeFinishedArticles,
  findCreativeFinishedArticleById,
  editCreativeFinishedArticle,
  toggleWechatPublished,
  togglePublishable
} from "../core/creative/creativeFinishedArticleRepository.js";
import {
  insertDailyDigest,
  findDailyDigestById,
  listDailyDigests,
  updateDailyDigestStatus,
  findDailyDigestByDate,
  editDailyDigest
} from "../core/dailyDigest/dailyDigestRepository.js";

import { downloadAndStoreImage, storeImageBuffer, readStoredImage } from "../core/storage/imageStore.js";
import { readNextCollectionRunAt } from "../core/scheduler/readNextCollectionRunAt.js";
import {
  createSessionToken,
  readSessionCookieToken,
  readSessionToken,
  serializeClearedSessionCookie,
  serializeSessionCookie
} from "../core/auth/session.js";
import {
  renderControlPage,
  renderHistoryPage,
  renderNoticePage,
  renderNotFoundPage
} from "./renderPages.js";
import { findAppShellPage, getAppShellPages, renderAppLayout } from "./renderAppLayout.js";
import { renderContentPage } from "./renderContentPages.js";
import {
  renderProfilePage,
  renderSourcesPage,
  renderViewRulesPage,
  type BilibiliQuerySettingsView,
  type ProfileView,
  type SourcesSettingsView,
  type HackerNewsQuerySettingsView,
  type TwitterAccountSettingsView,
  type TwitterSearchKeywordSettingsView,
  type WeiboTrendingSettingsView,
  type ViewRulesWorkbenchView
} from "./renderSystemPages.js";

type ReportSummary = {
  date: string;
  topicCount: number;
  degraded: boolean;
  mailStatus: string;
};
type ParseRatingScoresResult =
  | { ok: true; scores: Record<string, number> }
  | { ok: false; reason: "invalid-ratings-payload" };
type SourceCard = {
  kind: string;
  name: string;
  siteUrl: string;
  rssUrl: string | null;
  isEnabled: boolean;
  isBuiltIn: boolean;
  showAllWhenSelected: boolean;
  sourceType: string;
  bridgeKind: string | null;
  bridgeConfigSummary: string | null;
  bridgeInputMode: "feed_url" | "article_url" | "name_lookup" | null;
  bridgeInputValue: string | null;
  lastCollectedAt: string | null;
  lastCollectionStatus: string | null;
  totalCount?: number;
  publishedTodayCount?: number;
  collectedTodayCount?: number;
  viewStats?: {
    hot: { candidateCount: number; visibleCount: number; visibleShare: number };
    articles: { candidateCount: number; visibleCount: number; visibleShare: number };
    ai: { candidateCount: number; visibleCount: number; visibleShare: number };
  };
};
type SourcesOperationSummary = {
  lastCollectionRunAt: string | null;
  lastSendLatestEmailAt: string | null;
};
type CurrentUserProfile = {
  username: string;
  displayName: string;
  role: string;
  email: string | null;
};
type ManualCollectResult = { accepted: true; action: "collect" };
type ManualTwitterCollectResult =
  | {
      accepted: true;
      action: "collect-twitter-accounts";
      enabledAccountCount: number;
      fetchedTweetCount: number;
      persistedContentItemCount: number;
      failureCount: number;
    }
  | {
      accepted: false;
      reason: "twitter-api-key-missing" | "no-enabled-twitter-accounts";
    };
type ManualTwitterKeywordCollectResult =
  | {
      accepted: true;
      action: "collect-twitter-keywords";
      enabledKeywordCount: number;
      processedKeywordCount: number;
      fetchedTweetCount: number;
      persistedContentItemCount: number;
      reusedContentItemCount: number;
      failureCount: number;
    }
  | {
      accepted: false;
      reason: "twitter-api-key-missing" | "no-enabled-twitter-keywords";
    };
type ManualHackerNewsCollectResult =
  | {
      accepted: true;
      action: "collect-hackernews";
      enabledQueryCount: number;
      processedQueryCount: number;
      fetchedHitCount: number;
      persistedContentItemCount: number;
      reusedContentItemCount: number;
      failureCount: number;
    }
  | {
      accepted: false;
      reason: "no-enabled-hackernews-queries";
    };
type ManualBilibiliCollectResult =
  | {
      accepted: true;
      action: "collect-bilibili";
      enabledQueryCount: number;
      processedQueryCount: number;
      fetchedVideoCount: number;
      persistedContentItemCount: number;
      reusedContentItemCount: number;
      failureCount: number;
    }
  | {
      accepted: false;
      reason: "no-enabled-bilibili-queries";
    };
type ManualWechatRssCollectResult =
  | {
      accepted: true;
      action: "collect-wechat-rss";
      enabledSourceCount: number;
      fetchedItemCount: number;
      persistedContentItemCount: number;
      failureCount: number;
    }
  | {
      accepted: false;
      reason: "no-enabled-wechat-rss-sources";
    };
type ManualWeiboTrendingCollectResult = {
  accepted: true;
  action: "collect-weibo-trending";
  fetchedTopicCount: number;
  matchedTopicCount: number;
  persistedContentItemCount: number;
  reusedContentItemCount: number;
  failureCount: number;
};
type ManualSendLatestEmailResult =
  | { accepted: true; action: "send-latest-email" }
  | { accepted: false; reason: LatestReportEmailErrorReason };
type SettingsAiTimelineAdminResponse = {
  overview: AiTimelineHealthOverview;
  sources: AiTimelineSourceHealthRecord[];
  options: {
    eventTypes: typeof aiTimelineEventTypes;
    importanceLevels: typeof aiTimelineImportanceLevels;
    visibilityStatuses: typeof aiTimelineVisibilityStatuses;
    reliabilityStatuses: typeof aiTimelineReliabilityStatuses;
  };
  events: {
    page: number;
    pageSize: number;
    totalResults: number;
    totalPages: number;
    filters: AiTimelinePageModel["filters"];
    events: AiTimelinePageModel["events"];
  };
};
type DeleteFeedbackResult = boolean;
type ClearFeedbackResult = number;
type ContentPageKey = "ai-new" | "ai-hot";
type ContentPageModel = {
  pageKey: ContentPageKey;
  sourceFilter?: {
    options: { kind: string; name: string; showAllWhenSelected: boolean; currentPageVisibleCount: number }[];
    selectedSourceKinds: string[];
  };
  twitterAccountFilter?: {
    options: { id: number; label: string; username: string }[];
    selectedAccountIds: number[];
  };
  twitterKeywordFilter?: {
    options: { id: number; label: string }[];
    selectedKeywordIds: number[];
  };
  wechatRssFilter?: {
    options: { id: number; label: string; rssUrl: string }[];
    selectedSourceIds: number[];
  };
  featuredCard: ContentCardView | null;
  cards: ContentCardView[];
  strategySummary: {
    pageKey: ContentPageKey;
    items: string[];
  };
  pagination: {
    page: number;
    pageSize: number;
    totalResults: number;
    totalPages: number;
  } | null;
  emptyState: {
    title: string;
    description: string;
    tone: "default" | "degraded" | "filtered";
  } | null;
};
type SaveContentFilterRuleInput = {
  ruleKey: string;
  toggles: unknown;
  weights: unknown;
};
type SaveContentFilterRuleResult = { ok: true; ruleKey: "ai" | "hot" } | { ok: false; reason: string };

type ServerDeps = {
  clientBuildRoot?: string;
  clientDevOrigin?: string;
  readClientDevEntryHtml?: () => Promise<string | null> | string | null;
  config?: Partial<RuntimeConfig>;
  db?: SqliteDatabase;
  creativeApiToken?: string;
  creativeImageDir?: string;
  listReportSummaries?: () => Promise<ReportSummary[]>;
  latestReportDate?: () => Promise<string | null>;
  readReportHtml?: (date: string) => Promise<string>;
  readAiTimelineFeed?: () => Promise<AiTimelineFeedReadResult> | AiTimelineFeedReadResult;
  triggerManualRun?: () => Promise<{ accepted: boolean }>;
  triggerManualCollect?: () => Promise<ManualCollectResult>;
  triggerManualTwitterCollect?: () => Promise<ManualTwitterCollectResult>;
  triggerManualTwitterKeywordCollect?: () => Promise<ManualTwitterKeywordCollectResult>;
  triggerManualSendLatestEmail?: () => Promise<ManualSendLatestEmailResult>;
  isRunning?: () => boolean;
  listContentView?: (
    viewKey: ContentViewKey,
    options?: Pick<
      ContentViewSelectionOptions,
      "selectedSourceKinds" | "selectedTwitterAccountIds" | "selectedTwitterKeywordIds" | "selectedWechatRssSourceIds" | "sortMode"
    >
  ) => Promise<ContentCardView[]> | ContentCardView[];
  listContentSources?: () => Promise<ContentSourceOption[]> | ContentSourceOption[];
  saveContentFeedback?: (
    contentItemId: number,
    input: Omit<SaveFeedbackPoolEntryInput, "contentItemId">
  ) => Promise<SaveFeedbackPoolEntryResult> | SaveFeedbackPoolEntryResult;
  listRatingDimensions?: () => Promise<RatingDimension[]> | RatingDimension[];
  saveRatings?: (contentItemId: number, scores: Record<string, number>) => Promise<SaveRatingsResult> | SaveRatingsResult;
  getViewRulesWorkbenchData?: () => Promise<ViewRulesWorkbenchView> | ViewRulesWorkbenchView;
  saveContentFilterRule?: (
    input: SaveContentFilterRuleInput
  ) => Promise<SaveContentFilterRuleResult> | SaveContentFilterRuleResult;
  saveProviderSettings?: (input: SaveProviderSettingsInput) => Promise<SaveProviderSettingsResult> | SaveProviderSettingsResult;
  updateProviderSettingsActivation?: (
    input: UpdateProviderSettingsActivationInput
  ) => Promise<UpdateProviderSettingsActivationResult> | UpdateProviderSettingsActivationResult;
  deleteProviderSettings?: (providerKind: string) => Promise<boolean> | boolean;
  deleteFeedbackEntry?: (feedbackId: number) => Promise<DeleteFeedbackResult> | DeleteFeedbackResult;
  clearAllFeedback?: () => Promise<ClearFeedbackResult> | ClearFeedbackResult;
  listSources?: () => Promise<SourceCard[]> | SourceCard[];
  getSourcesOperationSummary?: () => Promise<SourcesOperationSummary> | SourcesOperationSummary;
  createSource?: (input: SaveSourceInput) => Promise<SaveSourceResult> | SaveSourceResult;
  updateSource?: (input: SaveSourceInput) => Promise<SaveSourceResult> | SaveSourceResult;
  deleteSource?: (kind: string) => Promise<DeleteSourceResult> | DeleteSourceResult;
  toggleSource?: (kind: string, enable: boolean) => Promise<ToggleSourceResult> | ToggleSourceResult;
  updateSourceDisplayMode?: (
    kind: string,
    showAllWhenSelected: boolean
  ) => Promise<UpdateSourceDisplayModeResult> | UpdateSourceDisplayModeResult;
  listTwitterAccounts?: () => Promise<TwitterAccountRecord[]> | TwitterAccountRecord[];
  listTwitterSearchKeywords?: () => Promise<TwitterSearchKeywordRecord[]> | TwitterSearchKeywordRecord[];
  listHackerNewsQueries?: () => Promise<HackerNewsQueryRecord[]> | HackerNewsQueryRecord[];
  listBilibiliQueries?: () => Promise<BilibiliQueryRecord[]> | BilibiliQueryRecord[];
  listWechatRssSources?: () => Promise<WechatRssSourceRecord[]> | WechatRssSourceRecord[];
  getWeiboTrendingState?: () => Promise<WeiboTrendingRunState> | WeiboTrendingRunState;
  readAiTimelinePage?: (query: AiTimelineListQuery) => Promise<AiTimelinePageModel> | AiTimelinePageModel;
  createTwitterAccount?: (
    input: SaveTwitterAccountInput
  ) => Promise<SaveTwitterAccountResult> | SaveTwitterAccountResult;
  updateTwitterAccount?: (
    input: SaveTwitterAccountInput
  ) => Promise<SaveTwitterAccountResult> | SaveTwitterAccountResult;
  deleteTwitterAccount?: (id: number) => Promise<DeleteTwitterAccountResult> | DeleteTwitterAccountResult;
  toggleTwitterAccount?: (
    id: number,
    enable: boolean
  ) => Promise<ToggleTwitterAccountResult> | ToggleTwitterAccountResult;
  createTwitterSearchKeyword?: (
    input: SaveTwitterSearchKeywordInput
  ) => Promise<SaveTwitterSearchKeywordResult> | SaveTwitterSearchKeywordResult;
  updateTwitterSearchKeyword?: (
    input: SaveTwitterSearchKeywordInput
  ) => Promise<SaveTwitterSearchKeywordResult> | SaveTwitterSearchKeywordResult;
  deleteTwitterSearchKeyword?: (
    id: number
  ) => Promise<DeleteTwitterSearchKeywordResult> | DeleteTwitterSearchKeywordResult;
  toggleTwitterSearchKeywordCollect?: (
    id: number,
    enable: boolean
  ) => Promise<ToggleTwitterSearchKeywordResult> | ToggleTwitterSearchKeywordResult;
  toggleTwitterSearchKeywordVisible?: (
    id: number,
    enable: boolean
  ) => Promise<ToggleTwitterSearchKeywordResult> | ToggleTwitterSearchKeywordResult;
  createHackerNewsQuery?: (
    input: SaveHackerNewsQueryInput
  ) => Promise<SaveHackerNewsQueryResult> | SaveHackerNewsQueryResult;
  updateHackerNewsQuery?: (
    input: SaveHackerNewsQueryInput
  ) => Promise<SaveHackerNewsQueryResult> | SaveHackerNewsQueryResult;
  deleteHackerNewsQuery?: (id: number) => Promise<DeleteHackerNewsQueryResult> | DeleteHackerNewsQueryResult;
  toggleHackerNewsQuery?: (
    id: number,
    enable: boolean
  ) => Promise<ToggleHackerNewsQueryResult> | ToggleHackerNewsQueryResult;
  createBilibiliQuery?: (
    input: SaveBilibiliQueryInput
  ) => Promise<SaveBilibiliQueryResult> | SaveBilibiliQueryResult;
  updateBilibiliQuery?: (
    input: SaveBilibiliQueryInput
  ) => Promise<SaveBilibiliQueryResult> | SaveBilibiliQueryResult;
  deleteBilibiliQuery?: (id: number) => Promise<DeleteBilibiliQueryResult> | DeleteBilibiliQueryResult;
  toggleBilibiliQuery?: (
    id: number,
    enable: boolean
  ) => Promise<ToggleBilibiliQueryResult> | ToggleBilibiliQueryResult;
  createWechatRssSources?: (
    input: CreateWechatRssSourcesInput
  ) => Promise<CreateWechatRssSourcesResult> | CreateWechatRssSourcesResult;
  updateWechatRssSource?: (
    input: UpdateWechatRssSourceInput
  ) => Promise<UpdateWechatRssSourceResult> | UpdateWechatRssSourceResult;
  deleteWechatRssSource?: (id: number) => Promise<DeleteWechatRssSourceResult> | DeleteWechatRssSourceResult;
  hasTwitterApiKey?: boolean;
  triggerManualHackerNewsCollect?: () => Promise<ManualHackerNewsCollectResult>;
  triggerManualBilibiliCollect?: () => Promise<ManualBilibiliCollectResult>;
  triggerManualWechatRssCollect?: () => Promise<ManualWechatRssCollectResult>;
  triggerManualWeiboTrendingCollect?: () => Promise<ManualWeiboTrendingCollectResult>;
  getCurrentUserProfile?: () => Promise<CurrentUserProfile | null> | CurrentUserProfile | null;
  updatePassword?: (newPassword: string) => Promise<void>;
  pushArticleToWechatDraft?: (
    articleId: number,
    themeId: string,
    wechatHtml?: string,
    onProgress?: (step: string, status: "running" | "done" | "error", detail?: string) => void | Promise<void>
  ) => Promise<{ ok: boolean; mediaId?: string; errorCode?: string; errorMessage?: string; hint?: string; pushCount?: number }>;
  pushDailyDigestToWechatDraft?: (
    digestId: number,
    themeId: string,
    wechatHtml: string,
    onProgress?: (step: string, status: "running" | "done" | "error", detail?: string) => void | Promise<void>
  ) => Promise<{ ok: boolean; mediaId?: string; errorCode?: string; errorMessage?: string }>;
  getArticleWechatPushLog?: (articleId: number) => unknown[];
  getArticlePushCount?: (articleId: number) => number;
  listWechatMpAccounts?: () => unknown[];
  saveWechatMpAccount?: (input: { id?: number; name: string; appId: string; appSecret?: string; notes?: string; isDefault?: boolean; isEnabled?: boolean }) => Promise<{ ok: boolean; id: number }>;
  deleteWechatMpAccount?: (id: number) => boolean;
  setDefaultWechatMpAccount?: (id: number) => boolean;
  getContentPageModel?: (
    pageKey: ContentPageKey,
    options?: Pick<
      BuildContentPageModelOptions,
      | "selectedSourceKinds"
      | "selectedTwitterAccountIds"
      | "selectedTwitterKeywordIds"
      | "selectedWechatRssSourceIds"
      | "sortMode"
      | "page"
      | "searchKeyword"
    >
  ) => Promise<ContentPageModel> | ContentPageModel;
  auth?: {
    requireLogin: boolean;
    sessionSecret: string;
    verifyLogin?: (
      username: string,
      password: string
    ) =>
      | Promise<{ username: string; displayName?: string | null; role?: string | null } | null>
      | { username: string; displayName?: string | null; role?: string | null }
      | null;
    sessionTtlSeconds?: number;
    secureCookie?: boolean;
  };
};

// This server keeps the old health route intact and layers report pages on top through dependency injection.
export function createServer(deps: ServerDeps = {}) {
  const app = Fastify({ logger: true });
  const authConfig = deps.auth;
  const authEnabled = authConfig?.requireLogin === true;
  const db = deps.db;
  const creativeApiToken = deps.creativeApiToken;
  const creativeImageDir = deps.creativeImageDir;
  const hasUnifiedShellDeps = Boolean(
    deps.listContentView || deps.getViewRulesWorkbenchData || deps.listSources || deps.getCurrentUserProfile
  );
  const siteCss = readSiteCss();
  const siteJs = readSiteJs();
  // Tests can override the client build root so missing-bundle scenarios do not mutate the process cwd.
  const clientBuildRoot = deps.clientBuildRoot ?? path.resolve(process.cwd(), "dist/client");
  const clientIndexPath = path.join(clientBuildRoot, "index.html");
  const clientDevOrigin = normalizeClientDevOrigin(deps.clientDevOrigin ?? null);

  app.get("/health", async () => ({ ok: true }));
  app.get("/feeds/ai-timeline-feed.md", async (_request, reply) => {
    if (!deps.readAiTimelineFeed) {
      return reply.code(404).type("text/plain; charset=utf-8").send("AI timeline feed is not configured");
    }

    try {
      const feed = await deps.readAiTimelineFeed();
      return reply
        .header("x-hot-now-feed-source", feed.sourcePath)
        .header("x-hot-now-feed-fallback", String(feed.isFallback))
        .type("text/markdown; charset=utf-8")
        .send(feed.content);
    } catch (error) {
      app.log.warn({ error }, "AI timeline feed is unavailable");
      return reply.code(503).type("text/plain; charset=utf-8").send("AI timeline feed is unavailable");
    }
  });
  app.get("/assets/site.css", async (_request, reply) => reply.type("text/css; charset=utf-8").send(siteCss));
  app.get("/assets/site.js", async (_request, reply) => reply.type("application/javascript; charset=utf-8").send(siteJs));
  app.get("/favicon.ico", async (_request, reply) => {
    const faviconPath = path.resolve(process.cwd(), "src/server/public/brand/hotnow-favicon.png");

    try {
      return reply.type("image/png").send(readFileSync(faviconPath));
    } catch {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }
  });
  app.get("/brand/*", async (request, reply) => {
    const { "*": rawAssetPath = "" } = request.params as { "*": string };
    const normalizedAssetPath = normalizeClientAssetPath(rawAssetPath);

    if (!normalizedAssetPath || path.extname(normalizedAssetPath).toLowerCase() !== ".png") {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    const brandRoot = path.resolve(process.cwd(), "src/server/public/brand");
    const resolvedAssetPath = path.resolve(brandRoot, normalizedAssetPath);
    const brandRootWithSeparator = `${brandRoot}${path.sep}`;

    // 品牌静态资源只允许读取 brand 目录下的 png，避免请求路径越界到工作区其他文件。
    if (!resolvedAssetPath.startsWith(brandRootWithSeparator) && resolvedAssetPath !== brandRoot) {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    try {
      const assetBody = readFileSync(resolvedAssetPath);
      return reply.type("image/png").send(assetBody);
    } catch {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }
  });
  app.get("/client/*", async (request, reply) => {
    const { "*": rawAssetPath = "" } = request.params as { "*": string };
    const normalizedAssetPath = normalizeClientAssetPath(rawAssetPath);

    if (!normalizedAssetPath) {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    const resolvedAssetPath = path.resolve(clientBuildRoot, normalizedAssetPath);
    const clientBuildRootWithSeparator = `${clientBuildRoot}${path.sep}`;

    // The static client endpoint only serves files that remain under dist/client.
    if (!resolvedAssetPath.startsWith(clientBuildRootWithSeparator) && resolvedAssetPath !== clientBuildRoot) {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    const extension = path.extname(resolvedAssetPath).toLowerCase();

    if (extension !== ".js" && extension !== ".css") {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    try {
      const assetBody = readFileSync(resolvedAssetPath, "utf8");
      return reply.type(resolveClientAssetMimeType(extension)).send(assetBody);
    } catch {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }
  });

  app.get("/api/settings/view-rules", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");

    if (session === undefined) {
      return;
    }

    return reply.send(await readSettingsViewRulesApiData(deps));
  });

  app.post("/actions/view-rules/content-filters", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    const body = request.body as { ruleKey?: unknown; toggles?: unknown; weights?: unknown } | undefined;
    const ruleKey = typeof body?.ruleKey === "string" ? body.ruleKey.trim() : "";
    const result = await deps.saveContentFilterRule?.({
      ruleKey,
      toggles: body?.toggles,
      weights: body?.weights
    });

    if (!result || result.ok === false) {
      return reply.code(400).send({ ok: false, reason: "invalid-content-filter-config" });
    }

    return reply.send({ ok: true, ruleKey: result.ruleKey });
  });

  app.get("/api/settings/sources", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");

    if (session === undefined) {
      return;
    }

    return reply.send(await readSettingsSourcesApiData(deps));
  });

  app.get("/api/settings/profile", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");

    if (session === undefined) {
      return;
    }

    return reply.send({ profile: await readSettingsProfileApiData(deps, session) });
  });

  app.put("/api/settings/profile/password", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");

    if (session === undefined) {
      return;
    }

    const body = request.body as Record<string, unknown> | undefined;
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    if (!currentPassword || !newPassword) {
      return reply.status(400).send({ ok: false, error: "当前密码和新密码不能为空" });
    }

    if (newPassword.length < 6) {
      return reply.status(400).send({ ok: false, error: "新密码至少 6 位" });
    }

    if (!authConfig?.verifyLogin) {
      return reply.status(503).send({ ok: false, error: "服务未配置登录验证" });
    }

    const user = await authConfig.verifyLogin(session!.username, currentPassword);

    if (!user) {
      return reply.status(401).send({ ok: false, error: "当前密码不正确" });
    }

    if (!deps.updatePassword) {
      return reply.status(503).send({ ok: false, error: "服务未配置密码更新" });
    }

    await deps.updatePassword(newPassword);
    return reply.send({ ok: true });
  });

  app.get("/api/settings/ai-timeline", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");

    if (session === undefined) {
      return;
    }

    return reply.send(await readSettingsAiTimelineAdminApiData(deps, request));
  });

  app.get("/api/content/ai-new", async (request, reply) => {
    return reply.send(await readContentPageModelApiData(deps, request, "ai-new"));
  });

  app.get("/api/content/ai-hot", async (request, reply) => {
    return reply.send(await readContentPageModelApiData(deps, request, "ai-hot"));
  });

  app.get("/api/ai-timeline", async (request, reply) => {
    return reply.send(await readAiTimelineApiData(deps, request));
  });

  app.get("/api/settings/ai-timeline-events", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");

    if (session === undefined) {
      return;
    }

    return reply.send(await readAiTimelineAdminApiData(deps, request));
  });

  app.get("/api/settings/ai-timeline/events", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");

    if (session === undefined) {
      return;
    }

    return reply.send(await readAiTimelineAdminApiData(deps, request));
  });

  // ─── Creative: Push API (token-authenticated) ───

  app.post("/api/creative/source-items", async (request, reply) => {
    if (!validateCreativeApiToken(request, reply, creativeApiToken)) {
      return;
    }

    const body = request.body as Record<string, unknown> | undefined;
    const externalId = typeof body?.externalId === "string" ? body.externalId.trim() : "";
    const collectorAgent = typeof body?.collectorAgent === "string" ? body.collectorAgent.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const url = typeof body?.url === "string" ? body.url.trim() : "";

    if (!externalId || !collectorAgent || !title || !url) {
      return reply.code(400).send({ ok: false, reason: "missing-required-fields" });
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const result = insertCreativeSourceItem(db, {
      externalId,
      collectorAgent,
      title,
      url,
      sourceName: typeof body?.sourceName === "string" ? body.sourceName : undefined,
      summary: typeof body?.summary === "string" ? body.summary : undefined,
      fullContent: typeof body?.fullContent === "string" ? body.fullContent : undefined,
      author: typeof body?.author === "string" ? body.author : undefined,
      coverImageUrl: typeof body?.coverImageUrl === "string" ? body.coverImageUrl : undefined,
      tags: typeof body?.tags === "string" ? body.tags : (Array.isArray(body?.tags) ? JSON.stringify(body.tags) : undefined),
      language: typeof body?.language === "string" ? body.language : undefined,
      wordCount: typeof body?.wordCount === "number" ? body.wordCount : undefined,
      contentType: typeof body?.contentType === "string" ? body.contentType : undefined,
      score: typeof body?.score === "number" ? body.score : undefined,
      publishedAt: typeof body?.publishedAt === "string" ? body.publishedAt : undefined,
      collectorTimestamp: typeof body?.collectorTimestamp === "string" ? body.collectorTimestamp : undefined,
      writingStatus: typeof body?.writingStatus === "string" && ["ready", "writing", "done", "skipped", "excluded"].includes(body.writingStatus) ? body.writingStatus as "ready" | "writing" | "done" | "skipped" | "excluded" : undefined,
      trendScore: typeof body?.trendScore === "number" ? body.trendScore : undefined,
      trendBreakdown: typeof body?.trendBreakdown === "object" && body.trendBreakdown !== null ? body.trendBreakdown as any : undefined
    });

    return reply.code(result.created ? 201 : 200).send({
      id: result.id,
      externalId,
      created: result.created
    });
  });

  app.post("/api/creative/finished-articles", async (request, reply) => {
    if (!validateCreativeApiToken(request, reply, creativeApiToken)) {
      return;
    }

    const body = request.body as Record<string, unknown> | undefined;
    const sourceExternalId = typeof body?.sourceExternalId === "string" ? body.sourceExternalId.trim() : "";
    const collectorAgent = typeof body?.collectorAgent === "string" ? body.collectorAgent.trim() : "";
    const contentMarkdown = typeof body?.contentMarkdown === "string" ? body.contentMarkdown.trim() : "";

    if (!sourceExternalId || !collectorAgent || !contentMarkdown) {
      return reply.code(400).send({ ok: false, reason: "missing-required-fields" });
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const sourceItem = findCreativeSourceItemByExternalId(db, sourceExternalId, collectorAgent);
    if (!sourceItem) {
      return reply.code(404).send({ ok: false, reason: "source-item-not-found" });
    }

    const existing = findCreativeFinishedArticleBySourceItemId(db, sourceItem.id);
    const allowDuplicate = body?.allowDuplicate === true;
    if (existing && !allowDuplicate) {
      return reply.code(409).send({ ok: false, reason: "article-already-exists" });
    }

    const article = insertCreativeFinishedArticle(db, {
      sourceItemId: sourceItem.id,
      mode: typeof body?.mode === "string" ? (body.mode as "A" | "B") : undefined,
      thesis: typeof body?.thesis === "string" ? body.thesis : undefined,
      intros: Array.isArray(body?.intros) ? body.intros as string[] : undefined,
      contentMarkdown,
      titles: Array.isArray(body?.titles) ? body.titles as string[] : undefined,
      hooks: Array.isArray(body?.hooks) ? body.hooks as string[] : undefined,
      quotes: Array.isArray(body?.quotes) ? body.quotes as string[] : undefined,
      summary100: Array.isArray(body?.summary100) ? body.summary100 as string[] : (typeof body?.summary100 === "string" ? [body.summary100] : undefined),
      images: Array.isArray(body?.images) ? body.images as any[] : undefined,
      coverImage: Array.isArray(body?.coverImage) ? body.coverImage as string[] : (typeof body?.coverImage === "string" ? [body.coverImage] : undefined),
      rawResponseText: typeof body?.rawResponseText === "string" ? body.rawResponseText : undefined,
      coverImagePrompt: typeof body?.coverImagePrompt === "string" ? body.coverImagePrompt : undefined,
      inlineImagePrompts: body?.inlineImagePrompts && typeof body.inlineImagePrompts === "object" ? body.inlineImagePrompts as Record<string, string> : undefined,
      similarityCheck: body?.similarityCheck && typeof body.similarityCheck === "object" ? body.similarityCheck as Record<string, unknown> : undefined,
      needsManualReview: typeof body?.needsManualReview === "boolean" ? body.needsManualReview : undefined,
      manualReviewReason: typeof body?.manualReviewReason === "string" ? body.manualReviewReason : undefined,
      manualReviewReasons: Array.isArray(body?.manualReviewReasons) ? body.manualReviewReasons as string[] : undefined,
      status: typeof body?.status === "string" ? body.status : undefined,
    });

    // 推送成品文章后，自动将素材写作状态标为 done
    updateCreativeSourceItemLinkedArticle(db, sourceItem.id, article.id);
    updateCreativeSourceItemWritingStatus(db, sourceItem.id, "done");

    return reply.code(201).send({
      id: article.id,
      sourceItemId: sourceItem.id,
      created: true
    });
  });

  // ─── Creative: Feed API（为外部 Agent 暴露高分 AI 新讯候选，token 鉴权） ───

  app.get("/api/creative/feed/ai-new", async (request, reply) => {
    if (!validateCreativeApiToken(request, reply, creativeApiToken)) {
      return;
    }

    if (!deps.listContentView) {
      return reply.code(503).send({ ok: false, reason: "content-view-not-available" });
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    // minScore 为百分制整数（0-100），默认 80
    const query = request.query as Record<string, string | undefined>;
    const rawMinScore = parseFloat(query.minScore ?? "80");
    const minScore = Number.isFinite(rawMinScore) && rawMinScore >= 0 && rawMinScore <= 100 ? rawMinScore : 80;

    // 按评分降序拉取 AI 新讯全量候选（不传 selectedSourceKinds，不受用户来源偏好影响）
    const allCards = await deps.listContentView("ai", { sortMode: "content_score" });

    // 查出已推入素材库的 URL 集合，用于去重
    const pushedUrls = new Set<string>(
      (db.prepare("SELECT url FROM creative_source_items").all() as Array<{ url: string }>).map((r) => r.url)
    );

    const filtered = allCards
      .filter((card) => card.contentScore >= minScore && !pushedUrls.has(card.canonicalUrl))
      .slice(0, 50);

    // 批量取 body_markdown，RSS 来源大多为空，Agent 需自行抓取原文
    const idPlaceholders = filtered.map(() => "?").join(", ");
    const bodyRows = filtered.length > 0
      ? (db.prepare(`SELECT id, body_markdown FROM content_items WHERE id IN (${idPlaceholders})`).all(...filtered.map((c) => c.id)) as Array<{ id: number; body_markdown: string | null }>)
      : [];
    const bodyById = new Map(bodyRows.map((r) => [r.id, r.body_markdown]));

    const candidates = filtered.map((card) => ({
      id: card.id,
      title: card.title,
      summary: card.summary,
      fullContent: bodyById.get(card.id) ?? null,
      canonicalUrl: card.canonicalUrl,
      publishedAt: card.publishedAt,
      contentScore: card.contentScore,
      sourceName: card.sourceName,
      sourceKind: card.sourceKind
    }));

    return reply.send({ ok: true, total: candidates.length, items: candidates });
  });

  // ─── Creative: Query API (session-authenticated) ───

  app.get("/api/creative/source-items", async (request, reply) => {
    // 支持两种认证：token（外部 Agent）或 session（管理 UI）
    const hasToken = creativeApiToken && request.headers["x-creative-token"] === creativeApiToken;
    if (!hasToken) {
      const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
      if (session === undefined) { return; }
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const query = request.query as Record<string, string | undefined>;

    const result = listCreativeSourceItems(db, {
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
      writingStatus: query.writingStatus as "ready" | "writing" | "done" | "skipped" | "excluded" | undefined,
      collectorAgent: query.collectorAgent,
      search: query.search,
      trendScoreMin: query.trendScore_min ? parseInt(query.trendScore_min, 10) : undefined,
      sourceFeed: query.sourceFeed || undefined,
      last24h: query.sourceFeed ? true : undefined
    });

    // 批量查询关联成品文章的创建时间和公众号发布状态
    const linkedIds = result.items.filter(i => i.linkedArticleId != null).map(i => i.linkedArticleId!);
    if (linkedIds.length > 0) {
      const placeholders = linkedIds.map(() => "?").join(",");
      const articleRows = db.prepare(
        `SELECT id, created_at, wechat_published FROM creative_finished_articles WHERE id IN (${placeholders})`
      ).all(...linkedIds) as Array<{ id: number; created_at: string; wechat_published: number }>;
      const articleMap = new Map(articleRows.map(r => [r.id, r]));
      for (const item of result.items) {
        if (item.linkedArticleId != null) {
          const row = articleMap.get(item.linkedArticleId);
          (item as any).linkedArticleCreatedAt = row?.created_at ?? null;
          (item as any).linkedArticlePublished = row?.wechat_published === 1;
        }
      }
    }

    return reply.send(result);
  });

  app.get("/api/creative/source-items/:id", async (request, reply) => {
    // 支持两种认证：token（外部 Agent）或 session（管理 UI）
    const hasToken = creativeApiToken && request.headers["x-creative-token"] === creativeApiToken;
    if (!hasToken) {
      const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
      if (session === undefined) { return; }
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const params = request.params as { id: string };
    const id = parseInt(params.id, 10);
    const item = findCreativeSourceItemById(db, id);
    if (!item) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }
    return reply.send(item);
  });

  app.get("/api/creative/finished-articles", async (request, reply) => {
    // 支持两种认证：token（外部 Agent）或 session（管理 UI）
    const hasToken = creativeApiToken && request.headers["x-creative-token"] === creativeApiToken;
    if (!hasToken) {
      const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
      if (session === undefined) { return; }
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const query = request.query as Record<string, string | undefined>;
    const result = listCreativeFinishedArticles(db, {
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
      status: query.status,
      search: query.search,
      publishable: query.publishable === "1" ? true : undefined
    });

    // 批量查询关联素材的 trendScore/trendBreakdown/publishedAt
    if (result.items.length > 0) {
      const sourceItemIds = result.items.map(a => a.sourceItemId);
      const idPlaceholders = sourceItemIds.map(() => "?").join(",");
      const sourceRows = db.prepare(
        `SELECT id, trend_score, trend_breakdown, published_at, title, source_name FROM creative_source_items WHERE id IN (${idPlaceholders})`
      ).all(...sourceItemIds) as Array<{ id: number; trend_score: number | null; trend_breakdown: string | null; published_at: string | null; title: string | null; source_name: string | null }>;
      const sourceMap = new Map(sourceRows.map(r => [r.id, r]));
      for (const article of result.items) {
        const source = sourceMap.get(article.sourceItemId);
        (article as any).trendScore = source?.trend_score ?? null;
        (article as any).trendBreakdown = source?.trend_breakdown ? JSON.parse(source.trend_breakdown) : null;
        (article as any).publishedAt = source?.published_at ?? null;
        (article as any).sourceTitle = source?.title ?? null;
        (article as any).sourceName = source?.source_name ?? null;
      }
    }
    return reply.send(result);
  });

  app.get("/api/creative/finished-articles/:id", async (request, reply) => {
    // 支持两种认证：token（外部 Agent）或 session（管理 UI）
    const hasToken = creativeApiToken && request.headers["x-creative-token"] === creativeApiToken;
    if (!hasToken) {
      const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
      if (session === undefined) { return; }
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const params = request.params as { id: string };
    const id = parseInt(params.id, 10);
    const article = findCreativeFinishedArticleById(db, id);
    if (!article) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    // 关联查询 source item 的 trendScore/trendBreakdown/publishedAt/title
    const sourceRow = db.prepare(
      "SELECT trend_score, trend_breakdown, published_at, title FROM creative_source_items WHERE id = ?"
    ).get(article.sourceItemId) as { trend_score: number | null; trend_breakdown: string | null; published_at: string | null; title: string } | undefined;
    if (sourceRow) {
      (article as any).trendScore = sourceRow.trend_score ?? null;
      (article as any).trendBreakdown = sourceRow.trend_breakdown ? JSON.parse(sourceRow.trend_breakdown) : null;
      (article as any).publishedAt = sourceRow.published_at ?? null;
      (article as any).sourceTitle = sourceRow.title ?? null;
    }

    return reply.send(article);
  });

  // 成品文章局部更新：评分重跑、补图等场景
  app.patch("/api/creative/finished-articles/:id", async (request, reply) => {
    const hasToken = creativeApiToken && request.headers["x-creative-token"] === creativeApiToken;
    if (!hasToken) {
      const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
      if (session === undefined) { return; }
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const params = request.params as { id: string };
    const id = parseInt(params.id, 10);
    const body = request.body as Record<string, unknown> | undefined;
    const article = findCreativeFinishedArticleById(db, id);
    if (!article) {
      return reply.code(404).send({ message: "Finished article not found", statusCode: 404 });
    }

    const updatedFields: string[] = [];

    // finished_articles 表字段
    const editInput: Record<string, unknown> = {};
    if (body?.contentMarkdown !== undefined) { editInput.contentMarkdown = body.contentMarkdown; updatedFields.push("contentMarkdown"); }
    if (body?.images !== undefined) { editInput.images = body.images; updatedFields.push("images"); }
    if (body?.coverImage !== undefined) {
      // 兼容字符串和数组两种格式
      editInput.coverImage = Array.isArray(body.coverImage)
        ? body.coverImage as string[]
        : typeof body.coverImage === "string" ? [body.coverImage] : [];
      updatedFields.push("coverImage");
    }
    if (body?.coverImageIndex !== undefined && typeof body.coverImageIndex === "number") {
      editInput.coverImageIndex = body.coverImageIndex;
      updatedFields.push("coverImageIndex");
    }
    if (body?.titleIndex !== undefined && typeof body.titleIndex === "number") {
      editInput.titleIndex = body.titleIndex;
      updatedFields.push("titleIndex");
    }
    if (body?.intros !== undefined) {
      editInput.intros = Array.isArray(body.intros) ? body.intros as string[] : [];
      updatedFields.push("intros");
    }
    if (body?.introIndex !== undefined && typeof body.introIndex === "number") {
      editInput.introIndex = body.introIndex;
      updatedFields.push("introIndex");
    }
    if (body?.titles !== undefined) { editInput.titles = body.titles; updatedFields.push("titles"); }
    if (body?.thesis !== undefined) { editInput.thesis = body.thesis; updatedFields.push("thesis"); }
    if (body?.summary100 !== undefined) {
      editInput.summary100 = Array.isArray(body.summary100) ? body.summary100 as string[] : (typeof body.summary100 === "string" ? [body.summary100] : []);
      updatedFields.push("summary100");
    }
    if (body?.summaryIndex !== undefined && typeof body.summaryIndex === "number") {
      editInput.summaryIndex = body.summaryIndex;
      updatedFields.push("summaryIndex");
    }
    if (body?.status !== undefined) { editInput.status = body.status; updatedFields.push("status"); }
    if (body?.anomalyReason !== undefined) { editInput.anomalyReason = body.anomalyReason; updatedFields.push("anomalyReason"); }
    if (body?.wechatThemeId !== undefined) { editInput.wechatThemeId = body.wechatThemeId; updatedFields.push("wechatThemeId"); }
    if (body?.wechatHtml !== undefined) { editInput.wechatHtml = body.wechatHtml; updatedFields.push("wechatHtml"); }
    if (body?.coverImagePrompt !== undefined) { editInput.coverImagePrompt = body.coverImagePrompt; updatedFields.push("coverImagePrompt"); }
    if (body?.inlineImagePrompts !== undefined) { editInput.inlineImagePrompts = body.inlineImagePrompts; updatedFields.push("inlineImagePrompts"); }
    if (body?.similarityCheck !== undefined) { editInput.similarityCheck = body.similarityCheck; updatedFields.push("similarityCheck"); }
    if (body?.needsManualReview !== undefined) { editInput.needsManualReview = body.needsManualReview; updatedFields.push("needsManualReview"); }
    if (body?.manualReviewReason !== undefined) { editInput.manualReviewReason = body.manualReviewReason; updatedFields.push("manualReviewReason"); }
    if (body?.manualReviewReasons !== undefined) { editInput.manualReviewReasons = body.manualReviewReasons; updatedFields.push("manualReviewReasons"); }

    if (Object.keys(editInput).length > 0) {
      editCreativeFinishedArticle(db, id, editInput as any);
    }

    // trendScore / trendBreakdown 存在 source_items 表，需关联更新
    if (body?.trendScore !== undefined || body?.trendBreakdown !== undefined) {
      if (body?.trendScore !== undefined) updatedFields.push("trendScore");
      if (body?.trendBreakdown !== undefined) updatedFields.push("trendBreakdown");
      const trendScore = typeof body.trendScore === "number" ? body.trendScore : 0;
      const trendBreakdown = (body.trendBreakdown && typeof body.trendBreakdown === "object") ? body.trendBreakdown : {};
      updateCreativeSourceItemTrendScore(db, article.sourceItemId, trendScore, trendBreakdown as any);
    }

    if (updatedFields.length === 0) {
      return reply.code(400).send({ message: "No fields to update", statusCode: 400 });
    }

    const updated = findCreativeFinishedArticleById(db, id);
    return reply.send({
      id,
      updatedFields,
      updatedAt: updated?.updatedAt ?? new Date().toISOString()
    });
  });

  // 切换成品文章的公众号发布状态
  app.post("/api/creative/finished-articles/:id/toggle-published", async (request, reply) => {
    const hasToken = creativeApiToken && request.headers["x-creative-token"] === creativeApiToken;
    if (!hasToken) {
      const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
      if (session === undefined) { return; }
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const params = request.params as { id: string };
    const id = parseInt(params.id, 10);
    const updated = toggleWechatPublished(db, id);
    if (!updated) {
      return reply.code(404).send({ message: "Finished article not found", statusCode: 404 });
    }
    return reply.send({ ok: true, wechatPublished: updated.wechatPublished });
  });

  app.post("/api/creative/finished-articles/:id/toggle-publishable", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
    if (session === undefined) { return; }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const id = parseInt((request.params as { id: string }).id, 10);
    const updated = togglePublishable(db, id);
    if (!updated) {
      return reply.code(404).send({ message: "Finished article not found", statusCode: 404 });
    }
    return reply.send({ ok: true, publishable: updated.publishable });
  });

  // 查询文章缺失图片状态（代理 Hermes API）
  app.get("/api/creative/finished-articles/:id/missing-images", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
    if (session === undefined) { return; }

    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }

    const id = parseInt((request.params as { id: string }).id, 10);
    try {
      const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/articles/missing-images?articleId=${id}`, {
        headers: { "Authorization": `Bearer ${hermesApiToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return reply.code(res.status >= 500 ? 502 : res.status).send({ ok: false, reason: `Hermes HTTP ${res.status}`, detail: body });
      }
      const data = await res.json();
      return reply.send(data);
    } catch (err) {
      return reply.code(502).send({ ok: false, reason: "Hermes 调用失败", detail: (err as Error).message });
    }
  });

  // 重新生成封面图：后端代理 Hermes API
  app.post("/api/creative/finished-articles/:id/regen-cover", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
    if (session === undefined) { return; }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const params = request.params as { id: string };
    const id = parseInt(params.id, 10);
    const article = findCreativeFinishedArticleById(db, id);
    if (!article) {
      return reply.code(404).send({ ok: false, reason: "article-not-found" });
    }

    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) {
      return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180_000);

      const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/regen-cover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${hermesApiToken}`,
        },
        body: JSON.stringify({ articleId: id }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "") || `Hermes HTTP ${res.status}`;
        return reply.code(res.status >= 500 ? 502 : res.status).send({
          ok: false,
          reason: `Hermes HTTP ${res.status}`,
          hermesResponse: errorBody,
        });
      }

      const data = await res.json() as { success: boolean; coverUrl?: string; prompt?: string; sourceUrl?: string; provider?: string; model?: string; error?: string };
      if (!data.success || !data.coverUrl) {
        return reply.code(502).send({ ok: false, reason: data.error ?? "封面图生成失败", hermesResponse: JSON.stringify(data) });
      }

      // 将新封面图 prepend 到数组开头
      const updatedCovers = [data.coverUrl, ...article.coverImage];
      editCreativeFinishedArticle(db, id, { coverImage: updatedCovers });

      const updated = findCreativeFinishedArticleById(db, id);
      return reply.send({
        ok: true,
        coverImage: updated?.coverImage ?? updatedCovers,
        prompt: data.prompt,
        sourceUrl: data.sourceUrl ?? "",
        provider: data.provider ?? "",
        model: data.model ?? "",
      });
    } catch (err) {
      const errMessage = (err as Error).message ?? String(err);
      if ((err as Error).name === "AbortError") {
        return reply.code(504).send({ ok: false, reason: "封面图生成超时（>180s），Hermes 未响应", detail: errMessage });
      }
      return reply.code(502).send({ ok: false, reason: `Hermes 调用失败`, detail: errMessage });
    }
  });

  app.post("/api/creative/finished-articles/:id/regen-title", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
    if (session === undefined) { return; }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const params = request.params as { id: string };
    const id = parseInt(params.id, 10);
    const article = findCreativeFinishedArticleById(db, id);
    if (!article) {
      return reply.code(404).send({ ok: false, reason: "article-not-found" });
    }

    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) {
      return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/regen-title`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${hermesApiToken}`,
        },
        body: JSON.stringify({ articleId: id }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "") || `Hermes HTTP ${res.status}`;
        return reply.code(res.status >= 500 ? 502 : res.status).send({
          ok: false,
          reason: `Hermes HTTP ${res.status}`,
          hermesResponse: errorBody,
        });
      }

      const data = await res.json() as { success: boolean; title?: string; prompt?: string; error?: string };
      if (!data.success || !data.title) {
        return reply.code(502).send({ ok: false, reason: data.error ?? "标题生成失败", hermesResponse: JSON.stringify(data) });
      }

      // 新标题 prepend 到数组开头
      const existingTitles = article.titles ?? [];
      const updatedTitles = [data.title, ...existingTitles];
      editCreativeFinishedArticle(db, id, { titles: updatedTitles });

      const updated = findCreativeFinishedArticleById(db, id);
      return reply.send({ ok: true, titles: updated?.titles ?? updatedTitles, prompt: data.prompt });
    } catch (err) {
      const errMessage = (err as Error).message ?? String(err);
      if ((err as Error).name === "AbortError") {
        return reply.code(504).send({ ok: false, reason: "标题生成超时（>15s），Hermes 未响应", detail: errMessage });
      }
      return reply.code(502).send({ ok: false, reason: `Hermes 调用失败`, detail: errMessage });
    }
  });

  // ─── regen-intro：重新生成导语 ───
  app.post("/api/creative/finished-articles/:id/regen-intro", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
    if (session === undefined) { return; }
    if (!db) { return reply.code(503).send({ ok: false, reason: "database-not-available" }); }

    const id = parseInt((request.params as { id: string }).id, 10);
    const article = findCreativeFinishedArticleById(db, id);
    if (!article) { return reply.code(404).send({ ok: false, reason: "article-not-found" }); }

    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/regen-intro`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hermesApiToken}` },
        body: JSON.stringify({ articleId: id }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "") || `Hermes HTTP ${res.status}`;
        return reply.code(res.status >= 500 ? 502 : res.status).send({ ok: false, reason: `Hermes HTTP ${res.status}`, hermesResponse: errorBody });
      }

      const data = await res.json() as { success: boolean; intro?: string; prompt?: string; error?: string };
      if (!data.success || !data.intro) {
        return reply.code(502).send({ ok: false, reason: data.error ?? "导语生成失败", hermesResponse: JSON.stringify(data) });
      }

      const existingIntros = article.intros ?? [];
      const updatedIntros = [data.intro, ...existingIntros];
      editCreativeFinishedArticle(db, id, { intros: updatedIntros });

      const updated = findCreativeFinishedArticleById(db, id);
      return reply.send({ ok: true, intros: updated?.intros ?? updatedIntros, prompt: data.prompt });
    } catch (err) {
      const errMessage = (err as Error).message ?? String(err);
      if ((err as Error).name === "AbortError") { return reply.code(504).send({ ok: false, reason: "导语生成超时（>15s），Hermes 未响应", detail: errMessage }); }
      return reply.code(502).send({ ok: false, reason: `Hermes 调用失败`, detail: errMessage });
    }
  });

  // ─── regen-summary：重新生成百字摘要 ───
  app.post("/api/creative/finished-articles/:id/regen-summary", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
    if (session === undefined) { return; }
    if (!db) { return reply.code(503).send({ ok: false, reason: "database-not-available" }); }

    const id = parseInt((request.params as { id: string }).id, 10);
    const article = findCreativeFinishedArticleById(db, id);
    if (!article) { return reply.code(404).send({ ok: false, reason: "article-not-found" }); }

    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/regen-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hermesApiToken}` },
        body: JSON.stringify({ articleId: id }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "") || `Hermes HTTP ${res.status}`;
        return reply.code(res.status >= 500 ? 502 : res.status).send({ ok: false, reason: `Hermes HTTP ${res.status}`, hermesResponse: errorBody });
      }

      const data = await res.json() as { success: boolean; summary100?: string; prompt?: string; error?: string };
      if (!data.success || !data.summary100) {
        return reply.code(502).send({ ok: false, reason: data.error ?? "摘要生成失败", hermesResponse: JSON.stringify(data) });
      }

      const existing = article.summary100 ?? [];
      const updated = [data.summary100, ...existing];
      editCreativeFinishedArticle(db, id, { summary100: updated });

      return reply.send({ ok: true, summary100: updated, prompt: data.prompt });
    } catch (err) {
      const errMessage = (err as Error).message ?? String(err);
      if ((err as Error).name === "AbortError") { return reply.code(504).send({ ok: false, reason: "摘要生成超时（>15s），Hermes 未响应", detail: errMessage }); }
      return reply.code(502).send({ ok: false, reason: `Hermes 调用失败`, detail: errMessage });
    }
  });

  // ─── regen-inline-image：重新生成单张正文配图 ───
  app.post("/api/creative/finished-articles/:id/regen-inline-image", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
    if (session === undefined) { return; }
    if (!db) { return reply.code(503).send({ ok: false, reason: "database-not-available" }); }

    const id = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as Record<string, unknown> | undefined;
    const imageIndex = typeof body?.imageIndex === "number" ? body.imageIndex : undefined;
    if (!imageIndex) { return reply.code(400).send({ ok: false, reason: "imageIndex is required" }); }

    const article = findCreativeFinishedArticleById(db, id);
    if (!article) { return reply.code(404).send({ ok: false, reason: "article-not-found" }); }

    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180_000);
      const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/regen-inline-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hermesApiToken}` },
        body: JSON.stringify({ articleId: id, imageIndex }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "") || `Hermes HTTP ${res.status}`;
        return reply.code(res.status >= 500 ? 502 : res.status).send({ ok: false, reason: `Hermes HTTP ${res.status}`, hermesResponse: errorBody });
      }

      const data = await res.json() as { success: boolean; imageUrl?: string; imageIndex?: number; prompt?: string; sourceUrl?: string; provider?: string; model?: string; error?: string };
      if (!data.success) {
        return reply.code(502).send({ ok: false, reason: data.error ?? "配图生成失败", hermesResponse: JSON.stringify(data) });
      }

      // Hermes 已回写 contentMarkdown 和 images，重新读取最新数据返回
      const updated = findCreativeFinishedArticleById(db, id);
      return reply.send({
        ok: true,
        imageUrl: data.imageUrl,
        imageIndex: data.imageIndex,
        contentMarkdown: updated?.contentMarkdown ?? article.contentMarkdown,
        images: updated?.images ?? article.images,
        prompt: data.prompt,
        sourceUrl: data.sourceUrl ?? "",
        provider: data.provider ?? "",
        model: data.model ?? "",
      });
    } catch (err) {
      const errMessage = (err as Error).message ?? String(err);
      if ((err as Error).name === "AbortError") { return reply.code(504).send({ ok: false, reason: "配图生成超时（>180s），Hermes 未响应", detail: errMessage }); }
      return reply.code(502).send({ ok: false, reason: `Hermes 调用失败`, detail: errMessage });
    }
  });

  // ─── regen-article：整篇重新写作 ───
  app.post("/api/creative/finished-articles/:id/regen-article", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
    if (session === undefined) { return; }
    if (!db) { return reply.code(503).send({ ok: false, reason: "database-not-available" }); }

    const id = parseInt((request.params as { id: string }).id, 10);
    const article = findCreativeFinishedArticleById(db, id);
    if (!article) { return reply.code(404).send({ ok: false, reason: "article-not-found" }); }

    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 200_000);
      const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/regen-article`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hermesApiToken}` },
        body: JSON.stringify({ articleId: id }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "") || `Hermes HTTP ${res.status}`;
        return reply.code(res.status >= 500 ? 502 : res.status).send({ ok: false, reason: `Hermes HTTP ${res.status}`, hermesResponse: errorBody });
      }

      const data = await res.json() as { success: boolean; title?: string; prompts?: Record<string, unknown>; error?: string };
      if (!data.success) {
        return reply.code(502).send({ ok: false, reason: data.error ?? "整篇重写失败", hermesResponse: JSON.stringify(data) });
      }

      return reply.send({ ok: true, title: data.title, prompts: data.prompts });
    } catch (err) {
      const errMessage = (err as Error).message ?? String(err);
      if ((err as Error).name === "AbortError") { return reply.code(504).send({ ok: false, reason: "整篇重写超时（>200s），Hermes 未响应", detail: errMessage }); }
      return reply.code(502).send({ ok: false, reason: `Hermes 调用失败`, detail: errMessage });
    }
  });

  // ─── 素材库写文章：调用 Hermes write-article API，异步执行 ───
  app.post("/api/creative/source-items/:id/write-article", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
    if (session === undefined) { return; }
    if (!db) { return reply.code(503).send({ ok: false, reason: "database-not-available" }); }

    const id = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as { mode?: string } | undefined;
    const item = findCreativeSourceItemById(db, id);
    if (!item) { return reply.code(404).send({ ok: false, reason: "source-item-not-found" }); }

    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }

    const hermesBody: Record<string, unknown> = { sourceItemId: id };
    if (body?.mode && ["A", "B", "C"].includes(body.mode)) {
      hermesBody.mode = body.mode;
    }

    try {
      const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/write-article`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hermesApiToken}` },
        body: JSON.stringify(hermesBody),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "") || `Hermes HTTP ${res.status}`;
        return reply.code(res.status >= 500 ? 502 : res.status).send({ ok: false, reason: `Hermes HTTP ${res.status}`, hermesResponse: errorBody });
      }

      const data = await res.json() as { success: boolean; status?: string; message?: string; error?: string };
      if (!data.success) {
        return reply.code(502).send({ ok: false, reason: data.error ?? "写文章失败", hermesResponse: JSON.stringify(data) });
      }

      return reply.send({ ok: true, status: data.status ?? "writing" });
    } catch (err) {
      const errMessage = (err as Error).message ?? String(err);
      return reply.code(502).send({ ok: false, reason: `Hermes 调用失败`, detail: errMessage });
    }
  });



  // ─── Daily Digest: Hermes 推送日报（token 鉴权） ───

  app.post("/api/creative/daily-digests", async (request, reply) => {
    if (!validateCreativeApiToken(request, reply, creativeApiToken)) {
      return;
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const body = request.body as Record<string, unknown> | undefined;
    const date = typeof body?.date === "string" ? body.date.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const contentMarkdown = typeof body?.contentMarkdown === "string" ? body.contentMarkdown : "";
    const totalItems = typeof body?.totalItems === "number" ? body.totalItems : 0;
    const categories = Array.isArray(body?.categories) ? body.categories as string[] : [];
    const collectorAgent = typeof body?.collectorAgent === "string" ? body.collectorAgent.trim() : "";
    const coverImage = typeof body?.coverImage === "string" ? body.coverImage : undefined;

    if (!date || !title || !contentMarkdown || !collectorAgent) {
      return reply.code(400).send({ ok: false, reason: "missing-required-fields" });
    }

    // 同一天幂等：已存在则返回 409
    const existing = findDailyDigestByDate(db, date);
    if (existing) {
      return reply.code(409).send({ ok: false, reason: "already-exists", id: existing.id });
    }

    const record = insertDailyDigest(db, {
      date,
      title,
      contentMarkdown,
      coverImage,
      totalItems,
      categories,
      collectorAgent
    });

    return reply.code(201).send(record);
  });

  // ─── Daily Digest: 前端查询列表（session 鉴权） ───

  app.get("/api/creative/daily-digests", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
    if (session === undefined) { return; }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const query = request.query as Record<string, string | undefined>;
    const result = listDailyDigests(db, {
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo
    });

    return reply.send(result);
  });

  // ─── Daily Digest: 前端查询详情（session 鉴权） ───

  app.get("/api/creative/daily-digests/:id", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
    if (session === undefined) { return; }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const params = request.params as { id: string };
    const id = parseInt(params.id, 10);
    const record = findDailyDigestById(db, id);
    if (!record) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send(record);
  });

  // ─── Daily Digest: 更新状态（session 鉴权） ───

  app.patch("/api/creative/daily-digests/:id", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
    if (session === undefined) { return; }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const params = request.params as { id: string };
    const id = parseInt(params.id, 10);
    const body = request.body as Record<string, unknown> | undefined;

    // 更新状态
    if (typeof body?.status === "string") {
      const status = body.status;
      if (!["generated", "publishing", "published", "failed"].includes(status)) {
        return reply.code(400).send({ ok: false, reason: "invalid-status" });
      }
      const updated = updateDailyDigestStatus(db, id, status as "generated" | "publishing" | "published" | "failed");
      if (!updated) {
        return reply.code(404).send({ ok: false, reason: "not-found" });
      }
      return reply.send(updated);
    }

    // 编辑内容
    const contentMarkdown = typeof body?.contentMarkdown === "string" ? body.contentMarkdown : undefined;
    const title = typeof body?.title === "string" ? body.title : undefined;

    if (contentMarkdown === undefined && title === undefined) {
      return reply.code(400).send({ ok: false, reason: "no-fields-to-update" });
    }

    const updated = editDailyDigest(db, id, { contentMarkdown, title });
    if (!updated) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send(updated);
  });

  // ─── Daily Digest: 手动触发生成（代理调用 Hermes） ───

  app.post("/api/creative/daily-digests/generate", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
    if (session === undefined) { return; }

    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) {
      return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" });
    }

    const body = request.body as { date?: unknown } | undefined;
    const requestBody: Record<string, string> = {};
    if (typeof body?.date === "string" && body.date) {
      requestBody.date = body.date;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300_000);

      const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/generate-digest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${hermesApiToken}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ error: `Hermes HTTP ${res.status}` }));
        return reply.code(res.status >= 500 ? 502 : res.status).send({
          ok: false,
          reason: errorBody.error ?? `Hermes HTTP ${res.status}`,
        });
      }

      const data = await res.json() as { success?: boolean; detail?: string; error?: string };
      return reply.send({ ok: true, detail: data.detail ?? "生成请求已发送" });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return reply.code(504).send({ ok: false, reason: "生成超时（>300s），请稍后刷新查看" });
      }
      return reply.code(502).send({ ok: false, reason: `Hermes 调用失败: ${(err as Error).message}` });
    }
  });

  // ─── Daily Digest: 推送公众号草稿（SSE 流式推送） ───

  app.post("/api/creative/daily-digests/:id/push-draft", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }
    if (!deps.pushDailyDigestToWechatDraft) {
      return reply.code(503).send({ ok: false, reason: "wechat-push-not-configured" });
    }

    const params = request.params as { id: string };
    const body = request.body as { themeId?: string; wechatHtml?: string } | undefined;
    const id = parseInt(params.id, 10);
    const themeId = body?.themeId ?? "bauhaus";
    const wechatHtml = body?.wechatHtml ?? "";

    if (!wechatHtml) {
      return reply.code(400).send({ ok: false, reason: "missing-wechat-html" });
    }

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    res.socket?.setNoDelay(true);

    const sendEvent = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const onProgress = async (step: string, status: "running" | "done" | "error", detail?: string) => {
      const event: Record<string, unknown> = { step, status };
      if (detail) event.detail = detail;
      sendEvent(event);
      if (status === "done" || status === "running") {
        await new Promise(r => setTimeout(r, 100));
      }
    };

    try {
      const result = await deps.pushDailyDigestToWechatDraft(id, themeId, wechatHtml, onProgress);
      if (result.ok) {
        sendEvent({ step: "complete", status: "done", mediaId: result.mediaId });
      } else {
        sendEvent({ step: "complete", status: "error", errorCode: result.errorCode, errorMessage: result.errorMessage });
      }
    } catch (err) {
      sendEvent({ step: "complete", status: "error", errorMessage: (err as Error).message });
    } finally {
      res.end();
    }
  });

  // ─── Creative: Actions (session-authenticated) ───

  app.post("/actions/creative/source-items/:id/writing-status", async (request, reply) => {
    const hasToken = creativeApiToken && request.headers["x-creative-token"] === creativeApiToken;
    if (!hasToken) {
      if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
        return;
      }
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const params = request.params as { id: string };
    const body = request.body as { writingStatus?: unknown } | undefined;
    const id = parseInt(params.id, 10);
    const status = typeof body?.writingStatus === "string" ? body.writingStatus : "";
    if (!["ready", "writing", "done", "skipped", "excluded"].includes(status)) {
      return reply.code(400).send({ ok: false, reason: "invalid-status" });
    }
    const updated = updateCreativeSourceItemWritingStatus(db, id, status as "ready" | "writing" | "done" | "skipped" | "excluded");
    if (!updated) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }
    return reply.send({ ok: true });
  });

  app.post("/actions/creative/source-items/:id/update", async (request, reply) => {
    const hasToken = creativeApiToken && request.headers["x-creative-token"] === creativeApiToken;
    if (!hasToken) {
      if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
        return;
      }
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const params = request.params as { id: string };
    const body = request.body as Record<string, unknown> | undefined;
    const id = parseInt(params.id, 10);

    const score = typeof body?.score === "number" ? body.score : undefined;
    const fullContent = typeof body?.fullContent === "string" ? body.fullContent : undefined;

    if (score === undefined && fullContent === undefined) {
      return reply.code(400).send({ ok: false, reason: "no-fields-to-update" });
    }

    if (score !== undefined && (score < 0 || score > 100)) {
      return reply.code(400).send({ ok: false, reason: "score-out-of-range" });
    }

    const updated = updateCreativeSourceItemFields(db, id, { score, fullContent });
    if (!updated) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }
    return reply.send({ ok: true });
  });

  app.post("/actions/creative/source-items/:id/trend-score", async (request, reply) => {
    if (!validateCreativeApiToken(request, reply, creativeApiToken)) {
      return;
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const params = request.params as { id: string };
    const body = request.body as Record<string, unknown> | undefined;
    const id = parseInt(params.id, 10);
    const trendScore = typeof body?.trendScore === "number" ? body.trendScore : undefined;
    const trendBreakdown = typeof body?.trendBreakdown === "object" && body?.trendBreakdown !== null ? body.trendBreakdown as Record<string, number> : undefined;

    if (trendScore == null || !trendBreakdown) {
      return reply.code(400).send({ ok: false, reason: "missing-trend-score-or-breakdown" });
    }

    const updated = updateCreativeSourceItemTrendScore(db, id, trendScore, trendBreakdown as any);
    if (!updated) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }
    return reply.send({ ok: true });
  });

  app.put("/actions/creative/finished-articles/:id", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const params = request.params as { id: string };
    const body = request.body as Record<string, unknown> | undefined;
    const id = parseInt(params.id, 10);
    const result = editCreativeFinishedArticle(db, id, {
      contentMarkdown: typeof body?.contentMarkdown === "string" ? body.contentMarkdown : undefined,
      thesis: typeof body?.thesis === "string" ? body.thesis : undefined,
      titles: Array.isArray(body?.titles) ? body.titles as string[] : undefined,
      hooks: Array.isArray(body?.hooks) ? body.hooks as string[] : undefined,
      quotes: Array.isArray(body?.quotes) ? body.quotes as string[] : undefined,
      summary100: Array.isArray(body?.summary100) ? body.summary100 as string[] : (typeof body?.summary100 === "string" ? [body.summary100] : undefined),
      images: Array.isArray(body?.images) ? body.images as any[] : undefined,
      wechatThemeId: typeof body?.wechatThemeId === "string" ? body.wechatThemeId : (body?.wechatThemeId === null ? null : undefined),
      wechatHtml: typeof body?.wechatHtml === "string" ? body.wechatHtml : (body?.wechatHtml === null ? null : undefined),
      coverImageIndex: typeof body?.coverImageIndex === "number" ? body.coverImageIndex : undefined,
      titleIndex: typeof body?.titleIndex === "number" ? body.titleIndex : undefined,
      intros: Array.isArray(body?.intros) ? body.intros as string[] : undefined,
      introIndex: typeof body?.introIndex === "number" ? body.introIndex : undefined,
    });
    if (!result.ok && result.reason === "article not found") {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }
    if (!result.ok) {
      return reply.code(400).send({ ok: false, reason: result.reason });
    }
    return reply.send({ ok: true });
  });

  // ─── 微信公众号：推送到草稿箱（session 鉴权） ───

  app.post("/api/creative/finished-articles/:id/push-draft", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }
    if (!deps.pushArticleToWechatDraft) {
      return reply.code(503).send({ ok: false, reason: "wechat-push-not-configured" });
    }

    const params = request.params as { id: string };
    const body = request.body as { themeId?: string; wechatHtml?: string } | undefined;
    const id = parseInt(params.id, 10);
    const themeId = body?.themeId ?? "bauhaus";
    const wechatHtml = body?.wechatHtml;

    // 接管响应，用 SSE 流式推送进度
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    // 禁用 TCP Nagle 算法，确保每次 write 立即发送
    res.socket?.setNoDelay(true);

    const sendEvent = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const onProgress = async (step: string, status: "running" | "done" | "error", detail?: string) => {
      const event: Record<string, unknown> = { step, status };
      if (detail) event.detail = detail;
      sendEvent(event);
      // 每个状态变化后短暂停顿，让前端用户能看到步骤过渡
      if (status === "done" || status === "running") {
        await new Promise(r => setTimeout(r, 100));
      }
    };

    try {
      const result = await deps.pushArticleToWechatDraft(id, themeId, wechatHtml, onProgress);
      if (result.ok) {
        sendEvent({ step: "complete", status: "done", mediaId: result.mediaId, pushCount: result.pushCount });
      } else {
        sendEvent({ step: "complete", status: "error", errorCode: result.errorCode, errorMessage: result.errorMessage });
      }
    } catch (err) {
      sendEvent({ step: "complete", status: "error", errorMessage: (err as Error).message });
    } finally {
      res.end();
    }
  });

  // 获取文章推送记录
  app.get("/api/creative/finished-articles/:id/push-log", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
    if (session === undefined) return;

    if (!deps.getArticleWechatPushLog) {
      return reply.code(503).send({ ok: false, reason: "wechat-push-not-configured" });
    }

    const params = request.params as { id: string };
    const id = parseInt(params.id, 10);
    const log = deps.getArticleWechatPushLog(id);
    return reply.send({ ok: true, log });
  });

  // ─── 微信公众号配置管理（session 鉴权） ───

  app.get("/api/settings/wechat-mp", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");
    if (session === undefined) return;

    if (!deps.listWechatMpAccounts) {
      return reply.code(503).send({ ok: false, reason: "wechat-mp-not-configured" });
    }
    const accounts = deps.listWechatMpAccounts();
    return reply.send({ ok: true, accounts });
  });

  app.post("/actions/wechat-mp/save", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }
    if (!deps.saveWechatMpAccount) {
      return reply.code(503).send({ ok: false, reason: "wechat-mp-not-configured" });
    }

    const body = request.body as {
      id?: number;
      name: string;
      appId: string;
      appSecret?: string;
      notes?: string;
      isDefault?: boolean;
      isEnabled?: boolean;
    };

    if (!body.name || !body.appId) {
      return reply.code(400).send({ ok: false, reason: "name-and-appid-required" });
    }

    try {
      const result = await deps.saveWechatMpAccount(body);
      return reply.send(result);
    } catch (err) {
      request.log.error(err, "Save wechat mp account failed");
      return reply.code(500).send({ ok: false, reason: "save-failed" });
    }
  });

  app.post("/actions/wechat-mp/delete", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }
    if (!deps.deleteWechatMpAccount) {
      return reply.code(503).send({ ok: false, reason: "wechat-mp-not-configured" });
    }

    const body = request.body as { id: number };
    if (!body.id) {
      return reply.code(400).send({ ok: false, reason: "id-required" });
    }

    const deleted = deps.deleteWechatMpAccount(body.id);
    return reply.send({ ok: deleted });
  });

  app.post("/actions/wechat-mp/set-default", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }
    if (!deps.setDefaultWechatMpAccount) {
      return reply.code(503).send({ ok: false, reason: "wechat-mp-not-configured" });
    }

    const body = request.body as { id: number };
    if (!body.id) {
      return reply.code(400).send({ ok: false, reason: "id-required" });
    }

    const result = deps.setDefaultWechatMpAccount(body.id);
    return reply.send({ ok: result });
  });

  // ─── Creative: 图片转存接口（token 鉴权） ───

  app.post("/api/creative/images/upload-by-url", async (request, reply) => {
    if (!validateCreativeApiToken(request, reply, creativeApiToken)) {
      return;
    }

    if (!creativeImageDir) {
      return reply.code(503).send({ ok: false, reason: "image-dir-not-configured" });
    }

    const body = request.body as { images?: unknown[] } | undefined;
    const images = Array.isArray(body?.images) ? body.images : [];

    if (images.length === 0) {
      return reply.code(400).send({ ok: false, reason: "missing-images" });
    }

    if (images.length > 9) {
      return reply.code(400).send({ ok: false, reason: "too-many-images" });
    }

    const publicBaseUrl = (deps.config?.publicBaseUrl ?? "").replace(/\/+$/, "");
    const results: Array<{
      originalUrl: string;
      storedUrl: string;
      purpose: string;
      alt: string;
      sourceUrl: string;
      model: string;
    }> = [];
    const failed: Array<{ url: string; reason: string }> = [];

    for (const img of images) {
      // 兼容 string 和 object 两种格式
      const url = typeof img === "string" ? img : (img as Record<string, unknown>)?.url;
      const purpose = typeof img === "object" && img !== null
        ? String((img as Record<string, unknown>).purpose ?? "cover")
        : "cover";
      const alt = typeof img === "object" && img !== null
        ? String((img as Record<string, unknown>).alt ?? "")
        : "";
      // 透传 Hermes 传入的原始临时地址和生图模型，方便排查
      const sourceUrl = typeof img === "object" && img !== null
        ? String((img as Record<string, unknown>).sourceUrl ?? url ?? "")
        : String(url ?? "");
      const model = typeof img === "object" && img !== null
        ? String((img as Record<string, unknown>).model ?? "")
        : "";

      if (typeof url !== "string" || !url.trim()) {
        failed.push({ url: String(url), reason: "invalid-url" });
        continue;
      }

      try {
        const stored = await downloadAndStoreImage(creativeImageDir, url.trim());
        results.push({
          originalUrl: url.trim(),
          storedUrl: publicBaseUrl ? `${publicBaseUrl}${stored.urlPath}` : stored.urlPath,
          purpose,
          alt,
          sourceUrl: sourceUrl.trim(),
          model: model.trim()
        });
      } catch (err) {
        request.log.warn({ err, url }, "Image download/store failed");
        failed.push({ url: url.trim(), reason: "download_failed" });
      }
    }

    if (results.length === 0) {
      return reply.code(500).send({ error: "all_uploads_failed", details: failed });
    }

    const response: Record<string, unknown> = { images: results };
    if (failed.length > 0) {
      response.failed = failed;
    }
    return reply.send(response);
  });

  // ─── Creative: 图片文件上传（Hermes 下载后直传，避免 hot-now 出境下载） ───
  app.post("/api/creative/images/upload-image", { bodyLimit: 15 * 1024 * 1024 }, async (request, reply) => {
    if (!validateCreativeApiToken(request, reply, creativeApiToken)) {
      return;
    }

    if (!creativeImageDir) {
      return reply.code(503).send({ ok: false, reason: "image-dir-not-configured" });
    }

    const body = request.body as {
      images?: Array<{
        data: string;       // base64 编码的图片数据
        filename?: string;  // 原始文件名，用于推断扩展名
        contentType?: string;
        purpose?: string;
        alt?: string;
        sourceUrl?: string;
        provider?: string;
        model?: string;
      }>;
    } | undefined;

    const images = Array.isArray(body?.images) ? body.images : [];
    if (images.length === 0) {
      return reply.code(400).send({ ok: false, reason: "missing-images" });
    }
    if (images.length > 9) {
      return reply.code(400).send({ ok: false, reason: "too-many-images" });
    }

    const publicBaseUrl = (deps.config?.publicBaseUrl ?? "").replace(/\/+$/, "");
    const results: Array<{
      storedUrl: string;
      purpose: string;
      alt: string;
      sourceUrl: string;
      provider: string;
      model: string;
    }> = [];
    const failed: Array<{ index: number; reason: string }> = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (!img.data) {
        failed.push({ index: i, reason: "missing-data" });
        continue;
      }

      try {
        const buffer = Buffer.from(img.data, "base64");
        const ext = resolveExtFromFilename(img.filename) ?? resolveExtFromContentType(img.contentType);
        const stored = await storeImageBuffer(creativeImageDir, buffer, ext);
        results.push({
          storedUrl: publicBaseUrl ? `${publicBaseUrl}${stored.urlPath}` : stored.urlPath,
          purpose: img.purpose ?? "cover",
          alt: img.alt ?? "",
          sourceUrl: img.sourceUrl ?? "",
          provider: img.provider ?? "",
          model: img.model ?? ""
        });
      } catch (err) {
        request.log.warn({ err, index: i }, "Image upload/store failed");
        failed.push({ index: i, reason: (err as Error).message ?? "store_failed" });
      }
    }

    if (results.length === 0) {
      return reply.code(500).send({ error: "all_uploads_failed", details: failed });
    }

    const response: Record<string, unknown> = { images: results };
    if (failed.length > 0) {
      response.failed = failed;
    }
    return reply.send(response);
  });

  // ─── Creative: 图片文件服务（公开访问，无需鉴权） ───

  app.get("/api/creative/images/:date/:file", async (request, reply) => {
    if (!creativeImageDir) {
      return reply.code(404).type("text/plain").send("Not Found");
    }

    const params = request.params as { date: string; file: string };
    const dateDir = params.date;
    const fileName = params.file;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDir)) {
      return reply.code(400).type("text/plain").send("Invalid date");
    }

    const result = await readStoredImage(creativeImageDir, dateDir, fileName);
    if (!result) {
      return reply.code(404).type("text/plain").send("Not Found");
    }

    return reply
      .type(result.contentType)
      .header("cache-control", "public, max-age=31536000, immutable")
      .send(result.buffer);
  });

  if (authEnabled) {
    app.get("/login", async (request, reply) => {
      const existingSession = readAuthenticatedSession(request.headers.cookie, authConfig?.sessionSecret ?? "");

      if (existingSession) {
        return reply.redirect("/");
      }

      return reply.type("text/html").send(renderLoginPage());
    });

    app.post("/login", async (request, reply) => {
      if (!authConfig?.verifyLogin) {
        return reply.code(503).send({ ok: false, reason: "login-disabled" });
      }

      const body = request.body as { username?: unknown; password?: unknown } | undefined;
      const username = typeof body?.username === "string" ? body.username.trim() : "";
      const password = typeof body?.password === "string" ? body.password : "";

      if (!username || !password) {
        return reply.code(400).send({ ok: false, reason: "invalid-credentials-format" });
      }

      const user = await authConfig.verifyLogin(username, password);

      if (!user) {
        return reply.code(401).send({ ok: false, reason: "invalid-credentials" });
      }

      const sessionToken = createSessionToken(
        {
          username: user.username,
          displayName: user.displayName?.trim() || user.username,
          role: user.role?.trim() || "admin"
        },
        authConfig.sessionSecret,
        { maxAgeSeconds: authConfig.sessionTtlSeconds }
      );

      reply.header(
        "set-cookie",
        serializeSessionCookie(sessionToken, {
          maxAgeSeconds: authConfig.sessionTtlSeconds,
          secure: authConfig.secureCookie
        })
      );

      return reply.redirect("/");
    });

    app.post("/logout", async (request, reply) => {
      reply.header(
        "set-cookie",
        serializeClearedSessionCookie({
          secure: authConfig?.secureCookie
        })
      );

      if (request.headers.accept?.includes("application/json")) {
        return reply.send({ ok: true });
      }

      return reply.redirect("/login");
    });

    for (const page of getAppShellPages()) {
      app.get(page.path, async (request, reply) => {
        const currentPage = findAppShellPage(page.path);

        if (!currentPage) {
          return reply.code(404).type("text/html").send(renderNoticePage("HotNow", "页面不存在"));
        }

        const session = readAuthenticatedSession(request.headers.cookie, authConfig?.sessionSecret ?? "");

        // Content pages stay readable without a session, but system pages still require an authenticated user.
        if (!session && (currentPage.section === "system" || currentPage.section === "creative")) {
          return reply.redirect("/login");
        }

        if (isClientSettingsPath(currentPage.path)) {
          return await serveClientSettingsShell(reply, clientIndexPath, {
            clientDevOrigin,
            readClientDevEntryHtml: deps.readClientDevEntryHtml
          });
        }

        if (currentPage.section === "content" || currentPage.section === "creative") {
          return await serveClientContentShell(reply, clientIndexPath, {
            clientDevOrigin,
            readClientDevEntryHtml: deps.readClientDevEntryHtml
          });
        }

        const contentHtml = await renderSystemPageForPath(deps, currentPage.path, Boolean(session));

        return reply.type("text/html").send(
          renderAppLayout({
            currentPath: currentPage.path,
            page: currentPage,
            user: session
              ? {
                  username: session.username,
                  displayName: session.displayName,
                  role: session.role
                }
              : undefined,
            showSystemMenu: Boolean(session),
            loginHref: session ? undefined : "/login",
            contentHtml
          })
        );
      });
    }
  } else if (hasUnifiedShellDeps) {
    for (const page of getAppShellPages()) {
      app.get(page.path, async (request, reply) => {
        const currentPage = findAppShellPage(page.path);

        if (!currentPage) {
          return reply.code(404).type("text/html").send(renderNoticePage("HotNow", "页面不存在"));
        }

        if (isClientSettingsPath(currentPage.path)) {
          return await serveClientSettingsShell(reply, clientIndexPath, {
            clientDevOrigin,
            readClientDevEntryHtml: deps.readClientDevEntryHtml
          });
        }

        if (currentPage.section === "content" || currentPage.section === "creative") {
          return await serveClientContentShell(reply, clientIndexPath, {
            clientDevOrigin,
            readClientDevEntryHtml: deps.readClientDevEntryHtml
          });
        }

        const contentHtml = await renderSystemPageForPath(deps, currentPage.path, false);

        return reply.type("text/html").send(
          renderAppLayout({
            currentPath: currentPage.path,
            page: currentPage,
            contentHtml
          })
        );
      });
    }
  } else {
    app.get("/", async (_request, reply) => {
      const latestDate = await deps.latestReportDate?.();

      if (!latestDate) {
        return reply.type("text/html").send(renderNoticePage("HotNow 最新报告", "今日尚未生成报告"));
      }

      if (!deps.readReportHtml) {
        return reply.code(503).type("text/html").send(renderNoticePage("HotNow 最新报告", "报告内容暂不可用"));
      }

      const html = await deps.readReportHtml(latestDate);
      return reply.type("text/html").send(html);
    });
  }

  app.get("/history", async (_request, reply) => {
    if (authEnabled) {
      // Legacy pages stay mounted for compatibility, but unified auth mode requires a valid session first.
      const session = readAuthenticatedSession(_request.headers.cookie, authConfig?.sessionSecret ?? "");

      if (!session) {
        return reply.redirect("/login");
      }
    }

    const summaries = (await deps.listReportSummaries?.()) ?? [];
    return reply.type("text/html").send(renderHistoryPage(summaries));
  });

  app.get("/reports/:date", async (request, reply) => {
    if (authEnabled) {
      const session = readAuthenticatedSession(request.headers.cookie, authConfig?.sessionSecret ?? "");

      if (!session) {
        return reply.redirect("/login");
      }
    }

    if (!deps.readReportHtml) {
      return reply.code(503).type("text/html").send(renderNoticePage("HotNow 报告", "报告内容暂不可用"));
    }

    const { date } = request.params as { date: string };
    const html = await deps.readReportHtml(date);
    return reply.type("text/html").send(html);
  });

  app.get("/control", async (_request, reply) => {
    if (authEnabled) {
      const session = readAuthenticatedSession(_request.headers.cookie, authConfig?.sessionSecret ?? "");

      if (!session) {
        return reply.redirect("/login");
      }
    }

    return reply.type("text/html").send(renderControlPage(deps.config, deps.isRunning?.() ?? false));
  });

  app.post("/actions/run", async (request, reply) => {
    return await handleManualCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualCollect ?? deps.triggerManualRun
    );
  });

  app.post("/actions/collect", async (request, reply) => {
    return await handleManualCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualCollect ?? deps.triggerManualRun
    );
  });

  app.post("/actions/send-latest-email", async (request, reply) => {
    return await handleManualSendLatestEmailAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualSendLatestEmail
    );
  });

  app.post("/actions/twitter-accounts/collect", async (request, reply) => {
    return await handleManualTwitterCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualTwitterCollect
    );
  });

  app.post("/actions/twitter-keywords/collect", async (request, reply) => {
    return await handleManualTwitterKeywordCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualTwitterKeywordCollect
    );
  });

  app.post("/actions/hackernews/collect", async (request, reply) => {
    return await handleManualHackerNewsCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualHackerNewsCollect
    );
  });

  app.post("/actions/bilibili/collect", async (request, reply) => {
    return await handleManualBilibiliCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualBilibiliCollect
    );
  });

  app.post("/actions/wechat-rss/collect", async (request, reply) => {
    return await handleManualWechatRssCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualWechatRssCollect
    );
  });

  app.post("/actions/weibo/collect", async (request, reply) => {
    return await handleManualWeiboTrendingCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualWeiboTrendingCollect
    );
  });

  app.post("/actions/ai-timeline/collect", async (request, reply) => {
    if (!ensureManualActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    return reply.code(410).send({
      accepted: false,
      reason: "ai-timeline-feed-automation-only"
    });
  });

  app.post("/actions/ai-timeline/events/:id/update", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    return reply.code(410).send({ ok: false, reason: "ai-timeline-feed-is-read-only" });
  });

  app.post("/actions/content/:id/feedback-pool", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.saveContentFeedback) {
      return reply.code(503).send({ ok: false, reason: "content-feedback-disabled" });
    }

    const contentItemId = parseContentItemId(request.params);

    if (!contentItemId) {
      return reply.code(400).send({ ok: false, reason: "invalid-content-id" });
    }

    const body = request.body as Record<string, unknown> | undefined;
    const positiveKeywords = parseStringArray(body?.positiveKeywords);
    const negativeKeywords = parseStringArray(body?.negativeKeywords);

    if (!positiveKeywords.ok || !negativeKeywords.ok) {
      return reply.code(400).send({ ok: false, reason: "invalid-feedback-payload" });
    }

    const input = {
      freeText: typeof body?.freeText === "string" ? body.freeText : null,
      suggestedEffect: isSuggestedEffect(body?.suggestedEffect) ? body.suggestedEffect : null,
      strengthLevel: isStrengthLevel(body?.strengthLevel) ? body.strengthLevel : null,
      positiveKeywords: positiveKeywords.values,
      negativeKeywords: negativeKeywords.values
    } satisfies Omit<SaveFeedbackPoolEntryInput, "contentItemId">;

    const result = await deps.saveContentFeedback(contentItemId, input);

    if (!result.ok) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send({ ok: true, contentItemId, entryId: result.entryId });
  });

  app.post("/actions/content/:id/ratings", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.saveRatings) {
      return reply.code(503).send({ ok: false, reason: "content-actions-disabled" });
    }

    const contentItemId = parseContentItemId(request.params);

    if (!contentItemId) {
      return reply.code(400).send({ ok: false, reason: "invalid-content-id" });
    }

    const body = request.body as { scores?: unknown } | undefined;
    const parsedScores = parseRatingScores(body?.scores);

    if (!parsedScores.ok) {
      return reply.code(400).send({ ok: false, reason: "invalid-ratings-payload" });
    }

    const result = await deps.saveRatings(contentItemId, parsedScores.scores);

    if (!result.ok && result.reason === "not-found") {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    if (!result.ok && result.reason === "unknown-dimensions") {
      return reply.code(400).send({ ok: false, reason: "unknown-dimensions", unknownKeys: result.unknownKeys });
    }

    return reply.send({
      ok: true,
      contentItemId,
      saved: result.saved,
      averageRating: result.averageRating
    });
  });

  app.post("/actions/view-rules/provider-settings", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.saveProviderSettings) {
      return reply.code(503).send({ ok: false, reason: "provider-settings-disabled" });
    }

    const body = request.body as Record<string, unknown> | undefined;
    const providerKind = typeof body?.providerKind === "string" ? body.providerKind.trim() : "";
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";

    if (!isProviderKind(providerKind) || !apiKey) {
      return reply.code(400).send({ ok: false, reason: "invalid-provider-settings" });
    }

    const result = await deps.saveProviderSettings({
      providerKind,
      apiKey
    });

    if (!result.ok && result.reason === "master-key-required") {
      return reply.code(409).send({ ok: false, reason: "master-key-required" });
    }

    return reply.send({ ok: true, providerKind });
  });

  app.post("/actions/view-rules/provider-settings/activation", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.updateProviderSettingsActivation) {
      return reply.code(503).send({ ok: false, reason: "provider-settings-disabled" });
    }

    const body = request.body as Record<string, unknown> | undefined;
    const providerKind = typeof body?.providerKind === "string" ? body.providerKind.trim() : "";
    const enable = typeof body?.enable === "boolean" ? body.enable : null;

    if (!isProviderKind(providerKind) || enable === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-provider-activation" });
    }

    const result = await deps.updateProviderSettingsActivation({
      providerKind,
      enable
    });

    if (!result.ok && result.reason === "not-found") {
      return reply.code(409).send({ ok: false, reason: "provider-settings-not-found" });
    }

    return reply.send({ ok: true, providerKind, isEnabled: enable });
  });

  app.post("/actions/view-rules/provider-settings/delete", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.deleteProviderSettings) {
      return reply.code(503).send({ ok: false, reason: "provider-settings-disabled" });
    }

    const body = request.body as Record<string, unknown> | undefined;
    const providerKind = typeof body?.providerKind === "string" ? body.providerKind.trim() : "";

    if (!isProviderKind(providerKind)) {
      return reply.code(400).send({ ok: false, reason: "invalid-provider-settings" });
    }

    await deps.deleteProviderSettings(providerKind);
    return reply.send({ ok: true });
  });

  app.post("/actions/feedback-pool/:id/delete", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.deleteFeedbackEntry) {
      return reply.code(503).send({ ok: false, reason: "feedback-pool-disabled" });
    }

    const feedbackId = parseNumericRouteId(request.params, "id");

    if (!feedbackId) {
      return reply.code(400).send({ ok: false, reason: "invalid-feedback-id" });
    }

    const deleted = await deps.deleteFeedbackEntry(feedbackId);

    if (!deleted) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send({ ok: true, feedbackId });
  });

  app.post("/actions/feedback-pool/clear", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.clearAllFeedback) {
      return reply.code(503).send({ ok: false, reason: "feedback-pool-disabled" });
    }

    const cleared = await deps.clearAllFeedback();
    return reply.send({ ok: true, cleared });
  });

  app.post("/actions/sources/toggle", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.toggleSource) {
      return reply.code(503).send({ ok: false, reason: "sources-disabled" });
    }

    const body = request.body as { kind?: unknown; enable?: unknown } | undefined;
    const kind = typeof body?.kind === "string" ? body.kind.trim() : "";
    const enable = typeof body?.enable === "boolean" ? body.enable : null;

    if (!kind) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-kind" });
    }

    if (enable === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-enable" });
    }

    const result = await deps.toggleSource(kind, enable);

    if (!result.ok && result.reason === "not-found") {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send({ ok: true, kind, enable });
  });

  app.post("/actions/sources/create", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.createSource) {
      return reply.code(503).send({ ok: false, reason: "sources-disabled" });
    }

    const payload = parseSourceSavePayload(request.body, "create");

    if (!payload) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-payload" });
    }

    const result = await deps.createSource(payload);
    return sendSourceSaveResult(reply, result);
  });

  app.post("/actions/sources/update", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.updateSource) {
      return reply.code(503).send({ ok: false, reason: "sources-disabled" });
    }

    const payload = parseSourceSavePayload(request.body, "update");

    if (!payload) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-payload" });
    }

    const result = await deps.updateSource(payload);
    return sendSourceSaveResult(reply, result);
  });

  app.post("/actions/sources/delete", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.deleteSource) {
      return reply.code(503).send({ ok: false, reason: "sources-disabled" });
    }

    const body = request.body as { kind?: unknown } | undefined;
    const kind = typeof body?.kind === "string" ? body.kind.trim() : "";

    if (!kind) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-payload" });
    }

    const result = await deps.deleteSource(kind);

    if (!result.ok) {
      if (result.reason === "not-found") {
        return reply.code(404).send({ ok: false, reason: "not-found" });
      }

      return reply.code(409).send({ ok: false, reason: result.reason });
    }

    return reply.send({ ok: true, kind: result.kind });
  });

  app.post("/actions/sources/display-mode", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.updateSourceDisplayMode) {
      return reply.code(503).send({ ok: false, reason: "sources-disabled" });
    }

    const body = request.body as { kind?: unknown; showAllWhenSelected?: unknown } | undefined;
    const kind = typeof body?.kind === "string" ? body.kind.trim() : "";
    const showAllWhenSelected = typeof body?.showAllWhenSelected === "boolean" ? body.showAllWhenSelected : null;

    if (!kind) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-kind" });
    }

    if (showAllWhenSelected === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-display-mode" });
    }

    const result = await deps.updateSourceDisplayMode(kind, showAllWhenSelected);

    if (!result.ok && result.reason === "not-found") {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send({ ok: true, kind, showAllWhenSelected });
  });

  app.post("/actions/twitter-accounts/create", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.createTwitterAccount) {
      return reply.code(503).send({ ok: false, reason: "twitter-accounts-disabled" });
    }

    const payload = parseTwitterAccountSavePayload(request.body, "create");

    if (!payload) {
      return reply.code(400).send({ ok: false, reason: "invalid-twitter-account-payload" });
    }

    return sendTwitterAccountSaveResult(reply, await deps.createTwitterAccount(payload));
  });

  app.post("/actions/twitter-accounts/update", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.updateTwitterAccount) {
      return reply.code(503).send({ ok: false, reason: "twitter-accounts-disabled" });
    }

    const payload = parseTwitterAccountSavePayload(request.body, "update");

    if (!payload) {
      return reply.code(400).send({ ok: false, reason: "invalid-twitter-account-payload" });
    }

    return sendTwitterAccountSaveResult(reply, await deps.updateTwitterAccount(payload));
  });

  app.post("/actions/twitter-accounts/delete", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.deleteTwitterAccount) {
      return reply.code(503).send({ ok: false, reason: "twitter-accounts-disabled" });
    }

    const id = parsePositiveInteger((request.body as { id?: unknown } | undefined)?.id);

    if (id === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-twitter-account-id" });
    }

    const result = await deps.deleteTwitterAccount(id);

    if (!result.ok) {
      return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });
    }

    return reply.send({ ok: true, id: result.id });
  });

  app.post("/actions/twitter-accounts/toggle", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.toggleTwitterAccount) {
      return reply.code(503).send({ ok: false, reason: "twitter-accounts-disabled" });
    }

    const body = request.body as { id?: unknown; enable?: unknown } | undefined;
    const id = parsePositiveInteger(body?.id);
    const enable = typeof body?.enable === "boolean" ? body.enable : null;

    if (id === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-twitter-account-id" });
    }

    if (enable === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-twitter-account-enable" });
    }

    const result = await deps.toggleTwitterAccount(id, enable);

    if (!result.ok) {
      return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });
    }

    return reply.send({ ok: true, id: result.account.id, enable: result.account.isEnabled });
  });

  app.post("/actions/twitter-keywords/create", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.createTwitterSearchKeyword) {
      return reply.code(503).send({ ok: false, reason: "twitter-keywords-disabled" });
    }

    const payload = parseTwitterKeywordSavePayload(request.body, "create");

    if (!payload) {
      return reply.code(400).send({ ok: false, reason: "invalid-twitter-keyword-payload" });
    }

    return sendTwitterKeywordSaveResult(reply, await deps.createTwitterSearchKeyword(payload));
  });

  app.post("/actions/twitter-keywords/update", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.updateTwitterSearchKeyword) {
      return reply.code(503).send({ ok: false, reason: "twitter-keywords-disabled" });
    }

    const payload = parseTwitterKeywordSavePayload(request.body, "update");

    if (!payload) {
      return reply.code(400).send({ ok: false, reason: "invalid-twitter-keyword-payload" });
    }

    return sendTwitterKeywordSaveResult(reply, await deps.updateTwitterSearchKeyword(payload));
  });

  app.post("/actions/twitter-keywords/delete", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.deleteTwitterSearchKeyword) {
      return reply.code(503).send({ ok: false, reason: "twitter-keywords-disabled" });
    }

    const id = parsePositiveInteger((request.body as { id?: unknown } | undefined)?.id);

    if (id === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-twitter-keyword-id" });
    }

    const result = await deps.deleteTwitterSearchKeyword(id);

    if (!result.ok) {
      return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });
    }

    return reply.send({ ok: true, id: result.id });
  });

  app.post("/actions/twitter-keywords/toggle-collect", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.toggleTwitterSearchKeywordCollect) {
      return reply.code(503).send({ ok: false, reason: "twitter-keywords-disabled" });
    }

    const body = request.body as { id?: unknown; enable?: unknown } | undefined;
    const id = parsePositiveInteger(body?.id);
    const enable = typeof body?.enable === "boolean" ? body.enable : null;

    if (id === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-twitter-keyword-id" });
    }

    if (enable === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-twitter-keyword-collect-enable" });
    }

    const result = await deps.toggleTwitterSearchKeywordCollect(id, enable);

    if (!result.ok) {
      return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });
    }

    return reply.send({ ok: true, id: result.keyword.id, enable: result.keyword.isCollectEnabled });
  });

  app.post("/actions/twitter-keywords/toggle-visible", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.toggleTwitterSearchKeywordVisible) {
      return reply.code(503).send({ ok: false, reason: "twitter-keywords-disabled" });
    }

    const body = request.body as { id?: unknown; enable?: unknown } | undefined;
    const id = parsePositiveInteger(body?.id);
    const enable = typeof body?.enable === "boolean" ? body.enable : null;

    if (id === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-twitter-keyword-id" });
    }

    if (enable === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-twitter-keyword-visible-enable" });
    }

    const result = await deps.toggleTwitterSearchKeywordVisible(id, enable);

    if (!result.ok) {
      return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });
    }

    return reply.send({ ok: true, id: result.keyword.id, enable: result.keyword.isVisible });
  });

  app.post("/actions/hackernews/create", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.createHackerNewsQuery) {
      return reply.code(503).send({ ok: false, reason: "hackernews-disabled" });
    }

    const payload = parseHackerNewsQuerySavePayload(request.body, "create");

    if (!payload) {
      return reply.code(400).send({ ok: false, reason: "invalid-hackernews-query-payload" });
    }

    return sendHackerNewsQuerySaveResult(reply, await deps.createHackerNewsQuery(payload));
  });

  app.post("/actions/hackernews/update", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.updateHackerNewsQuery) {
      return reply.code(503).send({ ok: false, reason: "hackernews-disabled" });
    }

    const payload = parseHackerNewsQuerySavePayload(request.body, "update");

    if (!payload) {
      return reply.code(400).send({ ok: false, reason: "invalid-hackernews-query-payload" });
    }

    return sendHackerNewsQuerySaveResult(reply, await deps.updateHackerNewsQuery(payload));
  });

  app.post("/actions/hackernews/delete", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.deleteHackerNewsQuery) {
      return reply.code(503).send({ ok: false, reason: "hackernews-disabled" });
    }

    const id = parsePositiveInteger((request.body as { id?: unknown } | undefined)?.id);

    if (id === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-hackernews-query-id" });
    }

    const result = await deps.deleteHackerNewsQuery(id);

    if (!result.ok) {
      return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });
    }

    return reply.send({ ok: true, id: result.id });
  });

  app.post("/actions/hackernews/toggle", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.toggleHackerNewsQuery) {
      return reply.code(503).send({ ok: false, reason: "hackernews-disabled" });
    }

    const body = request.body as { id?: unknown; enable?: unknown } | undefined;
    const id = parsePositiveInteger(body?.id);
    const enable = typeof body?.enable === "boolean" ? body.enable : null;

    if (id === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-hackernews-query-id" });
    }

    if (enable === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-hackernews-query-enable" });
    }

    const result = await deps.toggleHackerNewsQuery(id, enable);

    if (!result.ok) {
      return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });
    }

    return reply.send({ ok: true, id: result.query.id, enable: result.query.isEnabled });
  });

  app.post("/actions/bilibili/create", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.createBilibiliQuery) {
      return reply.code(503).send({ ok: false, reason: "bilibili-disabled" });
    }

    const payload = parseBilibiliQuerySavePayload(request.body, "create");

    if (!payload) {
      return reply.code(400).send({ ok: false, reason: "invalid-bilibili-query-payload" });
    }

    return sendBilibiliQuerySaveResult(reply, await deps.createBilibiliQuery(payload));
  });

  app.post("/actions/bilibili/update", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.updateBilibiliQuery) {
      return reply.code(503).send({ ok: false, reason: "bilibili-disabled" });
    }

    const payload = parseBilibiliQuerySavePayload(request.body, "update");

    if (!payload) {
      return reply.code(400).send({ ok: false, reason: "invalid-bilibili-query-payload" });
    }

    return sendBilibiliQuerySaveResult(reply, await deps.updateBilibiliQuery(payload));
  });

  app.post("/actions/bilibili/delete", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.deleteBilibiliQuery) {
      return reply.code(503).send({ ok: false, reason: "bilibili-disabled" });
    }

    const id = parsePositiveInteger((request.body as { id?: unknown } | undefined)?.id);

    if (id === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-bilibili-query-id" });
    }

    const result = await deps.deleteBilibiliQuery(id);

    if (!result.ok) {
      return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });
    }

    return reply.send({ ok: true, id: result.id });
  });

  app.post("/actions/bilibili/toggle", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.toggleBilibiliQuery) {
      return reply.code(503).send({ ok: false, reason: "bilibili-disabled" });
    }

    const body = request.body as { id?: unknown; enable?: unknown } | undefined;
    const id = parsePositiveInteger(body?.id);
    const enable = typeof body?.enable === "boolean" ? body.enable : null;

    if (id === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-bilibili-query-id" });
    }

    if (enable === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-bilibili-query-enable" });
    }

    const result = await deps.toggleBilibiliQuery(id, enable);

    if (!result.ok) {
      return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });
    }

    return reply.send({ ok: true, id: result.query.id, enable: result.query.isEnabled });
  });

  app.post("/actions/wechat-rss/create", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.createWechatRssSources) {
      return reply.code(503).send({ ok: false, reason: "wechat-rss-disabled" });
    }

    const payload = parseWechatRssCreatePayload(request.body);

    if (!payload) {
      return reply.code(400).send({ ok: false, reason: "invalid-wechat-rss-payload" });
    }

    return sendWechatRssCreateResult(reply, await deps.createWechatRssSources(payload));
  });

  app.post("/actions/wechat-rss/update", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.updateWechatRssSource) {
      return reply.code(503).send({ ok: false, reason: "wechat-rss-disabled" });
    }

    const payload = parseWechatRssUpdatePayload(request.body);

    if (!payload) {
      return reply.code(400).send({ ok: false, reason: "invalid-wechat-rss-payload" });
    }

    return sendWechatRssUpdateResult(reply, await deps.updateWechatRssSource(payload));
  });

  app.post("/actions/wechat-rss/delete", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.deleteWechatRssSource) {
      return reply.code(503).send({ ok: false, reason: "wechat-rss-disabled" });
    }

    const id = parsePositiveInteger((request.body as { id?: unknown } | undefined)?.id);

    if (id === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-wechat-rss-source-id" });
    }

    const result = await deps.deleteWechatRssSource(id);

    if (!result.ok) {
      return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });
    }

    return reply.send({ ok: true, id: result.id });
  });

  // ─── 404 fallback ───

  app.setNotFoundHandler((request, reply) => {
    // API 请求返回 JSON
    if (request.headers.accept?.includes("application/json") || request.url.startsWith("/api/")) {
      return reply.code(404).send({ ok: false, reason: "not-found", path: request.url });
    }

    // 浏览器请求返回 HTML 404 页面
    return reply.code(404).type("text/html; charset=utf-8").send(renderNotFoundPage(request.url));
  });

  return app;
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function parseTwitterAccountSavePayload(body: unknown, mode: "create" | "update"): SaveTwitterAccountInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const username = typeof payload.username === "string" ? payload.username.trim() : "";

  if (!username) {
    return null;
  }

  const id = mode === "update" ? parsePositiveInteger(payload.id) : null;

  if (mode === "update" && id === null) {
    return null;
  }

  return {
    ...(id !== null ? { id } : {}),
    username,
    userId: typeof payload.userId === "string" ? payload.userId : null,
    displayName: typeof payload.displayName === "string" ? payload.displayName : null,
    category: typeof payload.category === "string" ? payload.category : null,
    priority: typeof payload.priority === "number" ? payload.priority : null,
    includeReplies: typeof payload.includeReplies === "boolean" ? payload.includeReplies : null,
    isEnabled: typeof payload.isEnabled === "boolean" ? payload.isEnabled : null,
    notes: typeof payload.notes === "string" ? payload.notes : null
  };
}

function parseTwitterKeywordSavePayload(
  body: unknown,
  mode: "create" | "update"
): SaveTwitterSearchKeywordInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const keyword = typeof payload.keyword === "string" ? payload.keyword.trim() : "";

  if (!keyword) {
    return null;
  }

  const id = mode === "update" ? parsePositiveInteger(payload.id) : null;

  if (mode === "update" && id === null) {
    return null;
  }

  return {
    ...(id !== null ? { id } : {}),
    keyword,
    category: typeof payload.category === "string" ? payload.category : null,
    priority: typeof payload.priority === "number" ? payload.priority : null,
    isCollectEnabled: typeof payload.isCollectEnabled === "boolean" ? payload.isCollectEnabled : null,
    isVisible: typeof payload.isVisible === "boolean" ? payload.isVisible : null,
    notes: typeof payload.notes === "string" ? payload.notes : null
  };
}

function parseHackerNewsQuerySavePayload(
  body: unknown,
  mode: "create" | "update"
): SaveHackerNewsQueryInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const query = typeof payload.query === "string" ? payload.query.trim() : "";

  if (!query) {
    return null;
  }

  const id = mode === "update" ? parsePositiveInteger(payload.id) : null;

  if (mode === "update" && id === null) {
    return null;
  }

  return {
    ...(id !== null ? { id } : {}),
    query,
    priority: typeof payload.priority === "number" ? payload.priority : null,
    isEnabled: typeof payload.isEnabled === "boolean" ? payload.isEnabled : null,
    notes: typeof payload.notes === "string" ? payload.notes : null
  };
}

function parseBilibiliQuerySavePayload(
  body: unknown,
  mode: "create" | "update"
): SaveBilibiliQueryInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const query = typeof payload.query === "string" ? payload.query.trim() : "";

  if (!query) {
    return null;
  }

  const id = mode === "update" ? parsePositiveInteger(payload.id) : null;

  if (mode === "update" && id === null) {
    return null;
  }

  return {
    ...(id !== null ? { id } : {}),
    query,
    priority: typeof payload.priority === "number" ? payload.priority : null,
    isEnabled: typeof payload.isEnabled === "boolean" ? payload.isEnabled : null,
    notes: typeof payload.notes === "string" ? payload.notes : null
  };
}

function parseWechatRssCreatePayload(body: unknown): CreateWechatRssSourcesInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const rssUrls = payload.rssUrls;

  if (typeof rssUrls === "string") {
    return { rssUrls };
  }

  if (Array.isArray(rssUrls) && rssUrls.every((value) => typeof value === "string")) {
    return { rssUrls };
  }

  return null;
}

function parseWechatRssUpdatePayload(body: unknown): UpdateWechatRssSourceInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const id = parsePositiveInteger(payload.id);
  const rssUrl = payload.rssUrl;
  const displayName = payload.displayName;

  if (id === null || typeof rssUrl !== "string") {
    return null;
  }

  return {
    id,
    rssUrl,
    displayName: typeof displayName === "string" ? displayName : null
  };
}

function sendTwitterAccountSaveResult(reply: FastifyReply, result: SaveTwitterAccountResult) {
  if (result.ok) {
    return reply.send({ ok: true, account: result.account });
  }

  if (result.reason === "not-found") {
    return reply.code(404).send({ ok: false, reason: result.reason });
  }

  if (result.reason === "duplicate-username") {
    return reply.code(409).send({ ok: false, reason: result.reason });
  }

  return reply.code(400).send({ ok: false, reason: result.reason });
}

function sendTwitterKeywordSaveResult(reply: FastifyReply, result: SaveTwitterSearchKeywordResult) {
  if (result.ok) {
    return reply.send({ ok: true, keyword: result.keyword });
  }

  if (result.reason === "not-found") {
    return reply.code(404).send({ ok: false, reason: result.reason });
  }

  if (result.reason === "duplicate-keyword") {
    return reply.code(409).send({ ok: false, reason: result.reason });
  }

  return reply.code(400).send({ ok: false, reason: result.reason });
}

function sendHackerNewsQuerySaveResult(reply: FastifyReply, result: SaveHackerNewsQueryResult) {
  if (result.ok) {
    return reply.send({ ok: true, query: result.query });
  }

  if (result.reason === "not-found") {
    return reply.code(404).send({ ok: false, reason: result.reason });
  }

  if (result.reason === "duplicate-query") {
    return reply.code(409).send({ ok: false, reason: result.reason });
  }

  return reply.code(400).send({ ok: false, reason: result.reason });
}

function sendBilibiliQuerySaveResult(reply: FastifyReply, result: SaveBilibiliQueryResult) {
  if (result.ok) {
    return reply.send({ ok: true, query: result.query });
  }

  if (result.reason === "not-found") {
    return reply.code(404).send({ ok: false, reason: result.reason });
  }

  if (result.reason === "duplicate-query") {
    return reply.code(409).send({ ok: false, reason: result.reason });
  }

  return reply.code(400).send({ ok: false, reason: result.reason });
}

function sendWechatRssCreateResult(reply: FastifyReply, result: CreateWechatRssSourcesResult) {
  if (result.ok) {
    return reply.send({
      ok: true,
      created: result.created,
      skippedDuplicateUrls: result.skippedDuplicateUrls
    });
  }

  return reply.code(400).send({ ok: false, reason: result.reason });
}

function sendWechatRssUpdateResult(reply: FastifyReply, result: UpdateWechatRssSourceResult) {
  if (result.ok) {
    return reply.send({ ok: true, source: result.source });
  }

  if (result.reason === "not-found") {
    return reply.code(404).send({ ok: false, reason: result.reason });
  }

  if (result.reason === "duplicate-rss-url") {
    return reply.code(409).send({ ok: false, reason: result.reason });
  }

  return reply.code(400).send({ ok: false, reason: result.reason });
}

function parseSourceSavePayload(
  body: unknown,
  mode: "create" | "update"
): SaveSourceInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const sourceType = typeof payload.sourceType === "string" ? payload.sourceType.trim() : "";

  if (sourceType === "rss") {
    const rssUrl = typeof payload.rssUrl === "string" ? payload.rssUrl.trim() : "";

    if (!rssUrl) {
      return null;
    }

    const kind = typeof payload.kind === "string" ? payload.kind.trim() : "";

    if (mode === "update") {
      return kind
        ? {
            mode: "update",
            sourceType: "rss",
            kind,
            rssUrl
          }
        : null;
    }

    return {
      mode: "create",
      sourceType: "rss",
      rssUrl
    };
  }

  if (sourceType !== "wechat_bridge") {
    return null;
  }

  const wechatName = typeof payload.wechatName === "string" ? payload.wechatName.trim() : "";

  if (!wechatName) {
    return null;
  }

  const articleUrl = typeof payload.articleUrl === "string" ? payload.articleUrl.trim() : "";
  const kind = typeof payload.kind === "string" ? payload.kind.trim() : "";

  if (mode === "update") {
    return kind
      ? {
          mode: "update",
          sourceType: "wechat_bridge",
          kind,
          wechatName,
          ...(articleUrl ? { articleUrl } : {})
        }
      : null;
  }

  return {
    mode: "create",
    sourceType: "wechat_bridge",
    wechatName,
    ...(articleUrl ? { articleUrl } : {})
  };
}

function sendSourceSaveResult(reply: FastifyReply, result: SaveSourceResult) {
  if (!result.ok) {
    if (result.reason === "not-found") {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    if (result.reason === "wechat-resolver-disabled") {
      return reply.code(503).send({ ok: false, reason: "wechat-resolver-disabled" });
    }

    if (result.reason === "wechat-resolver-not-found") {
      return reply.code(404).send({ ok: false, reason: "wechat-resolver-not-found" });
    }

    if (result.reason === "resolver-unavailable") {
      return reply.code(502).send({ ok: false, reason: "resolver-unavailable" });
    }

    if (result.reason === "invalid-rss-feed") {
      return reply.code(400).send({ ok: false, reason: "invalid-rss-feed" });
    }

    return reply.code(409).send({ ok: false, reason: result.reason });
  }

  return reply.send({ ok: true, kind: result.kind });
}

function readAuthenticatedSession(cookieHeader: string | undefined, sessionSecret: string) {
  // Session parsing is centralized so every protected route shares one validation path.
  const sessionToken = readSessionCookieToken(cookieHeader);

  if (!sessionToken || !sessionSecret) {
    return null;
  }

  return readSessionToken(sessionToken, sessionSecret);
}

function readSettingsApiSession(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string
) {
  // The read API mirrors the page-level auth rule, but API callers receive JSON 401 instead of a redirect.
  const session = readAuthenticatedSession(request.headers.cookie, sessionSecret);

  if (authEnabled && !session) {
    reply.code(401).send({ ok: false, reason: "unauthorized" });
    return undefined;
  }

  return session;
}

async function readSettingsViewRulesApiData(deps: ServerDeps): Promise<ViewRulesWorkbenchView> {
  // The API reuses the exact workbench model the page renderer consumes so the Vue client does not need duplicate mapping.
  const workbench = deps.getViewRulesWorkbenchData ? await deps.getViewRulesWorkbenchData() : null;

  if (!workbench) {
    return {
      filterWorkbench: {
        aiRule: {
          ruleKey: "ai",
          displayName: "AI 新讯筛选",
          summary: "当前没有可读取的 AI 新讯筛选配置。",
          toggles: {
            enableTimeWindow: true,
            enableSourceViewBonus: true,
            enableAiKeywordWeight: true,
            enableHeatKeywordWeight: true,
            enableFreshnessWeight: true,
            enableScoreRanking: true
          },
          weights: {
            freshnessWeight: 0.1,
            sourceWeight: 0.1,
            completenessWeight: 0.15,
            aiWeight: 0.5,
            heatWeight: 0.15
          }
        },
        hotRule: {
          ruleKey: "hot",
          displayName: "AI 热点筛选",
          summary: "当前没有可读取的 AI 热点筛选配置。",
          toggles: {
            enableTimeWindow: false,
            enableSourceViewBonus: true,
            enableAiKeywordWeight: true,
            enableHeatKeywordWeight: true,
            enableFreshnessWeight: true,
            enableScoreRanking: true
          },
          weights: {
            freshnessWeight: 0.35,
            sourceWeight: 0.1,
            completenessWeight: 0.1,
            aiWeight: 0.05,
            heatWeight: 0.4
          }
        }
      },
      providerSettings: [],
      providerCapability: {
        hasMasterKey: false,
        featureAvailable: false,
        message: "当前没有可读取的反馈池数据。"
      },
      feedbackPool: []
    };
  }

  return workbench;
}

async function readSettingsSourcesApiData(deps: ServerDeps): Promise<SourcesSettingsView> {
  // Sources workbench uses独立来源统计，不再依赖内容页当前筛选上下文。
  const sources = ((await deps.listSources?.()) ?? []) as SourceCard[];
  const twitterAccounts = ((await deps.listTwitterAccounts?.()) ?? []) as TwitterAccountSettingsView[];
  const twitterSearchKeywords = ((await deps.listTwitterSearchKeywords?.()) ?? []) as TwitterSearchKeywordSettingsView[];
  const hackerNewsQueries = ((await deps.listHackerNewsQueries?.()) ?? []) as HackerNewsQuerySettingsView[];
  const bilibiliQueries = ((await deps.listBilibiliQueries?.()) ?? []) as BilibiliQuerySettingsView[];
  const wechatRssSources = ((await deps.listWechatRssSources?.()) ?? []) as WechatRssSourceRecord[];
  const weiboTrending = (await deps.getWeiboTrendingState?.()) as WeiboTrendingSettingsView | undefined;
  const operationSummary = deps.getSourcesOperationSummary
    ? await deps.getSourcesOperationSummary()
    : { lastCollectionRunAt: null, lastSendLatestEmailAt: null };
  const nextCollectionRunAt = readNextCollectionRunAt(deps.config?.collectionSchedule);
  const wechatResolverConfigured = Boolean(
    deps.config?.wechatResolver?.baseUrl && deps.config?.wechatResolver?.token
  );

  return {
    sources,
    twitterAccounts,
    twitterSearchKeywords,
    hackerNewsQueries,
    bilibiliQueries,
    wechatRssSources,
    weiboTrending,
    operations: {
      lastCollectionRunAt: operationSummary.lastCollectionRunAt,
      lastSendLatestEmailAt: operationSummary.lastSendLatestEmailAt,
      nextCollectionRunAt,
      canTriggerManualCollect: typeof (deps.triggerManualCollect ?? deps.triggerManualRun) === "function",
      canTriggerManualTwitterCollect: typeof deps.triggerManualTwitterCollect === "function",
      canTriggerManualTwitterKeywordCollect: typeof deps.triggerManualTwitterKeywordCollect === "function",
      canTriggerManualHackerNewsCollect: typeof deps.triggerManualHackerNewsCollect === "function",
      canTriggerManualBilibiliCollect: typeof deps.triggerManualBilibiliCollect === "function",
      canTriggerManualWechatRssCollect: typeof deps.triggerManualWechatRssCollect === "function",
      canTriggerManualWeiboTrendingCollect: typeof deps.triggerManualWeiboTrendingCollect === "function",
      canTriggerManualSendLatestEmail: typeof deps.triggerManualSendLatestEmail === "function",
      isRunning: deps.isRunning?.() ?? false
    },
    capability: {
      wechatArticleUrlEnabled: wechatResolverConfigured,
      wechatArticleUrlMessage: wechatResolverConfigured
        ? "公众号来源已开启，可直接填写公众号名称，或补一篇文章链接帮助系统更快定位来源。"
        : "当前环境未启用公众号来源解析；RSS 仍可直接新增。",
      twitterAccountCollectionEnabled: deps.hasTwitterApiKey === true,
      twitterAccountCollectionMessage:
        deps.hasTwitterApiKey === true
          ? "Twitter 账号采集已配置 API key，可采集已启用账号。"
          : "当前环境未配置 TWITTER_API_KEY；Twitter 账号可先维护，采集时会跳过。",
      twitterKeywordSearchEnabled: deps.hasTwitterApiKey === true,
      twitterKeywordSearchMessage:
        deps.hasTwitterApiKey === true
          ? "Twitter 关键词搜索已配置 API key，仅支持手动采集。"
          : "当前环境未配置 TWITTER_API_KEY；Twitter 关键词可先维护，采集时会跳过。",
      hackerNewsSearchEnabled: true,
      hackerNewsSearchMessage: "Hacker News 搜索已就绪，可维护 query 并手动采集。",
      bilibiliSearchEnabled: true,
      bilibiliSearchMessage: "B 站搜索已就绪，可维护 query 并手动采集。",
      wechatRssEnabled: true,
      wechatRssMessage: "微信公众号 RSS 已就绪，可批量维护 RSS 链接并手动采集。",
      weiboTrendingEnabled: true,
      weiboTrendingMessage: "微博热搜榜匹配已就绪，固定 AI 关键词只进入 AI 热点。"
    }
  };
}

async function readSettingsProfileApiData(
  deps: ServerDeps,
  session: ReturnType<typeof readAuthenticatedSession> | null
): Promise<ProfileView | null> {
  // Profile uses the same single-user DB row as the page renderer, but strips HTML concerns out of the response.
  const profile = deps.getCurrentUserProfile ? await deps.getCurrentUserProfile() : null;

  if (!profile) {
    return null;
  }

  return {
    username: profile.username,
    displayName: profile.displayName,
    role: profile.role,
    email: profile.email,
    loggedIn: Boolean(session)
  };
}

async function readClientEntryHtml(
  clientIndexPath: string,
  options: {
    clientDevOrigin: string | null;
    readClientDevEntryHtml?: (() => Promise<string | null> | string | null) | undefined;
  }
): Promise<string> {
  const devClientEntryHtml = await tryReadClientDevEntryHtml(options.clientDevOrigin, options.readClientDevEntryHtml);

  if (devClientEntryHtml) {
    return devClientEntryHtml;
  }

  // Unified shell routes prefer the built client entry, but still need a readable fallback when the frontend bundle is absent.
  try {
    return readFileSync(clientIndexPath, "utf8");
  } catch {
    // Missing frontend assets should fail loudly with a readable hint instead of referencing fake bundle names.
    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HotNow 客户端资源未准备好</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif;
        color: #eef3ff;
        background: #111722;
      }
      main {
        max-width: 560px;
        padding: 24px 28px;
        border: 1px solid rgba(126, 162, 255, 0.28);
        border-radius: 18px;
        background: rgba(23, 31, 44, 0.92);
        box-shadow: 0 24px 48px rgba(3, 8, 18, 0.48);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      p {
        margin: 0;
        line-height: 1.7;
        color: #c4cedf;
      }
      code {
        font-family: "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
        color: #7ea2ff;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>客户端资源未准备好</h1>
      <p>请先运行 <code>npm run build:client</code>，或者重新执行 <code>npm run dev</code> / <code>npm run dev:local</code> 后再刷新。</p>
    </main>
  </body>
</html>
`;
  }
}

// 本地开发时允许 3030 页面直接借用 Vite dev server 的 HTML，这样入口路径不变也能拿到 HMR 和 Vue DevTools。
async function tryReadClientDevEntryHtml(
  clientDevOrigin: string | null,
  readClientDevEntryHtml?: (() => Promise<string | null> | string | null) | undefined
): Promise<string | null> {
  if (!clientDevOrigin) {
    return null;
  }

  const rawClientDevEntryHtml = readClientDevEntryHtml
    ? await readClientDevEntryHtml()
    : await fetchClientDevEntryHtml(clientDevOrigin);

  if (!rawClientDevEntryHtml?.trim()) {
    return null;
  }

  return rewriteClientDevEntryHtml(rawClientDevEntryHtml, clientDevOrigin);
}

// 这里只探测 Vite dev server 的根 HTML；失败时会自动回退到 dist/client，不把开发辅助能力变成硬依赖。
async function fetchClientDevEntryHtml(clientDevOrigin: string): Promise<string | null> {
  try {
    const response = await fetch(`${clientDevOrigin}/client/`, {
      headers: {
        Accept: "text/html"
      }
    });

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}

// 开发态 HTML 会继续挂在 3030 域名下，所以这里把 /client/... 资源改写成当前 clientDevOrigin 绝对地址，避免还去命中构建产物。
function rewriteClientDevEntryHtml(clientEntryHtml: string, clientDevOrigin: string): string {
  const normalizedClientDevAssetBase = `${clientDevOrigin}/client/`;

  return clientEntryHtml
    .replaceAll('="/client/brand/', '="/brand/')
    .replaceAll("='/client/brand/", "='/brand/")
    .replaceAll('="/client/', `="${normalizedClientDevAssetBase}`)
    .replaceAll("='/client/", `='${normalizedClientDevAssetBase}`);
}

// 开发态入口只接受 origin 级配置，尾部斜杠统一在这里收掉，后面拼接 /client/ 时就不会重复。
function normalizeClientDevOrigin(clientDevOrigin: string | null): string | null {
  const normalizedClientDevOrigin = clientDevOrigin?.trim().replace(/\/+$/, "") ?? "";

  return normalizedClientDevOrigin ? normalizedClientDevOrigin : null;
}

function isClientSettingsPath(pathname: string) {
  // Settings routes still need a dedicated branch because legacy pages remain server-rendered.
  return pathname.startsWith("/settings/");
}

async function serveClientSettingsShell(
  reply: FastifyReply,
  clientIndexPath: string,
  options: {
    clientDevOrigin: string | null;
    readClientDevEntryHtml?: (() => Promise<string | null> | string | null) | undefined;
  }
) {
  // System pages should always render the latest available client entry.
  return reply.type("text/html; charset=utf-8").send(await readClientEntryHtml(clientIndexPath, options));
}

async function serveClientContentShell(
  reply: FastifyReply,
  clientIndexPath: string,
  options: {
    clientDevOrigin: string | null;
    readClientDevEntryHtml?: (() => Promise<string | null> | string | null) | undefined;
  }
) {
  // Content routes use the same live client entry and recover as soon as a client build exists.
  return reply.type("text/html; charset=utf-8").send(await readClientEntryHtml(clientIndexPath, options));
}

function normalizeClientAssetPath(rawAssetPath: string): string | null {
  // Static asset requests are normalized once so path traversal checks can operate on a clean relative path.
  const trimmedPath = rawAssetPath.trim().replace(/\\/g, "/");

  if (!trimmedPath) {
    return null;
  }

  const normalizedPath = path.posix.normalize(trimmedPath).replace(/^\/+/, "");

  if (!normalizedPath || normalizedPath === "." || normalizedPath.startsWith("..")) {
    return null;
  }

  return normalizedPath;
}

function resolveClientAssetMimeType(extension: string): string {
  // The client bundle only exposes CSS and JS in this phase, so a two-branch mime map is enough.
  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }

  return "application/javascript; charset=utf-8";
}

function readSiteCss() {
  // CSS is loaded from the source tree so both tsx dev and built runtime can serve one shared stylesheet.
  try {
    return readFileSync(new URL("./public/site.css", import.meta.url), "utf8");
  } catch {
    try {
      return readFileSync(path.resolve(process.cwd(), "src/server/public/site.css"), "utf8");
    } catch {
      return "body{font-family:sans-serif;background:#f8fafc;color:#0f172a;}";
    }
  }
}

function readSiteJs() {
  // The browser helper stays optional at runtime, but the server still serves a safe fallback script.
  try {
    return readFileSync(new URL("./public/site.js", import.meta.url), "utf8");
  } catch {
    try {
      return readFileSync(path.resolve(process.cwd(), "src/server/public/site.js"), "utf8");
    } catch {
      return "(() => {})();";
    }
  }
}

function mapPathToContentViewKey(pathname: string): ContentViewKey | null {
  // Content menu paths map to one canonical view key so ranking logic stays inside content modules.
  if (pathname === "/" || pathname === "/ai-new") {
    return "ai";
  }

  if (pathname === "/ai-hot") {
    return "hot";
  }

  return null;
}

async function readContentPageModelApiData(
  deps: ServerDeps,
  request: FastifyRequest,
  pageKey: ContentPageKey
): Promise<ContentPageModel> {
  if (deps.getContentPageModel) {
    const selectedSourceKinds = readSelectedSourceKindsHeader(request.headers["x-hot-now-source-filter"]);
    const selectedTwitterAccountIds = readSelectedEntityIdsHeader(request.headers["x-hot-now-twitter-account-filter"]);
    const selectedTwitterKeywordIds = readSelectedEntityIdsHeader(request.headers["x-hot-now-twitter-keyword-filter"]);
    const selectedWechatRssSourceIds = readSelectedEntityIdsHeader(request.headers["x-hot-now-wechat-rss-filter"]);
    const sortMode = readContentSortModeHeader(request.headers["x-hot-now-content-sort"]);
    const searchKeyword = readContentSearchHeader(request.headers["x-hot-now-content-search"]);
    const page = readContentPageQueryPage(request);
    return deps.getContentPageModel(
      pageKey,
      selectedSourceKinds === undefined &&
        selectedTwitterAccountIds === undefined &&
        selectedTwitterKeywordIds === undefined &&
        selectedWechatRssSourceIds === undefined &&
        sortMode === undefined &&
        searchKeyword === undefined &&
        page === 1
        ? undefined
        : {
            selectedSourceKinds,
            selectedTwitterAccountIds,
            selectedTwitterKeywordIds,
            selectedWechatRssSourceIds,
            sortMode,
            page,
            searchKeyword
          }
    );
  }

  return buildContentPageModelFromDependencies(deps, request, pageKey);
}

async function readAiTimelineApiData(deps: ServerDeps, request: FastifyRequest) {
  const query = readAiTimelineQuery(request);

  if (!deps.readAiTimelinePage) {
    return {
      page: query.page ?? 1,
      pageSize: 50,
      totalResults: 0,
      totalPages: 0,
      filters: {
        eventTypes: [...aiTimelineEventTypes],
        companies: []
      },
      generatedAt: null,
      events: []
    };
  }

  const model = await deps.readAiTimelinePage(query);

  return {
    page: model.pagination.page,
    pageSize: model.pagination.pageSize,
    totalResults: model.pagination.totalResults,
    totalPages: model.pagination.totalPages,
    filters: model.filters,
    generatedAt: model.generatedAt,
    events: model.events
  };
}

async function readAiTimelineAdminApiData(deps: ServerDeps, request: FastifyRequest) {
  return await readAiTimelineApiData(deps, request);
}

async function readSettingsAiTimelineAdminApiData(
  deps: ServerDeps,
  request: FastifyRequest
): Promise<SettingsAiTimelineAdminResponse> {
  const [overview, sources, events] = await Promise.all([
    readSettingsAiTimelineHealthOverview(deps),
    readSettingsAiTimelineSourceHealth(deps),
    readAiTimelineAdminApiData(deps, request)
  ]);

  return {
    overview,
    sources,
    options: {
      eventTypes: aiTimelineEventTypes,
      importanceLevels: aiTimelineImportanceLevels,
      visibilityStatuses: aiTimelineVisibilityStatuses,
      reliabilityStatuses: aiTimelineReliabilityStatuses
    },
    events
  };
}

async function readSettingsAiTimelineHealthOverview(deps: ServerDeps): Promise<AiTimelineHealthOverview> {
  if (!deps.readAiTimelinePage) {
    return {
      visibleImportantCount7d: 0,
      latestVisiblePublishedAt: null,
      latestCollectStartedAt: null,
      failedSourceCount: 0,
      staleSourceCount: 0
    };
  }

  const model = await deps.readAiTimelinePage({
    visibilityStatuses: ["auto_visible"],
    recentDays: 7,
    page: 1,
    pageSize: 1
  });

  return {
    visibleImportantCount7d: model.pagination.totalResults,
    latestVisiblePublishedAt: model.events[0]?.publishedAt ?? null,
    latestCollectStartedAt: null,
    failedSourceCount: 0,
    staleSourceCount: 0
  };
}

async function readSettingsAiTimelineSourceHealth(deps: ServerDeps): Promise<AiTimelineSourceHealthRecord[]> {
  return [];
}

function readAiTimelineQuery(request: FastifyRequest): AiTimelineListQuery {
  const query = request.query as Record<string, unknown>;
  const eventType = readQueryString(query.eventType);
  const companyKey = readQueryString(query.company);
  const searchKeyword = readQueryString(query.q);
  const importanceLevels = parseAiTimelineImportanceLevels(readQueryString(query.importance));
  const visibilityStatuses = parseAiTimelineVisibilityStatuses(readQueryString(query.visibility));
  const recentDays = readPositiveQueryInteger(query.recentDays);
  const page = readPositiveQueryInteger(query.page);
  const pageSize = readPositiveQueryInteger(query.pageSize);

  return {
    ...(eventType ? { eventType } : {}),
    ...(companyKey ? { companyKey } : {}),
    ...(searchKeyword ? { searchKeyword } : {}),
    ...(importanceLevels ? { importanceLevels } : {}),
    ...(visibilityStatuses ? { visibilityStatuses } : {}),
    ...(recentDays ? { recentDays } : {}),
    ...(page ? { page } : {}),
    ...(pageSize ? { pageSize } : {})
  };
}

function parseAiTimelineImportanceLevels(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const values = value.split(",").map((item) => item.trim()).filter(isAiTimelineImportanceLevel);
  return values.length > 0 ? values : undefined;
}

function parseAiTimelineVisibilityStatuses(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const values = value.split(",").map((item) => item.trim()).filter(isAiTimelineVisibilityStatus);
  return values.length > 0 ? values : undefined;
}

function readQueryString(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

function readPositiveQueryInteger(value: unknown): number | undefined {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return undefined;
  }

  return Math.floor(parsed);
}

async function buildContentPageModelFromDependencies(
  deps: ServerDeps,
  request: FastifyRequest,
  pageKey: ContentPageKey
): Promise<ContentPageModel> {
  const viewKey = pageKey === "ai-hot" ? "hot" : "ai";

  if (!deps.listContentView) {
    return {
      pageKey,
      featuredCard: null,
      cards: [],
      strategySummary: {
        pageKey,
        items: []
      },
      pagination: null,
      emptyState: {
        title: pageKey === "ai-hot" ? "暂无 AI 热点" : "暂无 AI 新讯",
        description: "可以稍后刷新，或先检查数据源采集状态。",
        tone: "default"
      }
    };
  }

  try {
    const twitterAccounts = (await deps.listTwitterAccounts?.()) ?? [];
    const twitterKeywords = (await deps.listTwitterSearchKeywords?.()) ?? [];
    const hackerNewsQueries = (await deps.listHackerNewsQueries?.()) ?? [];
    const bilibiliQueries = (await deps.listBilibiliQueries?.()) ?? [];
    const wechatRssSources = (await deps.listWechatRssSources?.()) ?? [];
    const sourceOptions = buildContentPageSourceOptions(
      ((await deps.listContentSources?.()) ?? []).filter((source) => source.isEnabled),
      twitterAccounts.length > 0,
      twitterKeywords.length > 0,
      hackerNewsQueries.length > 0,
      bilibiliQueries.length > 0,
      false,
      wechatRssSources.length > 0
    );
    const selectedSourceKinds = readContentPageSelectedSourceKinds(request.headers["x-hot-now-source-filter"], sourceOptions);
    const effectiveSelectedSourceKinds = selectedSourceKinds ?? deriveDefaultSelectedSourceKinds(sourceOptions);
    const twitterAccountFilter = buildTwitterAccountFilterModel(
      twitterAccounts,
      readSelectedEntityIdsHeader(request.headers["x-hot-now-twitter-account-filter"])
    );
    const twitterKeywordFilter = buildTwitterKeywordFilterModel(
      twitterKeywords,
      readSelectedEntityIdsHeader(request.headers["x-hot-now-twitter-keyword-filter"])
    );
    const wechatRssFilter = buildWechatRssFilterModel(
      wechatRssSources,
      readSelectedEntityIdsHeader(request.headers["x-hot-now-wechat-rss-filter"])
    );
    const sortMode = readContentSortModeHeader(request.headers["x-hot-now-content-sort"]) ?? "published_at";
    const searchKeyword = readContentSearchHeader(request.headers["x-hot-now-content-search"]);
    const requestedPage = readContentPageQueryPage(request);
    const allCards = await deps.listContentView(viewKey, {
      selectedSourceKinds: effectiveSelectedSourceKinds,
      selectedTwitterAccountIds:
        effectiveSelectedSourceKinds.includes("twitter_accounts") ? twitterAccountFilter?.selectedAccountIds : undefined,
      selectedTwitterKeywordIds:
        effectiveSelectedSourceKinds.includes("twitter_keyword_search") ? twitterKeywordFilter?.selectedKeywordIds : undefined,
      selectedWechatRssSourceIds:
        effectiveSelectedSourceKinds.includes("wechat_rss") ? wechatRssFilter?.selectedSourceIds : undefined,
      sortMode
    });
    const filteredCards = filterCardsByTitleKeyword(allCards, searchKeyword);
    const pagination = paginateContentCards(filteredCards, requestedPage);
    const currentPageVisibleCountsBySourceKind = countCurrentPageVisibleCardsBySourceKind(pagination.cards);

    return {
      pageKey,
      sourceFilter: sourceOptions.length > 0
        ? {
            options: sourceOptions.map((source) => ({
              kind: source.kind,
              name: source.name,
              showAllWhenSelected: source.showAllWhenSelected,
              currentPageVisibleCount: currentPageVisibleCountsBySourceKind[source.kind] ?? 0
            })),
            selectedSourceKinds: effectiveSelectedSourceKinds
          }
        : undefined,
      twitterAccountFilter,
      twitterKeywordFilter,
      wechatRssFilter,
      // AI 新讯和 AI 热点都统一成标准卡流，保留 featuredCard 仅作兼容空字段。
      featuredCard: null,
      cards: pagination.cards,
      strategySummary: {
        pageKey,
        items: []
      },
      pagination: pagination.meta,
      emptyState:
        effectiveSelectedSourceKinds.length === 0
          ? {
              title: "当前未选择任何数据源",
              description: "重新全选后即可恢复内容结果。",
              tone: "filtered"
            }
          : hasSearchKeyword(searchKeyword) && pagination.meta.totalResults === 0
            ? {
                title: "没有找到匹配的内容",
                description: "可以换个关键词，或清空搜索后查看全部结果。",
                tone: "filtered"
              }
          : pagination.meta.totalResults === 0
            ? {
                title: pageKey === "ai-new" ? "当前 24 小时内暂无 AI 新讯" : "暂无 AI 热点",
                description: pageKey === "ai-new"
                  ? "可以稍后刷新，或者检查最近 24 小时内是否有新的 AI 内容进入内容池。"
                  : "可以稍后刷新，或先检查数据源采集状态。",
                tone: "default"
              }
            : null
    };
  } catch (error) {
    if (!isMalformedContentStoreError(error)) {
      throw error;
    }

    return {
      pageKey,
      featuredCard: null,
      cards: [],
      strategySummary: {
        pageKey,
        items: []
      },
      pagination: null,
      emptyState: {
        title: "内容暂不可用",
        description: "检测到本地内容库读取失败，请修复或重建 data/hot-now.sqlite 后再刷新。",
        tone: "degraded"
      }
    };
  }
}

function countCurrentPageVisibleCardsBySourceKind(cards: ContentCardView[]) {
  // fallback 内容接口直接按当前请求已经返回的卡片分布计算来源数量，避免再跑一套独立稳定口径。
  const counts = new Map<string, number>();

  for (const card of cards) {
    if (!card.sourceKind) {
      continue;
    }

    counts.set(card.sourceKind, (counts.get(card.sourceKind) ?? 0) + 1);
  }

  return Object.fromEntries(counts.entries());
}

function readContentPageQueryPage(request: FastifyRequest) {
  const query = request.query as { page?: string | number | undefined };
  const parsed = Number(query.page);

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  const normalized = Math.floor(parsed);
  return normalized >= 1 ? normalized : 1;
}

// fallback API 也要保持和核心模型一致：关键词只匹配标题，匹配前先做 trim + lowercase。
function filterCardsByTitleKeyword(cards: ContentCardView[], keyword: string | undefined) {
  const normalizedKeyword = normalizeSearchKeyword(keyword);

  if (!normalizedKeyword) {
    return cards;
  }

  return cards.filter((card) => card.title.toLowerCase().includes(normalizedKeyword));
}

function paginateContentCards(cards: ContentCardView[], requestedPage: number) {
  // 内容 API fallback 也要和核心模型保持一致，统一按 50 条分页并在越界时回退到最后一页。
  const pageSize = 50;
  const totalResults = cards.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const startIndex = (page - 1) * pageSize;

  return {
    cards: cards.slice(startIndex, startIndex + pageSize),
    meta: {
      page,
      pageSize,
      totalResults,
      totalPages
    }
  };
}

async function renderContentForView(
  deps: ServerDeps,
  request: FastifyRequest,
  viewKey: ContentViewKey
): Promise<string | undefined> {
  // Task 1 only changes route semantics, so content pages keep the existing SSR body until the Vue modules land in Task 3.
  if (!deps.listContentView) {
    return undefined;
  }

  try {
    const sourceOptions = ((await deps.listContentSources?.()) ?? []).filter((source) => source.isEnabled);
    const selectedSourceKinds = readContentPageSelectedSourceKinds(request.headers["x-hot-now-source-filter"], sourceOptions);
    const effectiveSelectedSourceKinds = selectedSourceKinds ?? deriveDefaultSelectedSourceKinds(sourceOptions);
    const sortMode = readContentSortModeHeader(request.headers["x-hot-now-content-sort"]) ?? "published_at";
    const cards = await deps.listContentView(viewKey, {
      selectedSourceKinds: effectiveSelectedSourceKinds,
      sortMode
    });

    return renderContentPage({
      viewKey,
      cards,
      sourceFilter: sourceOptions.length > 0
        ? {
            options: sourceOptions.map((source) => ({
              kind: source.kind,
              name: source.name,
              showAllWhenSelected: source.showAllWhenSelected
            })),
            selectedSourceKinds: effectiveSelectedSourceKinds
          }
        : undefined,
      emptyState:
        effectiveSelectedSourceKinds.length === 0
          ? {
              title: "当前未选择任何数据源",
              description: "重新全选后即可恢复内容结果。",
              tone: "filtered"
            }
          : undefined
    });
  } catch (error) {
    if (!isMalformedContentStoreError(error)) {
      throw error;
    }

    return renderContentPage({
      viewKey,
      cards: [],
      emptyState: {
        title: "内容暂不可用",
        description: "检测到本地内容库读取失败，请修复或重建 data/hot-now.sqlite 后再刷新。",
        tone: "degraded"
      }
    });
  }
}

function readContentPageSelectedSourceKinds(
  headerValue: string | string[] | undefined,
  sourceOptions: ContentSourceOption[]
) {
  const selectedSourceKinds = readSelectedSourceKindsHeader(headerValue);

  if (selectedSourceKinds === undefined) {
    return undefined;
  }

  return normalizeSelectedSourceKindsForOptions(selectedSourceKinds, sourceOptions);
}

function readSelectedEntityIdsHeader(headerValue: string | string[] | undefined) {
  if (typeof headerValue === "undefined") {
    return undefined;
  }

  const rawValue = Array.isArray(headerValue) ? headerValue.join(",") : headerValue ?? "";

  if (rawValue === "") {
    return [];
  }

  return rawValue
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value, index, array) => Number.isInteger(value) && value > 0 && array.indexOf(value) === index);
}

function readSelectedSourceKindsHeader(headerValue: string | string[] | undefined) {
  if (typeof headerValue === "undefined") {
    return undefined;
  }

  const rawValue = Array.isArray(headerValue) ? headerValue.join(",") : headerValue ?? "";

  if (rawValue === "") {
    return [];
  }

  return rawValue
    .split(",")
    .map((kind) => kind.trim())
    .filter(Boolean);
}

function normalizeSelectedSourceKindsForOptions(
  selectedSourceKinds: string[] | undefined,
  sourceOptions: ContentSourceOption[]
) {
  if (selectedSourceKinds === undefined) {
    return undefined;
  }

  const enabledSourceKinds = new Set(sourceOptions.map((source) => source.kind));

  return selectedSourceKinds.filter((kind, index, array) => {
    return enabledSourceKinds.has(kind) && array.indexOf(kind) === index;
  });
}

function deriveDefaultSelectedSourceKinds(sourceOptions: ContentSourceOption[]): string[] {
  // First-visit defaults intentionally leave full-display sources unchecked so users do not land on
  // an unexpectedly long feed before opting into that behavior.
  return sourceOptions.filter((source) => !source.showAllWhenSelected).map((source) => source.kind);
}

function buildContentPageSourceOptions(
  sourceOptions: ContentSourceOption[],
  hasTwitterAccounts: boolean,
  hasTwitterKeywords: boolean,
  hasHackerNewsQueries: boolean,
  hasBilibiliQueries: boolean,
  hasWeiboTrending: boolean,
  hasWechatRss: boolean
): ContentSourceOption[] {
  const nextOptions = [...sourceOptions];

  if (hasTwitterAccounts) {
    nextOptions.push({
      kind: "twitter_accounts",
      name: "Twitter 账号",
      isEnabled: true,
      showAllWhenSelected: false
    });
  }

  if (hasTwitterKeywords) {
    nextOptions.push({
      kind: "twitter_keyword_search",
      name: "Twitter 关键词搜索",
      isEnabled: true,
      showAllWhenSelected: false
    });
  }

  if (hasHackerNewsQueries) {
    nextOptions.push({
      kind: "hackernews_search",
      name: "Hacker News",
      isEnabled: true,
      showAllWhenSelected: false
    });
  }

  if (hasBilibiliQueries) {
    nextOptions.push({
      kind: "bilibili_search",
      name: "B 站搜索",
      isEnabled: true,
      showAllWhenSelected: false
    });
  }

  if (hasWeiboTrending) {
    nextOptions.push({
      kind: "weibo_trending",
      name: "微博热搜",
      isEnabled: true,
      showAllWhenSelected: false
    });
  }

  if (hasWechatRss) {
    nextOptions.push({
      kind: "wechat_rss",
      name: "微信公众号 RSS",
      isEnabled: true,
      showAllWhenSelected: false
    });
  }

  return nextOptions;
}

function buildTwitterAccountFilterModel(
  accounts: TwitterAccountRecord[],
  selectedAccountIds: number[] | undefined
) {
  if (accounts.length === 0) {
    return undefined;
  }

  const availableIds = accounts.map((account) => account.id);

  return {
    options: accounts.map((account) => ({
      id: account.id,
      label: account.displayName,
      username: account.username
    })),
    selectedAccountIds: normalizeSelectedEntityIds(selectedAccountIds, availableIds)
  };
}

function buildTwitterKeywordFilterModel(
  keywords: TwitterSearchKeywordRecord[],
  selectedKeywordIds: number[] | undefined
) {
  if (keywords.length === 0) {
    return undefined;
  }

  const availableIds = keywords.map((keyword) => keyword.id);

  return {
    options: keywords.map((keyword) => ({
      id: keyword.id,
      label: keyword.keyword
    })),
    selectedKeywordIds: normalizeSelectedEntityIds(selectedKeywordIds, availableIds)
  };
}

function buildWechatRssFilterModel(
  sources: WechatRssSourceRecord[],
  selectedSourceIds: number[] | undefined
) {
  if (sources.length === 0) {
    return undefined;
  }

  const availableIds = sources.map((source) => source.id);

  return {
    options: sources.map((source) => ({
      id: source.id,
      label: source.displayName?.trim() || `微信公众号 RSS #${source.id}`,
      rssUrl: source.rssUrl
    })),
    selectedSourceIds: normalizeSelectedEntityIds(selectedSourceIds, availableIds)
  };
}

function normalizeSelectedEntityIds(selectedIds: number[] | undefined, availableIds: number[]) {
  const availableIdSet = new Set(availableIds);

  if (!selectedIds) {
    return availableIds;
  }

  return selectedIds.filter((id, index, array) => availableIdSet.has(id) && array.indexOf(id) === index);
}

// 搜索 header 先按客户端编码规则解码，再统一规整空白；旧客户端发纯 ASCII 时也能保持兼容。
function readContentSearchHeader(headerValue: string | string[] | undefined) {
  const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const decodedValue = decodeContentSearchHeaderValue(rawValue);
  const normalizedKeyword = normalizeSearchKeyword(decodedValue);

  return normalizedKeyword === "" ? undefined : decodedValue?.trim();
}

function decodeContentSearchHeaderValue(headerValue: string | undefined) {
  if (typeof headerValue !== "string") {
    return undefined;
  }

  try {
    return decodeURIComponent(headerValue);
  } catch {
    return headerValue;
  }
}

// 这个判断用于空态分支，确保空白关键词不会误触发“搜索无结果”提示。
function hasSearchKeyword(keyword: string | undefined) {
  return normalizeSearchKeyword(keyword) !== "";
}

// 搜索关键词只做最小规范化：trim + lowercase，后续按标题 includes 匹配。
function normalizeSearchKeyword(keyword: string | undefined) {
  if (typeof keyword !== "string") {
    return "";
  }

  return keyword.trim().toLowerCase();
}

function readContentSortModeHeader(headerValue: string | string[] | undefined): ContentSortMode | undefined {
  const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (rawValue === "published_at" || rawValue === "content_score") {
    return rawValue;
  }

  return undefined;
}

async function renderSystemPageForPath(deps: ServerDeps, pathname: string, loggedIn: boolean): Promise<string | undefined> {
  // System pages keep callback wiring in main; routes only decide which renderer to call for the current path.
  if (pathname === "/settings/view-rules") {
    if (!deps.getViewRulesWorkbenchData) {
      return undefined;
    }

    const workbench = await deps.getViewRulesWorkbenchData();
    return renderViewRulesPage(workbench);
  }

  if (pathname === "/settings/sources") {
    if (!deps.listSources) {
      return undefined;
    }

    const sources = await deps.listSources();
    const operationSummary = deps.getSourcesOperationSummary
      ? await deps.getSourcesOperationSummary()
      : { lastCollectionRunAt: null, lastSendLatestEmailAt: null };
    const nextCollectionRunAt = readNextCollectionRunAt(deps.config?.collectionSchedule);

    return renderSourcesPage(sources, {
      canTriggerManualCollect: typeof (deps.triggerManualCollect ?? deps.triggerManualRun) === "function",
      canTriggerManualTwitterCollect: typeof deps.triggerManualTwitterCollect === "function",
      canTriggerManualTwitterKeywordCollect: typeof deps.triggerManualTwitterKeywordCollect === "function",
      canTriggerManualSendLatestEmail: typeof deps.triggerManualSendLatestEmail === "function",
      isRunning: deps.isRunning?.() ?? false,
      lastCollectionRunAt: operationSummary.lastCollectionRunAt,
      lastSendLatestEmailAt: operationSummary.lastSendLatestEmailAt,
      nextCollectionRunAt
    });
  }

  if (pathname === "/settings/profile") {
    if (!deps.getCurrentUserProfile) {
      return undefined;
    }

    const profile = await deps.getCurrentUserProfile();

    if (!profile) {
      return renderProfilePage(null);
    }

    return renderProfilePage({
      username: profile.username,
      displayName: profile.displayName,
      role: profile.role,
      email: profile.email,
      loggedIn
    });
  }

  return undefined;
}

function ensureStateActionAuthorized(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string
) {
  // State-changing routes return hard 401 in auth mode, which keeps API-style actions script-friendly.
  if (!authEnabled) {
    return true;
  }

  const session = readAuthenticatedSession(request.headers.cookie, sessionSecret);

  if (!session) {
    void reply.code(401).send({ ok: false, reason: "unauthorized" });
    return false;
  }

  return true;
}

function resolveExtFromFilename(filename: string | undefined): string | null {
  if (!filename) return null;
  const ext = filename.includes(".") ? `.${filename.split(".").pop()!.toLowerCase()}` : null;
  if (ext && [".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    return ext === ".jpeg" ? ".jpg" : ext;
  }
  return null;
}

function resolveExtFromContentType(contentType: string | undefined): string | null {
  if (!contentType) return null;
  const ct = contentType.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };
  return map[ct] ?? null;
}

function validateCreativeApiToken(
  request: FastifyRequest,
  reply: FastifyReply,
  expectedToken: string | undefined
): boolean {
  if (!expectedToken) {
    void reply.code(503).send({ ok: false, reason: "creative-api-token-not-configured" });
    return false;
  }
  const token = request.headers["x-creative-token"];
  if (token !== expectedToken) {
    void reply.code(401).send({ ok: false, reason: "invalid-token" });
    return false;
  }
  return true;
}

function isMalformedContentStoreError(error: unknown): boolean {
  // Only known SQLite file-shape errors degrade to an empty state; other exceptions must still surface for debugging.
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorCode = "code" in error && typeof error.code === "string" ? error.code : "";
  const errorMessage = "message" in error && typeof error.message === "string" ? error.message : "";

  return (
    errorCode === "SQLITE_CORRUPT" ||
    errorCode === "SQLITE_NOTADB" ||
    /database disk image is malformed/i.test(errorMessage) ||
    /file is not a database/i.test(errorMessage)
  );
}

async function handleManualCollectAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualCollect: ServerDeps["triggerManualCollect"] | ServerDeps["triggerManualRun"]
) {
  // Manual collection endpoints share the same auth, lock, and disabled semantics so the legacy alias stays behaviorally identical.
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret)) {
    return;
  }

  if (isRunning) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!triggerManualCollect) {
    return reply.code(503).send({ accepted: false });
  }

  const result = await triggerManualCollect();
  return reply.code(202).send(result);
}

async function handleManualTwitterCollectAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualTwitterCollect: ServerDeps["triggerManualTwitterCollect"]
) {
  // Twitter 账号采集和常规采集共用一套权限与运行锁，但返回更细的账号采集结果摘要。
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret)) {
    return;
  }

  if (isRunning) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!triggerManualTwitterCollect) {
    return reply.code(503).send({ accepted: false });
  }

  const result = await triggerManualTwitterCollect();
  return reply.code(202).send(result);
}

async function handleManualTwitterKeywordCollectAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualTwitterKeywordCollect: ServerDeps["triggerManualTwitterKeywordCollect"]
) {
  // Twitter 关键词搜索和账号采集共用锁与权限门，但单独返回关键词侧的命中统计。
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret)) {
    return;
  }

  if (isRunning) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!triggerManualTwitterKeywordCollect) {
    return reply.code(503).send({ accepted: false });
  }

  const result = await triggerManualTwitterKeywordCollect();
  return reply.code(202).send(result);
}

async function handleManualHackerNewsCollectAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualHackerNewsCollect: ServerDeps["triggerManualHackerNewsCollect"]
) {
  // Hacker News 搜索沿用同一套手动动作权限和运行锁门禁，但单独返回 HN 侧结果摘要。
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret)) {
    return;
  }

  if (isRunning) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!triggerManualHackerNewsCollect) {
    return reply.code(503).send({ accepted: false });
  }

  const result = await triggerManualHackerNewsCollect();
  return reply.code(202).send(result);
}

async function handleManualBilibiliCollectAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualBilibiliCollect: ServerDeps["triggerManualBilibiliCollect"]
) {
  // B 站搜索和 HN 一样只做手动触发，但返回的是视频搜索侧的单独统计。
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret)) {
    return;
  }

  if (isRunning) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!triggerManualBilibiliCollect) {
    return reply.code(503).send({ accepted: false });
  }

  const result = await triggerManualBilibiliCollect();
  return reply.code(202).send(result);
}

async function handleManualWechatRssCollectAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualWechatRssCollect: ServerDeps["triggerManualWechatRssCollect"]
) {
  // 公众号 RSS 是独立来源表，手动入口只处理这组配置，不影响普通 RSS 的默认采集。
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret)) {
    return;
  }

  if (isRunning) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!triggerManualWechatRssCollect) {
    return reply.code(503).send({ accepted: false });
  }

  const result = await triggerManualWechatRssCollect();
  return reply.code(202).send(result);
}

async function handleManualWeiboTrendingCollectAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualWeiboTrendingCollect: ServerDeps["triggerManualWeiboTrendingCollect"]
) {
  // 微博热搜榜匹配和其他手动采集保持同一套权限与运行锁，但只返回热点匹配侧摘要。
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret)) {
    return;
  }

  if (isRunning) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!triggerManualWeiboTrendingCollect) {
    return reply.code(503).send({ accepted: false });
  }

  const result = await triggerManualWeiboTrendingCollect();
  return reply.code(202).send(result);
}

async function handleManualSendLatestEmailAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualSendLatestEmail: ServerDeps["triggerManualSendLatestEmail"]
) {
  // Resend uses the same action gate as collection, but maps mail-specific pipeline errors to stable HTTP statuses.
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret)) {
    return;
  }

  if (isRunning) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!triggerManualSendLatestEmail) {
    return reply.code(503).send({ accepted: false });
  }

  try {
    const result = await triggerManualSendLatestEmail();

    if (result.accepted) {
      return reply.code(202).send(result);
    }

    return reply.code(mapLatestEmailReasonToStatus(result.reason)).send(result);
  } catch (error) {
    if (!(error instanceof LatestReportEmailError)) {
      throw error;
    }

    return reply.code(mapLatestEmailReasonToStatus(error.reason)).send({
      accepted: false,
      reason: error.reason
    });
  }
}

function ensureManualActionAuthorized(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string
) {
  // Manual job actions return API-style unauthorized payloads instead of redirects so browser forms and scripts see the same contract.
  if (!authEnabled) {
    return true;
  }

  const session = readAuthenticatedSession(request.headers.cookie, sessionSecret);

  if (!session) {
    void reply.code(401).send({ accepted: false, reason: "unauthorized" });
    return false;
  }

  return true;
}

function mapLatestEmailReasonToStatus(reason: LatestReportEmailErrorReason) {
  // The resend endpoint exposes pipeline reason codes directly, so callers can distinguish missing reports from delivery failures.
  if (reason === "not-found") {
    return 404;
  }

  if (reason === "report-unavailable") {
    return 503;
  }

  return 502;
}

function parseContentItemId(params: unknown): number | null {
  // Action routes accept ids from path params only, so we enforce positive integer parsing here once.
  const idCandidate = (params as { id?: unknown } | undefined)?.id;
  const parsedId = Number(idCandidate);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return null;
  }

  return parsedId;
}

function parseNumericRouteId(params: unknown, key: string): number | null {
  const value = (params as Record<string, unknown> | undefined)?.[key];
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function isSuggestedEffect(value: unknown): value is NonNullable<SaveFeedbackPoolEntryInput["suggestedEffect"]> {
  return value === "boost" || value === "penalize" || value === "block" || value === "neutral";
}

function isStrengthLevel(value: unknown): value is NonNullable<SaveFeedbackPoolEntryInput["strengthLevel"]> {
  return value === "low" || value === "medium" || value === "high";
}

function isProviderKind(value: unknown): value is SaveProviderSettingsInput["providerKind"] {
  return value === "deepseek" || value === "minimax" || value === "kimi";
}

function parseRatingScores(value: unknown): ParseRatingScoresResult {
  // Ratings payload is strict: one invalid entry invalidates the full request, so partial writes never happen.
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "invalid-ratings-payload" };
  }

  const parsedScores: Record<string, number> = {};

  for (const [dimensionKey, rawScore] of Object.entries(value)) {
    if (typeof dimensionKey !== "string" || !dimensionKey.trim()) {
      return { ok: false, reason: "invalid-ratings-payload" };
    }

    const score = Number(rawScore);

    if (!Number.isFinite(score) || score < 1 || score > 5) {
      return { ok: false, reason: "invalid-ratings-payload" };
    }

    parsedScores[dimensionKey] = score;
  }

  if (Object.keys(parsedScores).length === 0) {
    return { ok: false, reason: "invalid-ratings-payload" };
  }

  return { ok: true, scores: parsedScores };
}

function parseStringArray(value: unknown): { ok: true; values: string[] } | { ok: false } {
  if (!Array.isArray(value)) {
    return { ok: false };
  }

  const values = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  return values.length === value.length ? { ok: true, values } : { ok: false };
}

function renderLoginPage() {
  // Login remains a small self-contained page that posts JSON without adding extra Fastify plugins.
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>登录 | 热讯平台HotNow</title>
    <link rel="icon" type="image/png" href="/brand/hotnow-favicon.png" />
    <link rel="stylesheet" href="/assets/site.css" />
  </head>
  <body class="login-page">
    <main class="login-shell">
      <section class="login-stage" data-login-stage="brand">
        <div class="login-stage__halo" aria-hidden="true"></div>
        <p class="login-kicker">Spotlight Feed</p>
        <div class="login-stage__brandlock">
          <img class="login-stage__logo" src="/brand/hotnow-logo-mark.png" alt="HotNow logo" />
          <div>
            <p class="login-stage__title">HotNow</p>
            <p class="login-stage__eyebrow">AI 热点与新讯</p>
          </div>
        </div>
        <h1>欢迎回到 HotNow</h1>
        <p class="login-subtitle">登录后继续管理来源、筛选规则和统一站点的系统能力。</p>
        <ul class="login-stage__highlights">
          <li>统一查看 AI 新讯、AI 热点和来源调度状态</li>
          <li>在同一套深浅色主题里切换系统配置与内容工作台</li>
          <li>把危险操作收口在受保护的系统菜单中，避免误触</li>
        </ul>
      </section>

      <section class="login-card" data-login-panel="form">
        <p class="login-card__eyebrow">账号验证</p>
        <h2>登录 HotNow</h2>
        <p class="login-card__summary">统一站点已启用账号校验，请使用管理员账号继续。</p>
        <form id="login-form">
          <label class="field-label" for="username">用户名</label>
          <input id="username" class="field-input" name="username" autocomplete="username" required />
          <label class="field-label" for="password">密码</label>
          <input
            id="password"
            class="field-input"
            name="password"
            type="password"
            autocomplete="current-password"
            required
          />
          <button class="primary-button" type="submit">登录</button>
        </form>
        <p id="login-error" class="form-error"></p>
      </section>
    </main>
    <script>
      const form = document.getElementById("login-form");
      const errorNode = document.getElementById("login-error");

      form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        errorNode.textContent = "";
        const username = (document.getElementById("username")?.value || "").trim();
        const password = document.getElementById("password")?.value || "";
        const response = await fetch("/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username, password })
        });

        if (response.redirected) {
          location.href = response.url;
          return;
        }

        if (response.status === 200 || response.status === 204 || response.status === 302) {
          location.href = "/";
          return;
        }

        errorNode.textContent = "登录失败，请检查用户名和密码。";
      });
    </script>
  </body>
</html>`;
}
