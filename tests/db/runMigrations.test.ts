import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyPassword } from "../../src/core/auth/passwords.js";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";

const expectedTables = [
  "collection_runs",
  "content_feedback",
  "content_items",
  "content_nl_evaluations",
  "content_ratings",
  "content_sources",
  "digest_reports",
  "feedback_pool",
  "llm_provider_settings",
  "nl_evaluation_runs",
  "nl_rule_sets",
  "rating_dimensions",
  "strategy_drafts",
  "user_profile",
  "view_rule_configs"
];

describe("runMigrations", () => {
  const databasesToClose: ReturnType<typeof openDatabase>[] = [];

  afterEach(() => {
    while (databasesToClose.length > 0) {
      databasesToClose.pop()?.close();
    }
  });

  it("creates the unified site tables and seeds the built-in source kinds", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-db-"));
    const dbPath = path.join(tempDir, "hot-now.sqlite");
    const db = openDatabase(dbPath);
    databasesToClose.push(db);

    runMigrations(db);
    seedInitialData(db, {
      username: "admin",
      password: "bootstrap-password"
    });
    seedInitialData(db, {
      username: "admin",
      password: "bootstrap-password"
    });

    const rows = db
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
          ORDER BY name
        `
      )
      .all() as Array<{ name: string }>;

    expect(rows.map((row) => row.name)).toEqual([...expectedTables, "schema_migrations"].sort());

    const schemaVersion = db.pragma("user_version", { simple: true }) as number;
    expect(schemaVersion).toBe(4);

    const appliedMigrations = db
      .prepare(
        `
          SELECT version, name
          FROM schema_migrations
          ORDER BY version
        `
      )
      .all() as Array<{ version: number; name: string }>;

    expect(appliedMigrations).toEqual([
      { version: 1, name: "001_unified_site_baseline" },
      { version: 2, name: "002_digest_report_mail_attempts" },
      { version: 3, name: "003_feedback_and_llm_strategy_workbench" },
      { version: 4, name: "004_source_display_mode" }
    ]);

    const digestReportColumns = db
      .prepare(
        `
          PRAGMA table_info(digest_reports)
        `
      )
      .all() as Array<{ name: string }>;

    expect(digestReportColumns.map((column) => column.name)).toContain("last_email_attempted_at");

    const sourceColumns = db
      .prepare(
        `
          PRAGMA table_info(content_sources)
        `
      )
      .all() as Array<{ name: string }>;

    expect(sourceColumns.map((column) => column.name)).toContain("show_all_when_selected");

    const sourceRows = db
      .prepare(
        `
          SELECT kind, is_enabled, show_all_when_selected
          FROM content_sources
          ORDER BY kind
        `
      )
      .all() as Array<{ kind: string; is_enabled: number; show_all_when_selected: number }>;

    expect(sourceRows).toEqual([
      { kind: "aifanr", is_enabled: 1, show_all_when_selected: 0 },
      { kind: "google_ai", is_enabled: 1, show_all_when_selected: 0 },
      { kind: "ithome", is_enabled: 1, show_all_when_selected: 0 },
      { kind: "juya", is_enabled: 1, show_all_when_selected: 0 },
      { kind: "kr36", is_enabled: 1, show_all_when_selected: 0 },
      { kind: "kr36_newsflash", is_enabled: 1, show_all_when_selected: 0 },
      { kind: "openai", is_enabled: 1, show_all_when_selected: 0 },
      { kind: "techcrunch_ai", is_enabled: 1, show_all_when_selected: 0 }
    ]);

    const adminRow = db
      .prepare(
        `
          SELECT username, password_hash, role
          FROM user_profile
          WHERE id = 1
        `
      )
      .get() as { username: string; password_hash: string; role: string } | undefined;

    expect(adminRow?.username).toBe("admin");
    expect(adminRow?.role).toBe("admin");
    expect(adminRow?.password_hash).toMatch(/^scrypt\$/);
    expect(adminRow?.password_hash).not.toContain("bootstrap-password");
    expect(verifyPassword("bootstrap-password", adminRow?.password_hash ?? "")).toBe(true);
    expect(verifyPassword("wrong-password", adminRow?.password_hash ?? "")).toBe(false);
  });

  it("keeps the juya row aligned with legacy config.source.rssUrl without resetting other source URLs", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-db-"));
    const dbPath = path.join(tempDir, "hot-now.sqlite");
    const db = openDatabase(dbPath);
    databasesToClose.push(db);

    runMigrations(db);
    seedInitialData(db, {
      username: "admin",
      password: "bootstrap-password",
      juyaRssUrl: "https://legacy.example.com/custom-juya.xml"
    });

    db.prepare(
      `
        UPDATE content_sources
        SET rss_url = ?
        WHERE kind = 'openai'
      `
    ).run("https://manual.example.com/openai.xml");

    seedInitialData(db, {
      username: "admin",
      password: "bootstrap-password",
      juyaRssUrl: "https://legacy.example.com/custom-juya.xml"
    });

    const rows = db
      .prepare(
        `
          SELECT kind, rss_url
          FROM content_sources
          WHERE kind IN ('juya', 'openai')
          ORDER BY kind
        `
      )
      .all() as Array<{ kind: string; rss_url: string }>;

    expect(rows).toEqual([
      { kind: "juya", rss_url: "https://legacy.example.com/custom-juya.xml" },
      { kind: "openai", rss_url: "https://manual.example.com/openai.xml" }
    ]);
  });
});
