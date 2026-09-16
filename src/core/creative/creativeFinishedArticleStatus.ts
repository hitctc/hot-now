/**
 * 成品状态的短内容兼容映射。
 *
 * 短内容成品的 `status` 由 Hermes 写作链路直接透传，它用的是写作状态词汇：
 * 质检通过写 `ready`，质检未过写 `draft` / `needs_rewrite`。
 * 而平台的成品状态机只认 `ready_for_publish` / `needs_review` 这一套，
 * `ready` 在状态转换表里没有出边，会导致短内容既不能推送、也不能改状态。
 *
 * 这里把短内容的写作状态映射到平台成品状态；长文不受影响，它有自己的门禁流程。
 */
const SHORT_CONTENT_STATUS_ALIASES: Record<string, string> = {
  // 质检通过 → 可直接推送
  ready: "ready_for_publish",
  // 质检未过只保留草稿，不能直接推送，但要让文章进得了审核流程，避免永久卡死
  draft: "needs_review",
  needs_rewrite: "needs_review",
};

/** 把外部传入的成品状态归一化为平台状态机的词汇；未命中映射时原样返回。 */
export function normalizeFinishedArticleStatus(
  direction: string,
  status: string | undefined,
): string | undefined {
  if (direction !== "short_content" || !status) return status;
  return SHORT_CONTENT_STATUS_ALIASES[status] ?? status;
}
