import type { SqliteDatabase } from "../db/openDatabase.js";
import { scoreContentItem, type ContentScoreBreakdown } from "./contentScoring.js";
import { getViewRuleConfig } from "../viewRules/viewRuleRepository.js";
import { BUILTIN_SOURCES } from "../source/sourceCatalog.js";
import type { ViewRuleConfigValues } from "../viewRules/viewRuleConfig.js";

export type ContentViewKey = "hot" | "articles" | "ai";

export type ContentCardView = {
  id: number;
  title: string;
  summary: string;
  sourceName: string;
  canonicalUrl: string;
  publishedAt: string | null;
  isFavorited: boolean;
  reaction: "like" | "dislike" | "none";
  contentScore: number;
  scoreBadges: string[];
  feedbackEntry?: {
    freeText: string | null;
    suggestedEffect: "boost" | "penalize" | "block" | "neutral" | null;
    strengthLevel: "low" | "medium" | "high" | null;
    positiveKeywords: string[];
    negativeKeywords: string[];
  };
};

type RankedContentCardView = ContentCardView & {
  rankingScore: number;
  rankingTimestamp: string | null;
  isBlocked: boolean;
};

const matchingSourceViewBonus = 120;

type ContentCardRow = {
  id: number;
  title: string;
  summary: string | null;
  bodyMarkdown: string | null;
  sourceName: string;
  sourceKind: string;
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
  globalDecision: string | null;
  globalScoreDelta: number | null;
  viewDecision: string | null;
  viewScoreDelta: number | null;
};

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
    global_eval.decision AS globalDecision,
    global_eval.score_delta AS globalScoreDelta,
    view_eval.decision AS viewDecision,
    view_eval.score_delta AS viewScoreDelta,
    COALESCE(ci.published_at, ci.fetched_at, ci.created_at) AS rankingTimestamp
  FROM content_items ci
  JOIN content_sources cs ON cs.id = ci.source_id
  LEFT JOIN latest_favorite ON latest_favorite.content_item_id = ci.id
  LEFT JOIN latest_reaction ON latest_reaction.content_item_id = ci.id
  LEFT JOIN feedback_pool fp ON fp.content_item_id = ci.id
  LEFT JOIN content_nl_evaluations global_eval
    ON global_eval.content_item_id = ci.id
   AND global_eval.scope = 'global'
  LEFT JOIN content_nl_evaluations view_eval
    ON view_eval.content_item_id = ci.id
   AND view_eval.scope = @viewScope
  ORDER BY datetime(COALESCE(ci.published_at, ci.fetched_at, ci.created_at)) DESC, ci.id DESC
`;

export function listContentView(
  db: SqliteDatabase,
  viewKey: ContentViewKey,
  options: { includeNlEvaluations?: boolean } = {}
): ContentCardView[] {
  const viewRuleConfig = getViewRuleConfig(db, viewKey);
  // Every tab reads the same candidate pool; the saved rule weights decide which cards rise and how many survive.
  const rows = db.prepare(contentSelectSql).all({ viewScope: viewKey }) as ContentCardRow[];
  const referenceTime = new Date();
  const includeNlEvaluations = options.includeNlEvaluations ?? true;

  return rows
    .map((row) => {
      const score = scoreContentItem(
        {
          title: row.title,
          summary: row.summary ?? "",
          bodyMarkdown: row.bodyMarkdown ?? "",
          publishedAt: row.publishedAt,
          sourceKind: row.sourceKind
        },
        { now: referenceTime }
      );

      return {
        id: row.id,
        title: row.title,
        summary: row.summary?.trim() || "暂无摘要",
        sourceName: row.sourceName,
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
          viewKey,
          viewRuleConfig,
          score,
          row.sourceKind,
          row.rankingTimestamp,
          referenceTime,
          includeNlEvaluations
            ? (row.globalScoreDelta ?? 0) + (row.viewScoreDelta ?? 0)
            : 0
        ),
        rankingTimestamp: row.rankingTimestamp,
        isBlocked:
          includeNlEvaluations &&
          (normalizeNlDecision(row.globalDecision) === "block" || normalizeNlDecision(row.viewDecision) === "block")
      };
    })
    .filter((card) => !card.isBlocked)
    .sort((left, right) => {
      const leftRank = left.rankingScore;
      const rightRank = right.rankingScore;

      if (rightRank !== leftRank) {
        return rightRank - leftRank;
      }

      const leftTimestamp = toTimestampMs(left.rankingTimestamp);
      const rightTimestamp = toTimestampMs(right.rankingTimestamp);

      if (rightTimestamp !== leftTimestamp) {
        return rightTimestamp - leftTimestamp;
      }

      return right.id - left.id;
    })
    .slice(0, viewRuleConfig.limit)
    .map(({ rankingScore: _rankingScore, rankingTimestamp: _rankingTimestamp, isBlocked: _isBlocked, ...card }) => card as ContentCardView);
}

function normalizeReaction(value: string | null): "like" | "dislike" | "none" {
  // Unknown legacy values degrade to `none` so view rendering stays stable.
  return value === "like" || value === "dislike" ? value : "none";
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
  // The saved rule config now controls both the ranking mix and the freshness window.
  const freshnessScore = calculateFreshnessWindowScore(rankingTimestamp, referenceTime, viewRuleConfig.freshnessWindowDays, score.freshnessScore);

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
  // Navigation pages keep a unified content pool, but matching sources receive a strong bonus so
  // domestic hot/news/AI feeds surface in the tabs they were introduced for.
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
  // The freshness window is a soft decay: newer items score higher, but old items keep a fallback score if the date is missing.
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

function toTimestampMs(value: string | null): number {
  // Timestamp tie-breaks ensure newer items win when the view score itself is equal.
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
