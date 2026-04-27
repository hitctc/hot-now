import path from "node:path";
import { existsSync } from "node:fs";
import { loadRootEnvFile } from "./core/config/loadRootEnvFile.js";
import { loadRuntimeConfig } from "./core/config/loadRuntimeConfig.js";
import { verifyPassword } from "./core/auth/passwords.js";
import { buildContentPageModel } from "./core/content/buildContentPageModel.js";
import { listContentView as listContentCards } from "./core/content/listContentView.js";
import { createRuntimeDatabase } from "./core/db/createRuntimeDatabase.js";
import { runMigrations } from "./core/db/runMigrations.js";
import { seedInitialData } from "./core/db/seedInitialData.js";
import { checkpointWal } from "./core/db/sqliteHealth.js";
import {
  clearFeedbackPool,
  deleteFeedbackPoolEntry,
  listFeedbackPoolEntries,
  saveFeedbackPoolEntry
} from "./core/feedback/feedbackPoolRepository.js";
import { fetchAndExtractArticle } from "./core/fetch/extractArticle.js";
import {
  deleteProviderSettings as removeProviderSettings,
  listProviderSettingsSummaries,
  saveProviderSettings as persistProviderSettings,
  updateProviderSettingsActivation as persistProviderSettingsActivation
} from "./core/llm/providerSettingsRepository.js";
import { sendDailyEmail } from "./core/mail/sendDailyEmail.js";
import { LatestReportEmailError, sendLatestReportEmail } from "./core/pipeline/sendLatestReportEmail.js";
import { runCollectionCycle } from "./core/pipeline/runCollectionCycle.js";
import { runAiTimelineAlertCycle } from "./core/notifications/runAiTimelineAlertCycle.js";
import { listRatingDimensions, saveRatings } from "./core/ratings/ratingRepository.js";
import type { DailyReportTrigger } from "./core/report/buildDailyReport.js";
import { createRunLock } from "./core/runtime/runLock.js";
import { installGracefulShutdown } from "./core/runtime/installGracefulShutdown.js";
import { startAiTimelineAlertScheduler, startCollectionScheduler, startMailScheduler } from "./core/scheduler/startScheduler.js";
import { listContentSources } from "./core/source/listContentSources.js";
import { listSourceWorkbench } from "./core/source/listSourceWorkbench.js";
import { readSourcesOperationSummary } from "./core/source/readSourcesOperationSummary.js";
import { loadEnabledSourceIssues } from "./core/source/loadEnabledSourceIssues.js";
import { hydrateSourceContent } from "./core/source/hydrateSourceContent.js";
import { runTwitterAccountCollection } from "./core/twitter/runTwitterAccountCollection.js";
import { runTwitterKeywordCollection } from "./core/twitter/runTwitterKeywordCollection.js";
import { runHackerNewsCollection } from "./core/hackernews/runHackerNewsCollection.js";
import { runBilibiliCollection } from "./core/bilibili/runBilibiliCollection.js";
import { runWechatRssCollection } from "./core/wechatRss/runWechatRssCollection.js";
import { readWeiboTrendingRunState, runWeiboTrendingCollection } from "./core/weibo/runWeiboTrendingCollection.js";
import { readAiTimelineFeedFile, readAiTimelineFeedPageModel } from "./core/aiTimeline/aiTimelineFeedFile.js";
import {
  deleteSource as removeSource,
  saveSource as persistSource,
  toggleSource as persistSourceToggle,
  updateSourceDisplayMode as persistSourceDisplayMode
} from "./core/source/sourceMutationRepository.js";
import {
  createTwitterAccount as persistTwitterAccount,
  deleteTwitterAccount as removeTwitterAccount,
  listTwitterAccounts,
  toggleTwitterAccount as persistTwitterAccountToggle,
  updateTwitterAccount as persistTwitterAccountUpdate
} from "./core/twitter/twitterAccountRepository.js";
import {
  createTwitterSearchKeyword as persistTwitterSearchKeyword,
  deleteTwitterSearchKeyword as removeTwitterSearchKeyword,
  listTwitterSearchKeywords,
  toggleTwitterSearchKeywordCollect as persistTwitterSearchKeywordCollectToggle,
  toggleTwitterSearchKeywordVisible as persistTwitterSearchKeywordVisibleToggle,
  updateTwitterSearchKeyword as persistTwitterSearchKeywordUpdate
} from "./core/twitter/twitterSearchKeywordRepository.js";
import {
  createHackerNewsQuery as persistHackerNewsQuery,
  deleteHackerNewsQuery as removeHackerNewsQuery,
  listHackerNewsQueries,
  toggleHackerNewsQuery as persistHackerNewsQueryToggle,
  updateHackerNewsQuery as persistHackerNewsQueryUpdate
} from "./core/hackernews/hackerNewsQueryRepository.js";
import {
  createBilibiliQuery as persistBilibiliQuery,
  deleteBilibiliQuery as removeBilibiliQuery,
  listBilibiliQueries,
  toggleBilibiliQuery as persistBilibiliQueryToggle,
  updateBilibiliQuery as persistBilibiliQueryUpdate
} from "./core/bilibili/bilibiliQueryRepository.js";
import {
  createWechatRssSources as persistWechatRssSources,
  deleteWechatRssSource as removeWechatRssSource,
  listWechatRssSources,
  updateWechatRssSource as persistWechatRssSourceUpdate
} from "./core/wechatRss/wechatRssSourceRepository.js";
import { listReportDates, readTextFile } from "./core/storage/reportStore.js";
import {
  getViewRuleConfig,
  saveViewRuleConfig
} from "./core/viewRules/viewRuleRepository.js";
import { createServer } from "./server/createServer.js";

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

