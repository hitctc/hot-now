import { afterEach, describe, expect, it, vi } from "vitest";
import { pushArticleToWechatDraft } from "../../src/core/wechatMp/wechatMpDraftPush.js";
import { findCreativeFinishedArticleById, checkPublishConditions } from "../../src/core/creative/creativeFinishedArticleRepository.js";
import type { SqliteDatabase } from "../../src/core/db/openDatabase.js";

vi.mock("../../src/core/wechatMp/wechatMpAccountRepository.js", () => ({ findDefaultWechatMpAccount: vi.fn(() => ({ id: 1 })) }));
vi.mock("../../src/core/creative/creativeFinishedArticleRepository.js", () => ({
  findCreativeFinishedArticleById: vi.fn(), checkPublishConditions: vi.fn(() => ({ qualified: false, missing: ["缺少封面图"] })), editCreativeFinishedArticle: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe("强制稿服务端推送保护", () => {
  it("缺少本次风险确认时在上传前拒绝，不能用可推送状态绕过", async () => {
    vi.mocked(findCreativeFinishedArticleById).mockReturnValue({ status: "ready_for_publish", manualReviewReason: "人工强制重写 · 待人工审核" } as never);
    const result = await pushArticleToWechatDraft({ db: {} as SqliteDatabase, articleId: 1, themeId: "bauhaus", masterKey: "test-only" });
    expect(result.errorCode).toBe("risk-confirmation-required");
    expect(checkPublishConditions).not.toHaveBeenCalled();
  });

  it("确认后待审核强制稿仍需满足标题、正文和封面条件", async () => {
    vi.mocked(findCreativeFinishedArticleById).mockReturnValue({ status: "needs_review", manualReviewReason: "人工强制重写 · 待人工审核" } as never);
    const result = await pushArticleToWechatDraft({ db: {} as SqliteDatabase, articleId: 1, themeId: "bauhaus", masterKey: "test-only", riskConfirmed: true });
    expect(result.errorCode).toBe("missing-content");
    expect(checkPublishConditions).toHaveBeenCalledOnce();
  });

  it("确认参数不放行普通待审核稿", async () => {
    vi.mocked(findCreativeFinishedArticleById).mockReturnValue({ status: "needs_review", manualReviewReason: "普通审核原因" } as never);
    const result = await pushArticleToWechatDraft({ db: {} as SqliteDatabase, articleId: 1, themeId: "bauhaus", masterKey: "test-only", riskConfirmed: true });
    expect(result.errorCode).toBe("invalid-status");
  });
});
