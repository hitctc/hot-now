import type { SqliteDatabase } from "../db/openDatabase.js";

export type AiTimelineAlertChannelStatus = "sent" | "failed" | "skipped";

export type AiTimelineAlertRecordInput = {
  eventKey: string;
  title: string;
  publishedAt: string;
  feishuStatus: AiTimelineAlertChannelStatus;
  emailStatus: AiTimelineAlertChannelStatus;
  lastError: string | null;
};

// Alert selection reads only event keys so polling stays cheap even as the sent table grows.
export function listSentAiTimelineAlertEventKeys(db: SqliteDatabase, eventKeys: string[]) {
  const uniqueEventKeys = [...new Set(eventKeys.map((eventKey) => eventKey.trim()).filter(Boolean))];

  if (uniqueEventKeys.length === 0) {
    return new Set<string>();
  }

  const placeholders = uniqueEventKeys.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        SELECT event_key
        FROM ai_timeline_event_notifications
        WHERE event_key IN (${placeholders})
      `
    )
    .all(...uniqueEventKeys) as Array<{ event_key: string }>;

  return new Set(rows.map((row) => row.event_key));
}

// One row per eventKey is enough for dedupe while still preserving per-channel delivery status.
export function saveAiTimelineAlertRecord(db: SqliteDatabase, input: AiTimelineAlertRecordInput) {
  const now = new Date().toISOString();

  db.prepare(
    `
      INSERT INTO ai_timeline_event_notifications (
        event_key,
        title,
        published_at,
        feishu_status,
        email_status,
        last_error,
        notified_at,
        created_at,
        updated_at
      )
      VALUES (
        @eventKey,
        @title,
        @publishedAt,
        @feishuStatus,
        @emailStatus,
        @lastError,
        @now,
        @now,
        @now
      )
      ON CONFLICT(event_key) DO UPDATE SET
        title = excluded.title,
        published_at = excluded.published_at,
        feishu_status = excluded.feishu_status,
        email_status = excluded.email_status,
        last_error = excluded.last_error,
        notified_at = excluded.notified_at,
        updated_at = excluded.updated_at
    `
  ).run({ ...input, now });
}
