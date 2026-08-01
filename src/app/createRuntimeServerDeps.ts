import path from "node:path";
import { hashPassword, verifyPassword } from "../core/auth/passwords.js";
import { readAiTimelineFeedFile, readAiTimelineFeedPageModel } from "../core/aiTimeline/aiTimelineFeedFile.js";
import { buildContentPageModel } from "../core/content/buildContentPageModel.js";
import { listContentView as listContentCards } from "../core/content/listContentView.js";
import type { SqliteDatabase } from "../core/db/openDatabase.js";
import { clearFeedbackPool, deleteFeedbackPoolEntry, listFeedbackPoolEntries, saveFeedbackPoolEntry } from "../core/feedback/feedbackPoolRepository.js";
import { fetchAndExtractArticle } from "../core/fetch/extractArticle.js";
import {
  deleteProviderSettings as removeProviderSettings,
  listProviderSettingsSummaries,
  saveProviderSettings as persistProviderSettings,
  updateProviderSettingsActivation as persistProviderSettingsActivation
} from "../core/llm/providerSettingsRepository.js";
import { listRatingDimensions, saveRatings } from "../core/ratings/ratingRepository.js";
import { listReportDates, readTextFile } from "../core/storage/reportStore.js";
import { listContentSources } from "../core/source/listContentSources.js";
import { listSourceWorkbench } from "../core/source/listSourceWorkbench.js";
import { readSourcesOperationSummary } from "../core/source/readSourcesOperationSummary.js";
import { hydrateSourceContent } from "../core/source/hydrateSourceContent.js";
import {
  deleteSource as removeSource,
  saveSource as persistSource,
  toggleSource as persistSourceToggle,
  updateSourceDisplayMode as persistSourceDisplayMode
} from "../core/source/sourceMutationRepository.js";
import { listTwitterAccounts, createTwitterAccount as persistTwitterAccount, deleteTwitterAccount as removeTwitterAccount, toggleTwitterAccount as persistTwitterAccountToggle, updateTwitterAccount as persistTwitterAccountUpdate } from "../core/twitter/twitterAccountRepository.js";
import { listTwitterSearchKeywords, createTwitterSearchKeyword as persistTwitterSearchKeyword, deleteTwitterSearchKeyword as removeTwitterSearchKeyword, toggleTwitterSearchKeywordCollect as persistTwitterSearchKeywordCollectToggle, toggleTwitterSearchKeywordVisible as persistTwitterSearchKeywordVisibleToggle, updateTwitterSearchKeyword as persistTwitterSearchKeywordUpdate } from "../core/twitter/twitterSearchKeywordRepository.js";
import { listHackerNewsQueries, createHackerNewsQuery as persistHackerNewsQuery, deleteHackerNewsQuery as removeHackerNewsQuery, toggleHackerNewsQuery as persistHackerNewsQueryToggle, updateHackerNewsQuery as persistHackerNewsQueryUpdate } from "../core/hackernews/hackerNewsQueryRepository.js";
import { listBilibiliQueries, createBilibiliQuery as persistBilibiliQuery, deleteBilibiliQuery as removeBilibiliQuery, toggleBilibiliQuery as persistBilibiliQueryToggle, updateBilibiliQuery as persistBilibiliQueryUpdate } from "../core/bilibili/bilibiliQueryRepository.js";
import { listWechatRssSources, createWechatRssSources as persistWechatRssSources, deleteWechatRssSource as removeWechatRssSource, updateWechatRssSource as persistWechatRssSourceUpdate } from "../core/wechatRss/wechatRssSourceRepository.js";
import { readWeiboTrendingRunState } from "../core/weibo/runWeiboTrendingCollection.js";
import type { RuntimeConfig } from "../core/types/appConfig.js";
import { getViewRuleConfig, saveViewRuleConfig } from "../core/viewRules/viewRuleRepository.js";
import { pushArticleToWechatDraft, getArticlePushLog, getArticlePushCount } from "../core/wechatMp/wechatMpDraftPush.js";
import { pushDailyDigestToWechatDraft } from "../core/wechatMp/dailyDigestDraftPush.js";
import { listWechatMpAccounts, saveWechatMpAccount, deleteWechatMpAccount, setDefaultWechatMpAccount } from "../core/wechatMp/wechatMpAccountRepository.js";
import type { WechatThemeId } from "../core/creative/wechatFormat/wechatCompat.js";
import type { ServerDeps } from "../server/createServer.js";

