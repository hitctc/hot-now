import type { SqliteDatabase } from "../db/openDatabase.js";
import type { LoadedSourceIssues, SourceLoadFailure } from "../source/loadEnabledSourceIssues.js";
import type { CandidateItem, LoadedIssue, SourceKind } from "../source/types.js";
import {
  defaultBilibiliHitsPerPage,
  searchBilibiliVideos,
  type BilibiliFetch,
  type BilibiliVideoHit
} from "./bilibiliApiClient.js";
import { listBilibiliQueries, markBilibiliQueryFetchResult, type BilibiliQueryRecord } from "./bilibiliQueryRepository.js";

export const bilibiliSearchSourceKind = "bilibili_search" as SourceKind;
const defaultQueryFetchLimit = 5;

export type CollectBilibiliIssuesOptions = {
  fetch?: BilibiliFetch;
  now?: Date;
  maxQueryCount?: number;
  hitsPerQuery?: number;
};

type BilibiliCandidateItem = CandidateItem & {
  metadataJson?: string;
};

// B 站搜索沿用共享 issue 结构，这样后面的内容入库和页面筛选不需要再长一条特殊分支。
export async function collectBilibiliIssues(
  db: SqliteDatabase,
  options: CollectBilibiliIssuesOptions = {}
): Promise<LoadedSourceIssues> {
  const enabledQueries = listBilibiliQueries(db)
    .filter((query) => query.isEnabled)
    .slice(0, normalizePositiveInteger(options.maxQueryCount, defaultQueryFetchLimit));
  const failures: SourceLoadFailure[] = [];

  if (enabledQueries.length === 0) {
    return Object.assign([], { failures });
  }

  const now = options.now ?? new Date();
  const fetchedAt = now.toISOString();
  const hitsPerQuery = normalizePositiveInteger(options.hitsPerQuery, defaultBilibiliHitsPerPage);
  const items: BilibiliCandidateItem[] = [];

  for (const query of enabledQueries) {
    const result = await searchBilibiliVideos({
      query: query.query,
      fetch: options.fetch,
      pageSize: hitsPerQuery
    });

    if (!result.ok) {
      failures.push({
        kind: bilibiliSearchSourceKind,
        reason: `${query.query}: ${result.reason}`
      });
      markBilibiliQueryFetchResult(db, {
        id: query.id,
        success: false,
        fetchedAt,
        error: result.reason
      });
      continue;
    }

    const candidateItems = result.hits.map((hit, index) => mapHitToCandidate(query, hit, index));
    markBilibiliQueryFetchResult(db, {
      id: query.id,
      success: true,
      fetchedAt,
      message:
        candidateItems.length > 0
          ? `本次搜索成功，获得 ${candidateItems.length} 条候选视频。`
          : "本次搜索成功，但没有获得可入库候选视频。"
    });
    items.push(...candidateItems);
  }

  if (items.length === 0) {
    return Object.assign([], { failures });
  }

  const issue: LoadedIssue = {
    date: fetchedAt.slice(0, 10),
    issueUrl: "https://search.bilibili.com/",
    sourceKind: bilibiliSearchSourceKind,
    sourceType: "aggregator",
    sourcePriority: 78,
    items
  };

  return Object.assign([issue], { failures });
}

function mapHitToCandidate(query: BilibiliQueryRecord, hit: BilibiliVideoHit, index: number): BilibiliCandidateItem {
  return {
    rank: index + 1,
    category: "video_platform",
    title: hit.title,
    sourceUrl: hit.url,
    sourceName: `B 站 / ${query.query}`,
    externalId: `bilibili:${hit.bvid}`,
    publishedAt: hit.publishedAt ?? undefined,
    summary: hit.description ?? undefined,
    metadataJson: JSON.stringify({
      collector: {
        kind: "bilibili_search",
        queryId: query.id,
        query: query.query,
        priority: query.priority
      },
      author: hit.author,
      mid: hit.mid,
      bvid: hit.bvid,
      play: hit.viewCount,
      like: hit.likeCount,
      comment: hit.commentCount,
      danmaku: hit.danmakuCount,
      favorite: hit.favoriteCount,
      matchedQueries: [query.query]
    })
  };
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : fallback;
}
