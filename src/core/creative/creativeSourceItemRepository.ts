import type { SqliteDatabase } from "../db/openDatabase.js";
import type { CreativeSourceItemQualityStatus } from "./types.js";

// ── Column selection & row mapping ──────────────────────────────────────────

const SELECT_COLUMNS = `
  id,
  external_id,
  collector_agent,
  title,
  url,
  source_name,
  summary,
  full_content,
  author,
  cover_image_url,
  tags,
  language,
  word_count,
  content_type,
  score,
  published_at,
  collector_timestamp,
  quality_status,
  raw_payload_json,
  linked_article_id,
  created_at,
  updated_at
` as const;

type SourceItemRow = {
  id: number;
  external_id: string;
  collector_agent: string;
  title: string;
  url: string;
  source_name: string | null;
  summary: string | null;
  full_content: string | null;
  author: string | null;
  cover_image_url: string | null;
  tags: string | null;
  language: string;
  word_count: number | null;
  content_type: string | null;
  score: number | null;
  published_at: string | null;
  collector_timestamp: string | null;
  quality_status: string;
  raw_payload_json: string;
  linked_article_id: number | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: SourceItemRow): CreativeSourceItemRecord {
  return {
    id: row.id,
    externalId: row.external_id,
    collectorAgent: row.collector_agent,
    title: row.title,
    url: row.url,
    sourceName: row.source_name,
    summary: row.summary,
    fullContent: row.full_content,
    author: row.author,
    coverImageUrl: row.cover_image_url,
    tags: row.tags,
    language: row.language,
    wordCount: row.word_count,
    contentType: row.content_type,
    score: row.score,
    publishedAt: row.published_at,
    collectorTimestamp: row.collector_timestamp,
    qualityStatus: row.quality_status as CreativeSourceItemQualityStatus,
    rawPayloadJson: row.raw_payload_json,
    linkedArticleId: row.linked_article_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// ── Public types ────────────────────────────────────────────────────────────

export type CreativeSourceItemRecord = {
  id: number;
  externalId: string;
  collectorAgent: string;
  title: string;
  url: string;
  sourceName: string | null;
  summary: string | null;
  fullContent: string | null;
  author: string | null;
  coverImageUrl: string | null;
  tags: string | null;
  language: string;
  wordCount: number | null;
  contentType: string | null;
  score: number | null;
  publishedAt: string | null;
  collectorTimestamp: string | null;
  qualityStatus: CreativeSourceItemQualityStatus;
  rawPayloadJson: string;
  linkedArticleId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type InsertCreativeSourceItemInput = {
  externalId: string;
  collectorAgent: string;
  title: string;
  url: string;
  sourceName?: string | null;
  summary?: string | null;
  fullContent?: string | null;
  author?: string | null;
  coverImageUrl?: string | null;
  tags?: string | null;
  language?: string;
  wordCount?: number | null;
  contentType?: string | null;
  score?: number | null;
  publishedAt?: string | null;
  collectorTimestamp?: string | null;
};

export type ListCreativeSourceItemsFilters = {
  page?: number;
  pageSize?: number;
  qualityStatus?: CreativeSourceItemQualityStatus;
  collectorAgent?: string;
  search?: string;
};

export type ListCreativeSourceItemsResult = {
  items: CreativeSourceItemRecord[];
  total: number;
  page: number;
  pageSize: number;
};

// ── Insert ──────────────────────────────────────────────────────────────────

export function insertCreativeSourceItem(
  db: SqliteDatabase,
  input: InsertCreativeSourceItemInput
): { id: number; created: boolean } {
  // Idempotent insert: if the same externalId + collectorAgent pair already exists, return the
  // existing row id without overwriting any data. This keeps repeated collector runs safe.
  const existing = db
    .prepare("SELECT id FROM creative_source_items WHERE external_id = ? AND collector_agent = ?")
    .get(input.externalId, input.collectorAgent) as { id: number } | undefined;

  if (existing) {
    return { id: existing.id, created: false };
  }

  const rawPayloadJson = JSON.stringify(input);

  db.prepare(
    `
      INSERT INTO creative_source_items (
        external_id,
        collector_agent,
        title,
        url,
        source_name,
        summary,
        full_content,
        author,
        cover_image_url,
        tags,
        language,
        word_count,
        content_type,
        score,
        published_at,
        collector_timestamp,
        raw_payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    input.externalId,
    input.collectorAgent,
    input.title,
    input.url,
    input.sourceName ?? null,
    input.summary ?? null,
    input.fullContent ?? null,
    input.author ?? null,
    input.coverImageUrl ?? null,
    input.tags ?? null,
    input.language ?? "zh",
    input.wordCount ?? null,
    input.contentType ?? null,
    input.score ?? null,
    input.publishedAt ?? null,
    input.collectorTimestamp ?? null,
    rawPayloadJson
  );

  const row = db
    .prepare("SELECT id FROM creative_source_items WHERE external_id = ? AND collector_agent = ?")
    .get(input.externalId, input.collectorAgent) as { id: number } | undefined;

  if (!row) {
    throw new Error("creative source item insert did not return a persisted row");
  }

  return { id: row.id, created: true };
}

// ── Find by id ──────────────────────────────────────────────────────────────

export function findCreativeSourceItemById(db: SqliteDatabase, id: number): CreativeSourceItemRecord | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM creative_source_items WHERE id = ?`)
    .get(id) as SourceItemRow | undefined;

  return row ? mapRow(row) : null;
}

// ── Find by external id + collector agent ───────────────────────────────────

export function findCreativeSourceItemByExternalId(
  db: SqliteDatabase,
  externalId: string,
  collectorAgent: string
): CreativeSourceItemRecord | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM creative_source_items WHERE external_id = ? AND collector_agent = ?`)
    .get(externalId, collectorAgent) as SourceItemRow | undefined;

  return row ? mapRow(row) : null;
}

// ── List with pagination and filters ────────────────────────────────────────

export function listCreativeSourceItems(
  db: SqliteDatabase,
  filters: ListCreativeSourceItemsFilters = {}
): ListCreativeSourceItemsResult {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, filters.pageSize ?? 20);

  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (filters.qualityStatus) {
    whereClauses.push("quality_status = ?");
    params.push(filters.qualityStatus);
  }

  if (filters.collectorAgent) {
    whereClauses.push("collector_agent = ?");
    params.push(filters.collectorAgent);
  }

  if (filters.search) {
    whereClauses.push("(title LIKE ? OR summary LIKE ?)");
    const term = `%${filters.search}%`;
    params.push(term, term);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM creative_source_items ${whereClause}`)
    .get(...params) as { total: number };

  const offset = (page - 1) * pageSize;
  const items = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM creative_source_items ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as SourceItemRow[];

  return {
    items: items.map(mapRow),
    total: countRow.total,
    page,
    pageSize
  };
}

// ── Update quality status ───────────────────────────────────────────────────

export function updateCreativeSourceItemQualityStatus(
  db: SqliteDatabase,
  id: number,
  status: CreativeSourceItemQualityStatus
): boolean {
  const result = db
    .prepare("UPDATE creative_source_items SET quality_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(status, id);

  return result.changes > 0;
}

// ── Update linked article ───────────────────────────────────────────────────

export function updateCreativeSourceItemLinkedArticle(
  db: SqliteDatabase,
  id: number,
  articleId: number
): boolean {
  const result = db
    .prepare(
      "UPDATE creative_source_items SET linked_article_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .run(articleId, id);

  return result.changes > 0;
}
