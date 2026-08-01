import type { SqliteDatabase } from "../openDatabase.js";

/** 检查 SQLite 表是否已有指定列，供可重复执行的增量迁移使用。 */
export function hasColumn(db: SqliteDatabase, tableName: string, columnName: string): boolean {
  // PRAGMA table_info is the safest way to detect additive SQLite migrations without relying on exception flow.
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}
