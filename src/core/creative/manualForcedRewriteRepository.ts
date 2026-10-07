import type { SqliteDatabase } from "../db/openDatabase.js";
import { isManualForcedRewrite, MANUAL_FORCED_REWRITE_MARKER } from "./manualForcedRewrite.js";

/** 按素材与原阻断记录恢复同一次强制稿交付；响应丢失时不再插入第二份，也不覆盖旧稿。 */
export function findManualForcedRewriteDelivery(db: SqliteDatabase, sourceItemId: number, input: {
  manualReviewReason?: unknown;
  manualReviewReasons?: unknown;
}): number | undefined {
  if (typeof input.manualReviewReason !== "string" || !isManualForcedRewrite({ manualReviewReason: input.manualReviewReason })) return;
  const reasons = input.manualReviewReasons;
  if (!Array.isArray(reasons) || typeof reasons[0] !== "string" || !reasons[0].startsWith("原任务 ")) return;
  const row = db.prepare(`SELECT id FROM creative_finished_articles
    WHERE source_item_id = ? AND manual_review_reason = ?
      AND json_valid(manual_review_reasons) AND json_extract(manual_review_reasons, '$[0]') = ?
    ORDER BY id DESC LIMIT 1`).get(sourceItemId, MANUAL_FORCED_REWRITE_MARKER, reasons[0]) as { id: number } | undefined;
  return row?.id;
}
