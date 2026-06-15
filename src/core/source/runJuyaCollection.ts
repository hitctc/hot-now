// Juya RSS 独立采集：只抓 juya 一个来源，不走全量 runCollectionCycle，不生成日报、不发邮件。
// 供「数据收集」页 Juya 配置卡的「手动采集」按钮调用。
import { resolveSourceByKind, upsertContentItems } from "../content/contentRepository.js";
import type { SqliteDatabase } from "../db/openDatabase.js";
import { fetchAndExtractArticle, type ArticleResult } from "../fetch/extractArticle.js";
import { persistCollectedItems, enrichIssue, type EnrichedIssue } from "../pipeline/runCollectionCycle.js";
import { parseJuyaIssue } from "./parseJuyaIssue.js";
import type { LoadedIssue } from "./types.js";

export type JuyaCollectionResult = {
  ok: boolean;
  itemCount: number;
  reason?: string;
};

// 独立采集只复用解析 + 持久化逻辑，跳过聚类、日报和邮件，避免为了单源补数据拖累其他来源。
export async function runJuyaCollection(
  db: SqliteDatabase,
  options?: { fetchArticle?: (url: string) => Promise<ArticleResult> }
): Promise<JuyaCollectionResult> {
  const source = resolveSourceByKind(db, "juya");
  if (!source) {
    return { ok: false, itemCount: 0, reason: "juya-source-not-found" };
  }
  const rssUrl = source.rssUrl?.trim();
  if (!rssUrl) {
    return { ok: false, itemCount: 0, reason: "juya-rss-url-empty" };
  }

  let response: Response;
  try {
    response = await fetch(rssUrl);
  } catch {
    return { ok: false, itemCount: 0, reason: "juya-fetch-failed" };
  }
  if (response.status !== 200) {
    return { ok: false, itemCount: 0, reason: `juya-http-${response.status}` };
  }

  const issue: LoadedIssue = await parseJuyaIssue(await response.text());
  const fetchArticle = options?.fetchArticle ?? fetchAndExtractArticle;
  const enriched: EnrichedIssue = await enrichIssue(issue, fetchArticle);

  persistCollectedItems(db, enriched, enriched.items);

  return { ok: true, itemCount: enriched.items.length };
}
