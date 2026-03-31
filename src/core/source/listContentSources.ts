import type { SqliteDatabase } from "../db/openDatabase.js";

export type ContentSourceOption = {
  kind: string;
  name: string;
  isEnabled: boolean;
};

type ContentSourceRow = {
  kind: string;
  name: string;
  is_enabled: number;
};

export function listContentSources(db: SqliteDatabase): ContentSourceOption[] {
  // Content filters only need source identity plus enable state, so the client payload stays small and stable.
  return (
    db
      .prepare(
        `
          SELECT kind, name, is_enabled
          FROM content_sources
          ORDER BY id ASC
        `
      )
      .all() as ContentSourceRow[]
  ).map((row) => ({
    kind: row.kind,
    name: row.name,
    isEnabled: row.is_enabled === 1
  }));
}
