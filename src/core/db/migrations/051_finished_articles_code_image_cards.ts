import type { SqliteDatabase } from "../openDatabase.js";
import { hasColumn } from "./columnHelpers.js";

/** 为短内容成品增加代码制图片元数据，保留既有图片字段的独立语义。 */
export const finishedArticlesCodeImageCardsMigration = {
  version: 51,
  name: "051_finished_articles_code_image_cards",
  apply(db: SqliteDatabase): void {
    if (!hasColumn(db, "creative_finished_articles", "code_image_cards")) {
      db.exec("ALTER TABLE creative_finished_articles ADD COLUMN code_image_cards TEXT DEFAULT NULL");
    }
  }
} as const;
