import type { SqliteDatabase } from "../openDatabase.js";

/** 写入微博热搜匹配使用的隐藏聚合来源。 */
export const weiboTrendingMigration = {
  version: 12,
  name: "012_weibo_trending",
  apply(db: SqliteDatabase): void {
    // 微博热搜第一版只有固定关键词匹配，没有单独配置表，但仍需要一个隐藏聚合 source
    // 来承接 content_items 外键。
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
      "weibo_trending",
      "微博热搜榜匹配",
      "https://s.weibo.com/top/summary",
      null,
      "weibo_trending_aggregate"
    );
  }
} as const;
