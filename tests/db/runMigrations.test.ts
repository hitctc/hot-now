import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";

const expectedTables = [
  "collection_runs",
  "content_feedback",
  "content_items",
  "content_ratings",
  "content_sources",
  "digest_reports",
  "rating_dimensions",
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
    expect(schemaVersion).toBe(1);

    const appliedMigrations = db
      .prepare(
        `
          SELECT version, name
          FROM schema_migrations
          ORDER BY version
        `
      )
      .all() as Array<{ version: number; name: string }>;

    expect(appliedMigrations).toEqual([{ version: 1, name: "001_unified_site_baseline" }]);

    const sourceKinds = db
      .prepare(
        `
          SELECT kind
          FROM content_sources
          ORDER BY kind
        `
      )
      .all() as Array<{ kind: string }>;

    expect(sourceKinds.map((row) => row.kind)).toEqual([
      "google_ai",
      "juya",
      "openai",
      "techcrunch_ai"
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
  });
});
