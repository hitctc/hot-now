import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { hasDraftPushStatus, isManualForcedRewrite, manualForcedRewriteRisks } from "../../src/core/creative/manualForcedRewrite.js";
import { findManualForcedRewriteDelivery } from "../../src/core/creative/manualForcedRewriteRepository.js";

const marker = "人工强制重写 · 待人工审核";

describe("人工强制重写成品合同", () => {
  it("强制待审核稿可直接进入风险确认，普通待审核稿仍不能推送", () => {
    expect(hasDraftPushStatus({ status: "needs_review", manualReviewReason: marker })).toBe(true);
    expect(hasDraftPushStatus({ status: "needs_review" })).toBe(false);
    for (const status of ["failed", "stopped", "soft_deleted", "review_rejected"]) {
      expect(hasDraftPushStatus({ status, manualReviewReason: marker })).toBe(false);
    }
  });

  it("推送完成后仍识别风险标记，风险确认不等同于审核通过", () => {
    const article = { status: "wechat_draft", manualReviewReason: marker, manualReviewReasons: ["原任务 original：事实冲突", "本次质检未通过"] };
    expect(isManualForcedRewrite(article)).toBe(true);
    expect(manualForcedRewriteRisks(article)).toEqual(["原任务 original：事实冲突", "本次质检未通过"]);
    expect(hasDraftPushStatus(article)).toBe(true);
  });

  it("响应丢失时只恢复同素材同原任务的强制稿，不覆盖或误取普通稿", () => {
    const db = new Database(":memory:");
    try {
      db.exec(`CREATE TABLE creative_finished_articles (id INTEGER, source_item_id INTEGER, manual_review_reason TEXT, manual_review_reasons TEXT)`);
      const insert = db.prepare("INSERT INTO creative_finished_articles VALUES (?, ?, ?, ?)");
      insert.run(1, 42, null, null);
      insert.run(2, 42, marker, JSON.stringify(["原任务 original：事实冲突", "质检失败"]));
      insert.run(3, 42, marker, JSON.stringify(["原任务 other：证据不足"]));
      insert.run(4, 43, marker, JSON.stringify(["原任务 original：事实冲突"]));
      const request = { manualReviewReason: marker, manualReviewReasons: ["原任务 original：事实冲突", "本次新增风险"] };
      expect(findManualForcedRewriteDelivery(db, 42, request)).toBe(2);
      expect(findManualForcedRewriteDelivery(db, 42, { manualReviewReasons: request.manualReviewReasons })).toBeUndefined();
      expect(findManualForcedRewriteDelivery(db, 99, request)).toBeUndefined();
    } finally { db.close(); }
  });
});
