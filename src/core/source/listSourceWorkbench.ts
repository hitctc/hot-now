import type { SqliteDatabase } from "../db/openDatabase.js";
import { listSourceCards } from "./listSourceCards.js";

type SourceCountRow = {
  sourceKind: string;
  totalCount: number;
  publishedTodayCount: number;
  collectedTodayCount: number;
};

type SourceViewStats = {
  candidateCount: number;
  visibleCount: number;
  visibleShare: number;
};

type SourceViewStatsRow = {
  sourceKind: string;
  candidateCount: number;
  visibleCount: number;
};

const hotOnlySourceKinds = new Set(["weibo_trending"]);

export type SourceWorkbenchRow = {
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
  totalCount: number;
  publishedTodayCount: number;
  collectedTodayCount: number;
  viewStats: {
    hot: SourceViewStats;
    articles: SourceViewStats;
    ai: SourceViewStats;
  };
};

export function listSourceWorkbench(
  db: SqliteDatabase,
  options: {
    referenceTime?: Date;
  } = {}
): SourceWorkbenchRow[] {
  // Workbench stats改回独立来源口径，回答“这个来源自己今天能贡献多少候选、展示和占比”。
  const referenceTime = options.referenceTime ?? new Date();
  const sourceCards = listSourceCards(db);
  const countMap = readSourceCountMap(db, referenceTime);
  const enabledSources = sourceCards.filter((source) => source.isEnabled);
  const enabledSourceKinds = enabledSources.map((source) => source.kind);
  const hotStats = readFastSourceViewStats(db, enabledSourceKinds, "hot", referenceTime);
  const articleStats = readFastSourceViewStats(db, enabledSourceKinds, "articles", referenceTime);
  const aiStats = readFastSourceViewStats(db, enabledSourceKinds, "ai", referenceTime);

  return sourceCards.map((sourceCard) => ({
    ...sourceCard,
    totalCount: countMap.get(sourceCard.kind)?.totalCount ?? 0,
    publishedTodayCount: countMap.get(sourceCard.kind)?.publishedTodayCount ?? 0,
    collectedTodayCount: countMap.get(sourceCard.kind)?.collectedTodayCount ?? 0,
    viewStats: {
      hot: hotStats.get(sourceCard.kind) ?? { candidateCount: 0, visibleCount: 0, visibleShare: 0 },
      articles: articleStats.get(sourceCard.kind) ?? { candidateCount: 0, visibleCount: 0, visibleShare: 0 },
      ai: aiStats.get(sourceCard.kind) ?? { candidateCount: 0, visibleCount: 0, visibleShare: 0 }
    }
  }));
}

