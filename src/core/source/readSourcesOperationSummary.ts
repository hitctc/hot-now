import type { SqliteDatabase } from "../db/openDatabase.js";
import { findLatestDigestReportMailAttemptAt } from "../storage/reportStore.js";

type LatestCollectionRunRow = {
  started_at: string;
  finished_at: string | null;
};

export type SourcesOperationSummary = {
  lastCollectionRunAt: string | null;
  lastSendLatestEmailAt: string | null;
};

// The source settings page only needs one aggregate timestamp per action card, so this helper keeps
// the SQL narrow and returns null when no matching execution has happened yet.
export function readSourcesOperationSummary(db: SqliteDatabase): SourcesOperationSummary {
  const latestCollectionRun = db
    .prepare(
      `
        SELECT started_at, finished_at
        FROM collection_runs
        ORDER BY datetime(COALESCE(finished_at, started_at)) DESC, id DESC
        LIMIT 1
      `
    )
    .get() as LatestCollectionRunRow | undefined;

  return {
    lastCollectionRunAt: latestCollectionRun?.finished_at ?? latestCollectionRun?.started_at ?? null,
    lastSendLatestEmailAt: findLatestDigestReportMailAttemptAt(db)
  };
}
