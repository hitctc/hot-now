import type { SqliteDatabase } from "../db/openDatabase.js";
import {
  aiTimelineEventTypes,
  aiTimelineImportanceLevels,
  aiTimelineVisibilityStatuses,
  isAiTimelineEventType,
  isAiTimelineImportanceLevel,
  isAiTimelineReleaseStatus,
  isAiTimelineVisibilityStatus,
  type AiTimelineEventInput,
  type AiTimelineEventRecord,
  type AiTimelineFilterOptions,
  type AiTimelineListQuery,
  type AiTimelineManualUpdateInput,
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
  importance_level: string;
  release_status: string;
  importance_summary_zh: string | null;
  visibility_status: string;
  manual_title: string | null;
  manual_summary_zh: string | null;
  manual_importance_level: string | null;
  detected_entities_json: string;
  raw_source_json: string;
  created_at: string;
  updated_at: string;
};

const publicDefaultImportanceLevels = ["S", "A"] as const;
const publicDefaultVisibilityStatuses = ["auto_visible", "manual_visible"] as const;
const defaultRecentDays = 7;
const aiTimelineEventSelectColumns = `
  id,
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
  importance_level,
  release_status,
  importance_summary_zh,
  visibility_status,
  manual_title,
  manual_summary_zh,
  manual_importance_level,
  detected_entities_json,
  raw_source_json,
  created_at,
  updated_at
`;

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
        importance_level,
        release_status,
        importance_summary_zh,
        visibility_status,
        detected_entities_json,
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
        @importanceLevel,
        @releaseStatus,
        @importanceSummaryZh,
        @visibilityStatus,
        @detectedEntitiesJson,
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
        importance_level = excluded.importance_level,
        release_status = excluded.release_status,
        importance_summary_zh = excluded.importance_summary_zh,
        visibility_status = CASE
          WHEN ai_timeline_events.visibility_status IN ('hidden', 'manual_visible')
          THEN ai_timeline_events.visibility_status
          ELSE excluded.visibility_status
        END,
        detected_entities_json = excluded.detected_entities_json,
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
  return listAiTimelineEventsInternal(db, query, {
    defaultImportanceLevels: [...publicDefaultImportanceLevels],
    defaultVisibilityStatuses: [...publicDefaultVisibilityStatuses],
    defaultRecentDays
  });
}

// 后台列表用于人工确认和隐藏候选，不套前台的 7 天与 S/A 默认过滤。
export function listAiTimelineAdminEvents(
  db: SqliteDatabase,
  query: AiTimelineListQuery
): AiTimelinePageModel {
  return listAiTimelineEventsInternal(db, query, {
    defaultImportanceLevels: [...aiTimelineImportanceLevels],
    defaultVisibilityStatuses: [...aiTimelineVisibilityStatuses],
    defaultRecentDays: null
  });
}

export function updateAiTimelineEventManualFields(
  db: SqliteDatabase,
  eventId: number,
  input: AiTimelineManualUpdateInput
): AiTimelineEventRecord | null {
  const normalized = normalizeAiTimelineManualUpdateInput(input);
  const result = db
    .prepare(
      `
        UPDATE ai_timeline_events
        SET visibility_status = @visibilityStatus,
            manual_title = @manualTitle,
            manual_summary_zh = @manualSummaryZh,
            manual_importance_level = @manualImportanceLevel,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = @eventId
      `
    )
    .run({
      eventId,
      ...normalized
    });

  if (result.changes === 0) {
    return null;
  }

  const row = db
    .prepare(
      `
        SELECT ${aiTimelineEventSelectColumns}
        FROM ai_timeline_events
        WHERE id = ?
      `
    )
    .get(eventId) as AiTimelineEventRow | undefined;

  return row ? mapAiTimelineEventRow(row) : null;
}

function listAiTimelineEventsInternal(
  db: SqliteDatabase,
  query: AiTimelineListQuery,
  defaults: {
    defaultImportanceLevels: string[];
    defaultVisibilityStatuses: string[];
    defaultRecentDays: number | null;
  }
): AiTimelinePageModel {
  const normalizedQuery = normalizeAiTimelineListQuery(query, defaults);
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
    whereClauses.push("(title LIKE @searchKeyword ESCAPE '\\' OR COALESCE(summary, '') LIKE @searchKeyword ESCAPE '\\')");
    params.searchKeyword = `%${escapeLikeValue(normalizedQuery.searchKeyword)}%`;
  }

  if (normalizedQuery.importanceLevels.length > 0) {
    whereClauses.push(`COALESCE(manual_importance_level, importance_level) IN (${bindArrayParams(
      "importanceLevel",
      normalizedQuery.importanceLevels,
      params
    )})`);
  }

  if (normalizedQuery.visibilityStatuses.length > 0) {
    whereClauses.push(`visibility_status IN (${bindArrayParams("visibilityStatus", normalizedQuery.visibilityStatuses, params)})`);
  }

  if (normalizedQuery.recentSince) {
    whereClauses.push("published_at >= @recentSince");
    params.recentSince = normalizedQuery.recentSince;
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
        SELECT ${aiTimelineEventSelectColumns}
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

  const importance = normalizeImportance(input.importance);

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
    importance,
    importanceLevel: normalizeImportanceLevel(input.importanceLevel, input.eventType, importance),
    releaseStatus: normalizeReleaseStatus(input.releaseStatus),
    importanceSummaryZh: normalizeNullableText(input.importanceSummaryZh),
    visibilityStatus: normalizeVisibilityStatus(input.visibilityStatus),
    detectedEntitiesJson: JSON.stringify(normalizeDetectedEntities(input.detectedEntities)),
    rawSourceJson: JSON.stringify(input.rawSourceJson ?? {})
  };
}