function readFastSourceViewStats(
  db: SqliteDatabase,
  sourceKinds: string[],
  viewKey: "hot" | "articles" | "ai",
  referenceTime: Date
) {
  // Sources workbench only renders per-source counts, not sorted cards, so SQL aggregation avoids
  // reading every body_markdown row into JS and re-running the full page ranking pipeline.
  if (sourceKinds.length === 0) {
    return new Map<string, SourceViewStats>();
  }

  const sourceKindPlaceholders = sourceKinds.map(() => "?").join(", ");
  const viewScope = viewKey === "ai" ? "ai_new" : viewKey === "hot" ? "ai_hot" : "__legacy_articles__";
  const cutoff =
    viewKey === "ai"
      ? new Date(referenceTime.getTime() - 24 * 60 * 60 * 1000).toISOString()
      : null;
  const { shanghaiDayStart, shanghaiNextDayStart } = buildShanghaiDayRange(referenceTime);
  const countWindowCondition =
    viewKey === "ai"
      ? "AND datetime(COALESCE(ci.published_at, ci.fetched_at, ci.created_at)) >= datetime(?)"
      : viewKey === "articles"
        ? "AND COALESCE(ci.published_at, ci.fetched_at, ci.created_at) >= ? AND COALESCE(ci.published_at, ci.fetched_at, ci.created_at) < ?"
        : "";
  const sourceScopeCondition = viewKey === "hot" ? "" : buildNotInCondition("cs.kind", [...hotOnlySourceKinds]);
  const params = [
    viewScope,
    ...sourceKinds,
    ...(viewKey === "ai" ? [cutoff] : viewKey === "articles" ? [shanghaiDayStart, shanghaiNextDayStart] : [])
  ];
  const rows = db
    .prepare(
      `
        SELECT
          cs.kind AS sourceKind,
          COUNT(*) AS candidateCount,
          COUNT(*) AS visibleCount
        FROM content_items ci
        JOIN content_sources cs ON cs.id = ci.source_id
        LEFT JOIN content_nl_evaluations base_eval
          ON base_eval.content_item_id = ci.id
         AND base_eval.scope = 'base'
        LEFT JOIN content_nl_evaluations view_eval
          ON view_eval.content_item_id = ci.id
         AND view_eval.scope = ?
        WHERE cs.kind IN (${sourceKindPlaceholders})
          ${sourceScopeCondition}
          ${countWindowCondition}
          AND COALESCE(base_eval.decision, '') != 'block'
          AND COALESCE(view_eval.decision, '') != 'block'
          AND (
            cs.kind != 'twitter_keyword_search'
            OR EXISTS (
              SELECT 1
              FROM twitter_search_keyword_matches match
              JOIN twitter_search_keywords keyword ON keyword.id = match.keyword_id
              WHERE match.content_item_id = ci.id
                AND keyword.is_visible = 1
            )
          )
        GROUP BY cs.kind
      `
    )
    .all(...params) as SourceViewStatsRow[];

  return applyViewShares(new Map(rows.map((row) => [row.sourceKind, row])));
}

function applyViewShares(stats: Map<string, SourceViewStatsRow>) {
  const totalVisibleCount = [...stats.values()].reduce((sum, row) => sum + row.visibleCount, 0);

  return new Map(
    [...stats.entries()].map(([sourceKind, row]) => [
      sourceKind,
      {
        candidateCount: row.candidateCount,
        visibleCount: row.visibleCount,
        visibleShare: totalVisibleCount > 0 ? row.visibleCount / totalVisibleCount : 0
      }
    ])
  );
}

function buildNotInCondition(columnName: string, values: string[]) {
  // The hot-only source list is code-owned and never built from request input, so these quoted literals stay safe.
  if (values.length === 0) {
    return "";
  }

  return `AND ${columnName} NOT IN (${values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ")})`;
}

function readSourceCountMap(db: SqliteDatabase, referenceTime: Date) {
  const { shanghaiDayStart, shanghaiNextDayStart } = buildShanghaiDayRange(referenceTime);
  const rows = db
    .prepare(
      `
        SELECT
          cs.kind AS sourceKind,
          COUNT(*) AS totalCount,
          SUM(CASE WHEN ci.published_at >= ? AND ci.published_at < ? THEN 1 ELSE 0 END) AS publishedTodayCount,
          SUM(CASE WHEN COALESCE(ci.fetched_at, ci.created_at) >= ? AND COALESCE(ci.fetched_at, ci.created_at) < ? THEN 1 ELSE 0 END) AS collectedTodayCount
        FROM content_items ci
        JOIN content_sources cs ON cs.id = ci.source_id
        GROUP BY cs.kind
      `
    )
    .all(shanghaiDayStart, shanghaiNextDayStart, shanghaiDayStart, shanghaiNextDayStart) as SourceCountRow[];

  return new Map(rows.map((row) => [row.sourceKind, row]));
}

function buildShanghaiDayRange(referenceTime: Date) {
  // The workbench counts are anchored to Shanghai local days so server timezone drift does not change the operator view.
  const shanghaiFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const [year, month, day] = shanghaiFormatter.format(referenceTime).split("-");
  const nextDayReferenceTime = new Date(referenceTime.getTime() + 24 * 60 * 60 * 1000);
  const [nextYear, nextMonth, nextDay] = shanghaiFormatter.format(nextDayReferenceTime).split("-");

  return {
    shanghaiDayStart: `${year}-${month}-${day}T00:00:00+08:00`,
    shanghaiNextDayStart: `${nextYear}-${nextMonth}-${nextDay}T00:00:00+08:00`
  };
}
