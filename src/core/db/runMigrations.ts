import type { SqliteDatabase } from "./openDatabase.js";

const schemaVersion = 7;
const baselineMigrationName = "001_unified_site_baseline";
const digestReportMailAttemptMigrationName = "002_digest_report_mail_attempts";
const feedbackAndLlmStrategyWorkbenchMigrationName = "003_feedback_and_llm_strategy_workbench";
const sourceDisplayModeMigrationName = "004_source_display_mode";
const nlRuleEnabledFlagMigrationName = "005_nl_rule_enabled_flag";
const providerSettingsMultiSaveMigrationName = "006_provider_settings_multi_save";
const sourceBridgeMetadataMigrationName = "007_source_bridge_metadata";

const migrationStatements = [
  `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS content_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      site_url TEXT NOT NULL,
      rss_url TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS content_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      external_id TEXT,
      title TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      summary TEXT,
      body_markdown TEXT,
      published_at TEXT,
      fetched_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, canonical_url),
      FOREIGN KEY (source_id) REFERENCES content_sources(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS content_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_item_id INTEGER NOT NULL,
      feedback_kind TEXT NOT NULL,
      feedback_value TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS rating_dimensions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      weight REAL NOT NULL DEFAULT 1
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS content_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_item_id INTEGER NOT NULL,
      rating_dimension_id INTEGER NOT NULL,
      score REAL NOT NULL,
      rationale TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(content_item_id, rating_dimension_id),
      FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE,
      FOREIGN KEY (rating_dimension_id) REFERENCES rating_dimensions(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS view_rule_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      config_json TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      display_name TEXT,
      email TEXT,
      preferences_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS collection_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_date TEXT NOT NULL,
      trigger_kind TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS digest_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_date TEXT NOT NULL UNIQUE,
      collection_run_id INTEGER,
      report_json_path TEXT,
      report_html_path TEXT,
      mail_status TEXT,
      last_email_attempted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (collection_run_id) REFERENCES collection_runs(id) ON DELETE SET NULL
    )
  `
] as const;

const feedbackAndLlmWorkbenchStatements = [
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

export function runMigrations(db: SqliteDatabase): void {
  // Migrations stay idempotent because existing local SQLite files must be upgraded in place
  // without forcing developers to rebuild data or drop historical reports.
  const migrate = db.transaction(() => {
    for (const statement of migrationStatements) {
      db.exec(statement);
    }

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(1, baselineMigrationName);

    if (!hasColumn(db, "digest_reports", "last_email_attempted_at")) {
      db.exec(`ALTER TABLE digest_reports ADD COLUMN last_email_attempted_at TEXT`);
    }

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(2, digestReportMailAttemptMigrationName);

    // The feedback workbench upgrade is additive only, so existing local databases can pick it up
    // in place and keep historic content, reactions and report data untouched.
    for (const statement of feedbackAndLlmWorkbenchStatements) {
      db.exec(statement);
    }

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(3, feedbackAndLlmStrategyWorkbenchMigrationName);

    // Source display mode stays additive so older SQLite files can gain the new setting without
    // rebuilding the local database or losing any collected content and report history.
    if (!hasColumn(db, "content_sources", "show_all_when_selected")) {
      db.exec("ALTER TABLE content_sources ADD COLUMN show_all_when_selected INTEGER NOT NULL DEFAULT 0");
    }

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(4, sourceDisplayModeMigrationName);

    // Gate rules need an explicit enable flag so each natural-language gate can be paused without
    // clearing its text and losing the authored rule.
    if (!hasColumn(db, "nl_rule_sets", "is_enabled")) {
      db.exec("ALTER TABLE nl_rule_sets ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1");
    }

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(5, nlRuleEnabledFlagMigrationName);

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

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(6, providerSettingsMultiSaveMigrationName);

    // Bridge-backed sources still save a final rss_url, but source rows now need explicit type and
    // bridge metadata so the sources workbench can manage RSS and WeChat sources in one table.
    if (!hasColumn(db, "content_sources", "source_type")) {
      db.exec("ALTER TABLE content_sources ADD COLUMN source_type TEXT NOT NULL DEFAULT 'rss'");
    }

    if (!hasColumn(db, "content_sources", "bridge_kind")) {
      db.exec("ALTER TABLE content_sources ADD COLUMN bridge_kind TEXT");
    }

    if (!hasColumn(db, "content_sources", "bridge_config_json")) {
      db.exec("ALTER TABLE content_sources ADD COLUMN bridge_config_json TEXT");
    }

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(7, sourceBridgeMetadataMigrationName);

    db.pragma(`user_version = ${schemaVersion}`);
  });

  migrate();
}

function hasColumn(db: SqliteDatabase, tableName: string, columnName: string): boolean {
  // PRAGMA table_info is the safest way to detect additive SQLite migrations without relying on exception flow.
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}