// 本地直接跑 tsx watch src/main.ts 时也要和 npm run dev 一样吃到根目录 .env。
loadRootEnvFile();
const config = await loadRuntimeConfig();
const recoveryDir = path.join(path.dirname(config.database.file), "recovery-backups");
const db = createRuntimeDatabase({
  databaseFile: config.database.file,
  recoveryDir
});
runMigrations(db);
seedInitialData(db, {
  username: config.auth.username,
  password: config.auth.password,
  email: config.smtp.user,
  juyaRssUrl: config.source.rssUrl
});
const lock = createRunLock();
const aiTimelineAlertLock = createRunLock();
const readAdminProfile = db.prepare(
  `
    SELECT username, password_hash, role, display_name
    FROM user_profile
    WHERE id = 1
  `
);
const readCurrentUserProfile = db.prepare(
  `
    SELECT username, role, display_name, email
    FROM user_profile
    WHERE id = 1
  `
);
// Collection runs now stop after report generation so recurring fetches no longer send mail as a side effect.
async function runCollectionTask(triggerType: DailyReportTrigger) {
  return await runCollectionCycle(config, triggerType, {
    db,
    loadEnabledSourceIssues: async () => await loadEnabledSourceIssues(db),
    fetchArticle: fetchAndExtractArticle
  });
}

// Twitter 账号采集单独手动触发，避免把高成本轮询绑进默认 10 分钟节奏。
async function runTwitterAccountCollectionTask() {
  return await runTwitterAccountCollection(db, {
    apiKey: process.env.TWITTER_API_KEY?.trim() || null,
    fetchArticle: fetchAndExtractArticle
  });
}

// Twitter 关键词搜索保持独立手动动作，避免和账号采集一起把 credits 固定烧进默认调度。
async function runTwitterKeywordCollectionTask() {
  return await runTwitterKeywordCollection(db, {
    apiKey: process.env.TWITTER_API_KEY?.trim() || null,
    fetchArticle: fetchAndExtractArticle
  });
}

