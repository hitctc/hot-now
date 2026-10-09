import type { SqliteDatabase } from "../openDatabase.js";

/** 建立管理员 API 凭证与提醒去重表；凭证明文只在签发响应中短暂出现。 */
export const adminApiAccessTokensMigration = {
  version: 58,
  name: "058_admin_api_access_tokens",
  /** 创建可撤销的凭证元数据及到期提醒记录，不改动现有账号或业务数据。 */
  apply(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS admin_api_access_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_username TEXT NOT NULL,
        name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
        token_hash TEXT NOT NULL UNIQUE,
        token_prefix TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_admin_api_access_tokens_owner_created
      ON admin_api_access_tokens(owner_username, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_admin_api_access_tokens_active_expiry
      ON admin_api_access_tokens(revoked_at, expires_at);
      CREATE TABLE IF NOT EXISTS admin_api_access_token_reminders (
        token_id INTEGER NOT NULL,
        reminder_days INTEGER NOT NULL CHECK (reminder_days IN (7, 14, 30)),
        sent_at TEXT NOT NULL,
        PRIMARY KEY (token_id, reminder_days),
        FOREIGN KEY (token_id) REFERENCES admin_api_access_tokens(id) ON DELETE CASCADE
      );
    `);
  }
} as const;
