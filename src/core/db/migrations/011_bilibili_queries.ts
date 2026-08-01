import type { SqliteDatabase } from "../openDatabase.js";

/** 创建 B 站查询配置及隐藏聚合来源。 */
export const bilibiliQueriesMigration = {
  version: 11,
  name: "011_bilibili_queries",
  apply(db: SqliteDatabase): void {
    // B 站搜索沿用独立 query 配置表，这样视频搜索不会污染普通 RSS 来源库存语义。
    db.exec(`
      CREATE TABLE IF NOT EXISTS bilibili_queries (
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
      CREATE INDEX IF NOT EXISTS idx_bilibili_queries_enabled
      ON bilibili_queries(is_enabled)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_bilibili_queries_priority
      ON bilibili_queries(priority)
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
          is_enabled = 0,
          is_builtin = 0,
          show_all_when_selected = 0,
          updated_at = CURRENT_TIMESTAMP
      `
    ).run("bilibili_search", "B 站搜索", "https://search.bilibili.com", null, "bilibili_search_aggregate");
  }
} as const;
