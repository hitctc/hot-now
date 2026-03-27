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
    seedInitialData(db);
    seedInitialData(db);

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

    expect(rows.map((row) => row.name)).toEqual(expectedTables);

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
  });
});
