import type { SqliteDatabase } from "../openDatabase.js";
import { hasColumn } from "./columnHelpers.js";

/** 为桥接来源补充类型、桥接种类与配置元数据。 */
export const sourceBridgeMetadataMigration = {
  version: 7,
  name: "007_source_bridge_metadata",
  apply(db: SqliteDatabase): void {
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
  }
} as const;
