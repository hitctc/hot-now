import { fetchAndExtractArticle, type ArticleResult } from "../fetch/extractArticle.js";
import { resolveSourceByKind, upsertContentItems } from "../content/contentRepository.js";
import type { SqliteDatabase } from "../db/openDatabase.js";
import type { LoadedIssue } from "../source/types.js";
import {
  collectWechatRssIssues,
  wechatRssSourceKind,
  type CollectWechatRssIssuesOptions
} from "./wechatRssCollector.js";
import { listWechatRssSources } from "./wechatRssSourceRepository.js";

type EnrichedWechatRssItem = LoadedIssue["items"][number] & {
  article: ArticleResult;
};

export type RunWechatRssCollectionResult =
  | {
      accepted: true;
      action: "collect-wechat-rss";
      enabledSourceCount: number;
      fetchedItemCount: number;
      persistedContentItemCount: number;
      failureCount: number;
    }
  | {
      accepted: false;
      reason: "no-enabled-wechat-rss-sources";
    };

export type RunWechatRssCollectionOptions = CollectWechatRssIssuesOptions & {
  fetchArticle?: (url: string) => Promise<ArticleResult>;
};

// 微信公众号 RSS 只在后台手动触发，不并入默认 RSS 来源库存的定时采集。
export async function runWechatRssCollection(
  db: SqliteDatabase,
  options: RunWechatRssCollectionOptions = {}
): Promise<RunWechatRssCollectionResult> {
  const enabledSources = listWechatRssSources(db).filter((source) => source.isEnabled);

  if (enabledSources.length === 0) {
    return { accepted: false, reason: "no-enabled-wechat-rss-sources" };
  }

  const issues = await collectWechatRssIssues(db, options);
  const fetchArticle = options.fetchArticle ?? fetchAndExtractArticle;
  const persistedContentItemIds: number[] = [];
  let fetchedItemCount = 0;

  for (const issue of issues) {
    fetchedItemCount += issue.items.length;
    const enrichedItems = await Promise.all(issue.items.map((item) => enrichItem(item, fetchArticle)));
    persistedContentItemIds.push(...persistWechatRssItems(db, issue, enrichedItems));
  }

  return {
    accepted: true,
    action: "collect-wechat-rss",
    enabledSourceCount: enabledSources.length,
    fetchedItemCount,
    persistedContentItemCount: uniqueNumbers(persistedContentItemIds).length,
    failureCount: issues.failures?.length ?? 0
  };
}

// 公众号文章正文抓取沿用统一提取器；抓取失败时仍保存 RSS 摘要，避免整条内容丢失。
async function enrichItem(
  item: LoadedIssue["items"][number],
  fetchArticle: (url: string) => Promise<ArticleResult>
): Promise<EnrichedWechatRssItem> {
  try {
    return {
      ...item,
      article: await fetchArticle(item.sourceUrl)
    };
  } catch {
    return {
      ...item,
      article: {
        ok: false,
        url: item.sourceUrl,
        title: "",
        text: "",
        error: "article-fetch-failed"
      }
    };
  }
}

function persistWechatRssItems(
  db: SqliteDatabase,
  issue: LoadedIssue,
  items: EnrichedWechatRssItem[]
): number[] {
  const source = resolveSourceByKind(db, issue.sourceKind) ?? {
    id: ensureWechatRssContentSource(db),
    kind: issue.sourceKind,
    name: "微信公众号 RSS",
    siteUrl: "https://mp.weixin.qq.com/",
    rssUrl: null
  };
  const fetchedAt = new Date().toISOString();

  upsertContentItems(db, {
    sourceId: source.id,
    items: items.map((item) => ({
      externalId: item.externalId,
      title: pickPersistedTitle(item.title, item.article),
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

// 隐藏聚合 source 只承接内容外键；真实公众号 RSS 配置继续保存在 wechat_rss_sources。
export function ensureWechatRssContentSource(db: SqliteDatabase): number {
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
  ).run(wechatRssSourceKind, "微信公众号 RSS", "https://mp.weixin.qq.com/", "wechat_rss_aggregate");

  const row = db
    .prepare("SELECT id FROM content_sources WHERE kind = ? LIMIT 1")
    .get(wechatRssSourceKind) as { id: number } | undefined;

  if (!row) {
    throw new Error("Failed to ensure wechat RSS content source");
  }

  return row.id;
}

function pickPersistedTitle(feedTitle: string, article: ArticleResult): string {
  if (article.ok && article.title.trim().length > 0) {
    return article.title.trim();
  }

  return feedTitle;
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}
