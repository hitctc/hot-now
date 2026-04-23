import {
  createCollectionRun,
  finishCollectionRun,
  listContentItemIdsByExternalIds,
  resolveSourceByKind,
  upsertContentItems
} from "../content/contentRepository.js";
import type { SqliteDatabase } from "../db/openDatabase.js";
import type { CandidateItem, LoadedIssue } from "../source/types.js";
import {
  collectWeiboTrendingIssues,
  fixedWeiboTrendingKeywords,
  weiboTrendingSourceKind,
  type CollectWeiboTrendingOptions
} from "./weiboTrendingCollector.js";

export type RunWeiboTrendingCollectionResult = {
  accepted: true;
  action: "collect-weibo-trending";
  fetchedTopicCount: number;
  matchedTopicCount: number;
  persistedContentItemCount: number;
  reusedContentItemCount: number;
  failureCount: number;
};

export type WeiboTrendingRunState = {
  fixedKeywords: string[];
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastResult: string | null;
};

export type RunWeiboTrendingCollectionOptions = CollectWeiboTrendingOptions;

type MatchedWeiboTopic = {
  externalId: string;
  item: CandidateItem;
};

const weiboTrendingTriggerKind = "manual-weibo-trending";

// 微博热搜只记录一份全局执行状态，所以这里直接复用 collection_runs，不再额外建配置表。
export async function runWeiboTrendingCollection(
  db: SqliteDatabase,
  options: RunWeiboTrendingCollectionOptions = {}
): Promise<RunWeiboTrendingCollectionResult> {
  const now = options.now ?? new Date();
  const startedAt = now.toISOString();
  const runId = createCollectionRun(db, {
    runDate: startedAt.slice(0, 10),
    triggerKind: weiboTrendingTriggerKind,
    status: "running",
    startedAt,
    notes: JSON.stringify({
      sourceKind: weiboTrendingSourceKind,
      lastResult: "微博热搜榜匹配执行中。"
    })
  });

  try {
    const issues = await collectWeiboTrendingIssues(db, options);
    const matches = collectMatchedTopics(issues);
    const { persistedContentItemIds, reusedContentItemIds } = persistCollectedWeiboTopics(db, matches, startedAt);
    const lastResult =
      matches.length > 0
        ? `本次匹配成功，命中 ${matches.length} 个微博热搜话题。`
        : "本次匹配成功，但没有命中 AI 相关微博热搜。";
    const finishedAt = new Date().toISOString();

    finishCollectionRun(db, {
      id: runId,
      status: issues.failures?.length ? "completed_with_failures" : "completed",
      finishedAt,
      notes: JSON.stringify({
        sourceKind: weiboTrendingSourceKind,
        fetchedTopicCount: countFetchedTopics(issues),
        matchedTopicCount: matches.length,
        persistedContentItemCount: persistedContentItemIds.length,
        reusedContentItemCount: reusedContentItemIds.length,
        failureCount: issues.failures?.length ?? 0,
        lastResult
      })
    });

    return {
      accepted: true,
      action: "collect-weibo-trending",
      fetchedTopicCount: countFetchedTopics(issues),
      matchedTopicCount: matches.length,
      persistedContentItemCount: persistedContentItemIds.length,
      reusedContentItemCount: reusedContentItemIds.length,
      failureCount: issues.failures?.length ?? 0
    };
  } catch (error) {
    finishCollectionRun(db, {
      id: runId,
      status: "failed",
      finishedAt: new Date().toISOString(),
      notes: JSON.stringify({
        sourceKind: weiboTrendingSourceKind,
        lastResult: error instanceof Error ? error.message : "微博热搜榜匹配失败。"
      })
    });
    throw error;
  }
}

// 设置页只需要一份全局状态，所以这里单独读最近一次执行和最近一次成功结果。
export function readWeiboTrendingRunState(db: SqliteDatabase): WeiboTrendingRunState {
  const latestRun = db
    .prepare(
      `
        SELECT started_at AS startedAt, finished_at AS finishedAt, status, notes
        FROM collection_runs
        WHERE trigger_kind = ?
        ORDER BY datetime(COALESCE(finished_at, started_at)) DESC, id DESC
        LIMIT 1
      `
    )
    .get(weiboTrendingTriggerKind) as
    | { startedAt: string; finishedAt: string | null; status: string; notes: string | null }
    | undefined;
  const latestSuccess = db
    .prepare(
      `
        SELECT started_at AS startedAt, finished_at AS finishedAt
        FROM collection_runs
        WHERE trigger_kind = ?
          AND status IN ('completed', 'completed_with_failures')
        ORDER BY datetime(COALESCE(finished_at, started_at)) DESC, id DESC
        LIMIT 1
      `
    )
    .get(weiboTrendingTriggerKind) as { startedAt: string; finishedAt: string | null } | undefined;

  return {
    fixedKeywords: [...fixedWeiboTrendingKeywords],
    lastFetchedAt: latestRun?.startedAt ?? null,
    lastSuccessAt: latestSuccess?.finishedAt ?? latestSuccess?.startedAt ?? null,
    lastResult: parseLastResult(latestRun?.notes ?? null)
  };
}

