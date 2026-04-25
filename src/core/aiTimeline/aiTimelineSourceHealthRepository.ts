import type { SqliteDatabase } from "../db/openDatabase.js";
import {
  getOfficialAiTimelineSourceUrl,
  type OfficialAiTimelineSource
} from "./officialAiTimelineSources.js";
import {
  type AiTimelineHealthOverview,
  type AiTimelineSourceHealthRecord,
  type AiTimelineSourceRunInput,
  type AiTimelineSourceRunStatus
} from "./aiTimelineTypes.js";

type AiTimelineSourceRunRow = {
  source_id: string;
  company_key: string;
  company_name: string;
  source_label: string;
  source_kind: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  fetched_item_count: number;
  candidate_event_count: number;
  important_event_count: number;
  latest_official_published_at: string | null;
  error_message: string | null;
};

type AiTimelineHealthOverviewRow = {
  latest_collect_started_at: string | null;
  failed_source_count: number | null;
  stale_source_count: number | null;
};

type AiTimelineVisibleOverviewRow = {
  visible_important_count_7d: number;
  latest_visible_published_at: string | null;
};

const allowedSourceRunStatuses = new Set<AiTimelineSourceRunStatus>(["success", "failed", "empty", "stale"]);

export function recordAiTimelineSourceRun(db: SqliteDatabase, input: AiTimelineSourceRunInput): void {
  const normalized = normalizeAiTimelineSourceRunInput(input);

  db.prepare(
    `
      INSERT INTO ai_timeline_source_runs (
        source_id,
        company_key,
        company_name,
        source_label,
        source_kind,
        status,
        started_at,
        finished_at,
        fetched_item_count,
        candidate_event_count,
        important_event_count,
        latest_official_published_at,
        error_message
      )
      VALUES (
        @sourceId,
        @companyKey,
        @companyName,
        @sourceLabel,
        @sourceKind,
        @status,
        @startedAt,
        @finishedAt,
        @fetchedItemCount,
        @candidateEventCount,
        @importantEventCount,
        @latestOfficialPublishedAt,
        @errorMessage
      )
    `
  ).run(normalized);
}

export function listAiTimelineSourceHealth(
  db: SqliteDatabase,
  sources: readonly OfficialAiTimelineSource[]
): AiTimelineSourceHealthRecord[] {
  const readLatestRun = db.prepare(
    `
      SELECT source_id,
             company_key,
             company_name,
             source_label,
             source_kind,
             status,
             started_at,
             finished_at,
             fetched_item_count,
             candidate_event_count,
             important_event_count,
             latest_official_published_at,
             error_message
      FROM ai_timeline_source_runs
      WHERE source_id = ?
      ORDER BY started_at DESC, id DESC
      LIMIT 1
    `
  );

  return sources.map((source) => {
    const row = readLatestRun.get(source.id) as AiTimelineSourceRunRow | undefined;

    return {
      sourceId: source.id,
      companyKey: source.companyKey,
      companyName: source.companyName,
      sourceLabel: source.sourceLabel,
      sourceKind: source.sourceKind,
      sourceUrl: getOfficialAiTimelineSourceUrl(source),
      latestStatus: row && isAiTimelineSourceRunStatus(row.status) ? row.status : null,
      latestStartedAt: row?.started_at ?? null,
      latestFinishedAt: row?.finished_at ?? null,
      fetchedItemCount: row?.fetched_item_count ?? 0,
      candidateEventCount: row?.candidate_event_count ?? 0,
      importantEventCount: row?.important_event_count ?? 0,
      latestOfficialPublishedAt: row?.latest_official_published_at ?? null,
      errorMessage: row?.error_message ?? null
    };
  });
}

export function readAiTimelineHealthOverview(db: SqliteDatabase): AiTimelineHealthOverview {
  const sourceOverview = db
    .prepare(
      `
        WITH ranked_runs AS (
          SELECT source_id,
                 status,
                 started_at,
                 ROW_NUMBER() OVER (PARTITION BY source_id ORDER BY started_at DESC, id DESC) AS row_number
          FROM ai_timeline_source_runs
        )
        SELECT MAX(started_at) AS latest_collect_started_at,
               SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_source_count,
               SUM(CASE WHEN status = 'stale' THEN 1 ELSE 0 END) AS stale_source_count
        FROM ranked_runs
        WHERE row_number = 1
      `
    )
    .get() as AiTimelineHealthOverviewRow | undefined;
  const visibleOverview = db
    .prepare(
      `
        SELECT COUNT(*) AS visible_important_count_7d,
               MAX(published_at) AS latest_visible_published_at
        FROM ai_timeline_events
        WHERE visibility_status IN ('auto_visible', 'manual_visible')
          AND COALESCE(manual_importance_level, importance_level) IN ('S', 'A')
          AND published_at >= datetime('now', '-7 days')
      `
    )
    .get() as AiTimelineVisibleOverviewRow;

  return {
    visibleImportantCount7d: visibleOverview.visible_important_count_7d,
    latestVisiblePublishedAt: visibleOverview.latest_visible_published_at,
    latestCollectStartedAt: sourceOverview?.latest_collect_started_at ?? null,
    failedSourceCount: sourceOverview?.failed_source_count ?? 0,
    staleSourceCount: sourceOverview?.stale_source_count ?? 0
  };
}

function normalizeAiTimelineSourceRunInput(input: AiTimelineSourceRunInput) {
  if (!allowedSourceRunStatuses.has(input.status)) {
    throw new Error(`Invalid AI timeline source run status: ${input.status}`);
  }

  return {
    sourceId: requireNonEmpty(input.sourceId, "sourceId"),
    companyKey: requireNonEmpty(input.companyKey, "companyKey"),
    companyName: requireNonEmpty(input.companyName, "companyName"),
    sourceLabel: requireNonEmpty(input.sourceLabel, "sourceLabel"),
    sourceKind: requireNonEmpty(input.sourceKind, "sourceKind"),
    status: input.status,
    startedAt: requireNonEmpty(input.startedAt, "startedAt"),
    finishedAt: normalizeNullableText(input.finishedAt),
    fetchedItemCount: normalizeNonNegativeInteger(input.fetchedItemCount),
    candidateEventCount: normalizeNonNegativeInteger(input.candidateEventCount),
    importantEventCount: normalizeNonNegativeInteger(input.importantEventCount),
    latestOfficialPublishedAt: normalizeNullableText(input.latestOfficialPublishedAt),
    errorMessage: normalizeNullableText(input.errorMessage)
  };
}

function isAiTimelineSourceRunStatus(value: string): value is AiTimelineSourceRunStatus {
  return allowedSourceRunStatuses.has(value as AiTimelineSourceRunStatus);
}

function requireNonEmpty(value: string | undefined | null, fieldName: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`Missing AI timeline source run field: ${fieldName}`);
  }

  return normalized;
}

function normalizeNullableText(value: string | undefined | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeNonNegativeInteger(value: number | undefined): number {
  if (value == null) {
    return 0;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid AI timeline source run count: ${value}`);
  }

  return value;
}
