import {
  listContentItemIdsByExternalIds,
  mergeContentMatchedQueries,
  resolveSourceByKind,
  upsertContentItems
} from "../content/contentRepository.js";
import type { SqliteDatabase } from "../db/openDatabase.js";
import type { CandidateItem, LoadedIssue } from "../source/types.js";
import { collectBilibiliIssues, bilibiliSearchSourceKind, type CollectBilibiliIssuesOptions } from "./bilibiliCollector.js";
import { listBilibiliQueries } from "./bilibiliQueryRepository.js";

export type RunBilibiliCollectionResult =
  | {
      accepted: true;
      action: "collect-bilibili";
      enabledQueryCount: number;
      processedQueryCount: number;
      fetchedVideoCount: number;
      persistedContentItemCount: number;
      reusedContentItemCount: number;
      failureCount: number;
    }
  | {
      accepted: false;
      reason: "no-enabled-bilibili-queries";
    };

export type RunBilibiliCollectionOptions = CollectBilibiliIssuesOptions;

type MatchedBilibiliItem = {
  externalId: string;
  item: CandidateItem;
  matchedQueries: string[];
};

// 手动 B 站搜索只负责把命中视频补入内容池，不并进默认 RSS / 公众号采集入口。
export async function runBilibiliCollection(
  db: SqliteDatabase,
  options: RunBilibiliCollectionOptions = {}
): Promise<RunBilibiliCollectionResult> {
  const enabledQueries = listBilibiliQueries(db).filter((query) => query.isEnabled);
  const processedQueries = enabledQueries.slice(0, normalizePositiveInteger(options.maxQueryCount, 5));

  if (enabledQueries.length === 0) {
    return { accepted: false, reason: "no-enabled-bilibili-queries" };
  }

  const issues = await collectBilibiliIssues(db, options);
  const matches = collectMatchedItems(issues);
  const { persistedContentItemIds, reusedContentItemIds } = persistCollectedBilibiliItems(db, matches);

  return {
    accepted: true,
    action: "collect-bilibili",
    enabledQueryCount: enabledQueries.length,
    processedQueryCount: processedQueries.length,
    fetchedVideoCount: matches.length,
    persistedContentItemCount: persistedContentItemIds.length,
    reusedContentItemCount: reusedContentItemIds.length,
    failureCount: issues.failures?.length ?? 0
  };
}

// 隐藏聚合 source 只用来满足 content_items 外键，不把真实 query 配置塞进普通来源库存表。
export function ensureBilibiliContentSource(db: SqliteDatabase): number {
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
  ).run(bilibiliSearchSourceKind, "B 站搜索", "https://search.bilibili.com/", "bilibili_search_aggregate");

  const row = db
    .prepare("SELECT id FROM content_sources WHERE kind = ? LIMIT 1")
    .get(bilibiliSearchSourceKind) as { id: number } | undefined;

  if (!row) {
    throw new Error("Failed to ensure bilibili content source");
  }

  return row.id;
}

function collectMatchedItems(issues: LoadedIssue[]): MatchedBilibiliItem[] {
  return issues.flatMap((issue) =>
    issue.items.flatMap((item) => {
      const externalId = item.externalId?.trim();

      if (!externalId) {
        return [];
      }

      return [
        {
          externalId,
          item,
          matchedQueries: readMatchedQueries(item.metadataJson)
        }
      ];
    })
  );
}

function persistCollectedBilibiliItems(db: SqliteDatabase, matches: MatchedBilibiliItem[]) {
  const existingByExternalId = new Map(
    listContentItemIdsByExternalIds(
      db,
      matches.map((match) => match.externalId)
    ).map((row) => [row.externalId, row.contentItemId])
  );
  const source = resolveSourceByKind(db, bilibiliSearchSourceKind);
  const sourceId = source?.id ?? ensureBilibiliContentSource(db);
  const mergedMatches = mergeMatchesByExternalId(matches);
  const newMatches = mergedMatches.filter((match) => !existingByExternalId.has(match.externalId));
  const fetchedAt = new Date().toISOString();

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
        metadataJson: rewriteMatchedQueriesMetadata(match.item.metadataJson, match.matchedQueries)
      }))
    });
  }

  const finalByExternalId = new Map(
    listContentItemIdsByExternalIds(
      db,
      mergedMatches.map((match) => match.externalId)
    ).map((row) => [row.externalId, row.contentItemId])
  );
  const persistedContentItemIds: number[] = [];
  const reusedContentItemIds: number[] = [];

  mergeContentMatchedQueries(
    db,
    mergedMatches.flatMap((match) => {
      const contentItemId = finalByExternalId.get(match.externalId);

      if (!contentItemId) {
        return [];
      }

      if (existingByExternalId.has(match.externalId)) {
        reusedContentItemIds.push(contentItemId);
      } else {
        persistedContentItemIds.push(contentItemId);
      }

      return [
        {
          contentItemId,
          matchedQueries: match.matchedQueries
        }
      ];
    })
  );

  return {
    persistedContentItemIds: uniqueNumbers(persistedContentItemIds),
    reusedContentItemIds: uniqueNumbers(reusedContentItemIds)
  };
}

function mergeMatchesByExternalId(matches: MatchedBilibiliItem[]): MatchedBilibiliItem[] {
  const merged = new Map<string, MatchedBilibiliItem>();

  for (const match of matches) {
    const existing = merged.get(match.externalId);

    if (!existing) {
      merged.set(match.externalId, {
        ...match,
        matchedQueries: uniqueNonEmptyStrings(match.matchedQueries)
      });
      continue;
    }

    existing.matchedQueries = uniqueNonEmptyStrings([...existing.matchedQueries, ...match.matchedQueries]);
  }

  return [...merged.values()].map((match) => ({
    ...match,
    item: {
      ...match.item,
      metadataJson: rewriteMatchedQueriesMetadata(match.item.metadataJson, match.matchedQueries)
    }
  }));
}

function readMatchedQueries(metadataJson: string | undefined): string[] {
  if (!metadataJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(metadataJson) as { matchedQueries?: unknown };
    return Array.isArray(parsed.matchedQueries)
      ? uniqueNonEmptyStrings(parsed.matchedQueries.filter((value): value is string => typeof value === "string"))
      : [];
  } catch {
    return [];
  }
}

function rewriteMatchedQueriesMetadata(metadataJson: string | undefined, matchedQueries: string[]): string | undefined {
  if (!metadataJson) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(metadataJson) as Record<string, unknown>;
    parsed.matchedQueries = uniqueNonEmptyStrings(matchedQueries);
    return JSON.stringify(parsed);
  } catch {
    return metadataJson;
  }
}

function uniqueNonEmptyStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : fallback;
}
