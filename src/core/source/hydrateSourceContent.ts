import type { SqliteDatabase } from "../db/openDatabase.js";
import { resolveSourceByKind, upsertContentItems } from "../content/contentRepository.js";
import { fetchAndExtractArticle, type ArticleResult } from "../fetch/extractArticle.js";
import { loadSourceIssueByKind } from "./loadActiveSourceIssue.js";
import type { LoadedIssue, SourceKind } from "./types.js";

type EnrichedCollectedItem = LoadedIssue["items"][number] & {
  article: ArticleResult;
};

export type HydrateSourceContentDeps = {
  fetchArticle?: (url: string) => Promise<ArticleResult>;
  runNlEvaluationCycle?: (input: {
    mode: "incremental-after-collect";
    contentItemIds: number[];
  }) => Promise<unknown>;
};

export type HydrateSourceContentResult = {
  contentItemIds: number[];
  itemCount: number;
};

// 新增或更新来源后，这个 helper 只补当前来源的内容入库，避免把“保存来源”拖成整轮全站采集。
export async function hydrateSourceContent(
  db: SqliteDatabase,
  sourceKind: SourceKind,
  deps: HydrateSourceContentDeps = {}
): Promise<HydrateSourceContentResult> {
  const fetchArticle = deps.fetchArticle ?? fetchAndExtractArticle;
  const issue = await loadSourceIssueByKind(db, sourceKind);
  const enrichedItems = await Promise.all(issue.items.map((item) => enrichItem(item, fetchArticle)));
  const source = resolveSourceByKind(db, issue.sourceKind);

  if (!source) {
    throw new Error(`Missing content source row for kind: ${issue.sourceKind}`);
  }

  const fetchedAt = new Date().toISOString();
  upsertContentItems(db, {
    sourceId: source.id,
    items: enrichedItems.map((item) => ({
      externalId: item.externalId,
      title: pickPersistedTitle(issue.sourceKind, item.title, item.article),
      canonicalUrl: item.sourceUrl,
      summary: item.summary,
      bodyMarkdown: item.article.ok ? item.article.text : "",
      publishedAt: item.publishedAt,
      fetchedAt
    }))
  });

  const contentItemIds = readPersistedContentIds(db, source.id, enrichedItems.map((item) => item.sourceUrl));

  if (contentItemIds.length > 0) {
    await deps.runNlEvaluationCycle?.({
      mode: "incremental-after-collect",
      contentItemIds
    });
  }

  return {
    contentItemIds,
    itemCount: enrichedItems.length
  };
}

async function enrichItem(
  item: LoadedIssue["items"][number],
  fetchArticle: (url: string) => Promise<ArticleResult>
): Promise<EnrichedCollectedItem> {
  return {
    ...item,
    article: await fetchArticle(item.sourceUrl)
  };
}

// 聚合源已经把标题整理过了，单条内容入库时不应该再被页面标题覆盖。
function pickPersistedTitle(sourceKind: SourceKind, feedTitle: string, article: ArticleResult): string {
  if (sourceKind === "juya") {
    return feedTitle;
  }

  if (article.ok && article.title.trim().length > 0) {
    return article.title.trim();
  }

  return feedTitle;
}

function readPersistedContentIds(db: SqliteDatabase, sourceId: number, canonicalUrls: string[]) {
  const readContentId = db.prepare(
    `
      SELECT id
      FROM content_items
      WHERE source_id = ?
        AND canonical_url = ?
      LIMIT 1
    `
  );

  return canonicalUrls.flatMap((canonicalUrl) => {
    const row = readContentId.get(sourceId, canonicalUrl) as { id: number } | undefined;
    return row ? [row.id] : [];
  });
}
