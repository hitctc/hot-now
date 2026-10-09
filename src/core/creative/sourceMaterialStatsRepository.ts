import type { SqliteDatabase } from "../db/openDatabase.js";

export type DailySourceMaterialCount = {
  date: string;
  juyaRssCount: number;
  aiHotCount: number;
};

/** 按北京时间自然日统计 Juya 原始 RSS 与 AI HOT 原始素材，只返回计数不读取正文。 */
export function readDailySourceMaterialCounts(
  db: SqliteDatabase,
  fromDate: string,
  toDate: string
): DailySourceMaterialCount[] {
  const rows = db.prepare(`
    SELECT day, source, COUNT(*) AS item_count FROM (
      SELECT date(datetime(ci.fetched_at), '+8 hours') AS day, 'juya' AS source
      FROM content_items ci
      JOIN content_sources cs ON cs.id = ci.source_id
      WHERE cs.kind = 'juya' AND ci.fetched_at IS NOT NULL
        AND date(datetime(ci.fetched_at), '+8 hours') BETWEEN ? AND ?
      UNION ALL
      SELECT date(datetime(item.collector_timestamp), '+8 hours') AS day, 'aihot' AS source
      FROM creative_source_items item
      WHERE item.collector_agent = 'aihot-collector' AND item.collector_timestamp IS NOT NULL
        AND date(datetime(item.collector_timestamp), '+8 hours') BETWEEN ? AND ?
    ) GROUP BY day, source
  `).all(fromDate, toDate, fromDate, toDate) as Array<{
    day: string;
    source: "juya" | "aihot";
    item_count: number;
  }>;
  const counts = new Map<string, DailySourceMaterialCount>();
  for (const date of listDateRange(fromDate, toDate)) {
    counts.set(date, { date, juyaRssCount: 0, aiHotCount: 0 });
  }

  for (const row of rows) {
    const count = counts.get(row.day);
    if (!count) continue;
    if (row.source === "juya") count.juyaRssCount = row.item_count;
    else count.aiHotCount = row.item_count;
  }

  return [...counts.values()];
}

/** 生成闭区间日期列表；调用方已校验日期格式与最大跨度。 */
function listDateRange(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
