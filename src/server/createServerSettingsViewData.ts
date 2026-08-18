import { readNextCollectionRunAt } from "../core/scheduler/readNextCollectionRunAt.js";
import type {
  BilibiliQuerySettingsView,
  HackerNewsQuerySettingsView,
  ProfileView,
  SourcesSettingsView,
  TwitterAccountSettingsView,
  TwitterSearchKeywordSettingsView,
  ViewRulesWorkbenchView,
  WeiboTrendingSettingsView,
} from "./renderSystemPages.js";
import type { ServerDeps, SourceCard } from "./createServer.js";
import type { WechatRssSourceRecord } from "../core/wechatRss/wechatRssSourceRepository.js";
import { readAuthenticatedSession } from "./createServerSession.js";

/** 把设置页依赖映射成 API 视图模型，避免 createServer 同时承担页面数据编排。 */
export async function readSettingsViewRulesApiData(deps: ServerDeps): Promise<ViewRulesWorkbenchView> {
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

/** 汇总来源、社交账号和下一次采集时间，供设置页和 API 共用。 */
export async function readSettingsSourcesApiData(deps: ServerDeps): Promise<SourcesSettingsView> {
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

/** 只返回前端需要的 profile 字段，并附带当前 session 是否有效。 */
export async function readSettingsProfileApiData(
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
