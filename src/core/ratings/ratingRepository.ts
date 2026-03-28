import type { SqliteDatabase } from "../db/openDatabase.js";

export type RatingDimension = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  weight: number;
};
export type SaveRatingsResult =
  | { ok: true; saved: number; averageRating: number | null }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "unknown-dimensions"; unknownKeys: string[] };

type DefaultDimension = Omit<RatingDimension, "id">;

const defaultDimensions: DefaultDimension[] = [
  { key: "value", name: "价值", description: "内容是否值得投入时间", weight: 1 },
  { key: "credibility", name: "可信度", description: "信息来源和论证是否可靠", weight: 1 },
  { key: "readability", name: "可读性", description: "结构是否清晰、易于理解", weight: 1 }
];

export function ensureDefaultRatingDimensions(db: SqliteDatabase): void {
  // Defaults are append-only in read paths so custom dimension labels and weights are never overwritten.
  const insertIfMissing = db.prepare(
    `
      INSERT INTO rating_dimensions (key, name, description, weight)
      VALUES (@key, @name, @description, @weight)
      ON CONFLICT(key) DO NOTHING
    `
  );
  const ensureDefaults = db.transaction(() => {
    for (const dimension of defaultDimensions) {
      insertIfMissing.run(dimension);
    }
  });

  ensureDefaults();
}

export function listRatingDimensions(db: SqliteDatabase): RatingDimension[] {
  ensureDefaultRatingDimensions(db);

  return db
    .prepare(
      `
        SELECT id, key, name, description, weight
        FROM rating_dimensions
        ORDER BY id ASC
      `
    )
    .all() as RatingDimension[];
}

export function saveRatings(db: SqliteDatabase, contentItemId: number, scores: Record<string, number>): SaveRatingsResult {
  // Save operations validate keys up front to avoid silently dropping unknown dimensions.
  const dimensions = listRatingDimensions(db);
  const dimensionIdByKey = new Map(dimensions.map((dimension) => [dimension.key, dimension.id]));
  const unknownKeys = Object.keys(scores).filter((dimensionKey) => !dimensionIdByKey.has(dimensionKey));

  if (unknownKeys.length > 0) {
    return { ok: false, reason: "unknown-dimensions", unknownKeys };
  }

  if (!contentItemExists(db, contentItemId)) {
    return { ok: false, reason: "not-found" };
  }

  const upsertRating = db.prepare(
    `
      INSERT INTO content_ratings (content_item_id, rating_dimension_id, score)
      VALUES (?, ?, ?)
      ON CONFLICT(content_item_id, rating_dimension_id) DO UPDATE SET
        score = excluded.score,
        created_at = CURRENT_TIMESTAMP
    `
  );
  const rewriteRatings = db.transaction((entries: Array<[string, number]>) => {
    for (const [dimensionKey, score] of entries) {
      const dimensionId = dimensionIdByKey.get(dimensionKey);

      if (!dimensionId) {
        continue;
      }

      upsertRating.run(contentItemId, dimensionId, score);
    }
  });
  const validEntries = Object.entries(scores).filter(([, score]) => Number.isFinite(score));

  rewriteRatings(validEntries);
  const averageRating = readAverageRating(db, contentItemId);
  return { ok: true, saved: validEntries.length, averageRating };
}

function contentItemExists(db: SqliteDatabase, contentItemId: number): boolean {
  // Existence checks avoid relying on FK errors for control flow in higher-level routes.
  const row = db.prepare("SELECT id FROM content_items WHERE id = ? LIMIT 1").get(contentItemId) as
    | { id: number }
    | undefined;
  return Boolean(row);
}

function readAverageRating(db: SqliteDatabase, contentItemId: number): number | null {
  // The response uses the latest persisted aggregate so client UI can refresh immediately without extra fetches.
  const row = db
    .prepare(
      `
        SELECT ROUND(AVG(score), 2) AS averageRating
        FROM content_ratings
        WHERE content_item_id = ?
      `
    )
    .get(contentItemId) as { averageRating: number | null } | undefined;

  return typeof row?.averageRating === "number" ? row.averageRating : null;
}
