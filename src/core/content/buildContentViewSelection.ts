import type { SqliteDatabase } from "../db/openDatabase.js";
import { scoreContentItem, type ContentScoreBreakdown } from "./contentScoring.js";
import { BUILTIN_SOURCES } from "../source/sourceCatalog.js";
import {
  getInternalViewRuleConfig,
  type ViewRuleConfigValues
} from "../viewRules/viewRuleConfig.js";
import type { ContentCardView, ContentViewKey } from "./listContentView.js";
import type { NlEvaluationDecision } from "../strategy/nlEvaluationRepository.js";
import type { StrategyGateScope } from "../strategy/strategyGateScopes.js";

export type ContentViewSelectionOptions = {
  includeNlEvaluations?: boolean;
  selectedSourceKinds?: string[];
  referenceTime?: Date;
  limitOverride?: number;
  sortMode?: ContentSortMode;
};

export type ContentSortMode = "published_at" | "content_score";

export type RankedContentCardView = ContentCardView & {
  rankingScore: number;
  rankingTimestamp: string | null;
  heroDecision: NlEvaluationDecision;
  heroScoreDelta: number;
};

export type ContentViewSelection = {
  candidateCards: RankedContentCardView[];
  visibleCards: RankedContentCardView[];
};

type RankedContentCardCandidate = RankedContentCardView & {
  isBlocked: boolean;
  showAllWhenSelected: boolean;
};

type ContentCardRow = {
  id: number;
  title: string;
  summary: string | null;
  bodyMarkdown: string | null;
  sourceName: string;
  sourceKind: string;
  showAllWhenSelected: number;
  canonicalUrl: string;
  publishedAt: string | null;
  favoriteValue: string | null;
  reactionValue: string | null;
  feedbackEntryId: number | null;
  feedbackFreeText: string | null;
  feedbackSuggestedEffect: string | null;
  feedbackStrengthLevel: string | null;
  feedbackPositiveKeywordsJson: string | null;
  feedbackNegativeKeywordsJson: string | null;
  rankingTimestamp: string | null;
  baseDecision: string | null;
  baseScoreDelta: number | null;
  viewDecision: string | null;
  viewScoreDelta: number | null;
  heroDecision: string | null;
  heroScoreDelta: number | null;
};

const matchingSourceViewBonus = 120;

const contentSelectSql = `
  WITH latest_favorite AS (
    SELECT content_item_id, feedback_value
    FROM (
      SELECT
        content_item_id,
        feedback_value,
        ROW_NUMBER() OVER (
          PARTITION BY content_item_id
          ORDER BY datetime(created_at) DESC, id DESC
        ) AS row_num
      FROM content_feedback
      WHERE feedback_kind = 'favorite'
    ) ranked_favorite
    WHERE ranked_favorite.row_num = 1
  ),
  latest_reaction AS (
    SELECT content_item_id, feedback_value
    FROM (
      SELECT
        content_item_id,
        feedback_value,
        ROW_NUMBER() OVER (
          PARTITION BY content_item_id
          ORDER BY datetime(created_at) DESC, id DESC
        ) AS row_num
      FROM content_feedback
      WHERE feedback_kind = 'reaction'
    ) ranked_reaction
    WHERE ranked_reaction.row_num = 1
  )
  SELECT
    ci.id AS id,
    ci.title AS title,
    ci.summary AS summary,
    ci.body_markdown AS bodyMarkdown,
    cs.name AS sourceName,
    cs.kind AS sourceKind,
    cs.show_all_when_selected AS showAllWhenSelected,
    ci.canonical_url AS canonicalUrl,
    ci.published_at AS publishedAt,
    latest_favorite.feedback_value AS favoriteValue,
    latest_reaction.feedback_value AS reactionValue,
    fp.id AS feedbackEntryId,
    fp.free_text AS feedbackFreeText,
    fp.suggested_effect AS feedbackSuggestedEffect,
    fp.strength_level AS feedbackStrengthLevel,
    fp.positive_keywords_json AS feedbackPositiveKeywordsJson,
    fp.negative_keywords_json AS feedbackNegativeKeywordsJson,
    base_eval.decision AS baseDecision,
    base_eval.score_delta AS baseScoreDelta,
    view_eval.decision AS viewDecision,
    view_eval.score_delta AS viewScoreDelta,
    hero_eval.decision AS heroDecision,
    hero_eval.score_delta AS heroScoreDelta,
    COALESCE(ci.published_at, ci.fetched_at, ci.created_at) AS rankingTimestamp
  FROM content_items ci
  JOIN content_sources cs ON cs.id = ci.source_id
  LEFT JOIN latest_favorite ON latest_favorite.content_item_id = ci.id
  LEFT JOIN latest_reaction ON latest_reaction.content_item_id = ci.id
  LEFT JOIN feedback_pool fp ON fp.content_item_id = ci.id
  LEFT JOIN content_nl_evaluations base_eval
    ON base_eval.content_item_id = ci.id
   AND base_eval.scope = 'base'
  LEFT JOIN content_nl_evaluations view_eval
    ON view_eval.content_item_id = ci.id
   AND view_eval.scope = @viewScope
  LEFT JOIN content_nl_evaluations hero_eval
    ON hero_eval.content_item_id = ci.id
   AND hero_eval.scope = 'hero'
  ORDER BY datetime(COALESCE(ci.published_at, ci.fetched_at, ci.created_at)) DESC, ci.id DESC
`;

