import type { SqliteDatabase } from "./openDatabase.js";

const schemaVersion = 1;
const baselineMigrationName = "001_unified_site_baseline";

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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (collection_run_id) REFERENCES collection_runs(id) ON DELETE SET NULL
    )
  `
] as const;

export function runMigrations(db: SqliteDatabase): void {
  // Phase 1 only needs a predictable bootstrap path, so migrations stay as idempotent SQL
  // statements plus one recorded baseline marker that later tasks can extend safely.
  const migrate = db.transaction(() => {
    for (const statement of migrationStatements) {
      db.exec(statement);
    }

    db.pragma(`user_version = ${schemaVersion}`);
    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(schemaVersion, baselineMigrationName);
  });

  migrate();
}
