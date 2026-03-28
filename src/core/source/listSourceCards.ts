import type { SqliteDatabase } from "../db/openDatabase.js";

type SourceRow = {
  kind: string;
  name: string;
  rss_url: string | null;
  is_active: number;
};

type CollectionRunRow = {
  started_at: string;
  finished_at: string | null;
  status: string;
  notes: string | null;
};

export type SourceCard = {
  kind: string;
  name: string;
  rssUrl: string | null;
  isActive: boolean;
  lastCollectedAt: string | null;
  lastCollectionStatus: string | null;
};

// Source cards combine source catalog rows with the latest known run per source kind
// so the system page can show status for every source instead of only the active one.
export function listSourceCards(db: SqliteDatabase): SourceCard[] {
  const sourceRows = db
    .prepare(
      `
        SELECT kind, name, rss_url, is_active
        FROM content_sources
        ORDER BY id ASC
      `
    )
    .all() as SourceRow[];
  const runRows = db
    .prepare(
      `
        SELECT started_at, finished_at, status, notes
        FROM collection_runs
        ORDER BY datetime(COALESCE(finished_at, started_at)) DESC, id DESC
      `
    )
    .all() as CollectionRunRow[];
  const latestRunBySourceKind = buildLatestRunIndex(runRows);

  return sourceRows.map((source) => {
    const latestRun = latestRunBySourceKind.get(source.kind);

    return {
      kind: source.kind,
      name: source.name,
      rssUrl: source.rss_url,
      isActive: source.is_active === 1,
      lastCollectedAt: latestRun?.finishedAt ?? latestRun?.startedAt ?? null,
      lastCollectionStatus: latestRun?.status ?? null
    };
  });
}

type LatestRunSummary = {
  startedAt: string;
  finishedAt: string | null;
  status: string;
};

function buildLatestRunIndex(rows: CollectionRunRow[]): Map<string, LatestRunSummary> {
  // Rows are already sorted newest-first, so the first valid run for a source kind wins.
  const latestRunBySourceKind = new Map<string, LatestRunSummary>();

  for (const row of rows) {
    const sourceKind = parseSourceKind(row.notes);

    if (!sourceKind || latestRunBySourceKind.has(sourceKind)) {
      continue;
    }

    latestRunBySourceKind.set(sourceKind, {
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      status: row.status
    });
  }

  return latestRunBySourceKind;
}

function parseSourceKind(notes: string | null): string | null {
  // Run notes are tolerated as freeform JSON, so malformed or partial rows are ignored instead of breaking the page.
  if (!notes) {
    return null;
  }

  try {
    const parsed = JSON.parse(notes) as Record<string, unknown>;
    return typeof parsed.sourceKind === "string" && parsed.sourceKind.trim() ? parsed.sourceKind.trim() : null;
  } catch {
    return null;
  }
}