export function buildContentViewSelection(
  db: SqliteDatabase,
  viewKey: ContentViewKey,
  options: ContentViewSelectionOptions = {}
): ContentViewSelection {
  // Shared selection keeps one exact candidate/visible pipeline for content pages and system analytics.
  const viewRuleConfig = getInternalViewRuleConfig(viewKey);
  const referenceTime = options.referenceTime ?? new Date();
  const includeNlEvaluations = options.includeNlEvaluations ?? true;
  const sortMode = options.sortMode;
  const selectedSourceKinds = normalizeSelectedSourceKinds(options.selectedSourceKinds);
  const rows = db
    .prepare(contentSelectSql)
    .all({ viewScope: mapViewScope(viewKey) }) as ContentCardRow[];
  const rankedCards = rows
    .map((row) =>
      buildRankedCardCandidate(row, {
        viewKey,
        viewRuleConfig,
        referenceTime,
        includeNlEvaluations
      })
    )
    .filter((card) => !card.isBlocked)
    .filter((card) => selectedSourceKinds === null || selectedSourceKinds.has(card.sourceKind))
    .sort(compareByRanking);
  const limit = options.limitOverride ?? viewRuleConfig.limit;
  const fullDisplaySourceKinds =
    selectedSourceKinds === null
      ? new Set<string>()
      : new Set(
          rankedCards
            .filter((card) => card.showAllWhenSelected && selectedSourceKinds.has(card.sourceKind))
            .map((card) => card.sourceKind)
        );
  const visibleCards = [
    ...rankedCards.filter((card) => fullDisplaySourceKinds.has(card.sourceKind)),
    ...rankedCards.filter((card) => !fullDisplaySourceKinds.has(card.sourceKind)).slice(0, limit)
  ]
    .sort((left, right) => compareVisibleCards(sortMode, left, right))
    .map(({ isBlocked: _isBlocked, showAllWhenSelected: _showAllWhenSelected, ...card }) => card);

  return {
    candidateCards: rankedCards.map(({ isBlocked: _isBlocked, showAllWhenSelected: _showAllWhenSelected, ...card }) => card),
    visibleCards
  };
}

function buildRankedCardCandidate(
  row: ContentCardRow,
  context: {
    viewKey: ContentViewKey;
    viewRuleConfig: ViewRuleConfigValues;
    referenceTime: Date;
    includeNlEvaluations: boolean;
  }
): RankedContentCardCandidate {
  const score = scoreContentItem(
    {
      title: row.title,
      summary: row.summary ?? "",
      bodyMarkdown: row.bodyMarkdown ?? "",
      publishedAt: row.publishedAt,
      sourceKind: row.sourceKind
    },
    { now: context.referenceTime }
  );

  return {
    id: row.id,
    title: row.title,
    summary: row.summary?.trim() || "暂无摘要",
    sourceName: row.sourceName,
    sourceKind: row.sourceKind,
    showAllWhenSelected: row.showAllWhenSelected === 1,
    canonicalUrl: row.canonicalUrl,
    publishedAt: row.publishedAt,
    isFavorited: row.favoriteValue === "1",
    reaction: normalizeReaction(row.reactionValue),
    contentScore: score.contentScore,
    scoreBadges: score.badges,
    feedbackEntry: row.feedbackEntryId
      ? {
          freeText: row.feedbackFreeText,
          suggestedEffect: normalizeSuggestedEffect(row.feedbackSuggestedEffect),
          strengthLevel: normalizeStrengthLevel(row.feedbackStrengthLevel),
          positiveKeywords: parseKeywordJson(row.feedbackPositiveKeywordsJson),
          negativeKeywords: parseKeywordJson(row.feedbackNegativeKeywordsJson)
        }
      : undefined,
    rankingScore: calculateViewRankingScore(
      context.viewKey,
      context.viewRuleConfig,
      score,
      row.sourceKind,
      row.rankingTimestamp,
      context.referenceTime,
      context.includeNlEvaluations ? (row.baseScoreDelta ?? 0) + (row.viewScoreDelta ?? 0) : 0
    ),
    rankingTimestamp: row.rankingTimestamp,
    heroDecision: normalizeNlDecision(row.heroDecision),
    heroScoreDelta: context.includeNlEvaluations ? (row.heroScoreDelta ?? 0) : 0,
    isBlocked:
      context.includeNlEvaluations &&
      (normalizeNlDecision(row.baseDecision) === "block" || normalizeNlDecision(row.viewDecision) === "block")
  };
}

function normalizeSelectedSourceKinds(selectedSourceKinds?: string[]) {
  if (!selectedSourceKinds) {
    return null;
  }

  return new Set(selectedSourceKinds.map((kind) => kind.trim()).filter(Boolean));
}

