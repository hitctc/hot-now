import { fetchAndExtractArticle, type ArticleResult } from "../fetch/extractArticle.js";
import {
  linkTwitterSearchKeywordMatches,
  listContentItemIdsByExternalIds,
  resolveSourceByKind,
  upsertContentItems
} from "../content/contentRepository.js";
import type { SqliteDatabase } from "../db/openDatabase.js";
import type { LoadedIssue } from "../source/types.js";
import { collectTwitterKeywordIssues, twitterKeywordSearchSourceKind } from "./twitterKeywordCollector.js";
import { listTwitterSearchKeywords } from "./twitterSearchKeywordRepository.js";
import type { TwitterApiFetch } from "./twitterApiClient.js";

type EnrichedCollectedItem = LoadedIssue["items"][number] & {
  article: ArticleResult;
};

export type RunTwitterKeywordCollectionResult =
  | {
      accepted: true;
      action: "collect-twitter-keywords";
      enabledKeywordCount: number;
      processedKeywordCount: number;
      fetchedTweetCount: number;
      persistedContentItemCount: number;
      reusedContentItemCount: number;
      failureCount: number;
    }
  | {
      accepted: false;
      reason: "twitter-api-key-missing" | "no-enabled-twitter-keywords";
    };

export type RunTwitterKeywordCollectionOptions = {
  apiKey?: string | null;
  fetch?: TwitterApiFetch;
  fetchArticle?: (url: string) => Promise<ArticleResult>;
  runNlEvaluationCycle?: (input: {
    mode: "incremental-after-collect";
    contentItemIds: number[];
  }) => Promise<unknown>;
  now?: Date;
  maxKeywordCount?: number;
  maxTweetsPerKeyword?: number;
};

type KeywordMatchInput = {
  keywordId: number;
  tweetExternalId: string;
  item: EnrichedCollectedItem;
};

// 手动关键词采集只负责“补漏推文 + 记录命中关系”，不会触发日报生成，也不会加入默认定时采集。
export async function runTwitterKeywordCollection(
  db: SqliteDatabase,
  options: RunTwitterKeywordCollectionOptions = {}
): Promise<RunTwitterKeywordCollectionResult> {
  const enabledKeywords = listTwitterSearchKeywords(db).filter((keyword) => keyword.isCollectEnabled);
  const processedKeywords = enabledKeywords.slice(0, normalizePositiveInteger(options.maxKeywordCount, 5));

  if (enabledKeywords.length === 0) {
    return { accepted: false, reason: "no-enabled-twitter-keywords" };
  }

  const apiKey = options.apiKey?.trim();

  if (!apiKey) {
    return { accepted: false, reason: "twitter-api-key-missing" };
  }

  const issues = await collectTwitterKeywordIssues(db, {
    apiKey,
    fetch: options.fetch,
    now: options.now,
    maxKeywordCount: options.maxKeywordCount,
    maxTweetsPerKeyword: options.maxTweetsPerKeyword
  });
  const fetchArticle = options.fetchArticle ?? fetchAndExtractArticle;
  const matches = await collectKeywordMatches(issues, fetchArticle);
  const { persistedContentItemIds, reusedContentItemIds } = persistCollectedKeywordItems(db, matches);
  const touchedContentItemIds = uniqueNumbers([...persistedContentItemIds, ...reusedContentItemIds]);

  if (options.runNlEvaluationCycle && touchedContentItemIds.length > 0) {
    try {
      await options.runNlEvaluationCycle({
        mode: "incremental-after-collect",
        contentItemIds: touchedContentItemIds
      });
    } catch {
      // 关键词搜索第一版先保证入库和命中关系，增量评估失败不反向影响手动采集结果。
    }
  }

  return {
    accepted: true,
    action: "collect-twitter-keywords",
    enabledKeywordCount: enabledKeywords.length,
    processedKeywordCount: processedKeywords.length,
    fetchedTweetCount: matches.length,
    persistedContentItemCount: persistedContentItemIds.length,
    reusedContentItemCount: reusedContentItemIds.length,
    failureCount: issues.failures?.length ?? 0
  };
}

