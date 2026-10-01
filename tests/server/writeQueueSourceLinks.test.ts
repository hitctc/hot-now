import Database from "better-sqlite3";
import Fastify from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { registerHermesOperationalRoutes } from "../../src/server/routes/hermesOperationalRoutes.js";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("映射自动短内容外部标识和成品关联素材，不将本地编号当作平台编号", async () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE creative_source_items (id INTEGER PRIMARY KEY, external_id TEXT, direction TEXT, title TEXT, source_name TEXT, collector_timestamp TEXT, created_at TEXT);
    CREATE TABLE creative_finished_articles (id INTEGER PRIMARY KEY, source_item_id INTEGER, created_at TEXT, deleted_at TEXT, origin_type TEXT);
    INSERT INTO creative_source_items VALUES (101, 'hot-11', 'short_content', '平台素材', '热搜', '2026-10-01', '2026-10-01');
    INSERT INTO creative_finished_articles VALUES (2401, 101, '2026-10-01', NULL, 'pipeline');
  `);
  vi.stubEnv("HERMES_API_BASE_URL", "https://hermes.test");
  vi.stubEnv("HERMES_API_TOKEN", "test-token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    current: { task_id: "auto", source_item_id: null, source_external_id: "hot-11", task_kind: "short_content_auto" },
    queue: [{ task_id: "unknown", source_item_id: null, source_external_id: "missing" }],
    history: [{ task_id: "done", source_item_id: null, finished_article_id: 2401 }], stats: {}, queue_length: 1,
  }))));
  const app = Fastify();
  registerHermesOperationalRoutes(app, { db, readSession: () => ({}) });
  try {
    const response = await app.inject("/api/creative/write-queue/status");
    expect(response.statusCode).toBe(200);
    const status = response.json();
    expect(status.current).toMatchObject({ source_item_id: 101, source_item_title: "平台素材" });
    expect(status.history[0].source_item_id).toBe(101);
    expect(status.queue[0].source_item_id).toBeNull();
  } finally { await app.close(); db.close(); }
});
