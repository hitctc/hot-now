import type { SqliteDatabase } from "../db/openDatabase.js";
import { parseArticleFeed } from "./parseArticleFeed.js";
import { hasBuiltinSourceAdapter, sourceAdapters } from "./sourceAdapters.js";
import { resolveRuntimeSourcePriority, toRuntimeArticleSourceDefinition } from "./sourceRuntimeMetadata.js";
import type { LoadedIssue, SourceKind } from "./types.js";

type EnabledSourceRow = {
  kind: SourceKind;
  name: string;
  site_url: string;
  rss_url: string | null;
  source_type: string | null;
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
      sourcePriority: resolveRuntimeSourcePriority(source)
    }))
    .sort((left, right) => {
      const priorityDiff = right.sourcePriority - left.sourcePriority;

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return left.kind.localeCompare(right.kind);
    });

  const results = await Promise.allSettled(
    orderedSources.map(async (source) => await loadEnabledSourceIssue(source))
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

async function loadEnabledSourceIssue(source: EnabledSourceRow): Promise<LoadedIssue> {
  const adapter = readSourceAdapter(source);
  const normalizedRssUrl = source.rss_url?.trim();

  if (!normalizedRssUrl) {
    throw new Error(`Content source ${source.kind} does not have an rss_url`);
  }

  const response = await fetch(normalizedRssUrl);

  // The loader stays strict about 200-only responses so one broken source does not silently
  // masquerade as fresh content in the merged digest run.
  if (response.status !== 200) {
    throw new Error(`RSS request failed with ${response.status} for ${source.kind}`);
  }

  return await adapter(await response.text());
}

function readEnabledSourceRows(db: SqliteDatabase): EnabledSourceRow[] {
  const hasEnabledColumn = hasIsEnabledColumn(db);
  const query = hasEnabledColumn
    ? `
      SELECT kind, name, site_url, rss_url, source_type
      FROM content_sources
      WHERE is_enabled = 1
        AND COALESCE(source_type, 'rss') NOT IN ('twitter_account_aggregate', 'twitter_keyword_aggregate')
      ORDER BY id ASC
    `
    : `
      SELECT kind, name, site_url, rss_url, source_type
      FROM content_sources
      WHERE COALESCE(source_type, 'rss') NOT IN ('twitter_account_aggregate', 'twitter_keyword_aggregate')
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

// Built-ins keep their tuned adapters, while user-defined sources fall back to one generic
// article-feed path so source CRUD no longer requires code changes per publisher.
function readSourceAdapter(source: EnabledSourceRow) {
  if (hasBuiltinSourceAdapter(source.kind)) {
    return sourceAdapters[source.kind];
  }

  return (feedXml: string) => parseArticleFeed(feedXml, toRuntimeArticleSourceDefinition(source));
}
