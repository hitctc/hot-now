import type { SqliteDatabase } from "../openDatabase.js";

/** 创建 Twitter 关键词配置、命中关联及隐藏聚合来源。 */
export const twitterSearchKeywordsMigration = {
  version: 9,
  name: "009_twitter_search_keywords",
  apply(db: SqliteDatabase): void {
    // Twitter keyword search uses its own config and match tables, while collected tweets still
    // need one hidden aggregate source row to satisfy the existing content_items foreign key.
    db.exec(`
      CREATE TABLE IF NOT EXISTS twitter_search_keywords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT NOT NULL COLLATE NOCASE UNIQUE,
        category TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 60,
        is_collect_enabled INTEGER NOT NULL DEFAULT 1,
        is_visible INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        last_fetched_at TEXT,
        last_success_at TEXT,
        last_result TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_twitter_search_keywords_collect_enabled
      ON twitter_search_keywords(is_collect_enabled)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_twitter_search_keywords_visible
      ON twitter_search_keywords(is_visible)
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS twitter_search_keyword_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword_id INTEGER NOT NULL,
        tweet_external_id TEXT NOT NULL,
        content_item_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(keyword_id, tweet_external_id),
        FOREIGN KEY (keyword_id) REFERENCES twitter_search_keywords(id) ON DELETE CASCADE,
        FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_twitter_search_keyword_matches_content_item
      ON twitter_search_keyword_matches(content_item_id)
    `);

    db.prepare(
      `
        INSERT INTO content_sources (
          kind,
          name,
          site_url,
          rss_url,
          is_enabled,
          is_builtin,
          source_type,
          show_all_when_selected,
          updated_at
        )
        VALUES (?, ?, ?, ?, 0, 0, ?, 0, CURRENT_TIMESTAMP)
        ON CONFLICT(kind) DO UPDATE SET
          name = excluded.name,
          site_url = excluded.site_url,
          source_type = excluded.source_type,
          show_all_when_selected = 0,
          updated_at = CURRENT_TIMESTAMP
      `
    ).run(
      "twitter_keyword_search",
      "Twitter 关键词搜索",
      "https://x.com",
      null,
      "twitter_keyword_aggregate"
    );
  }
} as const;
