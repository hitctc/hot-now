import type { SqliteDatabase } from "../db/openDatabase.js";

export type ReactionValue = "like" | "dislike" | "none";
export type FeedbackSaveResult = { ok: true } | { ok: false; reason: "not-found" };

export function saveFavorite(db: SqliteDatabase, contentItemId: number, isFavorited: boolean): FeedbackSaveResult {
  // The server maps missing content rows to 404, so repository writes first verify the target row exists.
  if (!contentItemExists(db, contentItemId)) {
    return { ok: false, reason: "not-found" };
  }

  // The feedback table has no uniqueness constraint, so we rewrite one logical state per content + kind.
  const rewriteFavorite = db.transaction(() => {
    db.prepare(
      `
        DELETE FROM content_feedback
        WHERE content_item_id = ?
          AND feedback_kind = 'favorite'
      `
    ).run(contentItemId);

    if (isFavorited) {
      db.prepare(
        `
          INSERT INTO content_feedback (content_item_id, feedback_kind, feedback_value)
          VALUES (?, 'favorite', '1')
        `
      ).run(contentItemId);
    }
  });

  rewriteFavorite();
  return { ok: true };
}

export function saveReaction(db: SqliteDatabase, contentItemId: number, reaction: ReactionValue): FeedbackSaveResult {
  // Missing content should not bubble up as FK errors, because callers need a stable not-found contract.
  if (!contentItemExists(db, contentItemId)) {
    return { ok: false, reason: "not-found" };
  }

  // A neutral reaction clears persisted state so list queries can treat missing rows as `none`.
  const rewriteReaction = db.transaction(() => {
    db.prepare(
      `
        DELETE FROM content_feedback
        WHERE content_item_id = ?
          AND feedback_kind = 'reaction'
      `
    ).run(contentItemId);

    if (reaction !== "none") {
      db.prepare(
        `
          INSERT INTO content_feedback (content_item_id, feedback_kind, feedback_value)
          VALUES (?, 'reaction', ?)
        `
      ).run(contentItemId, reaction);
    }
  });

  rewriteReaction();
  return { ok: true };
}

function contentItemExists(db: SqliteDatabase, contentItemId: number): boolean {
  // Existence is checked in one helper so favorite/reaction writes stay behaviorally aligned.
  const row = db.prepare("SELECT id FROM content_items WHERE id = ? LIMIT 1").get(contentItemId) as
    | { id: number }
    | undefined;
  return Boolean(row);
}
