import type { SqliteDatabase } from "../db/openDatabase.js";
import type { CreativeSourceItemWritingStatus } from "./types.js";
import type {
  AccountFitLevel,
  CreativeSourceItemRecord,
  ListCreativeSourceItemsFilters,
  ListCreativeSourceItemsResult,
} from "./creativeSourceItemTypes.js";

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
  writing_stop_step,
  writing_stop_step_name,
  writing_stop_reason,
  writing_stopped_at,
  raw_payload_json,
  trend_score,
  trend_breakdown,
  account_fit_level,
  account_fit_reason,
  account_fit_details_json,
  account_fit_rule_version,
  account_fit_evaluated_at,
  traced_sources_json,
  writable,
  direction,
  seq_number,
  linked_article_id,
  created_at,
  updated_at,
  (SELECT COUNT(*) FROM creative_finished_articles WHERE source_item_id = creative_source_items.id) AS write_count
` as const;

// 列表不读取正文、原始采集包和详情 JSON；展开行再通过详情接口按需加载。
const LIST_SELECT_COLUMNS = `
  id,
  external_id,
  collector_agent,
  title,
  url,
  source_name,
  summary,
  NULL AS full_content,
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
  writing_stop_step,
  writing_stop_step_name,
  writing_stop_reason,
  writing_stopped_at,
  '' AS raw_payload_json,
  trend_score,
  trend_breakdown,
  account_fit_level,
  account_fit_reason,
  NULL AS account_fit_details_json,
  account_fit_rule_version,
  account_fit_evaluated_at,
  NULL AS traced_sources_json,
  writable,
  direction,
  seq_number,
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
  writing_stop_step: number | null;
  writing_stop_step_name: string | null;
  writing_stop_reason: string | null;
  writing_stopped_at: string | null;
  raw_payload_json: string;
  trend_score: number | null;
  trend_breakdown: string | null;
  account_fit_level: string | null;
  account_fit_reason: string | null;
  account_fit_details_json: string | null;
  account_fit_rule_version: string | null;
  account_fit_evaluated_at: string | null;
  traced_sources_json: string | null;
  writable: number;
  direction: string;
  seq_number: number | null;
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
    writingStopStep: row.writing_stop_step,
    writingStopStepName: row.writing_stop_step_name,
    writingStopReason: row.writing_stop_reason,
    writingStoppedAt: row.writing_stopped_at,
    rawPayloadJson: row.raw_payload_json,
    trendScore: row.trend_score,
    trendBreakdown: row.trend_breakdown ? JSON.parse(row.trend_breakdown) : null,
    accountFitLevel: row.account_fit_level as AccountFitLevel | null,
    accountFitReason: row.account_fit_reason,
    accountFitDetails: row.account_fit_details_json ? JSON.parse(row.account_fit_details_json) : null,
    accountFitRuleVersion: row.account_fit_rule_version,
    accountFitEvaluatedAt: row.account_fit_evaluated_at,
    tracedSources: row.traced_sources_json ? JSON.parse(row.traced_sources_json) : null,
    writable: row.writable === 1,
    direction: row.direction,
    seqNumber: row.seq_number,
    linkedArticleId: row.linked_article_id,
    writeCount: row.write_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
/** 按素材主键读取完整记录，供详情与写作操作使用。 */
export function findCreativeSourceItemById(db: SqliteDatabase, id: number): CreativeSourceItemRecord | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM creative_source_items WHERE id = ?`)
    .get(id) as SourceItemRow | undefined;

  return row ? mapRow(row) : null;
}

/** 按外部 ID 和采集器读取素材，兼容历史采集器名称不一致的回退查询。 */
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

/** 按现有筛选、分页和轻量列表投影读取素材，不改变调用方的查询契约。 */
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

  if (filters.writable === true) {
    whereClauses.push("writable = 1");
  }

  if (filters.direction) {
    whereClauses.push("direction = ?");
    params.push(filters.direction);
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

  if (filters.accountFitLevel === "unassessed") {
    whereClauses.push("account_fit_level IS NULL");
  } else if (filters.accountFitLevel) {
    whereClauses.push("account_fit_level = ?");
    params.push(filters.accountFitLevel);
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
  const selectedColumns = filters.summaryOnly ? LIST_SELECT_COLUMNS : SELECT_COLUMNS;

  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM creative_source_items ${whereClause}`)
    .get(...params) as { total: number };

  let items: SourceItemRow[];
  if (filters.last24h) {
    // 不分页，一次返回全部
    items = db
      .prepare(`SELECT ${selectedColumns} FROM creative_source_items ${whereClause} ORDER BY created_at DESC`)
      .all(...params) as SourceItemRow[];
  } else {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.max(1, filters.pageSize ?? 20);
    const offset = (page - 1) * pageSize;
    items = db
      .prepare(
        `SELECT ${selectedColumns} FROM creative_source_items ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
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
