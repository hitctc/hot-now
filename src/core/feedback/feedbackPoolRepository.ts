import type { SqliteDatabase } from "../db/openDatabase.js";

export type FeedbackReactionSnapshot = "like" | "dislike" | "none";
export type FeedbackSuggestedEffect = "boost" | "penalize" | "block" | "neutral";
export type FeedbackStrengthLevel = "low" | "medium" | "high";

export type SaveFeedbackPoolEntryInput = {
  contentItemId: number;
  reactionSnapshot?: FeedbackReactionSnapshot;
  freeText?: string | null;
  suggestedEffect?: FeedbackSuggestedEffect | null;
  strengthLevel?: FeedbackStrengthLevel | null;
  positiveKeywords?: string[];
  negativeKeywords?: string[];
};

export type FeedbackPoolEntry = {
  id: number;
  contentItemId: number;
  contentTitle: string;
  canonicalUrl: string;
  sourceName: string;
  reactionSnapshot: FeedbackReactionSnapshot;
  freeText: string | null;
  suggestedEffect: FeedbackSuggestedEffect | null;
  strengthLevel: FeedbackStrengthLevel | null;
  positiveKeywords: string[];
  negativeKeywords: string[];
  createdAt: string;
  updatedAt: string;
};

export type SaveFeedbackPoolEntryResult = { ok: true; entryId: number } | { ok: false; reason: "not-found" };

type FeedbackPoolRow = {
  id: number;
  contentItemId: number;
  contentTitle: string;
  canonicalUrl: string;
  sourceName: string;
  reactionSnapshot: string | null;
  freeText: string | null;
  suggestedEffect: string | null;
  strengthLevel: string | null;
  positiveKeywordsJson: string;
  negativeKeywordsJson: string;
  createdAt: string;
  updatedAt: string;
};

export function saveFeedbackPoolEntry(
  db: SqliteDatabase,
  input: SaveFeedbackPoolEntryInput
): SaveFeedbackPoolEntryResult {
  // Feedback pool entries are edited in place per content item, so callers always get one current row
  // instead of accumulating stale suggestions for the same article.
  if (!contentItemExists(db, input.contentItemId)) {
    return { ok: false, reason: "not-found" };
  }

  db.prepare(
    `
      INSERT INTO feedback_pool (
        content_item_id,
        reaction_snapshot,
        free_text,
        suggested_effect,
        strength_level,
        positive_keywords_json,
        negative_keywords_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(content_item_id) DO UPDATE SET
        reaction_snapshot = excluded.reaction_snapshot,
        free_text = excluded.free_text,
        suggested_effect = excluded.suggested_effect,
        strength_level = excluded.strength_level,
        positive_keywords_json = excluded.positive_keywords_json,
        negative_keywords_json = excluded.negative_keywords_json,
        updated_at = CURRENT_TIMESTAMP
    `
  ).run(
    input.contentItemId,
    normalizeReactionSnapshot(input.reactionSnapshot),
    normalizeNullableText(input.freeText),
    input.suggestedEffect ?? null,
    input.strengthLevel ?? null,
    JSON.stringify(normalizeKeywords(input.positiveKeywords)),
    JSON.stringify(normalizeKeywords(input.negativeKeywords))
  );

  const row = db.prepare("SELECT id FROM feedback_pool WHERE content_item_id = ? LIMIT 1").get(input.contentItemId) as
    | { id: number }
    | undefined;

  if (!row) {
    throw new Error("feedback pool upsert did not return a persisted row");
  }

  return { ok: true, entryId: row.id };
}

export function listFeedbackPoolEntries(db: SqliteDatabase): FeedbackPoolEntry[] {
  // Listing joins source and content metadata once so the settings workbench can render copy-ready
  // cards without issuing more lookups per feedback row.
  const rows = db
    .prepare(
      `
        SELECT
          fp.id AS id,
          fp.content_item_id AS contentItemId,
          ci.title AS contentTitle,
          ci.canonical_url AS canonicalUrl,
          cs.name AS sourceName,
          fp.reaction_snapshot AS reactionSnapshot,
          fp.free_text AS freeText,
          fp.suggested_effect AS suggestedEffect,
          fp.strength_level AS strengthLevel,
          fp.positive_keywords_json AS positiveKeywordsJson,
          fp.negative_keywords_json AS negativeKeywordsJson,
          fp.created_at AS createdAt,
          fp.updated_at AS updatedAt
        FROM feedback_pool fp
        JOIN content_items ci ON ci.id = fp.content_item_id
        JOIN content_sources cs ON cs.id = ci.source_id
        ORDER BY datetime(fp.updated_at) DESC, fp.id DESC
      `
    )
    .all() as FeedbackPoolRow[];

  return rows.map((row) => ({
    id: row.id,
    contentItemId: row.contentItemId,
    contentTitle: row.contentTitle,
    canonicalUrl: row.canonicalUrl,
    sourceName: row.sourceName,
    reactionSnapshot: normalizeReactionSnapshot(row.reactionSnapshot),
    freeText: row.freeText,
    suggestedEffect: normalizeSuggestedEffect(row.suggestedEffect),
    strengthLevel: normalizeStrengthLevel(row.strengthLevel),
    positiveKeywords: parseKeywordJson(row.positiveKeywordsJson),
    negativeKeywords: parseKeywordJson(row.negativeKeywordsJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}

export function deleteFeedbackPoolEntry(db: SqliteDatabase, entryId: number): boolean {
  // Delete returns a boolean so routes can map missing rows to a stable no-op response.
  const result = db.prepare("DELETE FROM feedback_pool WHERE id = ?").run(entryId);
  return result.changes > 0;
}

export function clearFeedbackPool(db: SqliteDatabase): number {
  // Bulk clear is reserved for explicit admin actions, so the repository reports how many rows were removed.
  const result = db.prepare("DELETE FROM feedback_pool").run();
  return result.changes;
}

function contentItemExists(db: SqliteDatabase, contentItemId: number): boolean {
  const row = db.prepare("SELECT id FROM content_items WHERE id = ? LIMIT 1").get(contentItemId) as
    | { id: number }
    | undefined;
  return Boolean(row);
}

function normalizeReactionSnapshot(value: string | null | undefined): FeedbackReactionSnapshot {
  return value === "like" || value === "dislike" ? value : "none";
}

function normalizeSuggestedEffect(value: string | null): FeedbackSuggestedEffect | null {
  return value === "boost" || value === "penalize" || value === "block" || value === "neutral" ? value : null;
}

function normalizeStrengthLevel(value: string | null): FeedbackStrengthLevel | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeKeywords(keywords: string[] | undefined): string[] {
  return (keywords ?? []).map((keyword) => keyword.trim()).filter((keyword) => keyword.length > 0);
}

function parseKeywordJson(rawValue: string): string[] {
  // Keyword arrays are user-authored input, so parsing stays defensive and falls back to empty arrays
  // instead of breaking the whole feedback workbench on one malformed row.
  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // Invalid rows fall through to an empty list.
  }

  return [];
}
