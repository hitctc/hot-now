import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveSourceByKind, upsertContentItems } from "../../src/core/content/contentRepository.js";
import { openDatabase, type SqliteDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";
import type { SourceKind } from "../../src/core/source/types.js";

export type TestDatabaseHandle = {
  db: SqliteDatabase;
  tempDir: string;
  close: () => void;
};

type InsertTestContentItemInput = {
  sourceKind?: SourceKind;
  title?: string;
  canonicalUrl?: string;
  summary?: string;
  bodyMarkdown?: string;
  publishedAt?: string;
  fetchedAt?: string;
};

export async function createTestDatabase(prefix = "hot-now-test-db-"): Promise<TestDatabaseHandle> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));

  runMigrations(db);
  seedInitialData(db, {
    username: "admin",
    password: "bootstrap-password"
  });

  return {
    db,
    tempDir,
    close: () => db.close()
  };
}

export function insertTestContentItem(db: SqliteDatabase, input: InsertTestContentItemInput = {}): number {
  const sourceKind = input.sourceKind ?? "juya";
  const canonicalUrl = input.canonicalUrl ?? `https://example.com/${sourceKind}-${Date.now()}`;
  const source = resolveSourceByKind(db, sourceKind);

  if (!source) {
    throw new Error(`source not found: ${sourceKind}`);
  }

  upsertContentItems(db, {
    sourceId: source.id,
    items: [
      {
        title: input.title ?? "A test article",
        canonicalUrl,
        summary: input.summary ?? "short summary",
        bodyMarkdown: input.bodyMarkdown ?? "body markdown",
        publishedAt: input.publishedAt ?? "2026-03-28T08:00:00.000Z",
        fetchedAt: input.fetchedAt ?? "2026-03-28T08:01:00.000Z"
      }
    ]
  });

  const row = db.prepare("SELECT id FROM content_items WHERE canonical_url = ? LIMIT 1").get(canonicalUrl) as
    | { id: number }
    | undefined;

  if (!row) {
    throw new Error("content item insert failed");
  }

  return row.id;
}
