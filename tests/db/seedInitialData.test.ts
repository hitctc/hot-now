import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";

describe("seedInitialData", () => {
  const databasesToClose: ReturnType<typeof openDatabase>[] = [];

  afterEach(() => {
    while (databasesToClose.length > 0) {
      databasesToClose.pop()?.close();
    }
  });

  async function createTestDatabase() {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-seed-"));
    const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
    databasesToClose.push(db);
    runMigrations(db);
    return db;
  }

  it("adds is_enabled to content_sources and enables all built-ins on first seed", async () => {
    const db = await createTestDatabase();

    seedInitialData(db, { username: "admin", password: "bootstrap-password" });

    const columns = db
      .prepare("PRAGMA table_info(content_sources)")
      .all() as Array<{ name: string }>;

    expect(columns.some((column) => column.name === "is_enabled")).toBe(true);
    expect(columns.some((column) => column.name === "is_active")).toBe(true);
    expect(columns.some((column) => column.name === "show_all_when_selected")).toBe(true);

    const enabledRows = db
      .prepare(
        `
          SELECT kind, is_enabled, show_all_when_selected
          FROM content_sources
          ORDER BY kind
        `
      )
      .all() as Array<{ kind: string; is_enabled: number; show_all_when_selected: number }>;

    expect(enabledRows).toEqual([
      { kind: "aifanr", is_enabled: 1, show_all_when_selected: 0 },
      { kind: "google_ai", is_enabled: 1, show_all_when_selected: 0 },
      { kind: "ithome", is_enabled: 1, show_all_when_selected: 0 },
      { kind: "juya", is_enabled: 1, show_all_when_selected: 0 },
      { kind: "kr36", is_enabled: 1, show_all_when_selected: 0 },
      { kind: "kr36_newsflash", is_enabled: 1, show_all_when_selected: 0 },
      { kind: "openai", is_enabled: 1, show_all_when_selected: 0 },
      { kind: "techcrunch_ai", is_enabled: 1, show_all_when_selected: 0 }
    ]);

    const activeRows = db
      .prepare(
        `
          SELECT kind
          FROM content_sources
          WHERE is_active = 1
          ORDER BY kind
        `
      )
      .all() as Array<{ kind: string }>;

    expect(activeRows).toEqual([{ kind: "juya" }]);
  });

  it("keeps manually switched active source on reseed", async () => {
    const db = await createTestDatabase();

    seedInitialData(db, { username: "admin", password: "bootstrap-password" });

    db.exec(`
      UPDATE content_sources
      SET is_active = CASE WHEN kind = 'openai' THEN 1 ELSE 0 END
    `);

    seedInitialData(db, { username: "admin", password: "bootstrap-password" });

    const activeRows = db
      .prepare(
        `
          SELECT kind
          FROM content_sources
          WHERE is_active = 1
          ORDER BY kind
        `
      )
      .all() as Array<{ kind: string }>;

    expect(activeRows).toEqual([{ kind: "openai" }]);
  });

  it("keeps show_all_when_selected disabled by default for all built-in sources", async () => {
    const db = await createTestDatabase();

    seedInitialData(db, { username: "admin", password: "bootstrap-password" });

    const rows = db
      .prepare(
        `
          SELECT kind, show_all_when_selected
          FROM content_sources
          ORDER BY kind
        `
      )
      .all() as Array<{ kind: string; show_all_when_selected: number }>;

    expect(rows.every((row) => row.show_all_when_selected === 0)).toBe(true);
  });

  it("seeds default view rules without overwriting existing config_json", async () => {
    const db = await createTestDatabase();

    db.prepare(
      `
        INSERT INTO view_rule_configs (rule_key, display_name, config_json, is_enabled)
        VALUES (?, ?, ?, ?)
      `
    ).run("hot", "热点（自定义）", JSON.stringify({ limit: 99, sort: "manual" }), 1);

    seedInitialData(db, { username: "admin", password: "bootstrap-password" });

    const rows = db
      .prepare(
        `
          SELECT rule_key, display_name, config_json, is_enabled
          FROM view_rule_configs
          ORDER BY rule_key
        `
      )
      .all() as Array<{
      rule_key: string;
      display_name: string;
      config_json: string;
      is_enabled: number;
    }>;

    expect(rows.map((row) => row.rule_key)).toEqual(["ai", "articles", "hot"]);
    expect(JSON.parse(rows.find((row) => row.rule_key === "hot")?.config_json ?? "{}")).toEqual({
      limit: 99,
      sort: "manual"
    });
    expect(rows.find((row) => row.rule_key === "hot")?.display_name).toBe("热点（自定义）");
    expect(JSON.parse(rows.find((row) => row.rule_key === "articles")?.config_json ?? "{}")).toEqual({
      limit: 20,
      freshnessWindowDays: 7,
      freshnessWeight: 0.15,
      sourceWeight: 0.3,
      completenessWeight: 0.35,
      aiWeight: 0.05,
      heatWeight: 0.15
    });
    expect(JSON.parse(rows.find((row) => row.rule_key === "ai")?.config_json ?? "{}")).toEqual({
      limit: 20,
      freshnessWindowDays: 5,
      freshnessWeight: 0.1,
      sourceWeight: 0.1,
      completenessWeight: 0.15,
      aiWeight: 0.5,
      heatWeight: 0.15
    });
  });

  it("seeds fresh default view rules with weighted config_json", async () => {
    const db = await createTestDatabase();

    seedInitialData(db, { username: "admin", password: "bootstrap-password" });

    const rows = db
      .prepare(
        `
          SELECT rule_key, config_json
          FROM view_rule_configs
          ORDER BY rule_key
        `
      )
      .all() as Array<{
      rule_key: string;
      config_json: string;
    }>;

    expect(rows).toEqual([
      {
        rule_key: "ai",
        config_json: JSON.stringify({
          limit: 20,
          freshnessWindowDays: 5,
          freshnessWeight: 0.1,
          sourceWeight: 0.1,
          completenessWeight: 0.15,
          aiWeight: 0.5,
          heatWeight: 0.15
        })
      },
      {
        rule_key: "articles",
        config_json: JSON.stringify({
          limit: 20,
          freshnessWindowDays: 7,
          freshnessWeight: 0.15,
          sourceWeight: 0.3,
          completenessWeight: 0.35,
          aiWeight: 0.05,
          heatWeight: 0.15
        })
      },
      {
        rule_key: "hot",
        config_json: JSON.stringify({
          limit: 20,
          freshnessWindowDays: 3,
          freshnessWeight: 0.35,
          sourceWeight: 0.1,
          completenessWeight: 0.1,
          aiWeight: 0.05,
          heatWeight: 0.4
        })
      }
    ]);
  });
});
