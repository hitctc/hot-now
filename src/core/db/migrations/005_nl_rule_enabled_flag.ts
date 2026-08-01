import type { SqliteDatabase } from "../openDatabase.js";
import { hasColumn } from "./columnHelpers.js";

/** 为自然语言规则补充独立启用开关。 */
export const nlRuleEnabledFlagMigration = {
  version: 5,
  name: "005_nl_rule_enabled_flag",
  apply(db: SqliteDatabase): void {
    // Gate rules need an explicit enable flag so each natural-language gate can be paused without
    // clearing its text and losing the authored rule.
    if (!hasColumn(db, "nl_rule_sets", "is_enabled")) {
      db.exec("ALTER TABLE nl_rule_sets ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1");
    }
  }
} as const;
