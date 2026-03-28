import type { SqliteDatabase } from "../db/openDatabase.js";
import { scoreContentItem, type ContentScoreBreakdown } from "./contentScoring.js";

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
};

type RankedContentCardView = ContentCardView & {
  rankingScore: number;
  rankingTimestamp: string | null;
};

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
  rankingTimestamp: string | null;
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
    COALESCE(ci.published_at, ci.fetched_at, ci.created_at) AS rankingTimestamp
  FROM content_items ci
  JOIN content_sources cs ON cs.id = ci.source_id
  LEFT JOIN latest_favorite ON latest_favorite.content_item_id = ci.id
  LEFT JOIN latest_reaction ON latest_reaction.content_item_id = ci.id
  ORDER BY datetime(COALESCE(ci.published_at, ci.fetched_at, ci.created_at)) DESC, ci.id DESC
`;

export function listContentView(db: SqliteDatabase, viewKey: ContentViewKey): ContentCardView[] {
  // Every tab reads the same candidate pool; the pure scoring module turns it into view-specific order.
  const rows = db.prepare(contentSelectSql).all() as ContentCardRow[];
  const referenceTime = new Date();

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
        rankingScore: calculateViewRankingScore(viewKey, score),
        rankingTimestamp: row.rankingTimestamp
      };
    })
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
    .slice(0, 80)
    .map(({ rankingScore: _rankingScore, rankingTimestamp: _rankingTimestamp, ...card }) => card as ContentCardView);
}

function normalizeReaction(value: string | null): "like" | "dislike" | "none" {
  // Unknown legacy values degrade to `none` so view rendering stays stable.
  return value === "like" || value === "dislike" ? value : "none";
}

function calculateViewRankingScore(viewKey: ContentViewKey, score: ContentScoreBreakdown): number {
  // The card score is shared, while each tab gives a different signal mix a chance to win the top spots.
  switch (viewKey) {
    case "articles":
      return score.completenessScore * 0.7 + score.freshnessScore * 0.15 + score.sourceScore * 0.05 + score.heatScore * 0.1;
    case "ai":
      return score.aiScore * 0.7 + score.freshnessScore * 0.1 + score.heatScore * 0.1 + score.contentScore * 0.1;
    case "hot":
    default:
      return score.freshnessScore * 0.55 + score.heatScore * 0.15 + score.sourceScore * 0.1 + score.contentScore * 0.2;
  }
}

function toTimestampMs(value: string | null): number {
  // Timestamp tie-breaks ensure newer items win when the view score itself is equal.
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