export type RuntimeServerActionDeps = Pick<ServerDeps,
  | "isRunning"
  | "triggerManualCollect"
  | "triggerManualTwitterCollect"
  | "triggerManualTwitterKeywordCollect"
  | "triggerManualSendLatestEmail"
  | "triggerManualHackerNewsCollect"
  | "triggerManualBilibiliCollect"
  | "triggerManualWechatRssCollect"
  | "triggerManualWeiboTrendingCollect"
  | "triggerManualJuyaCollect"
  | "creativeAutomation"
>;

export type RuntimeServerDepsInput = RuntimeServerActionDeps & {
  db: SqliteDatabase;
  config: RuntimeConfig;
  creativeApiToken?: string;
  clientDevOrigin?: string;
  hasTwitterApiKey: boolean;
};

type ReportSummary = {
  date: string;
  topicCount: number;
  degraded: boolean;
  mailStatus: string;
};

type AdminProfileRow = {
  username: string;
  password_hash: string;
  role: string | null;
  display_name: string | null;
};

type UserProfileRow = {
  username: string;
  role: string | null;
  display_name: string | null;
  email: string | null;
};

// 将 HTTP 层所需的数据库读写和外部服务适配集中装配，避免启动入口承载业务细节。
export function createRuntimeServerDeps(input: RuntimeServerDepsInput): ServerDeps {
  const { db, config } = input;
  const readAdminProfile = db.prepare(`
    SELECT username, password_hash, role, display_name
    FROM user_profile
    WHERE id = 1
  `);
  const readCurrentUserProfile = db.prepare(`
    SELECT username, role, display_name, email
    FROM user_profile
    WHERE id = 1
  `);

  // History entries are rebuilt from stored run metadata so the server can boot without a database.
  async function listStoredReportSummaries(): Promise<ReportSummary[]> {
    const dates = await listReportDates(config.report.dataDir);

    return await Promise.all(
      dates.map(async (date) => {
        try {
          const text = await readTextFile(config.report.dataDir, date, "run-meta.json");
          return parseReportSummary(date, text);
        } catch {
          return {
            date,
            topicCount: 0,
            degraded: true,
            mailStatus: "unknown"
          };
        }
      })
    );
  }

  // The summary reader is intentionally strict about field types and falls back only at the page level.
  function parseReportSummary(date: string, fileText: string): ReportSummary {
    const parsed = JSON.parse(fileText) as Record<string, unknown>;

    return {
      date,
      topicCount: typeof parsed.topicCount === "number" && Number.isFinite(parsed.topicCount) ? parsed.topicCount : 0,
      degraded: typeof parsed.degraded === "boolean" ? parsed.degraded : true,
      mailStatus: typeof parsed.mailStatus === "string" ? parsed.mailStatus : "unknown"
    };
  }

  // The login callback stays in main so database details do not leak into the HTTP layer.
  async function verifyLogin(username: string, password: string) {
    const profile = readAdminProfile.get() as AdminProfileRow | undefined;

    if (!profile || profile.username !== username) {
      return null;
    }

    if (!verifyPassword(password, profile.password_hash)) {
      return null;
    }

    return {
      username: profile.username,
      displayName: profile.display_name?.trim() || profile.username,
      role: profile.role?.trim() || "admin"
    };
  }

  function getCurrentUserProfile() {
    // Unified profile page only needs one bootstrap account row from user_profile(id=1).
    const profile = readCurrentUserProfile.get() as UserProfileRow | undefined;

    if (!profile) {
      return null;
    }

    return {
      username: profile.username,
      displayName: profile.display_name?.trim() || profile.username,
      role: profile.role?.trim() || "admin",
      email: profile.email
    };
  }

  function getViewRulesWorkbenchData() {
    const aiRule = getViewRuleConfig(db, "ai");
    const hotRule = getViewRuleConfig(db, "hot");

    return {
      filterWorkbench: {
        aiRule: buildFilterWorkbenchRule("ai", aiRule),
        hotRule: buildFilterWorkbenchRule("hot", hotRule)
      },
      providerSettings: listProviderSettingsSummaries(db),
      providerCapability: readProviderCapability(),
      feedbackPool: listFeedbackPoolEntries(db)
    };
  }

  function buildFilterWorkbenchRule(
    ruleKey: "ai" | "hot",
    config: ReturnType<typeof getViewRuleConfig>
  ) {
    return {
      ruleKey,
      displayName: ruleKey === "ai" ? "AI 新讯怎么排" : "AI 热点怎么排",
      summary: ruleKey === "ai"
        ? buildAiRuleSummary(config)
        : buildHotRuleSummary(config),
      toggles: {
        enableTimeWindow: config.enableTimeWindow,
        enableSourceViewBonus: config.enableSourceViewBonus,
        enableAiKeywordWeight: config.enableAiKeywordWeight,
        enableHeatKeywordWeight: config.enableHeatKeywordWeight,
        enableFreshnessWeight: config.enableFreshnessWeight,
        enableScoreRanking: config.enableScoreRanking
      },
      weights: {
        freshnessWeight: config.freshnessWeight,
        sourceWeight: config.sourceWeight,
        completenessWeight: config.completenessWeight,
        aiWeight: config.aiWeight,
        heatWeight: config.heatWeight
      }
    };
  }

  function buildAiRuleSummary(config: ReturnType<typeof getViewRuleConfig>) {
    return `现在 AI 新讯${config.enableTimeWindow ? "默认只看最近 24 小时" : "不限制最近 24 小时"}。排序时主要看${readEnabledAiSignals(config)}，下面会把这些词的意思直接写清楚。`;
  }

  function buildHotRuleSummary(config: ReturnType<typeof getViewRuleConfig>) {
    return `现在 AI 热点${config.enableTimeWindow ? "只看最近 24 小时" : "不限制 24 小时"}。排序时主要看${readEnabledHotSignals(config)}，下面会把这些词的意思直接写清楚。`;
  }

  function readEnabledAiSignals(config: ReturnType<typeof getViewRuleConfig>) {
    const parts = [
      config.enableAiKeywordWeight ? "AI 内容" : null,
      config.enableHeatKeywordWeight ? "热点词" : null,
      config.enableSourceViewBonus ? "AI 新讯重点来源" : null,
      config.enableScoreRanking ? "综合分" : "发布时间"
    ].filter((value): value is string => typeof value === "string");

    return parts.join("、");
  }

  function readEnabledHotSignals(config: ReturnType<typeof getViewRuleConfig>) {
    const parts = [
      config.enableHeatKeywordWeight ? "热点词" : null,
      config.enableAiKeywordWeight ? "AI 内容" : null,
      config.enableFreshnessWeight ? "新内容" : null,
      config.enableSourceViewBonus ? "AI 热点重点来源" : null,
      config.enableScoreRanking ? "综合分" : "发布时间"
    ].filter((value): value is string => typeof value === "string");

    return parts.join("、");
  }

  function saveContentFilterRule(input: { ruleKey: string; toggles: unknown; weights: unknown }) {
    const normalizedRuleKey = input.ruleKey.trim();

    if (
      (normalizedRuleKey !== "ai" && normalizedRuleKey !== "hot") ||
      !isTogglePatch(input.toggles) ||
      !isWeightPatch(input.weights)
    ) {
      return { ok: false as const, reason: "invalid-content-filter-config" };
    }

    const ruleKey: "ai" | "hot" = normalizedRuleKey;

    const currentConfig = getViewRuleConfig(db, ruleKey);
    const result = saveViewRuleConfig(db, ruleKey, {
      ...currentConfig,
      ...input.toggles,
      ...input.weights
    });

    if (!result.ok) {
      return { ok: false as const, reason: result.reason };
    }

    return {
      ok: true as const,
      ruleKey
    };
  }

  function isTogglePatch(value: unknown): value is {
    enableTimeWindow?: boolean;
    enableSourceViewBonus?: boolean;
    enableAiKeywordWeight?: boolean;
    enableHeatKeywordWeight?: boolean;
    enableFreshnessWeight?: boolean;
    enableScoreRanking?: boolean;
  } {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return false;
    }

    return Object.entries(value).every(
      ([key, entryValue]) =>
        (
          key === "enableTimeWindow" ||
          key === "enableSourceViewBonus" ||
          key === "enableAiKeywordWeight" ||
          key === "enableHeatKeywordWeight" ||
          key === "enableFreshnessWeight" ||
          key === "enableScoreRanking"
        ) &&
        typeof entryValue === "boolean"
    );
  }

  function isWeightPatch(value: unknown): value is {
    freshnessWeight?: number;
    sourceWeight?: number;
    completenessWeight?: number;
    aiWeight?: number;
    heatWeight?: number;
  } {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return false;
    }

    return Object.entries(value).every(
      ([key, entryValue]) =>
        (
          key === "freshnessWeight" ||
          key === "sourceWeight" ||
          key === "completenessWeight" ||
          key === "aiWeight" ||
          key === "heatWeight"
        ) &&
        typeof entryValue === "number" &&
        Number.isFinite(entryValue) &&
        entryValue >= 0
    );
  }

  function readProviderCapability() {
    // 当前版本只保留厂商配置入口，因此这里描述的是“配置能否保存和展示”，而不是策略可用性。
    const settingsMasterKey = config.llm?.settingsMasterKey ?? null;

    if (!settingsMasterKey) {
      return {
        hasMasterKey: false,
        featureAvailable: false,
        message: "未配置 LLM_SETTINGS_MASTER_KEY，当前无法新增或更新厂商 API key。"
      };
    }

    const providerSettings = listProviderSettingsSummaries(db);
    const enabledProvider = providerSettings.find((settings) => settings.isEnabled) ?? null;

    if (!enabledProvider) {
      return {
        hasMasterKey: true,
        featureAvailable: false,
        message: providerSettings.length > 0 ? "已保存厂商配置，但当前没有启用中的厂商。" : "当前还没有保存任何厂商配置。"
      };
    }

    return {
      hasMasterKey: true,
      featureAvailable: true,
      message: `当前已启用 ${formatProviderLabel(enabledProvider.providerKind)}，但这份设置暂未接入反馈池或筛选逻辑。`
    };
  }

  function formatProviderLabel(providerKind: string): string {
    if (providerKind === "deepseek") {
      return "DeepSeek";
    }

    if (providerKind === "minimax") {
      return "MiniMax";
    }

    if (providerKind === "kimi") {
      return "Kimi";
    }

    return providerKind;
  }

  // 新增来源后先只补这一条 source 的内容入库，避免为了拿到首批数据就把整轮全站采集串进保存接口。
  async function saveAndHydrateSource(input: Parameters<typeof persistSource>[1]) {
    const result = await persistSource(db, input, {
      wechatResolver: config.wechatResolver ?? null
    });

    if (!result.ok) {
      return result;
    }

    try {
      await hydrateSourceContent(db, result.kind, {
        fetchArticle: fetchAndExtractArticle
      });
    } catch {
      // 来源保存不应该因为首轮补拉失败而回滚；后续定时采集仍然会继续尝试刷新这条 source。
    }

    return result;
  }

  // 创作图片与数据库同目录，保持既有持久化位置。
  const creativeImageDir = path.join(path.dirname(config.database.file), "creative-images");

  return {
  db,
    creativeApiToken: input.creativeApiToken,
    creativeImageDir,
    config,
    clientDevOrigin: input.clientDevOrigin,
  auth: {
    requireLogin: true,
    sessionSecret: config.auth.sessionSecret,
    sessionTtlSeconds: config.auth.sessionTtlSeconds,
    verifyLogin
  },
    isRunning: input.isRunning,
  getContentPageModel: async (pageKey, options) =>
    buildContentPageModel(db, pageKey, {
      ...options,
      includeNlEvaluations: false
    }),
  listContentView: async (viewKey, options) =>
    listContentCards(db, viewKey, {
      ...options,
      includeNlEvaluations: false
    }),
  listContentSources: async () => listContentSources(db),
  saveContentFeedback: async (contentItemId, input) => saveFeedbackPoolEntry(db, { contentItemId, ...input }),
  listRatingDimensions: async () => listRatingDimensions(db),
  saveRatings: async (contentItemId, scores) => saveRatings(db, contentItemId, scores),
  getViewRulesWorkbenchData: async () => getViewRulesWorkbenchData(),
  saveContentFilterRule: async (input) => saveContentFilterRule(input),
  saveProviderSettings: async (input) =>
    persistProviderSettings(db, input, {
      settingsMasterKey: config.llm?.settingsMasterKey ?? null
    }),
  updateProviderSettingsActivation: async (input) => persistProviderSettingsActivation(db, input),
  deleteProviderSettings: async (providerKind: string) => {
    const normalizedProviderKind = providerKind.trim();

    if (
      normalizedProviderKind !== "deepseek" &&
      normalizedProviderKind !== "minimax" &&
      normalizedProviderKind !== "kimi"
    ) {
      return false;
    }

    return removeProviderSettings(db, normalizedProviderKind);
  },
  deleteFeedbackEntry: async (feedbackId) => deleteFeedbackPoolEntry(db, feedbackId),
  clearAllFeedback: async () => clearFeedbackPool(db),
  listSources: async () => listSourceWorkbench(db),
  getSourcesOperationSummary: async () => readSourcesOperationSummary(db),
  createSource: async (input) => await saveAndHydrateSource(input),
  updateSource: async (input) => await saveAndHydrateSource(input),
  deleteSource: async (kind) => removeSource(db, kind),
  toggleSource: async (kind, enable) => persistSourceToggle(db, kind, enable),
  updateSourceDisplayMode: async (kind, showAllWhenSelected) =>
    persistSourceDisplayMode(db, kind, showAllWhenSelected),
  listTwitterAccounts: async () => listTwitterAccounts(db),
  listTwitterSearchKeywords: async () => listTwitterSearchKeywords(db),
  listHackerNewsQueries: async () => listHackerNewsQueries(db),
  listBilibiliQueries: async () => listBilibiliQueries(db),
  listWechatRssSources: async () => listWechatRssSources(db),
  getWeiboTrendingState: async () => readWeiboTrendingRunState(db),
  readAiTimelinePage: async (query) => await readAiTimelineFeedPageModel(config.aiTimelineFeed, query),
  createTwitterAccount: async (input) => persistTwitterAccount(db, input),
  updateTwitterAccount: async (input) => persistTwitterAccountUpdate(db, input),
  deleteTwitterAccount: async (id) => removeTwitterAccount(db, id),
  toggleTwitterAccount: async (id, enable) => persistTwitterAccountToggle(db, id, enable),
  createTwitterSearchKeyword: async (input) => persistTwitterSearchKeyword(db, input),
  updateTwitterSearchKeyword: async (input) => persistTwitterSearchKeywordUpdate(db, input),
  deleteTwitterSearchKeyword: async (id) => removeTwitterSearchKeyword(db, id),
  toggleTwitterSearchKeywordCollect: async (id, enable) =>
    persistTwitterSearchKeywordCollectToggle(db, id, enable),
  toggleTwitterSearchKeywordVisible: async (id, enable) =>
    persistTwitterSearchKeywordVisibleToggle(db, id, enable),
  createHackerNewsQuery: async (input) => persistHackerNewsQuery(db, input),
  updateHackerNewsQuery: async (input) => persistHackerNewsQueryUpdate(db, input),
  deleteHackerNewsQuery: async (id) => removeHackerNewsQuery(db, id),
  toggleHackerNewsQuery: async (id, enable) => persistHackerNewsQueryToggle(db, id, enable),
  createBilibiliQuery: async (input) => persistBilibiliQuery(db, input),
  updateBilibiliQuery: async (input) => persistBilibiliQueryUpdate(db, input),
  deleteBilibiliQuery: async (id) => removeBilibiliQuery(db, id),
  toggleBilibiliQuery: async (id, enable) => persistBilibiliQueryToggle(db, id, enable),
  createWechatRssSources: async (input) => persistWechatRssSources(db, input),
  updateWechatRssSource: async (input) => persistWechatRssSourceUpdate(db, input),
  deleteWechatRssSource: async (id) => removeWechatRssSource(db, id),
    hasTwitterApiKey: input.hasTwitterApiKey,
    triggerManualTwitterCollect: input.triggerManualTwitterCollect,
    triggerManualTwitterKeywordCollect: input.triggerManualTwitterKeywordCollect,
    triggerManualHackerNewsCollect: input.triggerManualHackerNewsCollect,
    triggerManualBilibiliCollect: input.triggerManualBilibiliCollect,
    triggerManualWechatRssCollect: input.triggerManualWechatRssCollect,
    triggerManualWeiboTrendingCollect: input.triggerManualWeiboTrendingCollect,
    triggerManualJuyaCollect: input.triggerManualJuyaCollect,
  getCurrentUserProfile: async () => getCurrentUserProfile(),
  updatePassword: async (newPassword: string) => {
    const newHash = hashPassword(newPassword);
    db.prepare("UPDATE user_profile SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1").run(newHash);
  },
  pushArticleToWechatDraft: async (articleId: number, themeId: string, wechatHtml?: string, onProgress?: (step: string, status: "running" | "done" | "error", detail?: string) => void) =>
    pushArticleToWechatDraft({
      db,
      articleId,
      themeId: themeId as WechatThemeId,
      wechatHtml,
      masterKey: config.llm?.settingsMasterKey ?? config.auth.sessionSecret,
      onProgress,
    }),
  pushDailyDigestToWechatDraft: async (digestId: number, themeId: string, wechatHtml: string, onProgress?: (step: string, status: "running" | "done" | "error", detail?: string) => void) =>
    pushDailyDigestToWechatDraft({
      db,
      digestId,
      themeId: themeId as WechatThemeId,
      wechatHtml,
      masterKey: config.llm?.settingsMasterKey ?? config.auth.sessionSecret,
      onProgress,
    }),
  getArticleWechatPushLog: (articleId: number) => getArticlePushLog(db, articleId),
  getArticlePushCount: (articleId: number) => getArticlePushCount(db, articleId),
  listWechatMpAccounts: () => listWechatMpAccounts(db),
  saveWechatMpAccount: async (input) =>
    saveWechatMpAccount(db, input, config.llm?.settingsMasterKey ?? config.auth.sessionSecret),
  deleteWechatMpAccount: (id: number) => deleteWechatMpAccount(db, id),
  setDefaultWechatMpAccount: (id: number) => setDefaultWechatMpAccount(db, id),
  listReportSummaries: listStoredReportSummaries,
  latestReportDate: async () => (await listReportDates(config.report.dataDir))[0] ?? null,
  readReportHtml: async (date: string) => await readTextFile(config.report.dataDir, date, "report.html"),
  readAiTimelineFeed: async () => await readAiTimelineFeedFile(config.aiTimelineFeed),
    triggerManualCollect: input.triggerManualCollect,
    triggerManualSendLatestEmail: input.triggerManualSendLatestEmail,
    triggerManualRun: input.triggerManualCollect
  };
}