function normalizeAiTimelineListQuery(
  query: AiTimelineListQuery,
  defaults: {
    defaultImportanceLevels: string[];
    defaultVisibilityStatuses: string[];
    defaultRecentDays: number | null;
  }
) {
  const pageSize = normalizePositiveInteger(query.pageSize, 50);
  const page = normalizePositiveInteger(query.page, 1);
  const eventType = typeof query.eventType === "string" && isAiTimelineEventType(query.eventType)
    ? query.eventType
    : null;
  const importanceLevels = normalizeStringArray(query.importanceLevels, isAiTimelineImportanceLevel, defaults.defaultImportanceLevels);
  const visibilityStatuses = normalizeStringArray(
    query.visibilityStatuses,
    isAiTimelineVisibilityStatus,
    defaults.defaultVisibilityStatuses
  );
  const recentDays = query.recentDays === null
    ? null
    : typeof query.recentDays === "number"
      ? normalizePositiveInteger(query.recentDays, defaults.defaultRecentDays ?? 0)
      : defaults.defaultRecentDays;
  const recentSince = recentDays && recentDays > 0
    ? toIsoDateString(subtractDays(query.referenceTime ?? new Date(), recentDays))
    : null;

  return {
    eventType,
    companyKey: normalizeNullableText(query.companyKey),
    searchKeyword: normalizeNullableText(query.searchKeyword),
    importanceLevels,
    visibilityStatuses,
    recentSince,
    page,
    pageSize: Math.min(pageSize, 100)
  };
}

function mapAiTimelineEventRow(row: AiTimelineEventRow): AiTimelineEventRecord {
  if (!isAiTimelineEventType(row.event_type)) {
    throw new Error(`Invalid AI timeline event type in database: ${row.event_type}`);
  }

  const storedImportanceLevel = isAiTimelineImportanceLevel(row.importance_level) ? row.importance_level : "B";
  const manualImportanceLevel = row.manual_importance_level && isAiTimelineImportanceLevel(row.manual_importance_level)
    ? row.manual_importance_level
    : null;
  const importanceLevel = manualImportanceLevel ?? storedImportanceLevel;
  const releaseStatus = isAiTimelineReleaseStatus(row.release_status) ? row.release_status : "released";
  const visibilityStatus = isAiTimelineVisibilityStatus(row.visibility_status) ? row.visibility_status : "auto_visible";
  const manualTitle = normalizeNullableText(row.manual_title);
  const manualSummaryZh = normalizeNullableText(row.manual_summary_zh);
  const importanceSummaryZh = normalizeNullableText(row.importance_summary_zh);

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
    importanceLevel,
    releaseStatus,
    importanceSummaryZh,
    visibilityStatus,
    manualTitle,
    manualSummaryZh,
    manualImportanceLevel,
    detectedEntities: parseDetectedEntities(row.detected_entities_json),
    displayTitle: manualTitle ?? row.title,
    displaySummaryZh: manualSummaryZh ?? importanceSummaryZh ?? row.summary,
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

function parseDetectedEntities(value: string): string[] {
  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function normalizeAiTimelineManualUpdateInput(input: AiTimelineManualUpdateInput) {
  return {
    visibilityStatus: normalizeVisibilityStatus(input.visibilityStatus),
    manualTitle: normalizeNullableText(input.manualTitle),
    manualSummaryZh: normalizeNullableText(input.manualSummaryZh),
    manualImportanceLevel: input.manualImportanceLevel && isAiTimelineImportanceLevel(input.manualImportanceLevel)
      ? input.manualImportanceLevel
      : null
  };
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

function normalizeImportanceLevel(
  value: string | undefined,
  eventType: string,
  importance: number
) {
  if (value && isAiTimelineImportanceLevel(value)) {
    return value;
  }

  if (eventType === "要闻" || importance >= 90) {
    return "S";
  }

  if (
    importance >= 75 ||
    eventType === "模型发布" ||
    eventType === "开发生态" ||
    eventType === "产品应用" ||
    eventType === "行业动态" ||
    eventType === "官方前瞻"
  ) {
    return "A";
  }

  if (importance >= 50) {
    return "B";
  }

  return "C";
}

function normalizeReleaseStatus(value: string | undefined) {
  return value && isAiTimelineReleaseStatus(value) ? value : "released";
}

function normalizeVisibilityStatus(value: string | undefined) {
  return value && isAiTimelineVisibilityStatus(value) ? value : "auto_visible";
}

function normalizeDetectedEntities(value: string[] | undefined): string[] {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => item.trim()).filter(Boolean))]
    : [];
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

function normalizeStringArray<T extends string>(
  value: readonly string[] | undefined,
  validator: (item: string) => item is T,
  fallback: readonly string[]
): T[] {
  const items = Array.isArray(value) ? value : fallback;
  return [...new Set(items.filter(validator))];
}

function bindArrayParams(prefix: string, values: readonly string[], params: Record<string, string | number>): string {
  return values
    .map((value, index) => {
      const key = `${prefix}${index}`;
      params[key] = value;
      return `@${key}`;
    })
    .join(", ");
}

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function toIsoDateString(date: Date): string {
  return date.toISOString();
}
