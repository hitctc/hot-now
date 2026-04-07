import type { SqliteDatabase } from "../db/openDatabase.js";
import { listContentSources, type ContentSourceOption } from "../source/listContentSources.js";
import {
  buildContentViewSelection,
  type ContentSortMode
} from "./buildContentViewSelection.js";
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
  featuredCard: ContentCardView | null;
  cards: ContentCardView[];
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
  sortMode?: ContentSortMode;
  page?: number;
};

const contentPageSize = 50;

// 内容页模型在这里统一拼装，避免 server route 再复制一套精选卡、来源筛选和空态判断。
export function buildContentPageModel(
  db: SqliteDatabase,
  pageKey: ContentPageKey,
  options: BuildContentPageModelOptions = {}
): ContentPageModel {
  const sourceOptions = listContentSources(db).filter((source) => source.isEnabled);
  const selectedSourceKinds = normalizeSelectedSourceKinds(options.selectedSourceKinds, sourceOptions);
  const effectiveSelectedSourceKinds = selectedSourceKinds ?? deriveDefaultSelectedSourceKinds(sourceOptions);

  try {
    const selection = buildContentViewSelection(db, pageKey === "ai-hot" ? "hot" : "ai", {
      includeNlEvaluations: options.includeNlEvaluations,
      selectedSourceKinds: effectiveSelectedSourceKinds,
      sortMode: options.sortMode ?? "published_at"
    });
    const allCards = selection.visibleCards.map(stripRankedCard);
    const pagination = paginateContentCards(allCards, options.page);
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
      // 客户端内容页已经不再拆首条精选卡，这里保留空字段只为了兼容现有接口模型。
      featuredCard: null,
      cards: pagination.cards,
      pagination: pagination.meta,
      emptyState:
        effectiveSelectedSourceKinds.length === 0
          ? {
              title: "当前未选择任何数据源",
              description: "重新全选后即可恢复内容结果。",
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
      featuredCard: null,
      cards: [],
      pagination: null,
      emptyState: {
        title: "内容暂不可用",
        description: "检测到本地内容库读取失败，请修复或重建 data/hot-now.sqlite 后再刷新。",
        tone: "degraded"
      }
    };
  }
}

function stripRankedCard({
  rankingScore: _rankingScore,
  rankingTimestamp: _rankingTimestamp,
  ...card
}: ReturnType<typeof buildContentViewSelection>["visibleCards"][number]): ContentCardView {
  return card;
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
