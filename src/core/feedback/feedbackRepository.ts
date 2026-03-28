import type { SqliteDatabase } from "../db/openDatabase.js";

export type ReactionValue = "like" | "dislike" | "none";

export function saveFavorite(db: SqliteDatabase, contentItemId: number, isFavorited: boolean): void {
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
}

export function saveReaction(db: SqliteDatabase, contentItemId: number, reaction: ReactionValue): void {
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
}
