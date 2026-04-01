import type { SqliteDatabase } from "../db/openDatabase.js";
import { listContentSources, type ContentSourceOption } from "../source/listContentSources.js";
import {
  buildContentViewSelection,
  type ContentSortMode
} from "./buildContentViewSelection.js";
import type { ContentCardView } from "./listContentView.js";

export type ContentPageKey = "ai-new" | "ai-hot";

export type ContentPageModel = {
  pageKey: ContentPageKey;
  sourceFilter?: {
    options: { kind: string; name: string; showAllWhenSelected: boolean; currentPageVisibleCount: number }[];
    selectedSourceKinds: string[];
  };
  featuredCard: ContentCardView | null;
  cards: ContentCardView[];
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
};

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
    const cards = selection.visibleCards.map(stripRankedCard);
    const visibleCountsBySourceKind = countCurrentPageVisibleCardsBySourceKind(cards);

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
      cards,
      emptyState:
        effectiveSelectedSourceKinds.length === 0
          ? {
              title: "当前未选择任何数据源",
              description: "重新全选后即可恢复内容结果。",
              tone: "filtered"
            }
          : cards.length > 0
            ? null
            : {
                title: pageKey === "ai-new" ? "暂无 AI 新讯" : "暂无 AI 热点",
                description: "可以稍后刷新，或先检查数据源采集状态。",
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
