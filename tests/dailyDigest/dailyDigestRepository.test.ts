import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import {
  insertDailyDigest,
  findDailyDigestById,
  findDailyDigestByDate,
  listDailyDigests,
  updateDailyDigestStatus,
  type DailyDigestStatus,
} from "../../src/core/dailyDigest/dailyDigestRepository.js";

const databasesToClose: ReturnType<typeof openDatabase>[] = [];

afterEach(() => {
  while (databasesToClose.length > 0) {
    databasesToClose.pop()?.close();
  }
});

async function createTestDb() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-digest-"));
  const db = openDatabase(path.join(tempDir, "test.sqlite"));
  databasesToClose.push(db);
  runMigrations(db);
  return db;
}

describe("dailyDigestRepository", () => {
  it("inserts and retrieves a daily digest by id and date", async () => {
    const db = await createTestDb();

    const record = insertDailyDigest(db, {
      date: "2026-05-23",
      title: "AI日报 | 2026-05-23",
      contentMarkdown: "# AI日报\n\n测试内容",
      coverImage: "https://example.com/cover.png",
      totalItems: 18,
      categories: ["模型发布与更新", "产品与功能上线"],
      collectorAgent: "hermes-daily-digest",
    });

    expect(record.id).toBeGreaterThan(0);
    expect(record.date).toBe("2026-05-23");
    expect(record.title).toBe("AI日报 | 2026-05-23");
    expect(record.contentMarkdown).toBe("# AI日报\n\n测试内容");
    expect(record.coverImage).toBe("https://example.com/cover.png");
    expect(record.totalItems).toBe(18);
    expect(record.categories).toEqual(["模型发布与更新", "产品与功能上线"]);
    expect(record.status).toBe("generated");
    expect(record.collectorAgent).toBe("hermes-daily-digest");

    const byId = findDailyDigestById(db, record.id);
    expect(byId).toBeTruthy();
    expect(byId!.date).toBe("2026-05-23");

    const byDate = findDailyDigestByDate(db, "2026-05-23");
    expect(byDate).toBeTruthy();
    expect(byDate!.id).toBe(record.id);
  });

  it("lists digests with pagination and status filter", async () => {
    const db = await createTestDb();

    // 插入 3 条
    insertDailyDigest(db, {
      date: "2026-05-23",
      title: "日报 23",
      contentMarkdown: "content",
      totalItems: 10,
      categories: ["分类A"],
      collectorAgent: "hermes",
    });
    insertDailyDigest(db, {
      date: "2026-05-24",
      title: "日报 24",
      contentMarkdown: "content",
      totalItems: 12,
      categories: ["分类B"],
      collectorAgent: "hermes",
    });
    insertDailyDigest(db, {
      date: "2026-05-25",
      title: "日报 25",
      contentMarkdown: "content",
      totalItems: 8,
      categories: ["分类C"],
      collectorAgent: "hermes",
    });

    // 全量列表倒序
    const all = listDailyDigests(db);
    expect(all.total).toBe(3);
    expect(all.items[0].date).toBe("2026-05-25");
    expect(all.items[2].date).toBe("2026-05-23");
    // 列表不含 contentMarkdown
    expect("contentMarkdown" in all.items[0]).toBe(false);

    // 分页
    const page1 = listDailyDigests(db, { page: 1, pageSize: 2 });
    expect(page1.items.length).toBe(2);
    expect(page1.total).toBe(3);

    const page2 = listDailyDigests(db, { page: 2, pageSize: 2 });
    expect(page2.items.length).toBe(1);
  });

  it("updates status through generated → publishing → published", async () => {
    const db = await createTestDb();

    const record = insertDailyDigest(db, {
      date: "2026-05-23",
      title: "日报",
      contentMarkdown: "content",
      totalItems: 5,
      categories: [],
      collectorAgent: "hermes",
    });
    expect(record.status).toBe("generated");

    const publishing = updateDailyDigestStatus(db, record.id, "publishing");
    expect(publishing!.status).toBe("publishing");

    const published = updateDailyDigestStatus(db, record.id, "published");
    expect(published!.status).toBe("published");
  });

  it("returns null for nonexistent id", async () => {
    const db = await createTestDb();
    expect(findDailyDigestById(db, 9999)).toBeNull();
    expect(findDailyDigestByDate(db, "2099-01-01")).toBeNull();
    expect(updateDailyDigestStatus(db, 9999, "published" as DailyDigestStatus)).toBeNull();
  });
});
