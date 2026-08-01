import type { SqliteDatabase } from "../openDatabase.js";
import { hasColumn } from "./columnHelpers.js";

/** 为来源库存补充选中时全量展示开关。 */
export const sourceDisplayModeMigration = {
  version: 4,
  name: "004_source_display_mode",
  apply(db: SqliteDatabase): void {
    // Source display mode stays additive so older SQLite files can gain the new setting without
    // rebuilding the local database or losing any collected content and report history.
    if (!hasColumn(db, "content_sources", "show_all_when_selected")) {
      db.exec("ALTER TABLE content_sources ADD COLUMN show_all_when_selected INTEGER NOT NULL DEFAULT 0");
    }
  }
} as const;
