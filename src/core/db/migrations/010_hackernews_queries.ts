import type { SqliteDatabase } from "../openDatabase.js";

/** 创建 Hacker News 查询配置及隐藏聚合来源。 */
export const hackerNewsQueriesMigration = {
  version: 10,
  name: "010_hackernews_queries",
  apply(db: SqliteDatabase): void {
    // Hacker News search stays on a dedicated config table so query management can evolve
    // without overloading the generic content_sources inventory semantics.
    db.exec(`
      CREATE TABLE IF NOT EXISTS hackernews_queries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL COLLATE NOCASE UNIQUE,
        priority INTEGER NOT NULL DEFAULT 60,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        last_fetched_at TEXT,
        last_success_at TEXT,
        last_result TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_hackernews_queries_enabled
      ON hackernews_queries(is_enabled)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_hackernews_queries_priority
      ON hackernews_queries(priority)
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
      "hackernews_search",
      "Hacker News 搜索",
      "https://news.ycombinator.com",
      null,
      "hackernews_aggregate"
    );
  }
} as const;
