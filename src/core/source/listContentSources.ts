import type { SqliteDatabase } from "../db/openDatabase.js";

export type ContentSourceOption = {
  kind: string;
  name: string;
  isEnabled: boolean;
  showAllWhenSelected: boolean;
};

type ContentSourceRow = {
  kind: string;
  name: string;
  is_enabled: number;
  show_all_when_selected: number;
};

export function listContentSources(db: SqliteDatabase): ContentSourceOption[] {
  // Content filters only need source identity plus enable state, so the client payload stays small and stable.
  return (
    db
      .prepare(
        `
          SELECT kind, name, is_enabled, show_all_when_selected
          FROM content_sources
          WHERE COALESCE(source_type, 'rss') NOT IN ('twitter_account_aggregate', 'twitter_keyword_aggregate')
          ORDER BY id ASC
        `
      )
      .all() as ContentSourceRow[]
  ).map((row) => ({
    kind: row.kind,
    name: row.name,
    isEnabled: row.is_enabled === 1,
    showAllWhenSelected: row.show_all_when_selected === 1
  }));
}