// Hacker News 搜索第一版只支持手动触发，避免在默认采集节奏里顺手扩大来源范围。
async function runHackerNewsCollectionTask() {
  return await runHackerNewsCollection(db);
}

// B 站搜索第一版也只支持手动触发，先把视频搜索链路验证稳定再考虑调度扩展。
async function runBilibiliCollectionTask() {
  return await runBilibiliCollection(db);
}

// 微信公众号 RSS 由后台单独维护，第一版只手动采集，避免混进普通 RSS 定时轮询。
async function runWechatRssCollectionTask() {
  return await runWechatRssCollection(db, {
    fetchArticle: fetchAndExtractArticle
  });
}

// 微博热搜榜匹配只做热点补充信号，不进默认采集调度。
async function runWeiboTrendingCollectionTask() {
  return await runWeiboTrendingCollection(db);
}

// Latest-email runs reuse the most recent report artifact and keep SMTP concerns out of the collection cadence.
async function runLatestEmailTask() {
  return await sendLatestReportEmail(config, {
    db,
    sendDailyEmail
  });
}

// S-level timeline alerts are checked separately from reports so urgent events do not wait for the daily mail window.
async function runAiTimelineAlertTask() {
  return await runAiTimelineAlertCycle(config, db);
}

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

// Manual collection stays lock-guarded so button clicks share the same exclusion rules as scheduled jobs.
const triggerManualCollect = config.manualActions.collectEnabled
  ? async () => {
      await lock.runExclusive(async () => {
        await runCollectionTask("manual");
      });

      return { accepted: true as const, action: "collect" as const };
    }
  : undefined;

// Manual resend normalizes known pipeline failures into machine-readable reasons for the HTTP layer.
const triggerManualSendLatestEmail = config.manualActions.sendLatestEmailEnabled
  ? async () => {
      return await lock.runExclusive(async () => {
        try {
          await runLatestEmailTask();
          return { accepted: true as const, action: "send-latest-email" as const };
        } catch (error) {
          if (error instanceof LatestReportEmailError) {
            return { accepted: false as const, reason: error.reason };
          }

          throw error;
        }
      });
    }
  : undefined;

// Twitter 手动采集复用同一把运行锁，但不会触发 RSS/公众号采集，也不会生成日报产物。
const triggerManualTwitterCollect = config.manualActions.collectEnabled
  ? async () => {
      return await lock.runExclusive(async () => await runTwitterAccountCollectionTask());
    }
  : undefined;

// 关键词搜索和账号采集共用运行锁，但继续保持独立按钮和独立结果摘要。
const triggerManualTwitterKeywordCollect = config.manualActions.collectEnabled
  ? async () => {
      return await lock.runExclusive(async () => await runTwitterKeywordCollectionTask());
    }
  : undefined;

// Hacker News 搜索和其他手动采集共用同一把运行锁，但继续保持独立入口和独立结果摘要。
const triggerManualHackerNewsCollect = config.manualActions.collectEnabled
  ? async () => {
      return await lock.runExclusive(async () => await runHackerNewsCollectionTask());
    }
  : undefined;

// B 站搜索与 HN 一样先走独立手动入口，避免默认采集节奏无意扩大到视频搜索。
const triggerManualBilibiliCollect = config.manualActions.collectEnabled
  ? async () => {
      return await lock.runExclusive(async () => await runBilibiliCollectionTask());
    }
  : undefined;

// 公众号 RSS 和其他扩展来源一样只走手动入口，避免新增链接后立刻进入默认调度。
const triggerManualWechatRssCollect = config.manualActions.collectEnabled
  ? async () => {
      return await lock.runExclusive(async () => await runWechatRssCollectionTask());
    }
  : undefined;

// 微博热搜榜匹配和其他搜索来源共用运行锁，但继续保持单独入口和单独结果摘要。
const triggerManualWeiboTrendingCollect = config.manualActions.collectEnabled
  ? async () => {
      return await lock.runExclusive(async () => await runWeiboTrendingCollectionTask());
    }
  : undefined;

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

