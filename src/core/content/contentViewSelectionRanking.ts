import { BUILTIN_SOURCES } from "../source/sourceCatalog.js";
import type { ContentScoreBreakdown } from "./contentScoring.js";
import type { ContentViewKey } from "./listContentView.js";
import type { ViewRuleConfigValues } from "../viewRules/viewRuleConfig.js";
import type { ContentSortMode, RankedContentCardCandidate } from "./contentViewSelectionTypes.js";

const matchingSourceViewBonus = 120;

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

export function calculateViewRankingScore(
  viewKey: ContentViewKey,
  viewRuleConfig: ViewRuleConfigValues,
  score: ContentScoreBreakdown,
  sourceKind: string,
  rankingTimestamp: string | null,
  referenceTime: Date,
  nlScoreDelta: number
): number {
  // The saved rule config controls both the ranking mix and the freshness window.
  const freshnessScore = viewRuleConfig.enableFreshnessWeight
    ? calculateFreshnessWindowScore(
        rankingTimestamp,
        referenceTime,
        viewRuleConfig.freshnessWindowDays,
        score.freshnessScore
      )
    : 0;
  const aiScore = viewRuleConfig.enableAiKeywordWeight ? score.aiScore : 0;
  const heatScore = viewRuleConfig.enableHeatKeywordWeight ? score.heatScore : 0;
  const sourceViewBonus = viewRuleConfig.enableSourceViewBonus
    ? calculateMatchingSourceViewBonus(viewKey, sourceKind)
    : 0;

  return (
    freshnessScore * viewRuleConfig.freshnessWeight +
    score.sourceScore * viewRuleConfig.sourceWeight +
    score.completenessScore * viewRuleConfig.completenessWeight +
    aiScore * viewRuleConfig.aiWeight +
    heatScore * viewRuleConfig.heatWeight +
    nlScoreDelta +
    sourceViewBonus
  );
}

export function compareBySelectionOrder(
  viewRuleConfig: ViewRuleConfigValues,
  left: RankedContentCardCandidate,
  right: RankedContentCardCandidate
): number {
  return viewRuleConfig.enableScoreRanking ? compareByRanking(left, right) : compareByPublishedAtDesc(left, right);
}

export function normalizeNlDecision(value: string | null): "boost" | "penalize" | "block" | "neutral" {
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

export function compareVisibleCards(
  sortMode: ContentSortMode | undefined,
  viewRuleConfig: ViewRuleConfigValues,
  left: RankedContentCardCandidate,
  right: RankedContentCardCandidate
): number {
  // Core selection keeps the legacy ranking order unless a caller explicitly asks for a user-facing sort.
  if (sortMode === undefined) {
    return compareBySelectionOrder(viewRuleConfig, left, right);
  }

  if (sortMode === "content_score") {
    if (right.contentScore !== left.contentScore) {
      return right.contentScore - left.contentScore;
    }

    const publishedDelta = toTimestampMs(right.publishedAt ?? right.rankingTimestamp) - toTimestampMs(left.publishedAt ?? left.rankingTimestamp);

    if (publishedDelta !== 0) {
      return publishedDelta;
    }

    return compareBySelectionOrder(viewRuleConfig, left, right);
  }

  const publishedDelta = toTimestampMs(right.publishedAt ?? right.rankingTimestamp) - toTimestampMs(left.publishedAt ?? left.rankingTimestamp);

  if (publishedDelta !== 0) {
    return publishedDelta;
  }

  if (right.contentScore !== left.contentScore) {
    return right.contentScore - left.contentScore;
  }

  return compareBySelectionOrder(viewRuleConfig, left, right);
}

function compareByPublishedAtDesc(left: RankedContentCardCandidate, right: RankedContentCardCandidate): number {
  const publishedDelta = toTimestampMs(right.publishedAt ?? right.rankingTimestamp) - toTimestampMs(left.publishedAt ?? left.rankingTimestamp);

  if (publishedDelta !== 0) {
    return publishedDelta;
  }

  return right.id - left.id;
}

function toTimestampMs(value: string | null): number {
  // Timestamp tie-breaks keep newer items ahead when the ranking score is identical.
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
