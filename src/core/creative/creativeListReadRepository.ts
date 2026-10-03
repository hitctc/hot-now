import type { SqliteDatabase } from "../db/openDatabase.js";
import { findCreativeFinishedArticleById, listCreativeFinishedArticles } from "./creativeFinishedArticleRepository.js";
import { findCreativeSourceItemById, listCreativeSourceItems } from "./creativeSourceItemRepository.js";

/** 读取素材页及既有成品关联展示；只补齐本次读取拥有的对象，不修改业务行。 */
export function readCreativeSourceList(db: SqliteDatabase, filters: Parameters<typeof listCreativeSourceItems>[1]) {
  const result = listCreativeSourceItems(db, filters);
  const linkedIds = [...new Set(result.items.filter(item => item.linkedArticleId != null).map(item => item.linkedArticleId!))];
  if (linkedIds.length > 0) {
    const rows = db.prepare(`SELECT id, created_at, wechat_published FROM creative_finished_articles WHERE id IN (${linkedIds.map(() => "?").join(",")})`).all(...linkedIds) as Array<{ id: number; created_at: string; wechat_published: number }>;
    const articles = new Map(rows.map(row => [row.id, row]));
    for (const item of result.items) {
      if (item.linkedArticleId == null) continue;
      const row = articles.get(item.linkedArticleId);
      Object.assign(item, { linkedArticleCreatedAt: row?.created_at ?? null, linkedArticlePublished: row?.wechat_published === 1 });
    }
  }
  return result;
}

/** 读取全部既有来源名，沿用原去空值及排序；鉴权由HTTP适配层执行。 */
export function readCreativeSourceNames(db: SqliteDatabase): string[] {
  const rows = db.prepare("SELECT DISTINCT source_name FROM creative_source_items WHERE source_name IS NOT NULL AND source_name != '' ORDER BY source_name").all() as Array<{ source_name: string }>;
  return rows.map(row => row.source_name);
}

/** 按原摘要/完整模式读取素材详情，未找到仍返回undefined。 */
export function readCreativeSourceDetail(db: SqliteDatabase, id: number) {
  return findCreativeSourceItemById(db, id);
}

/** 读取成品列表并补齐平台素材信息；日期统计和分页全部沿用原repository语义。 */
export function readCreativeFinishedList(db: SqliteDatabase, filters: Parameters<typeof listCreativeFinishedArticles>[1]) {
  const result = listCreativeFinishedArticles(db, filters);
  const sourceIds = [...new Set(result.items.map(article => article.sourceItemId).filter((id): id is number => id !== null))];
  if (sourceIds.length > 0) {
    const rows = db.prepare(`SELECT id, trend_score, trend_breakdown, published_at, title, source_name FROM creative_source_items WHERE id IN (${sourceIds.map(() => "?").join(",")})`).all(...sourceIds) as Array<{ id: number; trend_score: number | null; trend_breakdown: string | null; published_at: string | null; title: string | null; source_name: string | null }>;
    const sources = new Map(rows.map(row => [row.id, row]));
    for (const article of result.items) {
      const source = article.sourceItemId === null ? undefined : sources.get(article.sourceItemId);
      Object.assign(article, { trendScore: source?.trend_score ?? null, trendBreakdown: source?.trend_breakdown ? JSON.parse(source.trend_breakdown) : null, publishedAt: source?.published_at ?? null, sourceTitle: source?.title ?? null, sourceName: source?.source_name ?? null });
    }
  }
  return result;
}

/** 读取完整成品与原详情关联字段；不新增来源字段或吞掉原JSON错误。 */
export function readCreativeFinishedDetail(db: SqliteDatabase, id: number) {
  const article = findCreativeFinishedArticleById(db, id);
  if (!article) return article;
  const source = article.sourceItemId === null ? undefined : db.prepare("SELECT trend_score, trend_breakdown, published_at, title FROM creative_source_items WHERE id = ?").get(article.sourceItemId) as { trend_score: number | null; trend_breakdown: string | null; published_at: string | null; title: string } | undefined;
  if (source) Object.assign(article, { trendScore: source.trend_score ?? null, trendBreakdown: source.trend_breakdown ? JSON.parse(source.trend_breakdown) : null, publishedAt: source.published_at ?? null, sourceTitle: source.title ?? null });
  return article;
}
