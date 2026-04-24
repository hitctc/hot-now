import type { SqliteDatabase } from "../db/openDatabase.js";
import { getViewRuleConfig, type ViewRuleConfig } from "../viewRules/viewRuleRepository.js";
import { listContentSources, type ContentSourceOption } from "../source/listContentSources.js";
import { listBilibiliQueries } from "../bilibili/bilibiliQueryRepository.js";
import { listHackerNewsQueries } from "../hackernews/hackerNewsQueryRepository.js";
import { listTwitterAccounts, type TwitterAccountRecord } from "../twitter/twitterAccountRepository.js";
import { listTwitterSearchKeywords, type TwitterSearchKeywordRecord } from "../twitter/twitterSearchKeywordRepository.js";
import {
  buildContentViewSelection,
  type ContentSortMode
} from "./buildContentViewSelection.js";
import { hasContentItemsForSourceKind } from "./contentRepository.js";
import type { ContentCardView } from "./listContentView.js";

export type ContentPageKey = "ai-new" | "ai-hot";

export type ContentPagination = {
  page: number;
  pageSize: number;
  totalResults: number;
  totalPages: number;
};

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
  featuredCard: ContentCardView | null;
  cards: ContentCardView[];
  strategySummary: {
    pageKey: ContentPageKey;
    items: string[];
  };
  pagination: ContentPagination | null;
  emptyState: {
    title: string;
    description: string;
    tone: "default" | "degraded" | "filtered";
  } | null;
};

export type BuildContentPageModelOptions = {
  includeNlEvaluations?: boolean;
  selectedSourceKinds?: string[];
  selectedTwitterAccountIds?: number[];
  selectedTwitterKeywordIds?: number[];
  sortMode?: ContentSortMode;
  page?: number;
  searchKeyword?: string;
};

const contentPageSize = 50;
const twitterAccountsSourceKind = "twitter_accounts";
const twitterKeywordSearchSourceKind = "twitter_keyword_search";
const hackerNewsSourceKind = "hackernews_search";
const bilibiliSourceKind = "bilibili_search";
const weiboTrendingSourceKind = "weibo_trending";

// 内容页模型在这里统一拼装，避免 server route 再复制一套精选卡、来源筛选和空态判断。
export function buildContentPageModel(
  db: SqliteDatabase,
  pageKey: ContentPageKey,
  options: BuildContentPageModelOptions = {}
): ContentPageModel {
  const twitterAccounts = listTwitterAccounts(db);
  const twitterKeywords = listTwitterSearchKeywords(db);
  const hackerNewsQueries = listHackerNewsQueries(db);
  const bilibiliQueries = listBilibiliQueries(db);
  const hasHackerNewsContent = hasContentItemsForSourceKind(db, hackerNewsSourceKind);
  const hasBilibiliContent = hasContentItemsForSourceKind(db, bilibiliSourceKind);
  const hasWeiboTrendingContent = pageKey === "ai-hot" && hasContentItemsForSourceKind(db, weiboTrendingSourceKind);
  const sourceOptions = buildContentPageSourceOptions(
    listContentSources(db).filter((source) => source.isEnabled),
    twitterAccounts,
    twitterKeywords,
    hackerNewsQueries.length > 0 || hasHackerNewsContent,
    bilibiliQueries.length > 0 || hasBilibiliContent,
    hasWeiboTrendingContent
  );
  const selectedSourceKinds = normalizeSelectedSourceKinds(options.selectedSourceKinds, sourceOptions);
  const effectiveSelectedSourceKinds = selectedSourceKinds ?? deriveDefaultSelectedSourceKinds(sourceOptions);
  const twitterAccountFilter = buildTwitterAccountFilterModel(
    twitterAccounts,
    options.selectedTwitterAccountIds
  );
  const twitterKeywordFilter = buildTwitterKeywordFilterModel(
    twitterKeywords,
    options.selectedTwitterKeywordIds
  );

  const viewRuleKey = pageKey === "ai-hot" ? "hot" : "ai";
  const viewRuleConfig = getViewRuleConfig(db, viewRuleKey);

  try {
    const selection = buildContentViewSelection(db, viewRuleKey, {
      includeNlEvaluations: options.includeNlEvaluations,
      selectedSourceKinds: effectiveSelectedSourceKinds,
      selectedTwitterAccountIds:
        effectiveSelectedSourceKinds.includes(twitterAccountsSourceKind)
          ? twitterAccountFilter?.selectedAccountIds
          : undefined,
      selectedTwitterKeywordIds:
        effectiveSelectedSourceKinds.includes(twitterKeywordSearchSourceKind)
          ? twitterKeywordFilter?.selectedKeywordIds
          : undefined,
      sortMode: options.sortMode ?? "published_at",
      ruleConfig: viewRuleConfig
    });
    const allCards = selection.visibleCards.map(stripRankedCard);
    const filteredCards = filterCardsByTitleKeyword(allCards, options.searchKeyword);
    const pagination = paginateContentCards(filteredCards, options.page);
    const visibleCountsBySourceKind = countCurrentPageVisibleCardsBySourceKind(pagination.cards);

    return {
      pageKey,
      sourceFilter:
        sourceOptions.length > 0
          ? {
              options: sourceOptions.map((source) => ({
                kind: source.kind,
                name: source.name,
                showAllWhenSelected: source.showAllWhenSelected,
                currentPageVisibleCount: visibleCountsBySourceKind[source.kind] ?? 0
              })),
              selectedSourceKinds: effectiveSelectedSourceKinds
            }
          : undefined,
      twitterAccountFilter,
      twitterKeywordFilter,
      // 客户端内容页已经不再拆首条精选卡，这里保留空字段只为了兼容现有接口模型。
      featuredCard: null,
      cards: pagination.cards,
      strategySummary: buildStrategySummary(pageKey, viewRuleConfig),
      pagination: pagination.meta,
      emptyState:
        effectiveSelectedSourceKinds.length === 0
          ? {
              title: "当前未选择任何数据源",
              description: "重新全选后即可恢复内容结果。",
              tone: "filtered"
            }
          : hasSearchKeyword(options.searchKeyword) && pagination.meta.totalResults === 0
            ? {
                title: "没有找到匹配的内容",
                description: "可以换个关键词，或清空搜索后查看全部结果。",
                tone: "filtered"
              }
          : pagination.meta.totalResults > 0
            ? null
            : {
                title: pageKey === "ai-new" ? "当前 24 小时内暂无 AI 新讯" : "暂无 AI 热点",
                description: pageKey === "ai-new"
                  ? "可以稍后刷新，或者检查最近 24 小时内是否有新的 AI 内容进入内容池。"
                  : "可以稍后刷新，或先检查数据源采集状态。",
                tone: "default"
              }
    };
  } catch (error) {
    if (!isMalformedContentStoreError(error)) {
      throw error;
    }

    return {
      pageKey,
      sourceFilter:
        sourceOptions.length > 0
          ? {
              options: sourceOptions.map((source) => ({
                kind: source.kind,
                name: source.name,
                showAllWhenSelected: source.showAllWhenSelected,
                currentPageVisibleCount: 0
              })),
              selectedSourceKinds: effectiveSelectedSourceKinds
            }
          : undefined,
      twitterAccountFilter,
      twitterKeywordFilter,
      featuredCard: null,
      cards: [],
      strategySummary: buildStrategySummary(pageKey, viewRuleConfig),
      pagination: null,
      emptyState: {
        title: "内容暂不可用",
        description: "检测到本地内容库读取失败，请修复或重建 data/hot-now.sqlite 后再刷新。",
        tone: "degraded"
      }
    };
  }
}

