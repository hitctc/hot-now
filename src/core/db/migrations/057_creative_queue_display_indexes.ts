import type { SqliteDatabase } from "../openDatabase.js";

export const creativeQueueDisplayIndexesMigration = {
  version: 57,
  name: "057_creative_queue_display_indexes",
  /** 为传入数据库的队列展示读取建立覆盖索引；不改业务行、日期解析、排序规则或软删除语义。 */
  apply(db: SqliteDatabase): void {
    // 原始日期列避免日期表达式索引限制历史输入；覆盖索引使日统计不再读取素材宽行。
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_creative_source_items_queue_day_cover
      ON creative_source_items(direction, collector_timestamp, created_at);
      CREATE INDEX IF NOT EXISTS idx_creative_finished_articles_queue_history_cover
      ON creative_finished_articles(origin_type, created_at, source_item_id);
    `);
  },
} as const;
