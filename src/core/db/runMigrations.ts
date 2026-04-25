import type { SqliteDatabase } from "./openDatabase.js";

const schemaVersion = 16;
const baselineMigrationName = "001_unified_site_baseline";
const digestReportMailAttemptMigrationName = "002_digest_report_mail_attempts";
const feedbackAndLlmStrategyWorkbenchMigrationName = "003_feedback_and_llm_strategy_workbench";
const sourceDisplayModeMigrationName = "004_source_display_mode";
const nlRuleEnabledFlagMigrationName = "005_nl_rule_enabled_flag";
const providerSettingsMultiSaveMigrationName = "006_provider_settings_multi_save";
const sourceBridgeMetadataMigrationName = "007_source_bridge_metadata";
const twitterAccountsMigrationName = "008_twitter_accounts";
const twitterSearchKeywordsMigrationName = "009_twitter_search_keywords";
const hackerNewsQueriesMigrationName = "010_hackernews_queries";
const bilibiliQueriesMigrationName = "011_bilibili_queries";
const weiboTrendingMigrationName = "012_weibo_trending";
const wechatRssSourcesMigrationName = "013_wechat_rss_sources";
const aiTimelineEventsMigrationName = "014_ai_timeline_events";
const aiTimelineEventImportanceMigrationName = "015_ai_timeline_event_importance";
const aiTimelineReliabilityWorkspaceMigrationName = "016_ai_timeline_reliability_workspace";

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

    // Twitter account collection has its own configuration table because account sources need
    // platform-specific fields and should not be mixed into the RSS source inventory.
    db.exec(`
      CREATE TABLE IF NOT EXISTS twitter_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        user_id TEXT,
        display_name TEXT NOT NULL,
        category TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 50,
        include_replies INTEGER NOT NULL DEFAULT 0,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        last_fetched_at TEXT,
        last_success_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_twitter_accounts_enabled
      ON twitter_accounts(is_enabled)
    `);

    if (!hasColumn(db, "content_items", "metadata_json")) {
      db.exec("ALTER TABLE content_items ADD COLUMN metadata_json TEXT");
    }

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(8, twitterAccountsMigrationName);

    // Twitter keyword search uses its own config and match tables, while collected tweets still
    // need one hidden aggregate source row to satisfy the existing content_items foreign key.
    db.exec(`
      CREATE TABLE IF NOT EXISTS twitter_search_keywords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT NOT NULL COLLATE NOCASE UNIQUE,
        category TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 60,
        is_collect_enabled INTEGER NOT NULL DEFAULT 1,
        is_visible INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        last_fetched_at TEXT,
        last_success_at TEXT,
        last_result TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_twitter_search_keywords_collect_enabled
      ON twitter_search_keywords(is_collect_enabled)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_twitter_search_keywords_visible
      ON twitter_search_keywords(is_visible)
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS twitter_search_keyword_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword_id INTEGER NOT NULL,
        tweet_external_id TEXT NOT NULL,
        content_item_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(keyword_id, tweet_external_id),
        FOREIGN KEY (keyword_id) REFERENCES twitter_search_keywords(id) ON DELETE CASCADE,
        FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_twitter_search_keyword_matches_content_item
      ON twitter_search_keyword_matches(content_item_id)
    `);

    db.prepare(
      `
        INSERT INTO content_sources (
          kind,
          name,
          site_url,
          rss_url,
          is_enabled,
          is_builtin,
          source_type,
          show_all_when_selected,
          updated_at
        )
        VALUES (?, ?, ?, ?, 0, 0, ?, 0, CURRENT_TIMESTAMP)
        ON CONFLICT(kind) DO UPDATE SET
          name = excluded.name,
          site_url = excluded.site_url,
          source_type = excluded.source_type,
          show_all_when_selected = 0,
          updated_at = CURRENT_TIMESTAMP
      `
    ).run(
      "twitter_keyword_search",
      "Twitter 关键词搜索",
      "https://x.com",
      null,
      "twitter_keyword_aggregate"
    );

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(9, twitterSearchKeywordsMigrationName);

    // Hacker News search stays on a dedicated config table so query management can evolve
    // without overloading the generic content_sources inventory semantics.
    db.exec(`
      CREATE TABLE IF NOT EXISTS hackernews_queries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL COLLATE NOCASE UNIQUE,
        priority INTEGER NOT NULL DEFAULT 60,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        last_fetched_at TEXT,
        last_success_at TEXT,
        last_result TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_hackernews_queries_enabled
      ON hackernews_queries(is_enabled)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_hackernews_queries_priority
      ON hackernews_queries(priority)
    `);

    db.prepare(
      `
        INSERT INTO content_sources (
          kind,
          name,
          site_url,
          rss_url,
          is_enabled,
          is_builtin,
          source_type,
          show_all_when_selected,
          updated_at
        )
        VALUES (?, ?, ?, ?, 0, 0, ?, 0, CURRENT_TIMESTAMP)
        ON CONFLICT(kind) DO UPDATE SET
          name = excluded.name,
          site_url = excluded.site_url,
          source_type = excluded.source_type,
          show_all_when_selected = 0,
          updated_at = CURRENT_TIMESTAMP
      `
    ).run(
      "hackernews_search",
      "Hacker News 搜索",
      "https://news.ycombinator.com",
      null,
      "hackernews_aggregate"
    );

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(10, hackerNewsQueriesMigrationName);

    // B 站搜索沿用独立 query 配置表，这样视频搜索不会污染普通 RSS 来源库存语义。
    db.exec(`
      CREATE TABLE IF NOT EXISTS bilibili_queries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL COLLATE NOCASE UNIQUE,
        priority INTEGER NOT NULL DEFAULT 60,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        last_fetched_at TEXT,
        last_success_at TEXT,
        last_result TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_bilibili_queries_enabled
      ON bilibili_queries(is_enabled)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_bilibili_queries_priority
      ON bilibili_queries(priority)
    `);

    db.prepare(
      `
        INSERT INTO content_sources (
          kind,
          name,
          site_url,
          rss_url,
          is_enabled,
          is_builtin,
          source_type,
          show_all_when_selected,
          updated_at
        )
        VALUES (?, ?, ?, ?, 0, 0, ?, 0, CURRENT_TIMESTAMP)
        ON CONFLICT(kind) DO UPDATE SET
          name = excluded.name,
          site_url = excluded.site_url,
          source_type = excluded.source_type,
          is_enabled = 0,
          is_builtin = 0,
          show_all_when_selected = 0,
          updated_at = CURRENT_TIMESTAMP
      `
    ).run("bilibili_search", "B 站搜索", "https://search.bilibili.com", null, "bilibili_search_aggregate");

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(11, bilibiliQueriesMigrationName);

    // 微博热搜第一版只有固定关键词匹配，没有单独配置表，但仍需要一个隐藏聚合 source
    // 来承接 content_items 外键。
    db.prepare(
      `
        INSERT INTO content_sources (
          kind,
          name,
          site_url,
          rss_url,
          is_enabled,
          is_builtin,
          source_type,
          show_all_when_selected,
          updated_at
        )
        VALUES (?, ?, ?, ?, 0, 0, ?, 0, CURRENT_TIMESTAMP)
        ON CONFLICT(kind) DO UPDATE SET
          name = excluded.name,
          site_url = excluded.site_url,
          source_type = excluded.source_type,
          is_enabled = 0,
          is_builtin = 0,
          show_all_when_selected = 0,
          updated_at = CURRENT_TIMESTAMP
      `
    ).run(
      "weibo_trending",
      "微博热搜榜匹配",
      "https://s.weibo.com/top/summary",
      null,
      "weibo_trending_aggregate"
    );

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(12, weiboTrendingMigrationName);

    // 微信公众号 RSS 进入独立配置表，避免把每个公众号 feed 混进普通 RSS 库存。
    db.exec(`
      CREATE TABLE IF NOT EXISTS wechat_rss_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rss_url TEXT NOT NULL UNIQUE,
        display_name TEXT,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        last_fetched_at TEXT,
        last_success_at TEXT,
        last_result TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_wechat_rss_sources_enabled
      ON wechat_rss_sources(is_enabled)
    `);

    db.prepare(
      `
        INSERT INTO content_sources (
          kind,
          name,
          site_url,
          rss_url,
          is_enabled,
          is_builtin,
          source_type,
          show_all_when_selected,
          updated_at
        )
        VALUES (?, ?, ?, ?, 0, 0, ?, 0, CURRENT_TIMESTAMP)
        ON CONFLICT(kind) DO UPDATE SET
          name = excluded.name,
          site_url = excluded.site_url,
          source_type = excluded.source_type,
          is_enabled = 0,
          is_builtin = 0,
          show_all_when_selected = 0,
          updated_at = CURRENT_TIMESTAMP
      `
    ).run(
      "wechat_rss",
      "微信公众号 RSS",
      "https://mp.weixin.qq.com/",
      null,
      "wechat_rss_aggregate"
    );

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(13, wechatRssSourcesMigrationName);

    // AI 时间线单独保存官方发布事件，不复用普通内容流，避免官方事件被新闻评分和热点归并污染。
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_timeline_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_key TEXT NOT NULL,
        company_name TEXT NOT NULL,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        official_url TEXT NOT NULL,
        source_label TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        published_at TEXT NOT NULL,
        discovered_at TEXT NOT NULL,
        importance INTEGER NOT NULL DEFAULT 50,
        raw_source_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(official_url)
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_timeline_events_published_at
      ON ai_timeline_events(published_at DESC)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_timeline_events_company_key
      ON ai_timeline_events(company_key)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_timeline_events_event_type
      ON ai_timeline_events(event_type)
    `);

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(14, aiTimelineEventsMigrationName);

    // 重要发布时间线需要保留自动规则和人工修正两层语义，迁移保持 additive，避免触碰已有官方事件。
    if (!hasColumn(db, "ai_timeline_events", "importance_level")) {
      db.exec("ALTER TABLE ai_timeline_events ADD COLUMN importance_level TEXT NOT NULL DEFAULT 'B'");
    }

    if (!hasColumn(db, "ai_timeline_events", "release_status")) {
      db.exec("ALTER TABLE ai_timeline_events ADD COLUMN release_status TEXT NOT NULL DEFAULT 'released'");
    }

    if (!hasColumn(db, "ai_timeline_events", "importance_summary_zh")) {
      db.exec("ALTER TABLE ai_timeline_events ADD COLUMN importance_summary_zh TEXT");
    }

    if (!hasColumn(db, "ai_timeline_events", "visibility_status")) {
      db.exec("ALTER TABLE ai_timeline_events ADD COLUMN visibility_status TEXT NOT NULL DEFAULT 'auto_visible'");
    }

    if (!hasColumn(db, "ai_timeline_events", "manual_title")) {
      db.exec("ALTER TABLE ai_timeline_events ADD COLUMN manual_title TEXT");
    }

    if (!hasColumn(db, "ai_timeline_events", "manual_summary_zh")) {
      db.exec("ALTER TABLE ai_timeline_events ADD COLUMN manual_summary_zh TEXT");
    }

    if (!hasColumn(db, "ai_timeline_events", "manual_importance_level")) {
      db.exec("ALTER TABLE ai_timeline_events ADD COLUMN manual_importance_level TEXT");
    }

    if (!hasColumn(db, "ai_timeline_events", "detected_entities_json")) {
      db.exec("ALTER TABLE ai_timeline_events ADD COLUMN detected_entities_json TEXT NOT NULL DEFAULT '[]'");
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_timeline_events_visible_recent
      ON ai_timeline_events(visibility_status, importance_level, published_at DESC)
    `);

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(15, aiTimelineEventImportanceMigrationName);

    // 时间线可靠性工作台需要记录来源健康和官方证据链，迁移保持 additive，
    // 让既有候选事件继续保留，同时给后续去重合并和后台运营提供结构化数据。
    if (!hasColumn(db, "ai_timeline_events", "event_key")) {
      db.exec("ALTER TABLE ai_timeline_events ADD COLUMN event_key TEXT");
    }

    if (!hasColumn(db, "ai_timeline_events", "reliability_status")) {
      db.exec("ALTER TABLE ai_timeline_events ADD COLUMN reliability_status TEXT NOT NULL DEFAULT 'single_source'");
    }

    if (!hasColumn(db, "ai_timeline_events", "evidence_count")) {
      db.exec("ALTER TABLE ai_timeline_events ADD COLUMN evidence_count INTEGER NOT NULL DEFAULT 1");
    }

    if (!hasColumn(db, "ai_timeline_events", "last_verified_at")) {
      db.exec("ALTER TABLE ai_timeline_events ADD COLUMN last_verified_at TEXT");
    }

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_timeline_events_event_key
      ON ai_timeline_events(event_key)
      WHERE event_key IS NOT NULL
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_timeline_events_reliability_recent
      ON ai_timeline_events(reliability_status, published_at DESC)
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_timeline_event_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        source_id TEXT NOT NULL,
        company_key TEXT NOT NULL,
        source_label TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        official_url TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        published_at TEXT NOT NULL,
        discovered_at TEXT NOT NULL,
        raw_source_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(event_id, source_id, official_url),
        FOREIGN KEY (event_id) REFERENCES ai_timeline_events(id) ON DELETE CASCADE
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_timeline_event_evidence_event_id
      ON ai_timeline_event_evidence(event_id)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_timeline_event_evidence_source_id
      ON ai_timeline_event_evidence(source_id)
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_timeline_source_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT NOT NULL,
        company_key TEXT NOT NULL,
        company_name TEXT NOT NULL,
        source_label TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        fetched_item_count INTEGER NOT NULL DEFAULT 0,
        candidate_event_count INTEGER NOT NULL DEFAULT 0,
        important_event_count INTEGER NOT NULL DEFAULT 0,
        latest_official_published_at TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_timeline_source_runs_source_recent
      ON ai_timeline_source_runs(source_id, started_at DESC)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_timeline_source_runs_status_recent
      ON ai_timeline_source_runs(status, started_at DESC)
    `);

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(16, aiTimelineReliabilityWorkspaceMigrationName);

    db.pragma(`user_version = ${schemaVersion}`);
  });

  migrate();
}

function hasColumn(db: SqliteDatabase, tableName: string, columnName: string): boolean {
  // PRAGMA table_info is the safest way to detect additive SQLite migrations without relying on exception flow.
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}
