import type { SqliteDatabase } from "../openDatabase.js";

/** 创建公众号 RSS 配置及隐藏聚合来源。 */
export const wechatRssSourcesMigration = {
  version: 13,
  name: "013_wechat_rss_sources",
  apply(db: SqliteDatabase): void {
    // 微信公众号 RSS 进入独立配置表，避免把每个公众号 feed 混进普通 RSS 库存。
    db.exec(`
      CREATE TABLE IF NOT EXISTS wechat_rss_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rss_url TEXT NOT NULL UNIQUE,
        display_name TEXT,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        last_fetched_at TEXT,
        last_success_at TEXT,
        last_result TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_wechat_rss_sources_enabled
      ON wechat_rss_sources(is_enabled)
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
    ).run(
      "wechat_rss",
      "微信公众号 RSS",
      "https://mp.weixin.qq.com/",
      null,
      "wechat_rss_aggregate"
    );
  }
} as const;