// 隐藏聚合 source 只负责承接 content_items 外键，不应该出现在普通来源库存表里。
export function ensureWeiboTrendingContentSource(db: SqliteDatabase): number {
  db.prepare(
    `
      INSERT INTO content_sources (
        kind,
        name,
        site_url,
        rss_url,
        source_type,
        is_enabled,
        is_builtin,
        show_all_when_selected,
        updated_at
      )
      VALUES (?, ?, ?, NULL, ?, 0, 0, 0, CURRENT_TIMESTAMP)
      ON CONFLICT(kind) DO UPDATE SET
        name = excluded.name,
        site_url = excluded.site_url,
        source_type = excluded.source_type,
        is_enabled = 0,
        is_builtin = 0,
        show_all_when_selected = 0,
        updated_at = CURRENT_TIMESTAMP
    `
  ).run(weiboTrendingSourceKind, "微博热搜榜匹配", "https://s.weibo.com/top/summary", "weibo_trending_aggregate");

  const row = db
    .prepare("SELECT id FROM content_sources WHERE kind = ? LIMIT 1")
    .get(weiboTrendingSourceKind) as { id: number } | undefined;

  if (!row) {
    throw new Error("Failed to ensure weibo trending content source");
  }

  return row.id;
}

function collectMatchedTopics(issues: LoadedIssue[]): MatchedWeiboTopic[] {
  return issues.flatMap((issue) =>
    issue.items.flatMap((item) => {
      const externalId = item.externalId?.trim();
      return externalId ? [{ externalId, item }] : [];
    })
  );
}

function persistCollectedWeiboTopics(db: SqliteDatabase, matches: MatchedWeiboTopic[], fetchedAt: string) {
  const existingByExternalId = new Map(
    listContentItemIdsByExternalIds(
      db,
      matches.map((match) => match.externalId)
    ).map((row) => [row.externalId, row.contentItemId])
  );
  const source = resolveSourceByKind(db, weiboTrendingSourceKind);
  const sourceId = source?.id ?? ensureWeiboTrendingContentSource(db);
  const mergedMatches = mergeMatchesByExternalId(matches);
  const newMatches = mergedMatches.filter((match) => !existingByExternalId.has(match.externalId));

  if (newMatches.length > 0) {
    upsertContentItems(db, {
      sourceId,
      items: newMatches.map((match) => ({
        externalId: match.externalId,
        title: match.item.title,
        canonicalUrl: match.item.sourceUrl,
        summary: match.item.summary,
        publishedAt: match.item.publishedAt,
        fetchedAt,
        metadataJson: match.item.metadataJson
      }))
    });
  }

  const finalByExternalId = new Map(
    listContentItemIdsByExternalIds(
      db,
      mergedMatches.map((match) => match.externalId)
    ).map((row) => [row.externalId, row.contentItemId])
  );

  return {
    persistedContentItemIds: uniqueNumbers(
      mergedMatches.flatMap((match) => {
        const contentItemId = finalByExternalId.get(match.externalId);
        return contentItemId && !existingByExternalId.has(match.externalId) ? [contentItemId] : [];
      })
    ),
    reusedContentItemIds: uniqueNumbers(
      mergedMatches.flatMap((match) => {
        const contentItemId = finalByExternalId.get(match.externalId);
        return contentItemId && existingByExternalId.has(match.externalId) ? [contentItemId] : [];
      })
    )
  };
}

function mergeMatchesByExternalId(matches: MatchedWeiboTopic[]): MatchedWeiboTopic[] {
  const merged = new Map<string, MatchedWeiboTopic>();

  for (const match of matches) {
    if (!merged.has(match.externalId)) {
      merged.set(match.externalId, match);
    }
  }

  return [...merged.values()];
}

function countFetchedTopics(issues: LoadedIssue[]): number {
  return issues.reduce((sum, issue) => sum + issue.items.length, 0);
}

function parseLastResult(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as { lastResult?: unknown };
    return typeof parsed.lastResult === "string" && parsed.lastResult.trim() ? parsed.lastResult.trim() : null;
  } catch {
    return null;
  }
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}
