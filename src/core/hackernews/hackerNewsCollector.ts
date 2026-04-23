import type { SqliteDatabase } from "../db/openDatabase.js";
import type { LoadedSourceIssues, SourceLoadFailure } from "../source/loadEnabledSourceIssues.js";
import type { CandidateItem, LoadedIssue, SourceKind } from "../source/types.js";
import {
  defaultHackerNewsHitsPerPage,
  defaultHackerNewsTimeWindowDays,
  searchHackerNewsStories,
  type HackerNewsFetch,
  type HackerNewsHit
} from "./hackerNewsApiClient.js";
import {
  listHackerNewsQueries,
  markHackerNewsQueryFetchResult,
  type HackerNewsQueryRecord
} from "./hackerNewsQueryRepository.js";

export const hackerNewsSearchSourceKind = "hackernews_search" as SourceKind;
const defaultQueryFetchLimit = 5;

export type CollectHackerNewsIssuesOptions = {
  fetch?: HackerNewsFetch;
  now?: Date;
  maxQueryCount?: number;
  hitsPerQuery?: number;
  timeWindowDays?: number;
};

type HackerNewsCandidateItem = CandidateItem & {
  metadataJson?: string;
};

// Hacker News uses its own query table, but collected items still need one shared issue shape
// so the later upsert step can reuse the existing content pipeline unchanged.
export async function collectHackerNewsIssues(
  db: SqliteDatabase,
  options: CollectHackerNewsIssuesOptions = {}
): Promise<LoadedSourceIssues> {
  const enabledQueries = listHackerNewsQueries(db)
    .filter((query) => query.isEnabled)
    .slice(0, normalizePositiveInteger(options.maxQueryCount, defaultQueryFetchLimit));
  const failures: SourceLoadFailure[] = [];

  if (enabledQueries.length === 0) {
    return Object.assign([], { failures });
  }

  const now = options.now ?? new Date();
  const fetchedAt = now.toISOString();
  const hitsPerQuery = normalizePositiveInteger(options.hitsPerQuery, defaultHackerNewsHitsPerPage);
  const timeWindowDays = normalizePositiveInteger(options.timeWindowDays, defaultHackerNewsTimeWindowDays);
  const items: HackerNewsCandidateItem[] = [];

  for (const query of enabledQueries) {
    const result = await searchHackerNewsStories({
      query: query.query,
      now,
      fetch: options.fetch,
      hitsPerPage: hitsPerQuery,
      timeWindowDays
    });

    if (!result.ok) {
      failures.push({
        kind: hackerNewsSearchSourceKind,
        reason: `${query.query}: ${result.reason}`
      });
      markHackerNewsQueryFetchResult(db, {
        id: query.id,
        success: false,
        fetchedAt,
        error: result.reason
      });
      continue;
    }

    const candidateItems = result.hits.map((hit, index) => mapHitToCandidate(query, hit, index));
    markHackerNewsQueryFetchResult(db, {
      id: query.id,
      success: true,
      fetchedAt,
      message:
        candidateItems.length > 0
          ? `本次搜索成功，获得 ${candidateItems.length} 条候选内容。`
          : "本次搜索成功，但没有获得可入库候选内容。"
    });
    items.push(...candidateItems);
  }

  if (items.length === 0) {
    return Object.assign([], { failures });
  }

  const issue: LoadedIssue = {
    date: fetchedAt.slice(0, 10),
    issueUrl: "https://hn.algolia.com/",
    sourceKind: hackerNewsSearchSourceKind,
    sourceType: "aggregator",
    sourcePriority: 82,
    items
  };

  return Object.assign([issue], { failures });
}

function mapHitToCandidate(query: HackerNewsQueryRecord, hit: HackerNewsHit, index: number): HackerNewsCandidateItem {
  return {
    rank: index + 1,
    category: "developer_community",
    title: hit.title,
    sourceUrl: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectId}`,
    sourceName: `Hacker News / ${query.query}`,
    externalId: `hackernews:${hit.objectId}`,
    publishedAt: hit.createdAt ?? undefined,
    summary: hit.storyText ?? undefined,
    metadataJson: JSON.stringify({
      collector: {
        kind: "hackernews_search",
        queryId: query.id,
        query: query.query,
        priority: query.priority
      },
      author: hit.author,
      points: hit.points,
      numComments: hit.numComments,
      hnObjectId: hit.objectId,
      matchedQueries: [query.query]
    })
  };
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : fallback;
}
