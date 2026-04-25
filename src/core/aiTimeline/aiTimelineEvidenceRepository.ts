import type { SqliteDatabase } from "../db/openDatabase.js";
import {
  type AiTimelineEventEvidenceInput,
  type AiTimelineEventEvidenceRecord
} from "./aiTimelineTypes.js";

type AiTimelineEventEvidenceRow = {
  id: number;
  event_id: number;
  source_id: string;
  company_key: string;
  source_label: string;
  source_kind: string;
  official_url: string;
  title: string;
  summary: string | null;
  published_at: string;
  discovered_at: string;
  raw_source_json: string;
  created_at: string;
  updated_at: string;
};

export function upsertAiTimelineEventEvidence(db: SqliteDatabase, input: AiTimelineEventEvidenceInput): void {
  const normalized = normalizeAiTimelineEventEvidenceInput(input);

  db.prepare(
    `
      INSERT INTO ai_timeline_event_evidence (
        event_id,
        source_id,
        company_key,
        source_label,
        source_kind,
        official_url,
        title,
        summary,
        published_at,
        discovered_at,
        raw_source_json,
        updated_at
      )
      VALUES (
        @eventId,
        @sourceId,
        @companyKey,
        @sourceLabel,
        @sourceKind,
        @officialUrl,
        @title,
        @summary,
        @publishedAt,
        @discoveredAt,
        @rawSourceJson,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(event_id, source_id, official_url) DO UPDATE SET
        company_key = excluded.company_key,
        source_label = excluded.source_label,
        source_kind = excluded.source_kind,
        title = excluded.title,
        summary = excluded.summary,
        published_at = excluded.published_at,
        discovered_at = excluded.discovered_at,
        raw_source_json = excluded.raw_source_json,
        updated_at = CURRENT_TIMESTAMP
    `
  ).run(normalized);

  refreshAiTimelineEventEvidenceCount(db, normalized.eventId);
}

export function listAiTimelineEventEvidence(
  db: SqliteDatabase,
  eventIds: number[]
): Map<number, AiTimelineEventEvidenceRecord[]> {
  const uniqueEventIds = [...new Set(eventIds.filter((eventId) => Number.isInteger(eventId) && eventId > 0))];
  const result = new Map<number, AiTimelineEventEvidenceRecord[]>();

  for (const eventId of uniqueEventIds) {
    result.set(eventId, []);
  }

  if (uniqueEventIds.length === 0) {
    return result;
  }

  const placeholders = uniqueEventIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        SELECT id,
               event_id,
               source_id,
               company_key,
               source_label,
               source_kind,
               official_url,
               title,
               summary,
               published_at,
               discovered_at,
               raw_source_json,
               created_at,
               updated_at
        FROM ai_timeline_event_evidence
        WHERE event_id IN (${placeholders})
        ORDER BY published_at DESC, id DESC
      `
    )
    .all(...uniqueEventIds) as AiTimelineEventEvidenceRow[];

  for (const row of rows) {
    const eventEvidence = result.get(row.event_id) ?? [];
    eventEvidence.push(mapAiTimelineEventEvidenceRow(row));
    result.set(row.event_id, eventEvidence);
  }

  return result;
}

export function refreshAiTimelineEventEvidenceCount(db: SqliteDatabase, eventId: number): void {
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw new Error(`Invalid AI timeline event id: ${eventId}`);
  }

  const row = db
    .prepare(
      `
        SELECT COUNT(*) AS evidence_count
        FROM ai_timeline_event_evidence
        WHERE event_id = ?
      `
    )
    .get(eventId) as { evidence_count: number };
  const evidenceCount = row.evidence_count;

  db.prepare(
    `
      UPDATE ai_timeline_events
      SET evidence_count = @evidenceCount,
          reliability_status = CASE
            WHEN reliability_status = 'manual_verified' THEN reliability_status
            WHEN @evidenceCount > 1 THEN 'multi_source'
            ELSE 'single_source'
          END,
          last_verified_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @eventId
    `
  ).run({
    eventId,
    evidenceCount
  });
}

function normalizeAiTimelineEventEvidenceInput(input: AiTimelineEventEvidenceInput) {
  return {
    eventId: normalizeEventId(input.eventId),
    sourceId: requireNonEmpty(input.sourceId, "sourceId"),
    companyKey: requireNonEmpty(input.companyKey, "companyKey"),
    sourceLabel: requireNonEmpty(input.sourceLabel, "sourceLabel"),
    sourceKind: requireNonEmpty(input.sourceKind, "sourceKind"),
    officialUrl: requireNonEmpty(input.officialUrl, "officialUrl"),
    title: requireNonEmpty(input.title, "title"),
    summary: normalizeNullableText(input.summary),
    publishedAt: requireNonEmpty(input.publishedAt, "publishedAt"),
    discoveredAt: requireNonEmpty(input.discoveredAt, "discoveredAt"),
    rawSourceJson: JSON.stringify(input.rawSourceJson ?? {})
  };
}

function mapAiTimelineEventEvidenceRow(row: AiTimelineEventEvidenceRow): AiTimelineEventEvidenceRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    sourceId: row.source_id,
    companyKey: row.company_key,
    sourceLabel: row.source_label,
    sourceKind: row.source_kind,
    officialUrl: row.official_url,
    title: row.title,
    summary: row.summary,
    publishedAt: row.published_at,
    discoveredAt: row.discovered_at,
    rawSourceJson: parseRawSourceJson(row.raw_source_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeEventId(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid AI timeline event id: ${value}`);
  }

  return value;
}

function requireNonEmpty(value: string | undefined | null, fieldName: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`Missing AI timeline event evidence field: ${fieldName}`);
  }

  return normalized;
}

function normalizeNullableText(value: string | undefined | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseRawSourceJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
