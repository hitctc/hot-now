import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enrichWriteQueueDisplay } from "../../src/core/creative/creativeWriteQueueDisplayRepository.js";
import { selectWriteQueueHistory } from "../../src/core/creative/writeQueueHistory.js";

const now = Date.parse("2026-10-16T12:00:00Z");

/** 建立仅用于展示查询的临时内存库，不连接开发或生产数据库。 */
function makeDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE creative_source_items (id INTEGER PRIMARY KEY, external_id TEXT, direction TEXT, title TEXT, source_name TEXT, collector_timestamp TEXT, created_at TEXT);
    CREATE TABLE creative_finished_articles (id INTEGER PRIMARY KEY, source_item_id INTEGER, created_at TEXT, deleted_at TEXT, origin_type TEXT);
  `);
  return db;
}

afterEach(() => vi.useRealTimers());

describe("写作记录滚动24小时", () => {
  it("兼容仅recent的旧接口，合并去重不修改输入，并随时钟移出过期记录", () => {
    const boundary = { task_id: "boundary", status: "stopped", reason_text: "用户取消", finished_at: "2026-10-15T12:00:00Z" };
    const latest = { task_id: "latest", status: "failed", error: "原始错误", finished_at: "2026-10-16T20:00:00+08:00" };
    const history = [boundary, latest];
    expect(selectWriteQueueHistory({ recent: history }, now)).toEqual([latest, boundary]);
    expect(selectWriteQueueHistory({ history, recent: [latest] }, now)).toEqual([latest, boundary]);
    expect(selectWriteQueueHistory({ history }, now + 1)).toEqual([latest]);
    expect(history).toEqual([boundary, latest]);
  });

  it("按完成时间包含精确边界、UTC旧时间及23小时前结果，不包含过期、未来或无效时间", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const db = makeDb();
    const record = (task_id: string, finished_at: string) => ({ task_id, finished_at, status: "done" });
    const rows = [record("latest", "2026-10-16T12:00:00Z"), record("boundary", "2026-10-15T12:00:00Z"),
      record("expired", "2026-10-15T11:59:59.999Z"), record("future", "2026-10-16T12:00:00.001Z"),
      record("old-utc", "2026-10-15 13:00:00"), record("invalid", "unknown")];
    try {
      const result = enrichWriteQueueDisplay(db, { current: { task_id: "active" }, queue: [{ task_id: "waiting" }], history: rows, recent: rows });
      expect(result.history.map((row) => row.task_id)).toEqual(["latest", "old-utc", "boundary"]);
      expect(result.recent.map((row) => row.task_id)).toEqual(["latest", "old-utc", "boundary"]);
      expect(result.current.task_id).toBe("active");
      expect(result.queue[0]?.task_id).toBe("waiting");
    } finally { db.close(); }
  });

  it("24小时内超过500条的成品补齐不截断，并保留失败任务且不重复成功任务", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const db = makeDb();
    const insert = db.prepare("INSERT INTO creative_finished_articles VALUES (?, NULL, ?, NULL, 'pipeline')");
    for (let id = 1; id <= 605; id += 1) insert.run(id, new Date(now - id * 1000).toISOString());
    insert.run(606, "2026-10-15T11:00:00Z");
    try {
      const result = enrichWriteQueueDisplay(db, { current: null, queue: [], history: [
        { task_id: "success", finished_article_id: 1, status: "done", finished_at: new Date(now - 1000).toISOString() },
        { task_id: "failed", status: "failed", finished_at: new Date(now - 2000).toISOString() },
      ] });
      expect(result.history).toHaveLength(606);
      expect(result.history.filter((task) => task.finished_article_id === 1)).toHaveLength(1);
      expect(result.history.some((task) => task.task_id === "failed")).toBe(true);
      expect(result.history.some((task) => task.finished_article_id === 605)).toBe(true);
      expect(result.history.some((task) => task.finished_article_id === 606)).toBe(false);
    } finally { db.close(); }
  });
});
