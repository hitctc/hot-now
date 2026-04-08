import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";
import { listSourceCards } from "../../src/core/source/listSourceCards.js";

describe("listSourceCards", () => {
  const databasesToClose: ReturnType<typeof openDatabase>[] = [];

  afterEach(() => {
    while (databasesToClose.length > 0) {
      databasesToClose.pop()?.close();
    }
  });

  async function createTestDatabase() {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-source-cards-"));
    const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
    databasesToClose.push(db);
    runMigrations(db);
    seedInitialData(db, { username: "admin", password: "bootstrap-password" });
    return db;
  }

  it("maps the latest collection run onto each source by sourceKind", async () => {
    const db = await createTestDatabase();

    db.exec(`
      UPDATE content_sources
      SET is_active = CASE WHEN kind = 'openai' THEN 1 ELSE 0 END,
          show_all_when_selected = CASE WHEN kind = 'openai' THEN 1 ELSE 0 END
    `);

    db.prepare(
      `
        INSERT INTO collection_runs (run_date, trigger_kind, status, started_at, finished_at, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `
    ).run(
      "2026-03-28",
      "scheduled",
      "completed",
      "2026-03-28T08:00:00.000Z",
      "2026-03-28T08:05:00.000Z",
      JSON.stringify({ sourceKind: "juya" })
    );
    db.prepare(
      `
        INSERT INTO collection_runs (run_date, trigger_kind, status, started_at, finished_at, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `
    ).run(
      "2026-03-28",
      "manual",
      "failed",
      "2026-03-28T09:00:00.000Z",
      "2026-03-28T09:01:00.000Z",
      JSON.stringify({ sourceKind: "openai" })
    );
    db.prepare(
      `
        INSERT INTO collection_runs (run_date, trigger_kind, status, started_at, finished_at, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `
    ).run(
      "2026-03-27",
      "manual",
      "completed",
      "2026-03-27T09:00:00.000Z",
      "2026-03-27T09:02:00.000Z",
      JSON.stringify({ sourceKind: "openai" })
    );

    const cards = listSourceCards(db);

    expect(cards.find((card) => card.kind === "juya")).toMatchObject({
      kind: "juya",
      isEnabled: true,
      showAllWhenSelected: false,
      lastCollectedAt: "2026-03-28T08:05:00.000Z",
      lastCollectionStatus: "completed"
    });
    expect(cards.find((card) => card.kind === "openai")).toMatchObject({
      kind: "openai",
      isEnabled: true,
      showAllWhenSelected: true,
      lastCollectedAt: "2026-03-28T09:01:00.000Z",
      lastCollectionStatus: "failed"
    });
    expect(cards.find((card) => card.kind === "google_ai")).toMatchObject({
      kind: "google_ai",
      showAllWhenSelected: false,
      lastCollectedAt: null,
      lastCollectionStatus: null
    });
  });

  it("ignores collection run rows whose notes do not contain a valid sourceKind", async () => {
    const db = await createTestDatabase();

    db.prepare(
      `
        INSERT INTO collection_runs (run_date, trigger_kind, status, started_at, finished_at, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `
    ).run("2026-03-28", "manual", "completed", "2026-03-28T10:00:00.000Z", "2026-03-28T10:03:00.000Z", "{bad");
    db.prepare(
      `
        INSERT INTO collection_runs (run_date, trigger_kind, status, started_at, finished_at, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `
    ).run("2026-03-28", "manual", "completed", "2026-03-28T11:00:00.000Z", "2026-03-28T11:03:00.000Z", "{}");

    const cards = listSourceCards(db);

    expect(cards.every((card) => card.lastCollectedAt === null && card.lastCollectionStatus === null)).toBe(true);
  });

  it("maps multi-source run notes onto every included source kind", async () => {
    const db = await createTestDatabase();

    db.prepare(
      `
        INSERT INTO collection_runs (run_date, trigger_kind, status, started_at, finished_at, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `
    ).run(
      "2026-03-29",
      "manual",
      "completed",
      "2026-03-29T10:00:00.000Z",
      "2026-03-29T10:04:00.000Z",
      JSON.stringify({ sourceKinds: ["juya", "openai"] })
    );

    const cards = listSourceCards(db);

    expect(cards.find((card) => card.kind === "juya")).toMatchObject({
      lastCollectedAt: "2026-03-29T10:04:00.000Z",
      lastCollectionStatus: "completed"
    });
    expect(cards.find((card) => card.kind === "openai")).toMatchObject({
      lastCollectedAt: "2026-03-29T10:04:00.000Z",
      lastCollectionStatus: "completed"
    });
  });

  it("returns source type and bridge summaries for custom bridge rows", async () => {
    const db = await createTestDatabase();

    db.prepare(
      `
        INSERT INTO content_sources (
          kind,
          name,
          site_url,
          rss_url,
          is_enabled,
          is_builtin,
          show_all_when_selected,
          source_type,
          bridge_kind,
          bridge_config_json
        )
        VALUES (?, ?, ?, ?, 1, 0, 0, 'wechat_bridge', 'resolver', ?)
      `
    ).run(
      "wechat_demo",
      "微信 Demo",
      "https://mp.weixin.qq.com/",
      "https://bridge.example.test/feed/demo.xml",
      JSON.stringify({
        inputMode: "article_url",
        articleUrl: "https://mp.weixin.qq.com/s?__biz=abc",
        resolvedFrom: "resolved-via:article-url"
      })
    );

    const cards = listSourceCards(db);

    expect(cards.find((card) => card.kind === "wechat_demo")).toMatchObject({
      sourceType: "wechat_bridge",
      bridgeKind: "resolver",
      bridgeConfigSummary: "公众号文章链接",
      bridgeInputMode: "article_url",
      bridgeInputValue: "https://mp.weixin.qq.com/s?__biz=abc"
    });
  });

  it("recognizes name-lookup bridge configs for custom bridge rows", async () => {
    const db = await createTestDatabase();

    db.prepare(
      `
        INSERT INTO content_sources (
          kind,
          name,
          site_url,
          rss_url,
          is_enabled,
          is_builtin,
          show_all_when_selected,
          source_type,
          bridge_kind,
          bridge_config_json
        )
        VALUES (?, ?, ?, ?, 1, 0, 0, 'wechat_bridge', 'resolver', ?)
      `
    ).run(
      "wechat_lookup",
      "数字生命卡兹克",
      "https://mp.weixin.qq.com/",
      "https://bridge.example.test/feed/lookup.xml",
      JSON.stringify({
        inputMode: "name_lookup",
        wechatName: "数字生命卡兹克",
        resolvedFrom: "resolved-via:name-lookup"
      })
    );

    const cards = listSourceCards(db);

    expect(cards.find((card) => card.kind === "wechat_lookup")).toMatchObject({
      sourceType: "wechat_bridge",
      bridgeKind: "resolver",
      bridgeConfigSummary: "公众号名称检索",
      bridgeInputMode: "name_lookup",
      bridgeInputValue: "数字生命卡兹克"
    });
  });
});
