import type { SqliteDatabase } from "../openDatabase.js";
import { hasColumn } from "./columnHelpers.js";

/** 将旧的单行供应商设置表升级为按厂商保存并独立启用的结构。 */
export const providerSettingsMultiSaveMigration = {
  version: 6,
  name: "006_provider_settings_multi_save",
  apply(db: SqliteDatabase): void {
    // LLM 厂商配置现在要支持“分别保存 + 独立启用”，所以旧的单行表需要就地转成按厂商存储。
    if (hasColumn(db, "llm_provider_settings", "id")) {
      db.exec("ALTER TABLE llm_provider_settings RENAME TO llm_provider_settings_legacy");
      db.exec(`
        CREATE TABLE llm_provider_settings (
          provider_kind TEXT PRIMARY KEY,
          encrypted_api_key TEXT NOT NULL,
          api_key_last4 TEXT NOT NULL,
          is_enabled INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.exec(`
        INSERT INTO llm_provider_settings (
          provider_kind,
          encrypted_api_key,
          api_key_last4,
          is_enabled,
          created_at,
          updated_at
        )
        SELECT
          provider_kind,
          encrypted_api_key,
          api_key_last4,
          is_enabled,
          created_at,
          updated_at
        FROM llm_provider_settings_legacy
      `);
      db.exec("DROP TABLE llm_provider_settings_legacy");
    }

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_provider_settings_single_enabled
      ON llm_provider_settings(is_enabled)
      WHERE is_enabled = 1
    `);
  }
} as const;
