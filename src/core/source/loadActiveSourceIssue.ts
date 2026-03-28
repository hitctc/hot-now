import type { SqliteDatabase } from "../db/openDatabase.js";
import { BUILTIN_SOURCES } from "./sourceCatalog.js";
import { sourceAdapters } from "./sourceAdapters.js";
import type { LoadedIssue, SourceKind } from "./types.js";

type SourceRow = {
  kind: SourceKind;
  rss_url: string | null;
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

  const adapter = readSourceAdapter(activeSource.kind);

  const rssUrl = activeSource.rss_url?.trim();
  if (!rssUrl) {
    throw new Error(`Content source ${activeSource.kind} does not have an rss_url`);
  }

  const response = await fetch(rssUrl);

  // Source loading stays strict about 200-only responses so the caller does not silently parse
  // redirects, empty bodies, or partial upstream failures as valid content.
  if (response.status !== 200) {
    throw new Error(`RSS request failed with ${response.status}`);
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
          SELECT kind, rss_url
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
        SELECT kind, rss_url
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

// The adapter registry is explicit, so unexpected DB values should fail with a targeted message
// instead of falling through to an undefined function call.
function readSourceAdapter(kind: string) {
  if (!Object.hasOwn(sourceAdapters, kind)) {
    throw new Error(`Unsupported content source kind: "${kind}"`);
  }

  return sourceAdapters[kind as SourceKind];
}
