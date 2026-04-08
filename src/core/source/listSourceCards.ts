import type { SqliteDatabase } from "../db/openDatabase.js";

type SourceRow = {
  kind: string;
  name: string;
  site_url: string;
  rss_url: string | null;
  is_enabled: number;
  is_builtin: number;
  show_all_when_selected: number;
  source_type: string | null;
  bridge_kind: string | null;
  bridge_config_json: string | null;
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
  siteUrl: string;
  rssUrl: string | null;
  isEnabled: boolean;
  isBuiltIn: boolean;
  showAllWhenSelected: boolean;
  sourceType: string;
  bridgeKind: string | null;
  bridgeConfigSummary: string | null;
  bridgeInputMode: "feed_url" | "article_url" | "name_lookup" | null;
  bridgeInputValue: string | null;
  lastCollectedAt: string | null;
  lastCollectionStatus: string | null;
};

// Source cards combine source catalog rows with the latest known run per source kind
// so the system page can show status for every source instead of only the active one.
export function listSourceCards(db: SqliteDatabase): SourceCard[] {
  const sourceRows = db
    .prepare(
      `
        SELECT kind, name, site_url, rss_url, is_enabled, is_builtin, show_all_when_selected
               , source_type, bridge_kind, bridge_config_json
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
    const bridgeConfig = parseBridgeConfig(source.bridge_config_json);

    return {
      kind: source.kind,
      name: source.name,
      siteUrl: source.site_url,
      rssUrl: source.rss_url,
      isEnabled: source.is_enabled === 1,
      isBuiltIn: source.is_builtin === 1,
      showAllWhenSelected: source.show_all_when_selected === 1,
      sourceType: source.source_type?.trim() || "rss",
      bridgeKind: source.bridge_kind?.trim() || null,
      bridgeConfigSummary: bridgeConfig.summary,
      bridgeInputMode: bridgeConfig.inputMode,
      bridgeInputValue: bridgeConfig.inputValue,
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
    const sourceKinds = parseSourceKinds(row.notes);

    if (sourceKinds.length === 0) {
      continue;
    }

    for (const sourceKind of sourceKinds) {
      if (latestRunBySourceKind.has(sourceKind)) {
        continue;
      }

      latestRunBySourceKind.set(sourceKind, {
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        status: row.status
      });
    }
  }

  return latestRunBySourceKind;
}

function parseSourceKinds(notes: string | null): string[] {
  // Run notes are tolerated as freeform JSON, so malformed or partial rows are ignored instead of breaking the page.
  if (!notes) {
    return [];
  }

  try {
    const parsed = JSON.parse(notes) as Record<string, unknown>;
    if (Array.isArray(parsed.sourceKinds)) {
      return parsed.sourceKinds
        .filter((sourceKind): sourceKind is string => typeof sourceKind === "string")
        .map((sourceKind) => sourceKind.trim())
        .filter(Boolean);
    }

    return typeof parsed.sourceKind === "string" && parsed.sourceKind.trim() ? [parsed.sourceKind.trim()] : [];
  } catch {
    return [];
  }
}

function parseBridgeConfig(value: string | null): {
  summary: string | null;
  inputMode: "feed_url" | "article_url" | "name_lookup" | null;
  inputValue: string | null;
} {
  if (!value?.trim()) {
    return { summary: null, inputMode: null, inputValue: null };
  }

  try {
    const parsed = JSON.parse(value) as {
      inputMode?: unknown;
      feedUrl?: unknown;
      articleUrl?: unknown;
      wechatName?: unknown;
    };

    if (parsed.inputMode === "feed_url") {
      return {
        summary: "现成 feed URL",
        inputMode: "feed_url",
        inputValue: typeof parsed.feedUrl === "string" ? parsed.feedUrl : null
      };
    }

    if (parsed.inputMode === "article_url") {
      return {
        summary: "公众号文章链接",
        inputMode: "article_url",
        inputValue: typeof parsed.articleUrl === "string" ? parsed.articleUrl : null
      };
    }

    if (parsed.inputMode === "name_lookup") {
      return {
        summary: "公众号名称检索",
        inputMode: "name_lookup",
        inputValue: typeof parsed.wechatName === "string" ? parsed.wechatName : null
      };
    }

    return { summary: "桥接配置", inputMode: null, inputValue: null };
  } catch {
    return { summary: "桥接配置", inputMode: null, inputValue: null };
  }
}
