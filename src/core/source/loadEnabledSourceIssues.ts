import type { SqliteDatabase } from "../db/openDatabase.js";
import { BUILTIN_SOURCES } from "./sourceCatalog.js";
import { sourceAdapters } from "./sourceAdapters.js";
import type { LoadedIssue, SourceKind } from "./types.js";

type EnabledSourceRow = {
  kind: SourceKind;
  rss_url: string | null;
};

export type SourceLoadFailure = {
  kind: SourceKind;
  reason: string;
};

export type LoadedSourceIssues = LoadedIssue[] & {
  failures?: SourceLoadFailure[];
};

// Multi-source collection reads every enabled source row, fetches it in priority order, and
// returns the parsed issues so the digest pipeline can merge them into a single run.
export async function loadEnabledSourceIssues(db: SqliteDatabase): Promise<LoadedSourceIssues> {
  const enabledSources = readEnabledSourceRows(db);

  if (enabledSources.length === 0) {
    throw new Error("No enabled content sources are available");
  }

  const orderedSources = enabledSources
    .map((source) => ({
      ...source,
      sourcePriority: getSourcePriority(source.kind)
    }))
    .sort((left, right) => {
      const priorityDiff = right.sourcePriority - left.sourcePriority;

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return left.kind.localeCompare(right.kind);
    });

  const results = await Promise.allSettled(
    orderedSources.map(async (source) => await loadEnabledSourceIssue(source.kind, source.rss_url))
  );
  const loadedIssues = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const failures = results.flatMap((result, index) => {
    if (result.status === "fulfilled") {
      return [];
    }

    return [
      {
        kind: orderedSources[index].kind,
        reason: result.reason instanceof Error ? result.reason.message : "unknown"
      }
    ];
  });

  // Multi-source mode stays useful as long as at least one source can be parsed, so one flaky feed
  // does not block the whole digest. The caller still gets a hard failure if every enabled source fails.
  if (loadedIssues.length === 0) {
    throw new Error(failures[0]?.reason ?? "No enabled content sources could be loaded");
  }

  return Object.assign(loadedIssues, { failures });
}

async function loadEnabledSourceIssue(kind: SourceKind, rssUrl: string | null): Promise<LoadedIssue> {
  const adapter = readSourceAdapter(kind);
  const normalizedRssUrl = rssUrl?.trim();

  if (!normalizedRssUrl) {
    throw new Error(`Content source ${kind} does not have an rss_url`);
  }

  const response = await fetch(normalizedRssUrl);

  // The loader stays strict about 200-only responses so one broken source does not silently
  // masquerade as fresh content in the merged digest run.
  if (response.status !== 200) {
    throw new Error(`RSS request failed with ${response.status} for ${kind}`);
  }

  return await adapter(await response.text());
}

function readEnabledSourceRows(db: SqliteDatabase): EnabledSourceRow[] {
  const hasEnabledColumn = hasIsEnabledColumn(db);
  const query = hasEnabledColumn
    ? `
      SELECT kind, rss_url
      FROM content_sources
      WHERE is_enabled = 1
      ORDER BY id ASC
    `
    : `
      SELECT kind, rss_url
      FROM content_sources
      ORDER BY id ASC
    `;

  return db.prepare(query).all() as EnabledSourceRow[];
}

function hasIsEnabledColumn(db: SqliteDatabase): boolean {
  const columns = db
    .prepare("PRAGMA table_info(content_sources)")
    .all() as Array<{ name: string }>;

  return columns.some((column) => column.name === "is_enabled");
}

function readSourceAdapter(kind: string) {
  if (!Object.hasOwn(sourceAdapters, kind)) {
    throw new Error(`Unsupported content source kind: "${kind}"`);
  }

  return sourceAdapters[kind as SourceKind];
}

function getSourcePriority(kind: string): number {
  const source = BUILTIN_SOURCES[kind as SourceKind];
  return source?.sourcePriority ?? 0;
}
