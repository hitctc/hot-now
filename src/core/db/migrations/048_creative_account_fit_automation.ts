import type { SqliteDatabase } from "../openDatabase.js";

/**
 * 持久化账号适配与自动写作的调度状态；素材本身只保留业务结果，任务表承载重试和运行历史。
 */
export const creativeAccountFitAutomationMigration = {
  version: 48,
  name: "048_creative_account_fit_automation",
  apply(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS creative_automation_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS creative_automation_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_type TEXT NOT NULL CHECK(job_type IN ('evaluate', 'write')),
        source_item_id INTEGER NOT NULL,
        trigger_kind TEXT NOT NULL CHECK(trigger_kind IN ('automatic', 'manual-evaluate', 'manual-write')),
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'retrying', 'dispatched', 'succeeded', 'failed', 'uncertain', 'cancelled', 'expired')),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_run_at TEXT,
        thesis TEXT,
        force_account_fit INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        dispatched_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_item_id) REFERENCES creative_source_items(id)
      );

      CREATE INDEX IF NOT EXISTS idx_creative_automation_jobs_ready
        ON creative_automation_jobs(job_type, status, next_run_at, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_creative_automation_jobs_source
        ON creative_automation_jobs(source_item_id, job_type, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_creative_automation_one_active_evaluate
        ON creative_automation_jobs(source_item_id, job_type)
        WHERE job_type = 'evaluate' AND status IN ('pending', 'running', 'retrying');
      CREATE UNIQUE INDEX IF NOT EXISTS idx_creative_automation_one_active_write
        ON creative_automation_jobs(source_item_id, job_type)
        WHERE job_type = 'write' AND status IN ('pending', 'running', 'retrying', 'dispatched');

      CREATE TABLE IF NOT EXISTS creative_automation_alert_state (
        failure_kind TEXT PRIMARY KEY,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        last_success_at TEXT,
        last_alert_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO creative_automation_settings(key, value) VALUES
        ('account_fit_auto_evaluate_enabled', 'true'),
        ('account_fit_auto_write_enabled', 'true')
      ON CONFLICT(key) DO NOTHING;
    `);
  }
} as const;