function buildStrategySummary(pageKey: ContentPageKey, viewRuleConfig: ViewRuleConfig["config"]) {
  const items = pageKey === "ai-new"
    ? [
        `只看最近 24 小时 ${formatToggleStatus(viewRuleConfig.enableTimeWindow)}`,
        `AI 新讯重点来源优先 ${formatToggleStatus(viewRuleConfig.enableSourceViewBonus)}`,
        `AI 内容优先 ${formatToggleStatus(viewRuleConfig.enableAiKeywordWeight)}`,
        `热点词优先 ${formatToggleStatus(viewRuleConfig.enableHeatKeywordWeight)}`,
        `按综合分排序 ${formatToggleStatus(viewRuleConfig.enableScoreRanking)}`
      ]
    : [
        `AI 热点重点来源优先 ${formatToggleStatus(viewRuleConfig.enableSourceViewBonus)}`,
        `AI 内容优先 ${formatToggleStatus(viewRuleConfig.enableAiKeywordWeight)}`,
        `热点词优先 ${formatToggleStatus(viewRuleConfig.enableHeatKeywordWeight)}`,
        `新内容优先 ${formatToggleStatus(viewRuleConfig.enableFreshnessWeight)}`,
        `按综合分排序 ${formatToggleStatus(viewRuleConfig.enableScoreRanking)}`
      ];

  return {
    pageKey,
    items
  };
}

function formatToggleStatus(enabled: boolean) {
  return enabled ? "开" : "关";
}

function stripRankedCard({
  rankingScore: _rankingScore,
  rankingTimestamp: _rankingTimestamp,
  ...card
}: ReturnType<typeof buildContentViewSelection>["visibleCards"][number]): ContentCardView {
  return card;
}

// 搜索只作用在标题文本；这里会把关键词规范化后做大小写不敏感的包含匹配。
function filterCardsByTitleKeyword(cards: ContentCardView[], keyword: string | undefined) {
  const normalizedKeyword = normalizeSearchKeyword(keyword);

  if (!normalizedKeyword) {
    return cards;
  }

  return cards.filter((card) => card.title.toLowerCase().includes(normalizedKeyword));
}

