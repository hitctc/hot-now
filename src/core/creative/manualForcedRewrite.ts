export const MANUAL_FORCED_REWRITE_MARKER = "人工强制重写 · 待人工审核";

type ReviewArticle = {
  manualReviewReason?: string | null;
  manualReviewReasons?: string[] | null;
};

/** 识别持久风险标记，不随推送状态变化而消失，也不把普通待审核稿误认为强制稿。 */
export function isManualForcedRewrite(article: ReviewArticle | null | undefined): boolean {
  return article?.manualReviewReason === MANUAL_FORCED_REWRITE_MARKER;
}

/** 返回原阻断和本次检查风险，供列表、详情和同一次推送确认展示，无副作用。 */
export function manualForcedRewriteRisks(article: ReviewArticle | null | undefined): string[] {
  return isManualForcedRewrite(article) ? article?.manualReviewReasons ?? [] : [];
}

/** 强制稿无需独立审核操作，但仅待审核/已推送状态可进入人工确认；其他稿沿用原状态限制。 */
export function hasDraftPushStatus(article: ReviewArticle & { originType?: string; status: string }): boolean {
  if (isManualForcedRewrite(article) && article.status === "needs_review") return true;
  return (article.originType === "manual" ? ["manual_draft", "wechat_draft"] : ["ready_for_publish", "wechat_draft"]).includes(article.status);
}
