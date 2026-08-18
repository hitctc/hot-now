import { readAiTimelineApiData } from "../aiTimelineApiData.js";
import {
  aiTimelineEventTypes,
  aiTimelineImportanceLevels,
  aiTimelineReliabilityStatuses,
  aiTimelineVisibilityStatuses,
  type AiTimelineHealthOverview,
  type AiTimelineSourceHealthRecord,
} from "../../core/aiTimeline/aiTimelineTypes.js";
import type { ContentSortMode } from "../../core/content/buildContentViewSelection.js";
import type { ContentCardView } from "../../core/content/listContentView.js";
import type { ContentSourceOption } from "../../core/source/listContentSources.js";
import type { TwitterAccountRecord } from "../../core/twitter/twitterAccountRepository.js";
import type { TwitterSearchKeywordRecord } from "../../core/twitter/twitterSearchKeywordRepository.js";
import type { WechatRssSourceRecord } from "../../core/wechatRss/wechatRssSourceRepository.js";
import type { ContentPageModel } from "../createServer.js";
import type { SitePageDeps, ContentPageKey, SettingsAiTimelineAdminResponse } from "./sitePageRouteShared.js";
import { isMalformedContentStoreError } from "./sitePageSystemHelpers.js";
import type { FastifyRequest } from "fastify";

export async function readContentPageModelApiData(
  deps: SitePageDeps,
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

async function readAiTimelineAdminApiData(deps: SitePageDeps, request: FastifyRequest) {
  return await readAiTimelineApiData({ readAiTimelinePage: deps.readAiTimelinePage }, request);
}

export async function readSettingsAiTimelineAdminApiData(
  deps: SitePageDeps,
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

async function readSettingsAiTimelineHealthOverview(deps: SitePageDeps): Promise<AiTimelineHealthOverview> {
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

async function readSettingsAiTimelineSourceHealth(_deps: SitePageDeps): Promise<AiTimelineSourceHealthRecord[]> {
  return [];
}

async function buildContentPageModelFromDependencies(
  deps: SitePageDeps,
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
