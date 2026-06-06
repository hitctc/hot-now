import type { SqliteDatabase } from "../db/openDatabase.js";
import type { CreativeSourceItemWritingStatus } from "./types.js";

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
  writing_status,
  raw_payload_json,
  trend_score,
  trend_breakdown,
  traced_sources_json,
  linked_article_id,
  created_at,
  updated_at,
  (SELECT COUNT(*) FROM creative_finished_articles WHERE source_item_id = creative_source_items.id) AS write_count
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
  writing_status: string;
  raw_payload_json: string;
  trend_score: number | null;
  trend_breakdown: string | null;
  traced_sources_json: string | null;
  linked_article_id: number | null;
  created_at: string;
  updated_at: string;
  write_count: number;
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
    writingStatus: row.writing_status as CreativeSourceItemWritingStatus,
    rawPayloadJson: row.raw_payload_json,
    trendScore: row.trend_score,
    trendBreakdown: row.trend_breakdown ? JSON.parse(row.trend_breakdown) : null,
    tracedSources: row.traced_sources_json ? JSON.parse(row.traced_sources_json) : null,
    linkedArticleId: row.linked_article_id,
    writeCount: row.write_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// ── Public types ────────────────────────────────────────────────────────────

/** 溯源结果条目 */
export type TracedSource = {
  title: string;
  url: string;
  source_name: string;
  published_at?: string;
  relevance_score?: number;
  reason?: string;
};

export type TrendBreakdown = {
  topicPower: number;
  emotionResonance: number;
  infoGap: number;
  socialCurrency: number;
  timingWindow: number;
  audienceBreadth: number;
};

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
  writingStatus: CreativeSourceItemWritingStatus;
  rawPayloadJson: string;
  trendScore: number | null;
  trendBreakdown: TrendBreakdown | null;
  tracedSources: TracedSource[] | null;
  linkedArticleId: number | null;
  writeCount: number;
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
  writingStatus?: CreativeSourceItemWritingStatus;
  trendScore?: number | null;
  trendBreakdown?: TrendBreakdown | null;
};

export type ListCreativeSourceItemsFilters = {
  page?: number;
  pageSize?: number;
  writingStatus?: CreativeSourceItemWritingStatus;
  collectorAgent?: string;
  sourceName?: string;
  search?: string;
  trendScoreMin?: number;
  last24h?: boolean;
  sourceFeed?: string;
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
  // 幂等插入：先按 externalId + collectorAgent 查，再按 url + collectorAgent 兜底
  let existing = db
    .prepare("SELECT id, full_content, summary, source_name, author, cover_image_url, tags, word_count, content_type, score, published_at, collector_timestamp FROM creative_source_items WHERE external_id = ? AND collector_agent = ?")
    .get(input.externalId, input.collectorAgent) as Record<string, unknown> | undefined;

  if (!existing && input.url) {
    existing = db
      .prepare("SELECT id, full_content, summary, source_name, author, cover_image_url, tags, word_count, content_type, score, published_at, collector_timestamp FROM creative_source_items WHERE url = ? AND collector_agent = ?")
      .get(input.url, input.collectorAgent) as Record<string, unknown> | undefined;
  }

  if (existing) {
    const patches: { col: string; val: unknown }[] = [];
    type FieldMap = { input: string | number | null | undefined; col: string };
    const fields: FieldMap[] = [
      { input: input.fullContent, col: "full_content" },
      { input: input.summary, col: "summary" },
      { input: input.sourceName, col: "source_name" },
      { input: input.author, col: "author" },
      { input: input.coverImageUrl, col: "cover_image_url" },
      { input: input.tags, col: "tags" },
      { input: input.wordCount, col: "word_count" },
      { input: input.contentType, col: "content_type" },
      { input: input.score, col: "score" },
      { input: input.publishedAt, col: "published_at" },
      { input: input.collectorTimestamp, col: "collector_timestamp" },
      { input: input.trendScore, col: "trend_score" },
      { input: input.trendBreakdown ? JSON.stringify(input.trendBreakdown) : undefined, col: "trend_breakdown" },
    ];
    for (const f of fields) {
      if (f.input == null) continue;
      const existingVal = existing[f.col];
      // full_content 字段：已有值是反爬垃圾内容时允许覆盖
      if (f.col === "full_content" && existingVal != null && typeof existingVal === "string" && existingVal.includes("环境异常")) {
        patches.push({ col: f.col, val: f.input });
      } else if (existingVal === null || existingVal === undefined) {
        patches.push({ col: f.col, val: f.input });
      }
    }
    if (patches.length > 0) {
      const setClause = patches.map(p => `${p.col} = ?`).join(", ") + ", updated_at = CURRENT_TIMESTAMP";
      db.prepare(`UPDATE creative_source_items SET ${setClause} WHERE id = ?`).run(
        ...patches.map(p => p.val),
        existing.id
      );
    }
    return { id: existing.id as number, created: false };
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
        writing_status,
        raw_payload_json,
        trend_score,
        trend_breakdown
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    input.writingStatus ?? "ready",
    rawPayloadJson,
    input.trendScore ?? null,
    input.trendBreakdown ? JSON.stringify(input.trendBreakdown) : null
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
  // 先精确匹配 external_id + collector_agent
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM creative_source_items WHERE external_id = ? AND collector_agent = ?`)
    .get(externalId, collectorAgent) as SourceItemRow | undefined;
  if (row) return mapRow(row);

  // 兜底：只按 external_id 匹配（Hermes 传的 collectorAgent 可能与 DB 不一致）
  const fallback = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM creative_source_items WHERE external_id = ?`)
    .get(externalId) as SourceItemRow | undefined;
  return fallback ? mapRow(fallback) : null;
}

