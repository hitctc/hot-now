import type { SqliteDatabase } from "../openDatabase.js";

/** 将旧版代码图片标记为过期，让新版字体和排版可以通过单篇重做生效。 */
export const refreshCodeImageCardsTemplateMigration = {
  version: 52,
  name: "052_refresh_code_image_cards_template",
  apply(db: SqliteDatabase): void {
    const rows = db
      .prepare("SELECT id, code_image_cards FROM creative_finished_articles WHERE code_image_cards IS NOT NULL")
      .all() as Array<{ id: number; code_image_cards: string | null }>;

    const update = db.prepare("UPDATE creative_finished_articles SET code_image_cards = ? WHERE id = ?");
    const applyRefresh = db.transaction(() => {
      for (const row of rows) {
        if (!row.code_image_cards) continue;
        let cards: unknown;
        try {
          cards = JSON.parse(row.code_image_cards);
        } catch {
          continue;
        }
        if (!Array.isArray(cards)) continue;
        const refreshed = cards.map((card) => {
          if (!card || typeof card !== "object") return card;
          const record = card as Record<string, unknown>;
          if (typeof record.url !== "string" || !record.url) return card;
          if (record.status === "succeeded" || record.status === "stale") {
            return { ...record, status: "stale", error: null };
          }
          return card;
        });
        if (JSON.stringify(refreshed) !== row.code_image_cards) {
          update.run(JSON.stringify(refreshed), row.id);
        }
      }
    });

    applyRefresh();
  }
} as const;
