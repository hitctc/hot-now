import type { SqliteDatabase } from "../openDatabase.js";

/**
 * 把短内容成品的写作状态词汇迁移成平台成品状态。
 *
 * 短内容的 status 一直由 Hermes 写作链路直接透传：质检通过写 `ready`，质检未过写
 * `draft` / `needs_rewrite`。这三种值在成品状态转换表里都没有出边，导致存量短内容
 * 既不能推送草稿箱、也不能变更状态（其中 `ready` 占了绝大多数）。
 *
 * 映射规则与 `creativeFinishedArticleStatus.ts` 保持一致：
 * - `ready` → `ready_for_publish`：质检通过，可直接推送
 * - `draft` / `needs_rewrite` → `needs_review`：质检未过，进审核流程而不是卡死
 */
export const normalizeShortContentStatusesMigration = {
  version: 55,
  name: "055_normalize_short_content_statuses",
  apply(db: SqliteDatabase): void {
    const update = db.prepare(
      "UPDATE creative_finished_articles SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE direction = 'short_content' AND status = ?",
    );
    const run = db.transaction(() => {
      update.run("ready_for_publish", "ready");
      update.run("needs_review", "draft");
      update.run("needs_review", "needs_rewrite");
    });
    run();
  }
} as const;
