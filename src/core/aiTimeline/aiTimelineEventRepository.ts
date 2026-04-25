import type { SqliteDatabase } from "../db/openDatabase.js";
import { createAiTimelineEventKey } from "./aiTimelineEventKey.js";
import {
  listAiTimelineEventEvidence,
  upsertAiTimelineEventEvidence
} from "./aiTimelineEvidenceRepository.js";
import {
  aiTimelineEventTypes,
  aiTimelineImportanceLevels,
  aiTimelineVisibilityStatuses,
  isAiTimelineEventType,
  isAiTimelineImportanceLevel,
  isAiTimelineReliabilityStatus,
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
  event_key: string | null;
  reliability_status: string;
  evidence_count: number;
  last_verified_at: string | null;
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
  event_key,
  reliability_status,
  evidence_count,
  last_verified_at,
  raw_source_json,
  created_at,
  updated_at
`;

// 官方事件优先按稳定 event_key 合并，多入口证据保留在 evidence 表；没有 key 时退回 official_url 去重。
export function upsertAiTimelineEvents(
  db: SqliteDatabase,
  events: AiTimelineEventInput[]
): AiTimelineUpsertResult {
  const normalizedEvents = events.map(normalizeAiTimelineEventInput);
  const readExistingByEventKey = db.prepare("SELECT id FROM ai_timeline_events WHERE event_key = ? LIMIT 1");
  const readExistingByUrl = db.prepare("SELECT id FROM ai_timeline_events WHERE official_url = ? LIMIT 1");
  const insertStatement = db.prepare(
    `
      INSERT INTO ai_timeline_events (
        event_key,
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
        @eventKey,
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
    `
  );
  const updateStatement = db.prepare(
    `
      UPDATE ai_timeline_events
      SET event_key = COALESCE(@eventKey, event_key),
          company_key = @companyKey,
          company_name = @companyName,
          event_type = @eventType,
          title = @title,
          summary = @summary,
          official_url = @officialUrl,
          source_label = @sourceLabel,
          source_kind = @sourceKind,
          published_at = @publishedAt,
          discovered_at = @discoveredAt,
          importance = @importance,
          importance_level = @importanceLevel,
          release_status = @releaseStatus,
          importance_summary_zh = @importanceSummaryZh,
        visibility_status = CASE
            WHEN visibility_status IN ('hidden', 'manual_visible')
            THEN visibility_status
            ELSE @visibilityStatus
        END,
          detected_entities_json = @detectedEntitiesJson,
          raw_source_json = @rawSourceJson,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `
  );
  const result = { insertedCount: 0, updatedCount: 0 };
  const write = db.transaction((items: ReturnType<typeof normalizeAiTimelineEventInput>[]) => {
    for (const item of items) {
      const existingByEventKey = item.eventKey
        ? readExistingByEventKey.get(item.eventKey) as { id: number } | undefined
        : undefined;
      const existingByUrl = readExistingByUrl.get(item.officialUrl) as { id: number } | undefined;
      const existingId = existingByEventKey?.id ?? existingByUrl?.id ?? null;
      let eventId = existingId ?? 0;

      if (existingId) {
        updateStatement.run({ ...item, id: existingId });
        result.updatedCount += 1;
      } else {
        const insertResult = insertStatement.run(item);
        eventId = Number(insertResult.lastInsertRowid);
        result.insertedCount += 1;
      }

      upsertAiTimelineEventEvidence(db, {
        eventId,
        sourceId: item.sourceId,
        companyKey: item.companyKey,
        sourceLabel: item.sourceLabel,
        sourceKind: item.sourceKind,
        officialUrl: item.officialUrl,
        title: item.title,
        summary: item.summary,
        publishedAt: item.publishedAt,
        discoveredAt: item.discoveredAt,
        rawSourceJson: item.rawSourceJsonValue
      });
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
  const events = rows.map(mapAiTimelineEventRow);
  const evidenceByEventId = listAiTimelineEventEvidence(db, events.map((event) => event.id));

  return {
    events: events.map((event) => ({
      ...event,
      evidenceLinks: evidenceByEventId.get(event.id) ?? []
    })),
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
  const companyKey = requireNonEmpty(input.companyKey, "companyKey");
  const title = requireNonEmpty(input.title, "title");
  const sourceLabel = requireNonEmpty(input.sourceLabel, "sourceLabel");
  const sourceKind = requireNonEmpty(input.sourceKind, "sourceKind");
  const publishedAt = requireNonEmpty(input.publishedAt, "publishedAt");
  const detectedEntities = normalizeDetectedEntities(input.detectedEntities);
  const rawSourceJsonValue = input.rawSourceJson ?? {};

  return {
    sourceId: normalizeNullableText(input.sourceId) ?? createFallbackSourceId(companyKey, sourceLabel, sourceKind),
    companyKey,
    companyName: requireNonEmpty(input.companyName, "companyName"),
    eventType: input.eventType,
    title,
    summary: normalizeNullableText(input.summary),
    officialUrl: requireNonEmpty(input.officialUrl, "officialUrl"),
    sourceLabel,
    sourceKind,
    publishedAt,
    discoveredAt: requireNonEmpty(input.discoveredAt, "discoveredAt"),
    importance,
    importanceLevel: normalizeImportanceLevel(input.importanceLevel, input.eventType, importance),
    releaseStatus: normalizeReleaseStatus(input.releaseStatus),
    importanceSummaryZh: normalizeNullableText(input.importanceSummaryZh),
    visibilityStatus: normalizeVisibilityStatus(input.visibilityStatus),
    detectedEntitiesJson: JSON.stringify(detectedEntities),
    eventKey: normalizeNullableText(input.eventKey) ?? createAiTimelineEventKey({
      companyKey,
      title,
      publishedAt,
      detectedEntities
    }),
    rawSourceJson: JSON.stringify(rawSourceJsonValue),
    rawSourceJsonValue
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
  const reliabilityStatus = isAiTimelineReliabilityStatus(row.reliability_status)
    ? row.reliability_status
    : "single_source";
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
    eventKey: normalizeNullableText(row.event_key),
    reliabilityStatus,
    evidenceCount: row.evidence_count,
    lastVerifiedAt: row.last_verified_at,
    evidenceLinks: [],
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

function createFallbackSourceId(companyKey: string, sourceLabel: string, sourceKind: string): string {
  return [companyKey, sourceKind, sourceLabel]
    .map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean)
    .join(":");
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