async function collectKeywordMatches(
  issues: LoadedIssue[],
  fetchArticle: (url: string) => Promise<ArticleResult>
): Promise<KeywordMatchInput[]> {
  const matches: KeywordMatchInput[] = [];

  for (const issue of issues) {
    for (const item of issue.items) {
      const keywordId = readKeywordId(item.metadataJson);

      if (!keywordId) {
        continue;
      }

      matches.push({
        keywordId,
        tweetExternalId: item.externalId ?? "",
        item: {
          ...item,
          article: await fetchArticle(item.sourceUrl)
        }
      });
    }
  }

  return matches.filter((match) => match.tweetExternalId.length > 0);
}

function persistCollectedKeywordItems(db: SqliteDatabase, matches: KeywordMatchInput[]) {
  const existingByExternalId = new Map(
    listContentItemIdsByExternalIds(
      db,
      matches.map((match) => match.tweetExternalId)
    ).map((row) => [row.externalId, row.contentItemId])
  );
  const source = resolveSourceByKind(db, twitterKeywordSearchSourceKind);

  if (!source) {
    throw new Error(`Missing content source row for kind: ${twitterKeywordSearchSourceKind}`);
  }

  const newItems = uniqueKeywordContentItems(matches, existingByExternalId);
  const fetchedAt = new Date().toISOString();

  if (newItems.length > 0) {
    upsertContentItems(db, {
      sourceId: source.id,
      items: newItems.map((match) => ({
        externalId: match.tweetExternalId,
        title: pickPersistedTitle(match.item.title, match.item.article),
        canonicalUrl: match.item.sourceUrl,
        summary: match.item.summary,
        bodyMarkdown: match.item.article.ok ? match.item.article.text : "",
        publishedAt: match.item.publishedAt,
        fetchedAt,
        metadataJson: match.item.metadataJson
      }))
    });
  }

  const finalByExternalId = new Map(
    listContentItemIdsByExternalIds(
      db,
      matches.map((match) => match.tweetExternalId)
    ).map((row) => [row.externalId, row.contentItemId])
  );
  const persistedContentItemIds: number[] = [];
  const reusedContentItemIds: number[] = [];

  linkTwitterSearchKeywordMatches(
    db,
    matches.flatMap((match) => {
      const contentItemId = finalByExternalId.get(match.tweetExternalId);

      if (!contentItemId) {
        return [];
      }

      if (existingByExternalId.has(match.tweetExternalId)) {
        reusedContentItemIds.push(contentItemId);
      } else {
        persistedContentItemIds.push(contentItemId);
      }

      return [
        {
          keywordId: match.keywordId,
          tweetExternalId: match.tweetExternalId,
          contentItemId
        }
      ];
    })
  );

  return {
    persistedContentItemIds: uniqueNumbers(persistedContentItemIds),
    reusedContentItemIds: uniqueNumbers(reusedContentItemIds)
  };
}

function uniqueKeywordContentItems(
  matches: KeywordMatchInput[],
  existingByExternalId: Map<string, number>
) {
  const uniqueMatches = new Map<string, KeywordMatchInput>();

  for (const match of matches) {
    if (existingByExternalId.has(match.tweetExternalId) || uniqueMatches.has(match.tweetExternalId)) {
      continue;
    }

    uniqueMatches.set(match.tweetExternalId, match);
  }

  return [...uniqueMatches.values()];
}

// Twitter 搜索内容仍以 feed 标题为主，只有正文提取拿到更具体标题时才覆盖。
function pickPersistedTitle(feedTitle: string, article: ArticleResult): string {
  if (article.ok && article.title.trim().length > 0) {
    return article.title.trim();
  }

  return feedTitle;
}

function readKeywordId(metadataJson: string | undefined) {
  if (!metadataJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadataJson) as {
      collector?: { keywordId?: unknown };
    };
    const keywordId = parsed.collector?.keywordId;

    return Number.isInteger(keywordId) && Number(keywordId) > 0 ? Number(keywordId) : null;
  } catch {
    return null;
  }
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : fallback;
}