function compareByRanking(left: RankedContentCardCandidate, right: RankedContentCardCandidate): number {
  if (right.rankingScore !== left.rankingScore) {
    return right.rankingScore - left.rankingScore;
  }

  const rightTimestamp = toTimestampMs(right.rankingTimestamp);
  const leftTimestamp = toTimestampMs(left.rankingTimestamp);

  if (rightTimestamp !== leftTimestamp) {
    return rightTimestamp - leftTimestamp;
  }

  return right.id - left.id;
}

function normalizeReaction(value: string | null): "like" | "dislike" | "none" {
  // Unknown legacy values degrade to `none` so view rendering stays stable.
  return value === "like" || value === "dislike" ? value : "none";
}

// 旧内容 view key 仍保留在内部排序层，正式自然语言策略只再认新的 gate scope。
function mapViewScope(viewKey: ContentViewKey): StrategyGateScope | null {
  if (viewKey === "ai") {
    return "ai_new";
  }

  if (viewKey === "hot") {
    return "ai_hot";
  }

  return null;
}

function normalizeSuggestedEffect(value: string | null): "boost" | "penalize" | "block" | "neutral" | null {
  return value === "boost" || value === "penalize" || value === "block" || value === "neutral" ? value : null;
}

function normalizeStrengthLevel(value: string | null): "low" | "medium" | "high" | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function calculateViewRankingScore(
  viewKey: ContentViewKey,
  viewRuleConfig: ViewRuleConfigValues,
  score: ContentScoreBreakdown,
  sourceKind: string,
  rankingTimestamp: string | null,
  referenceTime: Date,
  nlScoreDelta: number
): number {
  // The saved rule config controls both the ranking mix and the freshness window.
  const freshnessScore = calculateFreshnessWindowScore(
    rankingTimestamp,
    referenceTime,
    viewRuleConfig.freshnessWindowDays,
    score.freshnessScore
  );

  return (
    freshnessScore * viewRuleConfig.freshnessWeight +
    score.sourceScore * viewRuleConfig.sourceWeight +
    score.completenessScore * viewRuleConfig.completenessWeight +
    score.aiScore * viewRuleConfig.aiWeight +
    score.heatScore * viewRuleConfig.heatWeight +
    nlScoreDelta +
    calculateMatchingSourceViewBonus(viewKey, sourceKind)
  );
}

function normalizeNlDecision(value: string | null): "boost" | "penalize" | "block" | "neutral" {
  return value === "boost" || value === "penalize" || value === "block" ? value : "neutral";
}

function calculateMatchingSourceViewBonus(viewKey: ContentViewKey, sourceKind: string): number {
  // Matching sources get a strong view bonus so the shared pool still surfaces view-native feeds first.
  const source = BUILTIN_SOURCES[sourceKind as keyof typeof BUILTIN_SOURCES];

  if (!source) {
    return 0;
  }

  return source.navigationViews.includes(viewKey) ? matchingSourceViewBonus : 0;
}

function calculateFreshnessWindowScore(
  rankingTimestamp: string | null,
  referenceTime: Date,
  freshnessWindowDays: number,
  fallbackScore: number
): number {
  // Missing or invalid timestamps fall back to the precomputed freshness score instead of dropping the item.
  if (!rankingTimestamp) {
    return fallbackScore;
  }

  const parsedTimestamp = Date.parse(rankingTimestamp);

  if (!Number.isFinite(parsedTimestamp)) {
    return fallbackScore;
  }

  const windowDays = Math.max(1, freshnessWindowDays);
  const ageDays = Math.max(0, (referenceTime.getTime() - parsedTimestamp) / (24 * 60 * 60 * 1000));

  if (ageDays >= windowDays) {
    return 0;
  }

  return Math.max(0, Math.min(100, 100 - (ageDays / windowDays) * 100));
}

function compareVisibleCards(sortMode: ContentSortMode | undefined, left: RankedContentCardCandidate, right: RankedContentCardCandidate): number {
  // Core selection keeps the legacy ranking order unless a caller explicitly asks for a user-facing sort.
  if (sortMode === undefined) {
    return compareByRanking(left, right);
  }

  if (sortMode === "content_score") {
    if (right.contentScore !== left.contentScore) {
      return right.contentScore - left.contentScore;
    }

    const publishedDelta = toTimestampMs(right.publishedAt ?? right.rankingTimestamp) - toTimestampMs(left.publishedAt ?? left.rankingTimestamp);

    if (publishedDelta !== 0) {
      return publishedDelta;
    }

    return compareByRanking(left, right);
  }

  const publishedDelta = toTimestampMs(right.publishedAt ?? right.rankingTimestamp) - toTimestampMs(left.publishedAt ?? left.rankingTimestamp);

  if (publishedDelta !== 0) {
    return publishedDelta;
  }

  if (right.contentScore !== left.contentScore) {
    return right.contentScore - left.contentScore;
  }

  return compareByRanking(left, right);
}

function toTimestampMs(value: string | null): number {
  // Timestamp tie-breaks keep newer items ahead when the ranking score is identical.
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseKeywordJson(rawValue: string | null): string[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
