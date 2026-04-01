import { buildContentViewSelection } from "../content/buildContentViewSelection.js";
import type { SqliteDatabase } from "../db/openDatabase.js";
import { listSourceCards } from "./listSourceCards.js";

type SourceCountRow = {
  sourceKind: string;
  totalCount: number;
  publishedTodayCount: number;
  collectedTodayCount: number;
};

type SourceViewStats = {
  todayCandidateCount: number;
  todayVisibleCount: number;
  todayVisibleShare: number;
};

export type SourceWorkbenchRow = {
  kind: string;
  name: string;
  rssUrl: string | null;
  isEnabled: boolean;
  showAllWhenSelected: boolean;
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
  const hotStats = readIndependentTodayStatsBySource(db, enabledSources.map((source) => source.kind), "hot", referenceTime);
  const articleStats = readIndependentTodayStatsBySource(
    db,
    enabledSources.map((source) => source.kind),
    "articles",
    referenceTime
  );
  const aiStats = readIndependentTodayStatsBySource(db, enabledSources.map((source) => source.kind), "ai", referenceTime);

  return sourceCards.map((sourceCard) => ({
    ...sourceCard,
    totalCount: countMap.get(sourceCard.kind)?.totalCount ?? 0,
    publishedTodayCount: countMap.get(sourceCard.kind)?.publishedTodayCount ?? 0,
    collectedTodayCount: countMap.get(sourceCard.kind)?.collectedTodayCount ?? 0,
    viewStats: {
      hot: hotStats.get(sourceCard.kind) ?? { todayCandidateCount: 0, todayVisibleCount: 0, todayVisibleShare: 0 },
      articles: articleStats.get(sourceCard.kind) ?? { todayCandidateCount: 0, todayVisibleCount: 0, todayVisibleShare: 0 },
      ai: aiStats.get(sourceCard.kind) ?? { todayCandidateCount: 0, todayVisibleCount: 0, todayVisibleShare: 0 }
    }
  }));
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

function readIndependentTodayStatsBySource(
  db: SqliteDatabase,
  sourceKinds: string[],
  viewKey: "hot" | "articles" | "ai",
  referenceTime: Date
) {
  const stats = new Map<string, SourceViewStats>();
  let totalVisibleCount = 0;

  for (const sourceKind of sourceKinds) {
    const selection = buildContentViewSelection(db, viewKey, {
      referenceTime,
      selectedSourceKinds: [sourceKind]
    });
    const metrics = selection.currentPageMetricsBySourceKind[sourceKind] ?? {
      todayCandidateCount: 0,
      todayVisibleCount: 0,
      todayVisibleShare: 0
    };

    stats.set(sourceKind, {
      todayCandidateCount: metrics.todayCandidateCount,
      todayVisibleCount: metrics.todayVisibleCount,
      todayVisibleShare: 0
    });
    totalVisibleCount += metrics.todayVisibleCount;
  }

  for (const [sourceKind, entry] of stats.entries()) {
    stats.set(sourceKind, {
      ...entry,
      todayVisibleShare: totalVisibleCount > 0 ? entry.todayVisibleCount / totalVisibleCount : 0
    });
  }

  return stats;
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
