import type { SqliteDatabase } from "../db/openDatabase.js";
import {
  aiTimelineEventTypes,
  isAiTimelineEventType,
  type AiTimelineEventInput,
  type AiTimelineEventRecord,
  type AiTimelineFilterOptions,
  type AiTimelineListQuery,
  type AiTimelinePageModel,
  type AiTimelineUpsertResult
} from "./aiTimelineTypes.js";

type AiTimelineEventRow = {
  id: number;
  company_key: string;
  company_name: string;
  event_type: string;
  title: string;
  summary: string | null;
  official_url: string;
  source_label: string;
  source_kind: string;
  published_at: string;
  discovered_at: string;
  importance: number;
  raw_source_json: string;
  created_at: string;
  updated_at: string;
};

// 官方事件以 official_url 作为主去重键，重复采集时只刷新同一条时间线事件。
export function upsertAiTimelineEvents(
  db: SqliteDatabase,
  events: AiTimelineEventInput[]
): AiTimelineUpsertResult {
  const normalizedEvents = events.map(normalizeAiTimelineEventInput);
  const existingUrl = db.prepare("SELECT id FROM ai_timeline_events WHERE official_url = ? LIMIT 1");
  const statement = db.prepare(
    `
      INSERT INTO ai_timeline_events (
        company_key,
        company_name,
        event_type,
        title,
        summary,
        official_url,
        source_label,
        source_kind,
        published_at,
        discovered_at,
        importance,
        raw_source_json,
        updated_at
      )
      VALUES (
        @companyKey,
        @companyName,
        @eventType,
        @title,
        @summary,
        @officialUrl,
        @sourceLabel,
        @sourceKind,
        @publishedAt,
        @discoveredAt,
        @importance,
        @rawSourceJson,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(official_url) DO UPDATE SET
        company_key = excluded.company_key,
        company_name = excluded.company_name,
        event_type = excluded.event_type,
        title = excluded.title,
        summary = excluded.summary,
        source_label = excluded.source_label,
        source_kind = excluded.source_kind,
        published_at = excluded.published_at,
        discovered_at = excluded.discovered_at,
        importance = excluded.importance,
        raw_source_json = excluded.raw_source_json,
        updated_at = CURRENT_TIMESTAMP
    `
  );
  const result = { insertedCount: 0, updatedCount: 0 };
  const write = db.transaction((items: ReturnType<typeof normalizeAiTimelineEventInput>[]) => {
    for (const item of items) {
      const existed = Boolean(existingUrl.get(item.officialUrl));
      statement.run(item);

      if (existed) {
        result.updatedCount += 1;
      } else {
        result.insertedCount += 1;
      }
    }
  });

  write(normalizedEvents);

  return result;
}

