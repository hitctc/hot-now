import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCollectionRun, finishCollectionRun, resolveSourceByKind, upsertContentItems } from "../../src/core/content/contentRepository.js";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";

describe("contentRepository", () => {
  const databasesToClose: ReturnType<typeof openDatabase>[] = [];

  afterEach(() => {
    while (databasesToClose.length > 0) {
      databasesToClose.pop()?.close();
    }
  });

  it("deduplicates content items by canonical_url within the same source", async () => {
    const db = await createTestDatabase();
    const source = resolveSourceByKind(db, "juya");

    expect(source).toBeDefined();

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          externalId: "item-1",
          title: "First title",
          canonicalUrl: "https://example.com/article-1",
          summary: "first summary",
          bodyMarkdown: "first body",
          metadataJson: '{"source":"initial"}',
          publishedAt: "2026-03-28T08:00:00.000Z",
          fetchedAt: "2026-03-28T08:05:00.000Z"
        }
      ]
    });

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          externalId: "item-1-updated",
          title: "Updated title",
          canonicalUrl: "https://example.com/article-1",
          summary: "updated summary",
          bodyMarkdown: "updated body",
          metadataJson: '{"source":"updated"}',
          publishedAt: "2026-03-28T08:00:00.000Z",
          fetchedAt: "2026-03-28T09:00:00.000Z"
        }
      ]
    });

    const rows = db
      .prepare(
        `
          SELECT external_id, title, canonical_url, summary, body_markdown, metadata_json, fetched_at
          FROM content_items
          WHERE source_id = ?
        `
      )
      .all(source!.id) as Array<{
      external_id: string;
      title: string;
      canonical_url: string;
      summary: string;
      body_markdown: string;
      metadata_json: string;
      fetched_at: string;
    }>;

    expect(rows).toEqual([
      {
        external_id: "item-1-updated",
        title: "Updated title",
        canonical_url: "https://example.com/article-1",
        summary: "updated summary",
        body_markdown: "updated body",
        metadata_json: '{"source":"updated"}',
        fetched_at: "2026-03-28T09:00:00.000Z"
      }
    ]);
  });

  it("creates and finishes a collection run with the final status fields", async () => {
    const db = await createTestDatabase();

    const runId = createCollectionRun(db, {
      runDate: "2026-03-28",
      triggerKind: "manual",
      status: "running",
      startedAt: "2026-03-28T08:00:00.000Z",
      notes: '{"phase":"collecting"}'
    });

    finishCollectionRun(db, {
      id: runId,
      status: "completed",
      finishedAt: "2026-03-28T08:03:00.000Z",
      notes: '{"phase":"complete"}'
    });

    const row = db
      .prepare(
        `
          SELECT run_date, trigger_kind, status, started_at, finished_at, notes
          FROM collection_runs
          WHERE id = ?
        `
      )
      .get(runId) as {
      run_date: string;
      trigger_kind: string;
      status: string;
      started_at: string;
      finished_at: string;
      notes: string;
    };

    expect(row).toEqual({
      run_date: "2026-03-28",
      trigger_kind: "manual",
      status: "completed",
      started_at: "2026-03-28T08:00:00.000Z",
      finished_at: "2026-03-28T08:03:00.000Z",
      notes: '{"phase":"complete"}'
    });
  });

  it("keeps an existing non-empty body when a later degraded update has an empty body", async () => {
    const db = await createTestDatabase();
    const source = resolveSourceByKind(db, "juya");

    expect(source).toBeDefined();

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          externalId: "item-1",
          title: "Initial title",
          canonicalUrl: "https://example.com/article-1",
          summary: "initial summary",
          bodyMarkdown: "preserved body",
          publishedAt: "2026-03-28T08:00:00.000Z",
          fetchedAt: "2026-03-28T08:05:00.000Z"
        }
      ]
    });

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          externalId: "item-1-retry",
          title: "Retry title",
          canonicalUrl: "https://example.com/article-1",
          summary: "retry summary",
          bodyMarkdown: "",
          publishedAt: "2026-03-28T08:00:00.000Z",
          fetchedAt: "2026-03-28T09:00:00.000Z"
        }
      ]
    });

    const row = db
      .prepare(
        `
          SELECT external_id, title, summary, body_markdown, fetched_at
          FROM content_items
          WHERE source_id = ?
            AND canonical_url = ?
        `
      )
      .get(source!.id, "https://example.com/article-1") as {
      external_id: string;
      title: string;
      summary: string;
      body_markdown: string;
      fetched_at: string;
    };

    expect(row).toEqual({
      external_id: "item-1-retry",
      title: "Retry title",
      summary: "retry summary",
      body_markdown: "preserved body",
      fetched_at: "2026-03-28T09:00:00.000Z"
    });
  });

  async function createTestDatabase() {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-content-"));
    const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
    databasesToClose.push(db);
    runMigrations(db);
    seedInitialData(db, {
      username: "admin",
      password: "bootstrap-password"
    });
    return db;
  }
});
