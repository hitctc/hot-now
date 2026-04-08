import type { SqliteDatabase } from "../db/openDatabase.js";
import { parseArticleFeed } from "./parseArticleFeed.js";
import { BUILTIN_SOURCES } from "./sourceCatalog.js";
import { hasBuiltinSourceAdapter, sourceAdapters } from "./sourceAdapters.js";
import { toRuntimeArticleSourceDefinition } from "./sourceRuntimeMetadata.js";
import type { LoadedIssue, SourceKind } from "./types.js";

type SourceRow = {
  kind: SourceKind;
  name: string;
  site_url: string;
  rss_url: string | null;
  source_type: string | null;
};

// The loader resolves whichever source is currently active and hands the fetched XML to the
// explicit adapter registry, while keeping strict HTTP failure handling from the old path.
export async function loadActiveSourceIssue(db: SqliteDatabase): Promise<LoadedIssue> {
  const activeSource = readActiveSourceRow(db);

  if (!activeSource) {
    throw new Error(
      hasIsActiveColumn(db) ? "No active content source configured" : "No content source is available"
    );
  }

  return await loadSourceIssueFromRow(activeSource);
}

// Source hydration and other targeted refresh flows need the same strict feed parsing path as the
// old active-source loader, but scoped to one explicit source row instead of the legacy active flag.
export async function loadSourceIssueByKind(db: SqliteDatabase, kind: SourceKind): Promise<LoadedIssue> {
  const source = db
    .prepare(
      `
        SELECT kind, name, site_url, rss_url, source_type
        FROM content_sources
        WHERE kind = ?
        LIMIT 1
      `
    )
    .get(kind) as SourceRow | undefined;

  if (!source) {
    throw new Error(`Content source ${kind} does not exist`);
  }

  return await loadSourceIssueFromRow(source);
}

async function loadSourceIssueFromRow(source: SourceRow): Promise<LoadedIssue> {
  const adapter = readSourceAdapter(source);
  const rssUrl = source.rss_url?.trim();
  if (!rssUrl) {
    throw new Error(`Content source ${source.kind} does not have an rss_url`);
  }

  const response = await fetch(rssUrl);

  // Source loading stays strict about 200-only responses so the caller does not silently parse
  // redirects, empty bodies, or partial upstream failures as valid content.
  if (response.status !== 200) {
    throw new Error(`RSS request failed with ${response.status} for ${source.kind}`);
  }

  const xml = await response.text();
  return adapter(xml);
}

// Task 2 has to work against both the current Task 1 schema and the future active-source schema,
// so this lookup prefers `is_active` when present and otherwise preserves the legacy juya default.
function readActiveSourceRow(db: SqliteDatabase): SourceRow | undefined {
  if (hasIsActiveColumn(db)) {
    return db
      .prepare(
        `
          SELECT kind, name, site_url, rss_url, source_type
          FROM content_sources
          WHERE is_active = 1
          LIMIT 1
        `
      )
      .get() as SourceRow | undefined;
  }

  // Task 1's baseline schema has no active-source column yet, so Task 2 keeps the old behavior
  // by falling back to the built-in juya row until source switching lands.
  return db
    .prepare(
      `
        SELECT kind, name, site_url, rss_url, source_type
        FROM content_sources
        WHERE kind = ?
        LIMIT 1
      `
    )
    .get(BUILTIN_SOURCES.juya.kind) as SourceRow | undefined;
}

// Schema introspection stays local to this module so callers do not need to know which migration
// level the database is on before asking for the current source.
function hasIsActiveColumn(db: SqliteDatabase): boolean {
  const columns = db
    .prepare("PRAGMA table_info(content_sources)")
    .all() as Array<{ name: string }>;

  return columns.some((column) => column.name === "is_active");
}

// Built-ins keep their tuned adapters here too, while custom rows reuse the same generic article
// parser metadata as the multi-source loader.
function readSourceAdapter(source: SourceRow) {
  if (hasBuiltinSourceAdapter(source.kind)) {
    return sourceAdapters[source.kind];
  }

  return (feedXml: string) => parseArticleFeed(feedXml, toRuntimeArticleSourceDefinition(source));
}
