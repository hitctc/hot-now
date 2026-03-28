import type { SqliteDatabase } from "../db/openDatabase.js";
import type { SourceKind } from "../source/types.js";

export type ContentSourceRecord = {
  id: number;
  kind: SourceKind;
  name: string;
  siteUrl: string;
  rssUrl: string | null;
};

export type UpsertContentItemInput = {
  externalId?: string;
  title: string;
  canonicalUrl: string;
  summary?: string;
  bodyMarkdown?: string;
  publishedAt?: string;
  fetchedAt?: string;
};

export type CreateCollectionRunInput = {
  runDate: string;
  triggerKind: string;
  status: string;
  startedAt: string;
  notes?: string;
};

export type FinishCollectionRunInput = {
  id: number;
  status: string;
  finishedAt: string;
  notes?: string;
};

// This resolves the persisted source row so callers can attach collected items to the same
// source catalog that migrations and seed data already manage.
export function resolveSourceByKind(db: SqliteDatabase, kind: SourceKind): ContentSourceRecord | undefined {
  return db
    .prepare(
      `
        SELECT id, kind, name, site_url AS siteUrl, rss_url AS rssUrl
        FROM content_sources
        WHERE kind = ?
        LIMIT 1
      `
    )
    .get(kind) as ContentSourceRecord | undefined;
}

// Content items are upserted on the existing `(source_id, canonical_url)` key so repeated runs
// refresh extracted text without creating duplicate rows for the same source article.
export function upsertContentItems(
  db: SqliteDatabase,
  params: { sourceId: number; items: UpsertContentItemInput[] }
): void {
  const statement = db.prepare(
    `
      INSERT INTO content_items (
        source_id,
        external_id,
        title,
        canonical_url,
        summary,
        body_markdown,
        published_at,
        fetched_at,
        updated_at
      )
      VALUES (
        @sourceId,
        @externalId,
        @title,
        @canonicalUrl,
        @summary,
        @bodyMarkdown,
        @publishedAt,
        @fetchedAt,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_id, canonical_url) DO UPDATE SET
        external_id = excluded.external_id,
        title = excluded.title,
        summary = excluded.summary,
        body_markdown = excluded.body_markdown,
        published_at = excluded.published_at,
        fetched_at = excluded.fetched_at,
        updated_at = CURRENT_TIMESTAMP
    `
  );

  const upsert = db.transaction((items: UpsertContentItemInput[]) => {
    for (const item of items) {
      statement.run({
        sourceId: params.sourceId,
        externalId: item.externalId ?? null,
        title: item.title,
        canonicalUrl: item.canonicalUrl,
        summary: item.summary ?? null,
        bodyMarkdown: item.bodyMarkdown ?? null,
        publishedAt: item.publishedAt ?? null,
        fetchedAt: item.fetchedAt ?? null
      });
    }
  });

  upsert(params.items);
}

// A collection run row is created as soon as a digest has enough source context to be tracked,
// so later steps can either complete it or mark the run as failed.
export function createCollectionRun(db: SqliteDatabase, input: CreateCollectionRunInput): number {
  const result = db
    .prepare(
      `
        INSERT INTO collection_runs (
          run_date,
          trigger_kind,
          status,
          started_at,
          notes
        )
        VALUES (?, ?, ?, ?, ?)
      `
    )
    .run(input.runDate, input.triggerKind, input.status, input.startedAt, input.notes ?? null);

  return Number(result.lastInsertRowid);
}

// The run row is updated in place so downstream report metadata can point at a stable execution id.
export function finishCollectionRun(db: SqliteDatabase, input: FinishCollectionRunInput): void {
  db.prepare(
    `
      UPDATE collection_runs
      SET status = ?,
          finished_at = ?,
          notes = ?
      WHERE id = ?
    `
  ).run(input.status, input.finishedAt, input.notes ?? null, input.id);
}
