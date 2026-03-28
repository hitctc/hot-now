import type { SqliteDatabase } from "../db/openDatabase.js";

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
  averageRating: number | null;
};

type ContentCardRow = {
  id: number;
  title: string;
  summary: string | null;
  sourceName: string;
  canonicalUrl: string;
  publishedAt: string | null;
  favoriteValue: string | null;
  reactionValue: string | null;
  averageRating: number | null;
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
  ),
  rating_aggregate AS (
    SELECT
      content_item_id,
      AVG(score) AS average_rating
    FROM content_ratings
    GROUP BY content_item_id
  )
  SELECT
    ci.id AS id,
    ci.title AS title,
    ci.summary AS summary,
    cs.name AS sourceName,
    ci.canonical_url AS canonicalUrl,
    ci.published_at AS publishedAt,
    latest_favorite.feedback_value AS favoriteValue,
    latest_reaction.feedback_value AS reactionValue,
    ROUND(rating_aggregate.average_rating, 2) AS averageRating,
    COALESCE(ci.published_at, ci.fetched_at, ci.created_at) AS rankingTimestamp,
    (
      CASE
        WHEN ci.body_markdown IS NOT NULL AND LENGTH(TRIM(ci.body_markdown)) >= 160 THEN 2
        WHEN ci.body_markdown IS NOT NULL AND LENGTH(TRIM(ci.body_markdown)) > 0 THEN 1
        ELSE 0
      END
      +
      CASE
        WHEN ci.summary IS NOT NULL AND LENGTH(TRIM(ci.summary)) >= 80 THEN 1
        WHEN ci.summary IS NOT NULL AND LENGTH(TRIM(ci.summary)) > 0 THEN 0.5
        ELSE 0
      END
    ) AS completenessScore,
    __AI_SCORE__ AS aiScore
  FROM content_items ci
  JOIN content_sources cs ON cs.id = ci.source_id
  LEFT JOIN latest_favorite ON latest_favorite.content_item_id = ci.id
  LEFT JOIN latest_reaction ON latest_reaction.content_item_id = ci.id
  LEFT JOIN rating_aggregate ON rating_aggregate.content_item_id = ci.id
  ORDER BY __ORDER_BY__
  LIMIT 80
`;

const rankingSqlByView: Record<ContentViewKey, string> = {
  hot: "rankingTimestamp DESC, ci.id DESC",
  articles: "completenessScore DESC, rankingTimestamp DESC, ci.id DESC",
  ai: "aiScore DESC, rankingTimestamp DESC, ci.id DESC"
};

export function listContentView(db: SqliteDatabase, viewKey: ContentViewKey): ContentCardView[] {
  // All menu pages read from one shared content pool; each view differs only by ranking strategy.
  const sql = buildSelectSql(viewKey);
  const rows = db.prepare(sql).all() as ContentCardRow[];

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary?.trim() || "暂无摘要",
    sourceName: row.sourceName,
    canonicalUrl: row.canonicalUrl,
    publishedAt: row.publishedAt,
    isFavorited: row.favoriteValue === "1",
    reaction: normalizeReaction(row.reactionValue),
    averageRating: typeof row.averageRating === "number" ? row.averageRating : null
  }));
}

function normalizeReaction(value: string | null): "like" | "dislike" | "none" {
  // Unknown legacy values degrade to `none` so view rendering stays stable.
  return value === "like" || value === "dislike" ? value : "none";
}

function buildSelectSql(viewKey: ContentViewKey): string {
  // View-specific SQL is assembled from one shared base query to keep fields consistent across tabs.
  const aiScoreExpression = buildAiScoreExpression();

  return contentSelectSql
    .replace("__AI_SCORE__", aiScoreExpression)
    .replace("__ORDER_BY__", rankingSqlByView[viewKey]);
}

function buildAiScoreExpression() {
  // This lightweight keyword score is enough for Task5 and can be replaced by model-based ranking later.
  const aiText =
    "LOWER(COALESCE(ci.title, '') || ' ' || COALESCE(ci.summary, '') || ' ' || COALESCE(ci.body_markdown, ''))";
  const keywords = [" ai ", "ai", "llm", "gpt", "agent", "model", "prompt", "大模型", "智能体"];

  return keywords.map((keyword) => `CASE WHEN ${aiText} LIKE '%${keyword}%' THEN 1 ELSE 0 END`).join(" + ");
}
