import type { SqliteDatabase } from "../db/openDatabase.js";
import {
  listTwitterAccountContentItemIds,
  listVisibleTwitterKeywordMatchContentItemIds,
  listVisibleTwitterKeywordMatchContentItemIdsByKeywordIds,
  listWechatRssContentItemIds
} from "./contentRepository.js";

/** 内容选择主查询的最小行形状，供二级来源范围过滤复用。 */
export type ContentCardRow = {
  id: number;
  title: string;
  summary: string | null;
  bodyMarkdown: string | null;
  metadataJson: string | null;
  sourceName: string;
  sourceKind: string;
  showAllWhenSelected: number;
  canonicalUrl: string;
  publishedAt: string | null;
  feedbackEntryId: number | null;
  feedbackFreeText: string | null;
  feedbackSuggestedEffect: string | null;
  feedbackStrengthLevel: string | null;
  feedbackPositiveKeywordsJson: string | null;
  feedbackNegativeKeywordsJson: string | null;
  rankingTimestamp: string | null;
  baseDecision: string | null;
  baseScoreDelta: number | null;
  viewDecision: string | null;
  viewScoreDelta: number | null;
};

export const twitterAccountsSourceKind = "twitter_accounts";
export const twitterKeywordSearchSourceKind = "twitter_keyword_search";
export const wechatRssSourceKind = "wechat_rss";

/** 按 Twitter 账号/关键词与公众号 RSS 的二级选择范围过滤聚合来源内容。 */
export function filterSecondarySourceScopedRows(
  db: SqliteDatabase,
  rows: ContentCardRow[],
  options: {
    selectedTwitterAccountIds?: number[];
    selectedTwitterKeywordIds?: number[];
    selectedWechatRssSourceIds?: number[];
  }
): ContentCardRow[] {
  const twitterAccountRows = rows.filter((row) => row.sourceKind === twitterAccountsSourceKind);
  const twitterKeywordRows = rows.filter((row) => row.sourceKind === twitterKeywordSearchSourceKind);
  const wechatRssRows = rows.filter((row) => row.sourceKind === wechatRssSourceKind);

  if (twitterAccountRows.length === 0 && twitterKeywordRows.length === 0 && wechatRssRows.length === 0) {
    return rows;
  }

  const visibleTwitterKeywordContentItemIdSet = new Set(
    listVisibleTwitterKeywordMatchContentItemIds(
      db,
      twitterKeywordRows.map((row) => row.id)
    )
  );
  const selectedTwitterAccountContentItemIdSet = options.selectedTwitterAccountIds === undefined
    ? null
    : new Set(
        listTwitterAccountContentItemIds(
          db,
          twitterAccountRows.map((row) => row.id),
          options.selectedTwitterAccountIds
        )
      );
  const selectedTwitterKeywordContentItemIdSet = options.selectedTwitterKeywordIds === undefined
    ? null
    : new Set(
        listVisibleTwitterKeywordMatchContentItemIdsByKeywordIds(
          db,
          twitterKeywordRows.map((row) => row.id),
          options.selectedTwitterKeywordIds
        )
      );
  const selectedWechatRssContentItemIdSet = options.selectedWechatRssSourceIds === undefined
    ? null
    : new Set(
        listWechatRssContentItemIds(
          db,
          wechatRssRows.map((row) => row.id),
          options.selectedWechatRssSourceIds
        )
      );

  return rows.filter((row) => {
    if (row.sourceKind === twitterAccountsSourceKind) {
      return selectedTwitterAccountContentItemIdSet === null || selectedTwitterAccountContentItemIdSet.has(row.id);
    }

    if (row.sourceKind === twitterKeywordSearchSourceKind) {
      if (!visibleTwitterKeywordContentItemIdSet.has(row.id)) {
        return false;
      }

      return selectedTwitterKeywordContentItemIdSet === null || selectedTwitterKeywordContentItemIdSet.has(row.id);
    }

    if (row.sourceKind === wechatRssSourceKind) {
      return selectedWechatRssContentItemIdSet === null || selectedWechatRssContentItemIdSet.has(row.id);
    }

    return true;
  });
}

