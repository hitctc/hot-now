import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";

/** 只比较合成日期与计数，不包含正文、账号配置或真实数据。 */
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

it("queue covering indexes preserve date parsing, ordering, rows and repeated migration", () => {
  const db = openDatabase(":memory:");
  try {
    runMigrations(db);
    const source = db.prepare("INSERT INTO creative_source_items (external_id,collector_agent,title,url,raw_payload_json,collector_timestamp,created_at) VALUES (?, 'fixture', '合成素材', 'https://example.invalid', '{}', ?, ?)");
    const article = db.prepare("INSERT INTO creative_finished_articles (source_item_id,content_markdown,origin_type,created_at) VALUES (?, '合成正文', 'pipeline', ?)");
    for (const [i, stamp] of ["2026-10-01T15:59:59Z", "2026-10-01 16:00:00", "invalid-date", "now"].entries()) {
      const id = source.run("fixture-" + i, stamp, "2026-10-01 00:00:00").lastInsertRowid;
      article.run(id, stamp);
    }
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('idx_creative_source_items_queue_day_cover', 'idx_creative_finished_articles_queue_history_cover')").all();
    expect(indexes).toHaveLength(2);
    const sourceSql = "SELECT date(datetime(COALESCE(collector_timestamp,created_at)), '+8 hours') AS day_key, COUNT(*) AS count FROM creative_source_items GROUP BY day_key";
    const articleSql = "SELECT id,source_item_id,created_at FROM creative_finished_articles WHERE origin_type='pipeline' ORDER BY datetime(created_at) DESC,id DESC LIMIT 500";
    const before = [hash(db.prepare(sourceSql).all()), hash(db.prepare(articleSql).all())];
    const sourcePlan = db.prepare("EXPLAIN QUERY PLAN " + sourceSql).all() as Array<{ detail: string }>;
    const articlePlan = db.prepare("EXPLAIN QUERY PLAN " + articleSql).all() as Array<{ detail: string }>;
    expect(sourcePlan.some(row => row.detail.includes("COVERING INDEX idx_creative_source_items_queue_day_cover"))).toBe(true);
    expect(articlePlan.some(row => row.detail.includes("COVERING INDEX idx_creative_finished_articles_queue_history_cover"))).toBe(true);
    runMigrations(db);
    expect([hash(db.prepare(sourceSql).all()), hash(db.prepare(articleSql).all())]).toEqual(before);
    expect(db.pragma("user_version", { simple: true })).toBe(58);
    expect(db.pragma("quick_check")).toEqual([{ quick_check: "ok" }]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM creative_source_items").get()).toEqual({ count: 4 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM creative_finished_articles").get()).toEqual({ count: 4 });
  } finally { db.close(); }
});
