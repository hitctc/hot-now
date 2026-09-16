import type { SqliteDatabase } from "../openDatabase.js";

/** 将 fontconfig 修复前生成的代码图片标记为过期，确保旧乱码图片不会继续显示为完成。 */
export const refreshCodeImageCardsFontconfigMigration = {
  version: 53,
  name: "053_refresh_code_image_cards_fontconfig",
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
          return { ...record, status: "stale", error: null };
        });
        if (JSON.stringify(refreshed) !== row.code_image_cards) {
          update.run(JSON.stringify(refreshed), row.id);
        }
      }
    });
    applyRefresh();
  }
} as const;
