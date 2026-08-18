import type { SqliteDatabase } from "./openDatabase.js";
import { unifiedSiteBaselineMigration } from "./migrations/001_unified_site_baseline.js";
import { digestReportMailAttemptMigration } from "./migrations/002_digest_report_mail_attempts.js";
import { feedbackAndLlmStrategyWorkbenchMigration } from "./migrations/003_feedback_and_llm_strategy_workbench.js";
import { sourceDisplayModeMigration } from "./migrations/004_source_display_mode.js";
import { nlRuleEnabledFlagMigration } from "./migrations/005_nl_rule_enabled_flag.js";
import { providerSettingsMultiSaveMigration } from "./migrations/006_provider_settings_multi_save.js";
import { sourceBridgeMetadataMigration } from "./migrations/007_source_bridge_metadata.js";
import { twitterAccountsMigration } from "./migrations/008_twitter_accounts.js";
import { twitterSearchKeywordsMigration } from "./migrations/009_twitter_search_keywords.js";
import { hackerNewsQueriesMigration } from "./migrations/010_hackernews_queries.js";
import { bilibiliQueriesMigration } from "./migrations/011_bilibili_queries.js";
import { weiboTrendingMigration } from "./migrations/012_weibo_trending.js";
import { wechatRssSourcesMigration } from "./migrations/013_wechat_rss_sources.js";
import { creativeAccountFitAutomationMigration } from "./migrations/048_creative_account_fit_automation.js";
import { creativeAutomationAlertLogMigration } from "./migrations/049_creative_automation_alert_log.js";
import { creativeAutomationMasterSwitchMigration } from "./migrations/050_creative_automation_master_switch.js";
import { applyLegacyMigrations014To047 } from "./legacyMigrations014To047.js";

const schemaVersion = 50;

export function runMigrations(db: SqliteDatabase): void {
  // Migrations stay idempotent because existing local SQLite files must be upgraded in place
  // without forcing developers to rebuild data or drop historical reports.
  const existingForeignKeyErrors = db.pragma("foreign_key_check") as ForeignKeyCheckRow[];
  const migrate = db.transaction(() => {
    for (const statement of unifiedSiteBaselineMigration.statements) {
      db.exec(statement);
    }

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(unifiedSiteBaselineMigration.version, unifiedSiteBaselineMigration.name);

    digestReportMailAttemptMigration.apply(db);

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(digestReportMailAttemptMigration.version, digestReportMailAttemptMigration.name);

    feedbackAndLlmStrategyWorkbenchMigration.apply(db);

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(feedbackAndLlmStrategyWorkbenchMigration.version, feedbackAndLlmStrategyWorkbenchMigration.name);

    sourceDisplayModeMigration.apply(db);

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(sourceDisplayModeMigration.version, sourceDisplayModeMigration.name);

    nlRuleEnabledFlagMigration.apply(db);

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(nlRuleEnabledFlagMigration.version, nlRuleEnabledFlagMigration.name);

    providerSettingsMultiSaveMigration.apply(db);

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(providerSettingsMultiSaveMigration.version, providerSettingsMultiSaveMigration.name);

    sourceBridgeMetadataMigration.apply(db);

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(sourceBridgeMetadataMigration.version, sourceBridgeMetadataMigration.name);

    twitterAccountsMigration.apply(db);

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(twitterAccountsMigration.version, twitterAccountsMigration.name);

    twitterSearchKeywordsMigration.apply(db);

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(twitterSearchKeywordsMigration.version, twitterSearchKeywordsMigration.name);

    hackerNewsQueriesMigration.apply(db);

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(hackerNewsQueriesMigration.version, hackerNewsQueriesMigration.name);

    bilibiliQueriesMigration.apply(db);

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(bilibiliQueriesMigration.version, bilibiliQueriesMigration.name);

    weiboTrendingMigration.apply(db);

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(weiboTrendingMigration.version, weiboTrendingMigration.name);

    wechatRssSourcesMigration.apply(db);

    db.prepare(
      `
        INSERT INTO schema_migrations (version, name)
        VALUES (?, ?)
        ON CONFLICT(version) DO NOTHING
      `
    ).run(wechatRssSourcesMigration.version, wechatRssSourcesMigration.name);

    applyLegacyMigrations014To047(db);

    creativeAccountFitAutomationMigration.apply(db);
    db.prepare(`INSERT INTO schema_migrations (version, name) VALUES (?, ?) ON CONFLICT(version) DO NOTHING`).run(
      creativeAccountFitAutomationMigration.version,
      creativeAccountFitAutomationMigration.name
    );

    creativeAutomationAlertLogMigration.apply(db);
    db.prepare(`INSERT INTO schema_migrations (version, name) VALUES (?, ?) ON CONFLICT(version) DO NOTHING`).run(
      creativeAutomationAlertLogMigration.version,
      creativeAutomationAlertLogMigration.name
    );

    creativeAutomationMasterSwitchMigration.apply(db);
    db.prepare(`INSERT INTO schema_migrations (version, name) VALUES (?, ?) ON CONFLICT(version) DO NOTHING`).run(
      creativeAutomationMasterSwitchMigration.version,
      creativeAutomationMasterSwitchMigration.name
    );

    db.pragma(`user_version = ${schemaVersion}`);
    // 历史库可能已有悬空引用；本次迁移只阻止新增错误，避免误删既有文章或阻断启动。
    const foreignKeyErrors = db.pragma("foreign_key_check") as ForeignKeyCheckRow[];
    const newForeignKeyErrors = findNewForeignKeyErrors(existingForeignKeyErrors, foreignKeyErrors);
    if (newForeignKeyErrors.length > 0) {
      throw new Error(`foreign key check found new errors after migrations: ${JSON.stringify(newForeignKeyErrors)}`);
    }
  });

  // SQLite 只有重建表才能移除 NOT NULL；迁移期间暂时关闭外键，完成后立即恢复并校验。
  const foreignKeysEnabled = db.pragma("foreign_keys", { simple: true }) === 1;
  if (foreignKeysEnabled) db.pragma("foreign_keys = OFF");
  try {
    migrate();
  } finally {
    if (foreignKeysEnabled) db.pragma("foreign_keys = ON");
  }
}

type ForeignKeyCheckRow = {
  table: string;
  rowid: number | null;
  parent: string;
  fkid: number;
};

/** 比较迁移前后外键检查结果，只返回由本次迁移新增的错误。 */
export function findNewForeignKeyErrors(
  before: ForeignKeyCheckRow[],
  after: ForeignKeyCheckRow[]
): ForeignKeyCheckRow[] {
  const existing = new Set(before.map(foreignKeyErrorKey));
  return after.filter((row) => !existing.has(foreignKeyErrorKey(row)));
}

function foreignKeyErrorKey(row: ForeignKeyCheckRow): string {
  return `${row.table}\u0000${row.rowid ?? "null"}\u0000${row.parent}\u0000${row.fkid}`;
}
