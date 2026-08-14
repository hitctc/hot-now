import type { SqliteDatabase } from "../openDatabase.js";

/**
 * 告警历史表：每次对外发出的告警先落库拿到唯一 ID，邮件主题携带 ID；
 * 排查时凭 ID 查库即可拿到当时的失败任务快照，不依赖邮箱与日志留存。
 */
export const creativeAutomationAlertLogMigration = {
  version: 49,
  name: "049_creative_automation_alert_log",
  apply(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS creative_automation_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        failure_kind TEXT NOT NULL CHECK(failure_kind IN ('evaluate', 'write', 'queue-stall')),
        subject TEXT NOT NULL,
        detail TEXT NOT NULL,
        context_json TEXT,
        is_recovery INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_creative_automation_alerts_kind
        ON creative_automation_alerts(failure_kind, is_recovery, id DESC);
    `);
  }
} as const;
