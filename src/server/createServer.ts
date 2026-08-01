import Fastify, { LogController, type FastifyReply, type FastifyRequest } from "fastify";
import {
  installPerformanceMonitoring,
  resolveSlowRequestThreshold
} from "./performanceMonitoring.js";
import { registerHermesOperationalRoutes } from "./routes/hermesOperationalRoutes.js";
import { registerCreativeDailyDigestRoutes } from "./routes/creativeDailyDigestRoutes.js";
import { registerSettingsApiRoutes } from "./routes/settingsApiRoutes.js";
import { registerCreativeListRoutes } from "./routes/creativeListRoutes.js";
import { registerCreativeImageRoutes } from "./routes/creativeImageRoutes.js";
import { registerCreativeSourceActionRoutes } from "./routes/creativeSourceActionRoutes.js";
import { registerCreativeFinishedArticleRoutes } from "./routes/creativeFinishedArticleRoutes.js";
import { registerManualCollectionRoutes } from "./routes/manualCollectionRoutes.js";
import { registerSourceManagementRoutes } from "./routes/sourceManagementRoutes.js";
import { registerTwitterSourceRoutes } from "./routes/twitterSourceRoutes.js";
import { registerQuerySourceRoutes } from "./routes/querySourceRoutes.js";
import { registerWechatRssRoutes } from "./routes/wechatRssRoutes.js";
import { registerContentFeedbackRoutes } from "./routes/contentFeedbackRoutes.js";
import { registerSitePageRoutes, readSettingsAiTimelineAdminApiData } from "./routes/sitePageRoutes.js";
import { registerAiTimelineRoutes } from "./routes/aiTimelineRoutes.js";
import type { AiTimelineFeedReadResult } from "../core/aiTimeline/aiTimelineFeedFile.js";
import { LatestReportEmailError, type LatestReportEmailErrorReason } from "../core/pipeline/sendLatestReportEmail.js";
import type { BuildContentPageModelOptions } from "../core/content/buildContentPageModel.js";
import type { ContentViewSelectionOptions } from "../core/content/buildContentViewSelection.js";
import type { ContentCardView, ContentViewKey } from "../core/content/listContentView.js";
import {
  aiTimelineEventTypes,
  aiTimelineImportanceLevels,
  aiTimelineReliabilityStatuses,
  aiTimelineVisibilityStatuses,
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
import type { CreativeAutomationService } from "../core/creative/creativeAutomationService.js";
import { readNextCollectionRunAt } from "../core/scheduler/readNextCollectionRunAt.js";
import {
  readSessionCookieToken,
  readSessionToken,
} from "../core/auth/session.js";
import type {
  BilibiliQuerySettingsView,
  ProfileView,
  SourcesSettingsView,
  HackerNewsQuerySettingsView,
  TwitterAccountSettingsView,
  TwitterSearchKeywordSettingsView,
  WeiboTrendingSettingsView,
  ViewRulesWorkbenchView
} from "./renderSystemPages.js";

type ReportSummary = {
  date: string;
  topicCount: number;
  degraded: boolean;
  mailStatus: string;
};
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
type ManualJuyaCollectResult =
  | {
      accepted: true;
      action: "collect-juya";
      itemCount: number;
    }
  | {
      accepted: false;
      reason: "juya-source-not-found" | "juya-rss-url-empty" | "juya-fetch-failed" | string;
    };
type ManualSendLatestEmailResult =
  | { accepted: true; action: "send-latest-email" }
  | { accepted: false; reason: LatestReportEmailErrorReason };
type DeleteFeedbackResult = boolean;
type ClearFeedbackResult = number;
type ContentPageKey = "ai-new" | "ai-hot";
export type ContentPageModel = {
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

export type ServerDeps = {
  clientBuildRoot?: string;
  clientDevOrigin?: string;
  readClientDevEntryHtml?: () => Promise<string | null> | string | null;
  config?: Partial<RuntimeConfig>;
  db?: SqliteDatabase;
  creativeApiToken?: string;
  creativeImageDir?: string;
  creativeAutomation?: CreativeAutomationService;
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
  triggerManualJuyaCollect?: () => Promise<ManualJuyaCollectResult>;
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
  const app = Fastify({
    logger: true,
    logController: new LogController({ disableRequestLogging: true })
  });
  installPerformanceMonitoring(app, {
    slowRequestMs: resolveSlowRequestThreshold(process.env.HOT_NOW_SLOW_REQUEST_MS)
  });
  const authConfig = deps.auth;
  const authEnabled = authConfig?.requireLogin === true;
  const db = deps.db;
  const creativeApiToken = deps.creativeApiToken;
  const creativeImageDir = deps.creativeImageDir;
  registerCreativeSourceActionRoutes(app, {
    db,
    automation: deps.creativeAutomation,
    authorizeCreativeApiToken: (request, reply) => validateCreativeApiToken(request, reply, creativeApiToken),
    hasCreativeApiToken: (request) => Boolean(
      creativeApiToken && request.headers["x-creative-token"] === creativeApiToken
    ),
    authorizeSession: (request, reply) => (
      readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "") !== undefined
    ),
    authorizeStateAction: (request, reply) => (
      ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")
    ),
  });

  registerAiTimelineRoutes(app, { readFeed: deps.readAiTimelineFeed, readPage: deps.readAiTimelinePage, authorize: (request, reply) => ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "") });

  // 创作列表与详情保持原鉴权语义，由独立路由模块集中维护。
  registerCreativeListRoutes(app, {
    db,
    creativeApiToken,
    authorizeSession: (request, reply) =>
      readSettingsApiSession(
        request,
        reply,
        authEnabled,
        authConfig?.sessionSecret ?? ""
      ) !== undefined
  });


  // 成品文章域只接收最小依赖；入口保留鉴权策略与外部服务装配。
  registerCreativeFinishedArticleRoutes(app, {
    db,
    authorizeCreativeApiToken: (request, reply) => validateCreativeApiToken(request, reply, creativeApiToken),
    hasCreativeApiToken: (request) => Boolean(
      creativeApiToken && request.headers["x-creative-token"] === creativeApiToken
    ),
    readSession: (request, reply) => (
      readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "")
    ),
    authorizeStateAction: (request, reply) => (
      ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")
    ),
    pushArticleToWechatDraft: deps.pushArticleToWechatDraft,
    getArticleWechatPushLog: deps.getArticleWechatPushLog,
  });


  // 运行域使用与原入口相同的 session 读取语义，避免改变未登录时的响应行为。
  registerHermesOperationalRoutes(app, {
    db,
    readSession: (request, reply) => (
      readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "")
    ),
  });

  registerCreativeDailyDigestRoutes(app, {
    db,
    authorizeCreativeApiToken: (request, reply) => validateCreativeApiToken(request, reply, creativeApiToken),
    hasCreativeApiToken: (request) => Boolean(
      creativeApiToken && request.headers["x-creative-token"] === creativeApiToken
    ),
    readSession: (request, reply) => (
      readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "")
    ),
    authorizeStateAction: (request, reply) => (
      ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")
    ),
    pushDailyDigestToWechatDraft: deps.pushDailyDigestToWechatDraft,
  });


  // 设置域通过小型回调接收读取、保存和鉴权能力，不持有整个 ServerDeps。
  registerSettingsApiRoutes(app, {
    readSession: (request, reply) => (
      readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "")
    ),
    authorizeStateAction: (request, reply) => (
      ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")
    ),
    readViewRules: () => readSettingsViewRulesApiData(deps),
    saveContentFilterRule: deps.saveContentFilterRule,
    readSources: () => readSettingsSourcesApiData(deps),
    readProfile: (session) => readSettingsProfileApiData(deps, session),
    verifyLogin: authConfig?.verifyLogin,
    updatePassword: deps.updatePassword,
    readAiTimelineAdmin: (request) => readSettingsAiTimelineAdminApiData(deps, request),
    listWechatMpAccounts: deps.listWechatMpAccounts,
    saveWechatMpAccount: deps.saveWechatMpAccount,
    deleteWechatMpAccount: deps.deleteWechatMpAccount,
    setDefaultWechatMpAccount: deps.setDefaultWechatMpAccount,
    saveProviderSettings: deps.saveProviderSettings,
    updateProviderSettingsActivation: deps.updateProviderSettingsActivation,
    deleteProviderSettings: deps.deleteProviderSettings,
  });

  // 手动采集路由只接收既有处理函数，保障鉴权、运行锁和响应语义均不变。
  registerManualCollectionRoutes(app, {
    runCollect: (request, reply) => handleManualCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualCollect ?? deps.triggerManualRun
    ),
    sendLatestEmail: (request, reply) => handleManualSendLatestEmailAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualSendLatestEmail
    ),
    collectTwitterAccounts: (request, reply) => handleManualTwitterCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualTwitterCollect
    ),
    collectTwitterKeywords: (request, reply) => handleManualTwitterKeywordCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualTwitterKeywordCollect
    ),
    collectHackerNews: (request, reply) => handleManualHackerNewsCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualHackerNewsCollect
    ),
    collectBilibili: (request, reply) => handleManualBilibiliCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualBilibiliCollect
    ),
    collectWechatRss: (request, reply) => handleManualWechatRssCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualWechatRssCollect
    ),
    collectWeibo: (request, reply) => handleManualWeiboTrendingCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualWeiboTrendingCollect
    ),
    collectJuya: (request, reply) => handleManualJuyaCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.triggerManualJuyaCollect
    ),
    authorizeManualAction: (request, reply) => ensureManualActionAuthorized(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? ""
    ),
  });

  // 通用来源配置只注入写入能力和既有状态鉴权，来源采集与社交来源仍保持独立边界。
  registerSourceManagementRoutes(app, {
    authorizeStateAction: (request, reply) => ensureStateActionAuthorized(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? ""
    ),
    createSource: deps.createSource,
    updateSource: deps.updateSource,
    deleteSource: deps.deleteSource,
    toggleSource: deps.toggleSource,
    updateSourceDisplayMode: deps.updateSourceDisplayMode,
  });

  // Twitter 账号和关键词都有独立数据模型，统一由专用模块维护其写入接口。
  registerTwitterSourceRoutes(app, {
    authorizeStateAction: (request, reply) => ensureStateActionAuthorized(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? ""
    ),
    createTwitterAccount: deps.createTwitterAccount,
    updateTwitterAccount: deps.updateTwitterAccount,
    deleteTwitterAccount: deps.deleteTwitterAccount,
    toggleTwitterAccount: deps.toggleTwitterAccount,
    createTwitterSearchKeyword: deps.createTwitterSearchKeyword,
    updateTwitterSearchKeyword: deps.updateTwitterSearchKeyword,
    deleteTwitterSearchKeyword: deps.deleteTwitterSearchKeyword,
    toggleTwitterSearchKeywordCollect: deps.toggleTwitterSearchKeywordCollect,
    toggleTwitterSearchKeywordVisible: deps.toggleTwitterSearchKeywordVisible,
  });

  // 两类查询来源共享稳定的增改删与启停协议，但保留各自的仓储回调。
  registerQuerySourceRoutes(app, {
    authorizeStateAction: (request, reply) => ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? ""),
    createHackerNewsQuery: deps.createHackerNewsQuery, updateHackerNewsQuery: deps.updateHackerNewsQuery,
    deleteHackerNewsQuery: deps.deleteHackerNewsQuery, toggleHackerNewsQuery: deps.toggleHackerNewsQuery,
    createBilibiliQuery: deps.createBilibiliQuery, updateBilibiliQuery: deps.updateBilibiliQuery,
    deleteBilibiliQuery: deps.deleteBilibiliQuery, toggleBilibiliQuery: deps.toggleBilibiliQuery,
  });

  // 公众号 RSS 使用独立来源表，只注入本域写入回调。
  registerWechatRssRoutes(app, {
    authorizeStateAction: (request, reply) => ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? ""),
    createWechatRssSources: deps.createWechatRssSources, updateWechatRssSource: deps.updateWechatRssSource, deleteWechatRssSource: deps.deleteWechatRssSource,
  });

  registerContentFeedbackRoutes(app, {
    authorizeStateAction: (request, reply) => ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? ""),
    saveContentFeedback: deps.saveContentFeedback, saveRatings: deps.saveRatings,
    deleteFeedbackEntry: deps.deleteFeedbackEntry, clearAllFeedback: deps.clearAllFeedback,
  });

  // Creative 图片路由集中到独立模块，避免服务装配入口继续承载上传细节。
  registerCreativeImageRoutes(app, {
    creativeImageDir,
    publicBaseUrl: (deps.config?.publicBaseUrl ?? "").replace(/\/+$/, ""),
    authorizeCreativeApiToken: (request, reply) => validateCreativeApiToken(request, reply, creativeApiToken),
    authorizeSessionAction: (request, reply) =>
      ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")
  });

  registerSitePageRoutes(app, {
    auth: deps.auth,
    clientBuildRoot: deps.clientBuildRoot,
    clientDevOrigin: deps.clientDevOrigin,
    config: deps.config,
    creativeApiToken,
    db,
    getContentPageModel: deps.getContentPageModel,
    getCurrentUserProfile: deps.getCurrentUserProfile,
    getSourcesOperationSummary: deps.getSourcesOperationSummary,
    getViewRulesWorkbenchData: deps.getViewRulesWorkbenchData,
    isRunning: deps.isRunning,
    latestReportDate: deps.latestReportDate,
    listContentSources: deps.listContentSources,
    listSources: deps.listSources,
    listTwitterAccounts: deps.listTwitterAccounts,
    listTwitterSearchKeywords: deps.listTwitterSearchKeywords,
    listHackerNewsQueries: deps.listHackerNewsQueries,
    listBilibiliQueries: deps.listBilibiliQueries,
    listWechatRssSources: deps.listWechatRssSources,
    getWeiboTrendingState: deps.getWeiboTrendingState,
    readAiTimelinePage: deps.readAiTimelinePage,
    listContentView: deps.listContentView,
    listReportSummaries: deps.listReportSummaries,
    readClientDevEntryHtml: deps.readClientDevEntryHtml,
    readReportHtml: deps.readReportHtml,
    triggerManualCollect: deps.triggerManualCollect,
    triggerManualRun: deps.triggerManualRun,
    triggerManualSendLatestEmail: deps.triggerManualSendLatestEmail,
    triggerManualTwitterCollect: deps.triggerManualTwitterCollect,
    triggerManualTwitterKeywordCollect: deps.triggerManualTwitterKeywordCollect,
    authorizeCreativeApiToken: (request, reply) => validateCreativeApiToken(request, reply, creativeApiToken),
    readSession: (cookieHeader) => readAuthenticatedSession(cookieHeader, authConfig?.sessionSecret ?? "")
  });

  return app;
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
      canTriggerManualJuyaCollect: typeof deps.triggerManualJuyaCollect === "function",
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

// Juya RSS 独立采集：只抓 juya 一个源，独占锁，不生成日报，结果只回条目数。
async function handleManualJuyaCollectAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  triggerManualJuyaCollect: ServerDeps["triggerManualJuyaCollect"]
) {
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret)) {
    return;
  }

  if (!triggerManualJuyaCollect) {
    return reply.code(503).send({ accepted: false });
  }

  const result = await triggerManualJuyaCollect();
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