// ── List with pagination and filters ────────────────────────────────────────

export function listCreativeSourceItems(
  db: SqliteDatabase,
  filters: ListCreativeSourceItemsFilters = {}
): ListCreativeSourceItemsResult {
  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (filters.writingStatus) {
    whereClauses.push("writing_status = ?");
    params.push(filters.writingStatus);
  }

  if (filters.collectorAgent) {
    whereClauses.push("collector_agent = ?");
    params.push(filters.collectorAgent);
  }

  if (filters.sourceName) {
    whereClauses.push("source_name LIKE ?");
    params.push(`%${filters.sourceName}%`);
  }

  if (filters.search) {
    whereClauses.push("(title LIKE ? OR summary LIKE ?)");
    const term = `%${filters.search}%`;
    params.push(term, term);
  }

  if (filters.trendScoreMin != null) {
    whereClauses.push("trend_score >= ?");
    params.push(filters.trendScoreMin);
  }

  // last24h 模式：只返回最近 24 小时内发布的素材，不分页
  // 按发布时间（published_at）过滤，published_at 为空时回退到入库时间（created_at）
  if (filters.last24h) {
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const cutoff = d.toISOString().replace("T", " ").substring(0, 19);
    whereClauses.push("COALESCE(published_at, created_at) >= ?");
    params.push(cutoff);
  }

  // sourceFeed：按 sourceName 前缀匹配筛选数据源
  if (filters.sourceFeed) {
    const sourceFeedNameMap: Record<string, string> = {
      "juya-ai-daily": "Juya AI Daily",
      "wechat-rss": "微信公众号："
    };
    const namePattern = sourceFeedNameMap[filters.sourceFeed];
    if (namePattern) {
      whereClauses.push("source_name LIKE ?");
      params.push(`${namePattern}%`);
    }
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM creative_source_items ${whereClause}`)
    .get(...params) as { total: number };

  let items: SourceItemRow[];
  if (filters.last24h) {
    // 不分页，一次返回全部
    items = db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM creative_source_items ${whereClause} ORDER BY created_at DESC`)
      .all(...params) as SourceItemRow[];
  } else {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.max(1, filters.pageSize ?? 20);
    const offset = (page - 1) * pageSize;
    items = db
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

  return {
    items: items.map(mapRow),
    total: countRow.total,
    page: 1,
    pageSize: countRow.total
  };
}

// ── Update writing status ───────────────────────────────────────────────────

export function updateCreativeSourceItemWritingStatus(
  db: SqliteDatabase,
  id: number,
  status: CreativeSourceItemWritingStatus
): boolean {
  const result = db
    .prepare("UPDATE creative_source_items SET writing_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(status, id);

  return result.changes > 0;
}

// ── Update trend score ──────────────────────────────────────────────────────

export function updateCreativeSourceItemTrendScore(
  db: SqliteDatabase,
  id: number,
  trendScore: number,
  trendBreakdown: TrendBreakdown
): boolean {
  const result = db
    .prepare(
      "UPDATE creative_source_items SET trend_score = ?, trend_breakdown = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .run(trendScore, JSON.stringify(trendBreakdown), id);
  return result.changes > 0;
}

// ── Update mutable fields (score, fullContent) ──────────────────────────────

export function updateCreativeSourceItemFields(
  db: SqliteDatabase,
  id: number,
  fields: { score?: number; fullContent?: string }
): boolean {
  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (fields.score !== undefined) {
    updates.push("score = ?");
    values.push(fields.score);
  }
  if (fields.fullContent !== undefined) {
    updates.push("full_content = ?");
    values.push(fields.fullContent);
  }
  if (updates.length === 0) return false;

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  const result = db
    .prepare(`UPDATE creative_source_items SET ${updates.join(", ")} WHERE id = ?`)
    .run(...values);
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
