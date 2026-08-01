import type { SqliteDatabase } from "../openDatabase.js";
import { hasColumn } from "./columnHelpers.js";

/** 为日报邮件重试记录补充最后一次发送时间。 */
export const digestReportMailAttemptMigration = {
  version: 2,
  name: "002_digest_report_mail_attempts",
  apply(db: SqliteDatabase): void {
    if (!hasColumn(db, "digest_reports", "last_email_attempted_at")) {
      db.exec(`ALTER TABLE digest_reports ADD COLUMN last_email_attempted_at TEXT`);
    }
  }
} as const;
