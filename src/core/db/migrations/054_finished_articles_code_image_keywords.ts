import type { SqliteDatabase } from "../openDatabase.js";
import { hasColumn } from "./columnHelpers.js";

/** 为短内容成品保存文章生成阶段产出的真实标签，供代码制图和封面使用。 */
export const finishedArticlesCodeImageKeywordsMigration = {
  version: 54,
  name: "054_finished_articles_code_image_keywords",
  apply(db: SqliteDatabase): void {
    if (!hasColumn(db, "creative_finished_articles", "code_image_keywords")) {
      db.exec("ALTER TABLE creative_finished_articles ADD COLUMN code_image_keywords TEXT DEFAULT NULL");
    }
  }
} as const;
