import { fetchAndExtractArticle, type ArticleResult } from "../fetch/extractArticle.js";
import { resolveSourceByKind, upsertContentItems } from "../content/contentRepository.js";
import type { SqliteDatabase } from "../db/openDatabase.js";
import type { LoadedIssue } from "../source/types.js";
import { collectTwitterAccountIssues } from "./twitterAccountCollector.js";
import { listTwitterAccounts, type TwitterAccountRecord } from "./twitterAccountRepository.js";
import type { TwitterApiFetch } from "./twitterApiClient.js";

type EnrichedCollectedItem = LoadedIssue["items"][number] & {
  article: ArticleResult;
};

export type RunTwitterAccountCollectionResult =
  | {
      accepted: true;
      action: "collect-twitter-accounts";
      enabledAccountCount: number;
      fetchedTweetCount: number;
      persistedContentItemCount: number;
      failureCount: number;
    }
  | {
      accepted: false;
      reason: "twitter-api-key-missing" | "no-enabled-twitter-accounts";
    };

export type RunTwitterAccountCollectionOptions = {
  apiKey?: string | null;
  fetch?: TwitterApiFetch;
  fetchArticle?: (url: string) => Promise<ArticleResult>;
  runNlEvaluationCycle?: (input: {
    mode: "incremental-after-collect";
    contentItemIds: number[];
  }) => Promise<unknown>;
  now?: Date;
};

// Twitter 账号采集独立运行，只负责把推文写入内容池，不再混进常规 RSS/公众号的定时采集节奏。
export async function runTwitterAccountCollection(
  db: SqliteDatabase,
  options: RunTwitterAccountCollectionOptions = {}
): Promise<RunTwitterAccountCollectionResult> {
  const enabledAccounts = listTwitterAccounts(db).filter((account) => account.isEnabled);

  if (enabledAccounts.length === 0) {
    return { accepted: false, reason: "no-enabled-twitter-accounts" };
  }

  const apiKey = options.apiKey?.trim();

  if (!apiKey) {
    return { accepted: false, reason: "twitter-api-key-missing" };
  }

  const issues = await collectTwitterAccountIssues(db, {
    apiKey,
    fetch: options.fetch,
    now: options.now
  });
  const fetchArticle = options.fetchArticle ?? fetchAndExtractArticle;
  const persistedContentItemIds: number[] = [];
  let fetchedTweetCount = 0;

  for (const issue of issues) {
    fetchedTweetCount += issue.items.length;
    const enrichedItems = await Promise.all(issue.items.map((item) => enrichItem(item, fetchArticle)));
    persistedContentItemIds.push(...persistCollectedItems(db, issue, enrichedItems));
  }

  if (options.runNlEvaluationCycle && persistedContentItemIds.length > 0) {
    try {
      await options.runNlEvaluationCycle({
        mode: "incremental-after-collect",
        contentItemIds: uniqueNumbers(persistedContentItemIds)
      });
    } catch {
      // Twitter 账号采集先只保证内容入库，增量评估失败不能反向把采集判成失败。
    }
  }

  return {
    accepted: true,
    action: "collect-twitter-accounts",
    enabledAccountCount: enabledAccounts.length,
    fetchedTweetCount,
    persistedContentItemCount: persistedContentItemIds.length,
    failureCount: issues.failures?.length ?? 0
  };
}

// 推文链接的正文抓取仍沿用统一 extract 流程，这样内容页后续读取字段时不需要区分来源类型。
async function enrichItem(
  item: LoadedIssue["items"][number],
  fetchArticle: (url: string) => Promise<ArticleResult>
): Promise<EnrichedCollectedItem> {
  return {
    ...item,
    article: await fetchArticle(item.sourceUrl)
  };
}

// Twitter 采集只复用既有 content_items upsert，不生成日报产物，也不创建额外的 source 配置表。
function persistCollectedItems(db: SqliteDatabase, issue: LoadedIssue, items: EnrichedCollectedItem[]): number[] {
  const source = resolveSourceByKind(db, issue.sourceKind);

  if (!source) {
    throw new Error(`Missing content source row for kind: ${issue.sourceKind}`);
  }

  const fetchedAt = new Date().toISOString();
  upsertContentItems(db, {
    sourceId: source.id,
    items: items.map((item) => ({
      externalId: item.externalId,
      title: pickPersistedTitle(issue.sourceKind, item.title, item.article),
      canonicalUrl: item.sourceUrl,
      summary: item.summary,
      bodyMarkdown: item.article.ok ? item.article.text : "",
      publishedAt: item.publishedAt,
      fetchedAt,
      metadataJson: item.metadataJson
    }))
  });

  const readContentId = db.prepare(
    `
      SELECT id
      FROM content_items
      WHERE source_id = ?
        AND canonical_url = ?
      LIMIT 1
    `
  );

  return items.flatMap((item) => {
    const row = readContentId.get(source.id, item.sourceUrl) as { id: number } | undefined;
    return row ? [row.id] : [];
  });
}

// Twitter 走 feed title 优先，只有正文提取拿到了更具体的页面标题时才覆盖。
function pickPersistedTitle(sourceKind: LoadedIssue["sourceKind"], feedTitle: string, article: ArticleResult): string {
  if (sourceKind === "juya") {
    return feedTitle;
  }

  if (article.ok && article.title.trim().length > 0) {
    return article.title.trim();
  }

  return feedTitle;
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}
