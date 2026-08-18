import Fastify, { LogController } from "fastify";
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
import {
  ensureManualActionAuthorized,
  ensureStateActionAuthorized,
  readAuthenticatedSession,
  readSettingsApiSession,
  validateCreativeApiToken,
} from "./createServerSession.js";
import {
  readSettingsProfileApiData,
  readSettingsSourcesApiData,
  readSettingsViewRulesApiData,
} from "./createServerSettingsViewData.js";
import {
  handleManualBilibiliCollectAction,
  handleManualCollectAction,
  handleManualHackerNewsCollectAction,
  handleManualJuyaCollectAction,
  handleManualSendLatestEmailAction,
  handleManualTwitterCollectAction,
  handleManualTwitterKeywordCollectAction,
  handleManualWeiboTrendingCollectAction,
  handleManualWechatRssCollectAction,
} from "./createServerManualCollectionActions.js";
import type { AiTimelineFeedReadResult } from "../core/aiTimeline/aiTimelineFeedFile.js";
import type { LatestReportEmailErrorReason } from "../core/pipeline/sendLatestReportEmail.js";
import type { BuildContentPageModelOptions } from "../core/content/buildContentPageModel.js";
import type { ContentViewSelectionOptions } from "../core/content/buildContentViewSelection.js";
import type { ContentCardView, ContentViewKey } from "../core/content/listContentView.js";
import type { AiTimelineListQuery, AiTimelinePageModel } from "../core/aiTimeline/aiTimelineTypes.js";
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
import type {
  ViewRulesWorkbenchView
} from "./renderSystemPages.js";

type ReportSummary = {
  date: string;
  topicCount: number;
  degraded: boolean;
  mailStatus: string;
};
export type SourceCard = {
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