// 列表查询只暴露时间线自己的筛选条件，避免复用内容流的来源筛选和评分排序。
export function listAiTimelineEvents(
  db: SqliteDatabase,
  query: AiTimelineListQuery
): AiTimelinePageModel {
  const normalizedQuery = normalizeAiTimelineListQuery(query);
  const whereClauses: string[] = [];
  const params: Record<string, string | number> = {};

  if (normalizedQuery.eventType) {
    whereClauses.push("event_type = @eventType");
    params.eventType = normalizedQuery.eventType;
  }

  if (normalizedQuery.companyKey) {
    whereClauses.push("company_key = @companyKey");
    params.companyKey = normalizedQuery.companyKey;
  }

  if (normalizedQuery.searchKeyword) {
    whereClauses.push("(title LIKE @searchKeyword OR COALESCE(summary, '') LIKE @searchKeyword)");
    params.searchKeyword = `%${escapeLikeValue(normalizedQuery.searchKeyword)}%`;
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const countRow = db
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM ai_timeline_events
        ${whereSql}
      `
    )
    .get(params) as { total: number };
  const totalResults = countRow.total;
  const totalPages = totalResults === 0 ? 0 : Math.ceil(totalResults / normalizedQuery.pageSize);
  const safePage = totalPages === 0 ? 1 : Math.min(normalizedQuery.page, totalPages);
  const offset = (safePage - 1) * normalizedQuery.pageSize;
  const rows = db
    .prepare(
      `
        SELECT id,
               company_key,
               company_name,
               event_type,
               title,
               summary,
               official_url,
               source_label,
               source_kind,
               published_at,
               discovered_at,
               importance,
               raw_source_json,
               created_at,
               updated_at
        FROM ai_timeline_events
        ${whereSql}
        ORDER BY published_at DESC, id DESC
        LIMIT @pageSize OFFSET @offset
      `
    )
    .all({
      ...params,
      pageSize: normalizedQuery.pageSize,
      offset
    }) as AiTimelineEventRow[];

  return {
    events: rows.map(mapAiTimelineEventRow),
    filters: listAiTimelineFilterOptions(db),
    pagination: {
      page: safePage,
      pageSize: normalizedQuery.pageSize,
      totalResults,
      totalPages
    }
  };
}

// 事件类型总是完整返回，公司选项只来自已持久化事件，方便空库时展示稳定筛选框。
export function listAiTimelineFilterOptions(db: SqliteDatabase): AiTimelineFilterOptions {
  const companies = db
    .prepare(
      `
        SELECT company_key AS key,
               company_name AS name,
               COUNT(*) AS eventCount
        FROM ai_timeline_events
        GROUP BY company_key, company_name
        ORDER BY company_name ASC, company_key ASC
      `
    )
    .all() as AiTimelineFilterOptions["companies"];

  return {
    eventTypes: [...aiTimelineEventTypes],
    companies
  };
}

function normalizeAiTimelineEventInput(input: AiTimelineEventInput) {
  if (!isAiTimelineEventType(input.eventType)) {
    throw new Error(`Invalid AI timeline event type: ${input.eventType}`);
  }

  return {
    companyKey: requireNonEmpty(input.companyKey, "companyKey"),
    companyName: requireNonEmpty(input.companyName, "companyName"),
    eventType: input.eventType,
    title: requireNonEmpty(input.title, "title"),
    summary: normalizeNullableText(input.summary),
    officialUrl: requireNonEmpty(input.officialUrl, "officialUrl"),
    sourceLabel: requireNonEmpty(input.sourceLabel, "sourceLabel"),
    sourceKind: requireNonEmpty(input.sourceKind, "sourceKind"),
    publishedAt: requireNonEmpty(input.publishedAt, "publishedAt"),
    discoveredAt: requireNonEmpty(input.discoveredAt, "discoveredAt"),
    importance: normalizeImportance(input.importance),
    rawSourceJson: JSON.stringify(input.rawSourceJson ?? {})
  };
}

function normalizeAiTimelineListQuery(query: AiTimelineListQuery) {
  const pageSize = normalizePositiveInteger(query.pageSize, 50);
  const page = normalizePositiveInteger(query.page, 1);
  const eventType = typeof query.eventType === "string" && isAiTimelineEventType(query.eventType)
    ? query.eventType
    : null;

  return {
    eventType,
    companyKey: normalizeNullableText(query.companyKey),
    searchKeyword: normalizeNullableText(query.searchKeyword),
    page,
    pageSize: Math.min(pageSize, 100)
  };
}

function mapAiTimelineEventRow(row: AiTimelineEventRow): AiTimelineEventRecord {
  if (!isAiTimelineEventType(row.event_type)) {
    throw new Error(`Invalid AI timeline event type in database: ${row.event_type}`);
  }

  return {
    id: row.id,
    companyKey: row.company_key,
    companyName: row.company_name,
    eventType: row.event_type,
    title: row.title,
    summary: row.summary,
    officialUrl: row.official_url,
    sourceLabel: row.source_label,
    sourceKind: row.source_kind,
    publishedAt: row.published_at,
    discoveredAt: row.discovered_at,
    importance: row.importance,
    rawSourceJson: parseRawSourceJson(row.raw_source_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseRawSourceJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function requireNonEmpty(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`Missing AI timeline event field: ${fieldName}`);
  }

  return normalized;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeImportance(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 50;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return fallback;
  }

  return Math.floor(value);
}

function escapeLikeValue(value: string): string {
  return value.replaceAll("%", "\\%").replaceAll("_", "\\_");
}
