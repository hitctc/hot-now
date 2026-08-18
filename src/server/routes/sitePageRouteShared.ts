import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SessionUser } from "../../core/auth/session.js";
import type { SqliteDatabase } from "../../core/db/openDatabase.js";
import type {
  AiTimelineHealthOverview,
  AiTimelinePageModel,
  AiTimelineSourceHealthRecord,
} from "../../core/aiTimeline/aiTimelineTypes.js";
import type { ServerDeps } from "../createServer.js";

export type ContentPageKey = "ai-new" | "ai-hot";

export type SettingsAiTimelineAdminResponse = {
  overview: AiTimelineHealthOverview;
  sources: AiTimelineSourceHealthRecord[];
  options: {
    eventTypes: readonly string[];
    importanceLevels: readonly string[];
    visibilityStatuses: readonly string[];
    reliabilityStatuses: readonly string[];
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

/** 站点路由只接收页面所需的装配回调，不持有完整服务入口。 */
export type SitePageDeps = Pick<
  ServerDeps,
  | "auth"
  | "clientBuildRoot"
  | "clientDevOrigin"
  | "config"
  | "db"
  | "getContentPageModel"
  | "getCurrentUserProfile"
  | "getSourcesOperationSummary"
  | "getViewRulesWorkbenchData"
  | "isRunning"
  | "latestReportDate"
  | "listContentSources"
  | "listContentView"
  | "listSources"
  | "listTwitterAccounts"
  | "listTwitterSearchKeywords"
  | "listHackerNewsQueries"
  | "listBilibiliQueries"
  | "listWechatRssSources"
  | "getWeiboTrendingState"
  | "readAiTimelinePage"
  | "listReportSummaries"
  | "readClientDevEntryHtml"
  | "readReportHtml"
  | "triggerManualCollect"
  | "triggerManualRun"
  | "triggerManualSendLatestEmail"
  | "triggerManualTwitterCollect"
  | "triggerManualTwitterKeywordCollect"
>;

export interface SitePageRouteOptions extends SitePageDeps {
  creativeApiToken?: string;
  authorizeCreativeApiToken: (request: FastifyRequest, reply: FastifyReply) => boolean;
  readSession: (cookieHeader: string | undefined) => SessionUser | null;
}

export type SitePageRouteContext = {
  app: FastifyInstance;
  options: SitePageRouteOptions;
  deps: SitePageDeps;
  authConfig: SitePageRouteOptions["auth"];
  authEnabled: boolean;
  db: SqliteDatabase | undefined;
  hasUnifiedShellDeps: boolean;
  siteCss: string;
  siteJs: string;
  clientBuildRoot: string;
  clientIndexPath: string;
  clientDevOrigin: string | null;
};
