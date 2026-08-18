import type { SqliteDatabase } from "../openDatabase.js";

/** 为账号适配与自动写作增加一个总开关，保留评估和写作两个细分开关。 */
export const creativeAutomationMasterSwitchMigration = {
  version: 50,
  name: "050_creative_automation_master_switch",
  apply(db: SqliteDatabase): void {
    db.prepare(`
      INSERT INTO creative_automation_settings(key, value, updated_at)
      VALUES ('creative_automation_enabled', 'true', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO NOTHING
    `).run();
  }
} as const;
