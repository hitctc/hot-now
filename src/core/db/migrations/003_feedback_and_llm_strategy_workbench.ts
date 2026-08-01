import type { SqliteDatabase } from "../openDatabase.js";

const statements = [
  `
    CREATE TABLE IF NOT EXISTS feedback_pool (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_item_id INTEGER NOT NULL UNIQUE,
      reaction_snapshot TEXT,
      free_text TEXT,
      suggested_effect TEXT,
      strength_level TEXT,
      positive_keywords_json TEXT NOT NULL DEFAULT '[]',
      negative_keywords_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS strategy_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_feedback_id INTEGER,
      draft_text TEXT NOT NULL,
      suggested_scope TEXT NOT NULL DEFAULT 'unspecified',
      draft_effect_summary TEXT,
      positive_keywords_json TEXT NOT NULL DEFAULT '[]',
      negative_keywords_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_feedback_id) REFERENCES feedback_pool(id) ON DELETE SET NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS llm_provider_settings (
      provider_kind TEXT PRIMARY KEY,
      encrypted_api_key TEXT NOT NULL,
      api_key_last4 TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS nl_rule_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL UNIQUE,
      rule_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS content_nl_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_item_id INTEGER NOT NULL,
      scope TEXT NOT NULL,
      decision TEXT NOT NULL,
      strength_level TEXT,
      score_delta INTEGER NOT NULL DEFAULT 0,
      matched_keywords_json TEXT NOT NULL DEFAULT '[]',
      reason TEXT,
      provider_kind TEXT NOT NULL,
      evaluated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(content_item_id, scope),
      FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS nl_evaluation_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_type TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_kind TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      item_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `
] as const;

/** 建立反馈池、策略草稿与 LLM 规则工作台的增量表结构。 */
export const feedbackAndLlmStrategyWorkbenchMigration = {
  version: 3,
  name: "003_feedback_and_llm_strategy_workbench",
  apply(db: SqliteDatabase): void {
    // The feedback workbench upgrade is additive only, so existing local databases can pick it up
    // in place and keep historic content, reactions and report data untouched.
    for (const statement of statements) {
      db.exec(statement);
    }
  }
} as const;
