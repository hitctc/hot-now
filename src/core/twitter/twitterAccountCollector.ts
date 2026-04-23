import type { SqliteDatabase } from "../db/openDatabase.js";
import type { LoadedSourceIssues, SourceLoadFailure } from "../source/loadEnabledSourceIssues.js";
import type { CandidateItem, LoadedIssue, SourceKind } from "../source/types.js";
import {
  listTwitterAccounts,
  markTwitterAccountFetchResult,
  type TwitterAccountRecord
} from "./twitterAccountRepository.js";
import {
  fetchUserLastTweets,
  type TwitterApiFetch,
  type TwitterApiTweet
} from "./twitterApiClient.js";

export const twitterAccountsSourceKind = "twitter_accounts" as SourceKind;
const twitterAccountsSourceType = "twitter_account_aggregate";
const maxTweetAgeMs = 7 * 24 * 60 * 60 * 1000;

export type CollectTwitterAccountIssuesOptions = {
  apiKey?: string | null;
  fetch?: TwitterApiFetch;
  now?: Date;
};

type TwitterCandidateItem = CandidateItem & {
  metadataJson?: string;
};

// Account configuration is separate, but collected tweets still need one internal content source
// row because content_items currently belongs to content_sources through a foreign key.
export function ensureTwitterAccountsContentSource(db: SqliteDatabase): number {
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
      VALUES (?, ?, ?, NULL, ?, 1, 1, 0, CURRENT_TIMESTAMP)
      ON CONFLICT(kind) DO UPDATE SET
        name = excluded.name,
        site_url = excluded.site_url,
        source_type = excluded.source_type,
        is_enabled = 1,
        is_builtin = 1,
        show_all_when_selected = 0,
        updated_at = CURRENT_TIMESTAMP
    `
  ).run(twitterAccountsSourceKind, "Twitter 账号", "https://x.com/", twitterAccountsSourceType);

  const row = db
    .prepare("SELECT id FROM content_sources WHERE kind = ? LIMIT 1")
    .get(twitterAccountsSourceKind) as { id: number } | undefined;

  if (!row) {
    throw new Error("Failed to ensure twitter accounts content source");
  }

  return row.id;
}

export async function collectTwitterAccountIssues(
  db: SqliteDatabase,
  options: CollectTwitterAccountIssuesOptions = {}
): Promise<LoadedSourceIssues> {
  const accounts = listTwitterAccounts(db).filter((account) => account.isEnabled);
  const failures: SourceLoadFailure[] = [];
  const apiKey = options.apiKey?.trim();
  const now = options.now ?? new Date();

  if (accounts.length === 0) {
    return Object.assign([], { failures });
  }

  if (!apiKey) {
    return Object.assign([], {
      failures: [
        {
          kind: twitterAccountsSourceKind,
          reason: "TWITTER_API_KEY is not configured"
        }
      ]
    });
  }

  const items: TwitterCandidateItem[] = [];

  for (const account of accounts) {
    const fetchedAt = now.toISOString();
    const result = await fetchUserLastTweets({
      apiKey,
      userId: account.userId,
      userName: account.username,
      includeReplies: account.includeReplies,
      fetch: options.fetch
    });

    if (!result.ok) {
      failures.push({ kind: twitterAccountsSourceKind, reason: `${account.username}: ${result.reason}` });
      markTwitterAccountFetchResult(db, {
        id: account.id,
        success: false,
        fetchedAt,
        error: result.reason
      });
      continue;
    }

    const candidateTweets = result.tweets.flatMap((tweet, index) => mapTweetToCandidate(account, tweet, now, index));
    const firstAuthorId = result.tweets.find((tweet) => tweet.author.id)?.author.id ?? null;
    markTwitterAccountFetchResult(db, {
      id: account.id,
      success: true,
      fetchedAt,
      userId: firstAuthorId,
      message:
        candidateTweets.length > 0
          ? `本次抓取成功，获得 ${candidateTweets.length} 条可入库推文。`
          : "本次抓取成功，但没有可入库的新推文。"
    });
    items.push(...candidateTweets);
  }

  if (items.length === 0) {
    return Object.assign([], { failures });
  }

  ensureTwitterAccountsContentSource(db);

  const issue: LoadedIssue = {
    date: toIssueDate(now),
    issueUrl: "https://x.com/",
    sourceKind: twitterAccountsSourceKind,
    sourceType: "official",
    sourcePriority: 100,
    items
  };

  return Object.assign([issue], { failures });
}

function mapTweetToCandidate(
  account: TwitterAccountRecord,
  tweet: TwitterApiTweet,
  now: Date,
  index: number
): TwitterCandidateItem[] {
  const publishedAt = normalizePublishedAt(tweet.createdAt);

  if (publishedAt && now.getTime() - Date.parse(publishedAt) > maxTweetAgeMs) {
    return [];
  }

  return [
    {
      rank: index + 1,
      category: account.category,
      title: buildTweetTitle(tweet.text),
      sourceUrl: tweet.url ?? `https://x.com/${account.username}/status/${tweet.id}`,
      sourceName: `Twitter / ${account.displayName}`,
      externalId: `twitter:${tweet.id}`,
      publishedAt: publishedAt ?? undefined,
      summary: tweet.text,
      metadataJson: JSON.stringify({
        collector: {
          kind: "twitter_account",
          accountId: account.id,
          username: account.username,
          priority: account.priority
        },
        metrics: tweet.metrics,
        author: tweet.author
      })
    }
  ];
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

function toIssueDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}
