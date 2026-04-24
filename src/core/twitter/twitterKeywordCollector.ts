import type { SqliteDatabase } from "../db/openDatabase.js";
import type { LoadedSourceIssues, SourceLoadFailure } from "../source/loadEnabledSourceIssues.js";
import type { CandidateItem, LoadedIssue, SourceKind } from "../source/types.js";
import {
  listTwitterSearchKeywords,
  markTwitterSearchKeywordFetchResult,
  type TwitterSearchKeywordRecord
} from "./twitterSearchKeywordRepository.js";
import {
  fetchAdvancedSearchTweets,
  type TwitterApiFetch,
  type TwitterApiTweet
} from "./twitterApiClient.js";

export const twitterKeywordSearchSourceKind = "twitter_keyword_search" as SourceKind;
const twitterKeywordSearchSourceType = "twitter_keyword_aggregate";
const defaultKeywordFetchLimit = 5;
const defaultTweetsPerKeywordLimit = 10;
const keywordSearchLookbackHours = 72;
const fixedSearchLanguageOperator = "lang:zh";
const chineseTextPattern = /[\u4e00-\u9fff]/;
const japaneseKanaPattern = /[\u3040-\u30ff\u31f0-\u31ff]/;
const koreanTextPattern = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;

export type CollectTwitterKeywordIssuesOptions = {
  apiKey?: string | null;
  fetch?: TwitterApiFetch;
  now?: Date;
  maxKeywordCount?: number;
  maxTweetsPerKeyword?: number;
};

type TwitterKeywordCandidateItem = CandidateItem & {
  metadataJson?: string;
};

// 关键词搜索和账号采集一样，需要一个隐藏聚合 source 承接 content_items 外键，但不进入普通来源库存表。
export function ensureTwitterKeywordContentSource(db: SqliteDatabase): number {
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
  ).run(twitterKeywordSearchSourceKind, "Twitter 关键词搜索", "https://x.com/", twitterKeywordSearchSourceType);

  const row = db
    .prepare("SELECT id FROM content_sources WHERE kind = ? LIMIT 1")
    .get(twitterKeywordSearchSourceKind) as { id: number } | undefined;

  if (!row) {
    throw new Error("Failed to ensure twitter keyword content source");
  }

  return row.id;
}

// 第一版关键词搜索只支持手动采集，并通过 5x10 的双限流把 credits 消耗压在稳定范围内。
export async function collectTwitterKeywordIssues(
  db: SqliteDatabase,
  options: CollectTwitterKeywordIssuesOptions = {}
): Promise<LoadedSourceIssues> {
  const enabledKeywords = listTwitterSearchKeywords(db)
    .filter((keyword) => keyword.isCollectEnabled)
    .slice(0, normalizePositiveInteger(options.maxKeywordCount, defaultKeywordFetchLimit));
  const failures: SourceLoadFailure[] = [];
  const apiKey = options.apiKey?.trim();
  const now = options.now ?? new Date();
  const maxTweetsPerKeyword = normalizePositiveInteger(options.maxTweetsPerKeyword, defaultTweetsPerKeywordLimit);

  if (enabledKeywords.length === 0) {
    return Object.assign([], { failures });
  }

  if (!apiKey) {
    return Object.assign([], {
      failures: [
        {
          kind: twitterKeywordSearchSourceKind,
          reason: "TWITTER_API_KEY is not configured"
        }
      ]
    });
  }

  const items: TwitterKeywordCandidateItem[] = [];

  for (const keyword of enabledKeywords) {
    const fetchedAt = now.toISOString();
    const searchQuery = buildKeywordSearchQuery(keyword.keyword, now);
    const result = await fetchAdvancedSearchTweets({
      apiKey,
      query: searchQuery,
      queryType: "Latest",
      fetch: options.fetch
    });

    if (!result.ok) {
      failures.push({ kind: twitterKeywordSearchSourceKind, reason: `${keyword.keyword}: ${result.reason}` });
      markTwitterSearchKeywordFetchResult(db, {
        id: keyword.id,
        success: false,
        fetchedAt,
        error: result.reason
      });
      continue;
    }

    const candidateTweets = result.tweets
      .filter(isLikelySimplifiedChineseTweet)
      .slice(0, maxTweetsPerKeyword)
      .flatMap((tweet, index) => mapTweetToCandidate(keyword, tweet, index, searchQuery));

    markTwitterSearchKeywordFetchResult(db, {
      id: keyword.id,
      success: true,
      fetchedAt,
      message:
        candidateTweets.length > 0
          ? `本次搜索成功，获得 ${candidateTweets.length} 条可入库推文。`
          : "本次搜索成功，但没有可入库的新推文。"
    });
    items.push(...candidateTweets);
  }

  if (items.length === 0) {
    return Object.assign([], { failures });
  }

  ensureTwitterKeywordContentSource(db);

  const issue: LoadedIssue = {
    date: toIssueDate(now),
    issueUrl: "https://x.com/search",
    sourceKind: twitterKeywordSearchSourceKind,
    sourceType: "official",
    sourcePriority: 95,
    items
  };

  return Object.assign([issue], { failures });
}

function buildKeywordSearchQuery(keyword: string, now: Date) {
  const untilSeconds = Math.floor(now.getTime() / 1000);
  const sinceSeconds = untilSeconds - keywordSearchLookbackHours * 60 * 60;
  const searchTerm = normalizeKeywordSearchTerm(keyword);
  return `${searchTerm} ${fixedSearchLanguageOperator} since_time:${sinceSeconds} until_time:${untilSeconds}`.trim();
}

// 关键词搜索固定收中文结果；本地再排除日文假名和韩文，避免 API 偶发把非中文结果混进来。
function isLikelySimplifiedChineseTweet(tweet: TwitterApiTweet): boolean {
  return (
    chineseTextPattern.test(tweet.text) &&
    !japaneseKanaPattern.test(tweet.text) &&
    !koreanTextPattern.test(tweet.text)
  );
}

// 用户填写的关键词里即使带了 lang:xx，也以系统固定中文搜索为准，防止后台配置绕开范围。
function normalizeKeywordSearchTerm(keyword: string) {
  return keyword
    .trim()
    .replace(/(^|\s)-?lang:\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapTweetToCandidate(
  keyword: TwitterSearchKeywordRecord,
  tweet: TwitterApiTweet,
  index: number,
  searchQuery: string
): TwitterKeywordCandidateItem[] {
  return [
    {
      rank: index + 1,
      category: keyword.category,
      title: buildTweetTitle(tweet.text),
      sourceUrl: tweet.url ?? buildFallbackTweetUrl(tweet, keyword.keyword),
      sourceName: `Twitter 搜索 / ${keyword.keyword}`,
      externalId: `twitter:${tweet.id}`,
      publishedAt: normalizePublishedAt(tweet.createdAt) ?? undefined,
      summary: tweet.text,
      metadataJson: JSON.stringify({
        collector: {
          kind: "twitter_keyword_search",
          keywordId: keyword.id,
          keyword: keyword.keyword,
          priority: keyword.priority,
          searchQuery
        },
        metrics: tweet.metrics,
        author: tweet.author
      })
    }
  ];
}

function buildFallbackTweetUrl(tweet: TwitterApiTweet, keyword: string) {
  if (tweet.author.username) {
    return `https://x.com/${tweet.author.username}/status/${tweet.id}`;
  }

  return `https://x.com/search?q=${encodeURIComponent(keyword)}&src=typed_query`;
}

function buildTweetTitle(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function normalizePublishedAt(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : fallback;
}

function toIssueDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}
