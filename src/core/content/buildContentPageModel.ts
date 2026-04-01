import type { SqliteDatabase } from "../db/openDatabase.js";
import { listContentSources, type ContentSourceOption } from "../source/listContentSources.js";
import {
  buildContentViewSelection,
  type ContentSortMode,
  type RankedContentCardView
} from "./buildContentViewSelection.js";
import type { ContentCardView } from "./listContentView.js";

export type ContentPageKey = "ai-new" | "ai-hot";

export type ContentPageModel = {
  pageKey: ContentPageKey;
  sourceFilter?: {
    options: { kind: string; name: string; showAllWhenSelected: boolean }[];
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
    const featuredRankedCard = pageKey === "ai-new" ? selectFeaturedCard(selection.visibleCards) : null;
    const featuredCard = featuredRankedCard ? stripRankedCard(featuredRankedCard) : null;
    const cards = selection.visibleCards
      .filter((card) => card.id !== featuredRankedCard?.id)
      .map(stripRankedCard);

    return {
      pageKey,
      sourceFilter:
        sourceOptions.length > 0
          ? {
              options: sourceOptions.map((source) => ({
                kind: source.kind,
                name: source.name,
                showAllWhenSelected: source.showAllWhenSelected
              })),
              selectedSourceKinds: effectiveSelectedSourceKinds
            }
          : undefined,
      featuredCard,
      cards,
      emptyState:
        effectiveSelectedSourceKinds.length === 0
          ? {
              title: "当前未选择任何数据源",
              description: "重新全选后即可恢复内容结果。",
              tone: "filtered"
            }
          : featuredCard || cards.length > 0
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

// 首条精选只从被 hero 正向命中的候选里挑；如果没人命中，就回退到当前排序第一条。
export function selectFeaturedCard(cards: RankedContentCardView[]): RankedContentCardView | null {
  const heroPreferred = cards
    .filter((card) => card.heroDecision === "boost" && card.heroScoreDelta > 0)
    .sort((left, right) => right.heroScoreDelta - left.heroScoreDelta);

  return heroPreferred[0] ?? cards[0] ?? null;
}

function stripRankedCard({
  rankingScore: _rankingScore,
  rankingTimestamp: _rankingTimestamp,
  heroDecision: _heroDecision,
  heroScoreDelta: _heroScoreDelta,
  ...card
}: RankedContentCardView): ContentCardView {
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

function isMalformedContentStoreError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("database disk image is malformed") || error.message.includes("file is not a database") ||
    (error as Error & { code?: string }).code === "SQLITE_CORRUPT" ||
    (error as Error & { code?: string }).code === "SQLITE_NOTADB";
}
