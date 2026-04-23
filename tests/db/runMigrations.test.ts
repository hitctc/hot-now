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
  "hackernews_queries",
  "llm_provider_settings",
  "nl_evaluation_runs",
  "nl_rule_sets",
  "rating_dimensions",
  "strategy_drafts",
  "twitter_accounts",
  "twitter_search_keyword_matches",
  "twitter_search_keywords",
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
    expect(schemaVersion).toBe(10);

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
      { version: 4, name: "004_source_display_mode" },
      { version: 5, name: "005_nl_rule_enabled_flag" },
      { version: 6, name: "006_provider_settings_multi_save" },
      { version: 7, name: "007_source_bridge_metadata" },
      { version: 8, name: "008_twitter_accounts" },
      { version: 9, name: "009_twitter_search_keywords" },
      { version: 10, name: "010_hackernews_queries" }
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

    expect(sourceColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["show_all_when_selected", "source_type", "bridge_kind", "bridge_config_json"])
    );

    const contentItemColumns = db
      .prepare(
        `
          PRAGMA table_info(content_items)
        `
      )
      .all() as Array<{ name: string }>;

    expect(contentItemColumns.map((column) => column.name)).toContain("metadata_json");

    const twitterAccountColumns = db
      .prepare(
        `
          PRAGMA table_info(twitter_accounts)
        `
      )
      .all() as Array<{ name: string }>;

    expect(twitterAccountColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "id",
        "username",
        "user_id",
        "display_name",
        "category",
        "priority",
        "include_replies",
        "is_enabled",
        "notes",
        "last_fetched_at",
        "last_success_at",
        "last_error",
        "created_at",
        "updated_at"
      ])
    );

    const twitterSearchKeywordColumns = db
      .prepare(
        `
          PRAGMA table_info(twitter_search_keywords)
        `
      )
      .all() as Array<{ name: string }>;

    expect(twitterSearchKeywordColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "id",
        "keyword",
        "category",
        "priority",
        "is_collect_enabled",
        "is_visible",
        "notes",
        "last_fetched_at",
        "last_success_at",
        "last_result",
        "created_at",
        "updated_at"
      ])
    );

    const twitterSearchKeywordMatchColumns = db
      .prepare(
        `
          PRAGMA table_info(twitter_search_keyword_matches)
        `
      )
      .all() as Array<{ name: string }>;

    expect(twitterSearchKeywordMatchColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "id",
        "keyword_id",
        "tweet_external_id",
        "content_item_id",
        "created_at",
        "updated_at"
      ])
    );

    const hackerNewsQueryColumns = db
      .prepare(
        `
          PRAGMA table_info(hackernews_queries)
        `
      )
      .all() as Array<{ name: string }>;

    expect(hackerNewsQueryColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "id",
        "query",
        "priority",
        "is_enabled",
        "notes",
        "last_fetched_at",
        "last_success_at",
        "last_result",
        "created_at",
        "updated_at"
      ])
    );

    const providerSettingsColumns = db
      .prepare(
        `
          PRAGMA table_info(llm_provider_settings)
        `
      )
      .all() as Array<{ name: string }>;

    expect(providerSettingsColumns.map((column) => column.name)).not.toContain("id");
    expect(providerSettingsColumns.map((column) => column.name)).toContain("provider_kind");

    const sourceRows = db
      .prepare(
        `
          SELECT kind, is_enabled, show_all_when_selected
               , source_type, bridge_kind, bridge_config_json
          FROM content_sources
          ORDER BY kind
        `
      )
      .all() as Array<{
      kind: string;
      is_enabled: number;
      show_all_when_selected: number;
      source_type: string;
      bridge_kind: string | null;
      bridge_config_json: string | null;
    }>;

    expect(sourceRows.length).toBeGreaterThan(8);
    expect(sourceRows).toEqual(
      expect.arrayContaining([
        {
          kind: "openai",
          is_enabled: 1,
          show_all_when_selected: 0,
          source_type: "rss",
          bridge_kind: null,
          bridge_config_json: null
        },
        {
          kind: "juya",
          is_enabled: 1,
          show_all_when_selected: 0,
          source_type: "rss",
          bridge_kind: null,
          bridge_config_json: null
        },
        {
          kind: "twitter_keyword_search",
          is_enabled: 0,
          show_all_when_selected: 0,
          source_type: "twitter_keyword_aggregate",
          bridge_kind: null,
          bridge_config_json: null
        },
        {
          kind: "hackernews_search",
          is_enabled: 0,
          show_all_when_selected: 0,
          source_type: "hackernews_aggregate",
          bridge_kind: null,
          bridge_config_json: null
        }
      ])
    );
    expect(sourceRows.filter((source) => source.source_type === "rss").every((source) => source.bridge_kind === null)).toBe(true);

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

  it("keeps the juya row aligned with legacy config.source.rssUrl while refreshing built-in catalog URLs", async () => {
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
      { kind: "openai", rss_url: "https://openai.com/news/rss.xml" }
    ]);
  });
});