function paginateContentCards(cards: ContentCardView[], requestedPage: number | undefined) {
  // 内容页统一先拿完整结果集，再做固定 50 条的分页切片，避免把分页语义混进策略层。
  const totalResults = cards.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / contentPageSize));
  const page = Math.min(normalizeRequestedPage(requestedPage), totalPages);
  const startIndex = (page - 1) * contentPageSize;

  return {
    cards: cards.slice(startIndex, startIndex + contentPageSize),
    meta: {
      page,
      pageSize: contentPageSize,
      totalResults,
      totalPages
    }
  };
}

function normalizeRequestedPage(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }

  const normalized = Math.floor(value);
  return normalized >= 1 ? normalized : 1;
}

// 这个 helper 统一判断关键词是否有效，避免不同空白输入在空态逻辑里出现分歧。
function hasSearchKeyword(keyword: string | undefined) {
  return normalizeSearchKeyword(keyword) !== "";
}

// 关键词会在入口统一 trim + lowercase，空串会按“未开启搜索”处理。
function normalizeSearchKeyword(keyword: string | undefined) {
  if (typeof keyword !== "string") {
    return "";
  }

  return keyword.trim().toLowerCase();
}

function normalizeSelectedSourceKinds(selectedSourceKinds: string[] | undefined, sourceOptions: ContentSourceOption[]) {
  if (!selectedSourceKinds) {
    return undefined;
  }

  const enabledSourceKinds = new Set(sourceOptions.map((source) => source.kind));

  return selectedSourceKinds.filter((kind, index, array) => enabledSourceKinds.has(kind) && array.indexOf(kind) === index);
}

function deriveDefaultSelectedSourceKinds(sourceOptions: ContentSourceOption[]): string[] {
  return sourceOptions.filter((source) => !source.showAllWhenSelected).map((source) => source.kind);
}

function buildContentPageSourceOptions(
  sourceOptions: ContentSourceOption[],
  twitterAccounts: TwitterAccountRecord[],
  twitterKeywords: TwitterSearchKeywordRecord[],
  hasHackerNews: boolean,
  hasBilibili: boolean,
  hasWeiboTrending: boolean
): ContentSourceOption[] {
  const nextOptions = [...sourceOptions];

  if (twitterAccounts.length > 0) {
    nextOptions.push({
      kind: twitterAccountsSourceKind,
      name: "Twitter 账号",
      isEnabled: true,
      showAllWhenSelected: false
    });
  }

  if (twitterKeywords.length > 0) {
    nextOptions.push({
      kind: twitterKeywordSearchSourceKind,
      name: "Twitter 关键词搜索",
      isEnabled: true,
      showAllWhenSelected: false
    });
  }

  if (hasHackerNews) {
    nextOptions.push({
      kind: hackerNewsSourceKind,
      name: "Hacker News",
      isEnabled: true,
      showAllWhenSelected: false
    });
  }

  if (hasBilibili) {
    nextOptions.push({
      kind: bilibiliSourceKind,
      name: "B 站搜索",
      isEnabled: true,
      showAllWhenSelected: false
    });
  }

  if (hasWeiboTrending) {
    nextOptions.push({
      kind: weiboTrendingSourceKind,
      name: "微博热搜",
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

  return {
    options: accounts.map((account) => ({
      id: account.id,
      label: account.displayName,
      username: account.username
    })),
    selectedAccountIds: normalizeSelectedEntityIds(selectedAccountIds, accounts.map((account) => account.id))
  };
}

function buildTwitterKeywordFilterModel(
  keywords: TwitterSearchKeywordRecord[],
  selectedKeywordIds: number[] | undefined
) {
  if (keywords.length === 0) {
    return undefined;
  }

  return {
    options: keywords.map((keyword) => ({
      id: keyword.id,
      label: keyword.keyword
    })),
    selectedKeywordIds: normalizeSelectedEntityIds(selectedKeywordIds, keywords.map((keyword) => keyword.id))
  };
}

function normalizeSelectedEntityIds(selectedIds: number[] | undefined, availableIds: number[]) {
  const availableIdSet = new Set(availableIds);

  if (!selectedIds) {
    return availableIds;
  }

  return selectedIds.filter((id, index, array) => availableIdSet.has(id) && array.indexOf(id) === index);
}

function countCurrentPageVisibleCardsBySourceKind(cards: ContentCardView[]) {
  // 内容页来源胶囊现在直接反映当前卡片流里各来源真实占了多少条，不再回退单来源稳定口径。
  const counts = new Map<string, number>();

  for (const card of cards) {
    if (!card.sourceKind) {
      continue;
    }

    counts.set(card.sourceKind, (counts.get(card.sourceKind) ?? 0) + 1);
  }

  return Object.fromEntries(counts.entries());
}

function isMalformedContentStoreError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("database disk image is malformed") || error.message.includes("file is not a database") ||
    (error as Error & { code?: string }).code === "SQLITE_CORRUPT" ||
    (error as Error & { code?: string }).code === "SQLITE_NOTADB";
}