const app = createServer({
  config,
  clientDevOrigin: process.env.HOT_NOW_CLIENT_DEV_ORIGIN?.trim() || undefined,
  auth: {
    requireLogin: true,
    sessionSecret: config.auth.sessionSecret,
    verifyLogin
  },
  isRunning: () => lock.isRunning(),
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
  hasTwitterApiKey: Boolean(process.env.TWITTER_API_KEY?.trim()),
  triggerManualTwitterCollect,
  triggerManualTwitterKeywordCollect,
  triggerManualHackerNewsCollect,
  triggerManualBilibiliCollect,
  triggerManualWechatRssCollect,
  triggerManualWeiboTrendingCollect,
  getCurrentUserProfile: async () => getCurrentUserProfile(),
  listReportSummaries: listStoredReportSummaries,
  latestReportDate: async () => (await listReportDates(config.report.dataDir))[0] ?? null,
  readReportHtml: async (date: string) => await readTextFile(config.report.dataDir, date, "report.html"),
  readAiTimelineFeed: async () => await readAiTimelineFeedFile(config.aiTimelineFeed),
  triggerManualCollect,
  triggerManualSendLatestEmail,
  triggerManualRun: triggerManualCollect
});

const clientIndexPath = path.resolve(process.cwd(), "dist/client/index.html");

if (!existsSync(clientIndexPath)) {
  app.log.warn(
    { clientIndexPath },
    "未找到客户端入口文件，/settings/* 将回退到最小 HTML 兜底，请先执行 npm run build:client"
  );
}

const collectionScheduler = startCollectionScheduler(config, async () => {
  try {
    await lock.runExclusive(async () => {
      await runCollectionTask("scheduled");
    });
  } catch (error) {
    app.log.error(error);
  }
});

const mailScheduler = startMailScheduler(config, async () => {
  try {
    await lock.runExclusive(async () => {
      await runLatestEmailTask();
    });
  } catch (error) {
    app.log.error(error);
  }
});

const aiTimelineAlertScheduler = startAiTimelineAlertScheduler(config, async () => {
  try {
    const result = await aiTimelineAlertLock.runExclusive(async () => await runAiTimelineAlertTask());

    if (result.notifiedEventCount > 0 || result.failedEventCount > 0) {
      app.log.info(result, "AI timeline S-level alert cycle finished");
    }
  } catch (error) {
    app.log.error(error);
  }
});

await app.listen({ host: "127.0.0.1", port: resolveListenPort(process.env.PORT, config.server.port) });
installGracefulShutdown({
  process,
  exit: (code) => process.exit(code),
  logger: {
    info: (context, message) => app.log.info(context, message),
    error: (context, message) => app.log.error(context, message)
  },
  scheduledTasks: [collectionScheduler, mailScheduler, aiTimelineAlertScheduler],
  waitForIdle: async () => {
    // 当前版本只需要等采集、发信和 S 级提醒任务收口，LLM 相关运行时已经不再参与主链路。
    while (lock.isRunning() || aiTimelineAlertLock.isRunning()) {
      await wait(100);
    }
  },
  closeServer: async () => {
    await app.close();
  },
  checkpointDatabase: () => {
    checkpointWal(db);
  },
  closeDatabase: () => {
    if (db.open) {
      db.close();
    }
  },
  signals: ["SIGINT", "SIGTERM", "SIGUSR2"]
});

function resolveListenPort(envPort: string | undefined, fallbackPort: number): number {
  // Tests can bind to an ephemeral port with PORT=0 while production keeps the configured fixed port.
  if (!envPort) {
    return fallbackPort;
  }

  const port = Number(envPort);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${envPort}`);
  }

  return port;
}

function wait(ms: number) {
  // Polling is enough here because shutdown happens rarely and only needs a small idle wait.
  return new Promise((resolve) => setTimeout(resolve, ms));
}
