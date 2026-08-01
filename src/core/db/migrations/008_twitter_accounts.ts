import type { SqliteDatabase } from "../openDatabase.js";
import { hasColumn } from "./columnHelpers.js";

/** 创建 Twitter 账号配置表，并补充内容元数据列。 */
export const twitterAccountsMigration = {
  version: 8,
  name: "008_twitter_accounts",
  apply(db: SqliteDatabase): void {
    // Twitter account collection has its own configuration table because account sources need
    // platform-specific fields and should not be mixed into the RSS source inventory.
    db.exec(`
      CREATE TABLE IF NOT EXISTS twitter_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        user_id TEXT,
        display_name TEXT NOT NULL,
        category TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 50,
        include_replies INTEGER NOT NULL DEFAULT 0,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        last_fetched_at TEXT,
        last_success_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_twitter_accounts_enabled
      ON twitter_accounts(is_enabled)
    `);

    if (!hasColumn(db, "content_items", "metadata_json")) {
      db.exec("ALTER TABLE content_items ADD COLUMN metadata_json TEXT");
    }
  }
} as const;
