import type { SqliteDatabase } from "../db/openDatabase.js";

export type RatingDimension = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  weight: number;
};

type DefaultDimension = Omit<RatingDimension, "id">;

const defaultDimensions: DefaultDimension[] = [
  { key: "value", name: "价值", description: "内容是否值得投入时间", weight: 1 },
  { key: "credibility", name: "可信度", description: "信息来源和论证是否可靠", weight: 1 },
  { key: "readability", name: "可读性", description: "结构是否清晰、易于理解", weight: 1 }
];

export function ensureDefaultRatingDimensions(db: SqliteDatabase): void {
  // Task5 needs ratings immediately, so defaults are bootstrapped lazily in repository calls.
  const upsertDimension = db.prepare(
    `
      INSERT INTO rating_dimensions (key, name, description, weight)
      VALUES (@key, @name, @description, @weight)
      ON CONFLICT(key) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        weight = excluded.weight
    `
  );
  const ensureDefaults = db.transaction(() => {
    for (const dimension of defaultDimensions) {
      upsertDimension.run(dimension);
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

export function saveRatings(db: SqliteDatabase, contentItemId: number, scores: Record<string, number>): void {
  const dimensions = listRatingDimensions(db);
  const dimensionIdByKey = new Map(dimensions.map((dimension) => [dimension.key, dimension.id]));
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
}
