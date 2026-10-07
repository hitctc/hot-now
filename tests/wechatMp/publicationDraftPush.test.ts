import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { pushArticleToWechatDraft } from "../../src/core/wechatMp/wechatMpDraftPush.js";
import { findCreativeFinishedArticleById } from "../../src/core/creative/creativeFinishedArticleRepository.js";
import type { SqliteDatabase } from "../../src/core/db/openDatabase.js";

vi.mock("../../src/core/wechatMp/wechatMpAccountRepository.js", () => ({ findDefaultWechatMpAccount: vi.fn(() => ({ id: 1 })) }));
vi.mock("../../src/core/creative/creativeFinishedArticleRepository.js", () => ({
  findCreativeFinishedArticleById: vi.fn(), checkPublishConditions: vi.fn(() => ({ qualified: true, missing: [] })), editCreativeFinishedArticle: vi.fn(),
}));
afterEach(() => vi.clearAllMocks());
const dirty = "但现有证据只是搜索页面抓取内容，不能确认这是统一的官方安排。";

describe("发布稿语境硬门禁", () => {
  it.each(["ready_for_publish", "manual_draft", "needs_review"])("%s 即使确认风险也在任何写入或上传前阻断内部流程正文", async status => {
    vi.mocked(findCreativeFinishedArticleById).mockReturnValue({ status, titles: ["节后安排"], intros: [], humanMarkdown: dirty, contentMarkdown: dirty, manualReviewReason: "人工强制重写 · 待人工审核" } as never);
    const prepare = vi.fn(() => { throw new Error("不得开始推送写入"); });
    const result = await pushArticleToWechatDraft({ db: { prepare } as unknown as SqliteDatabase, articleId: 3664, themeId: "bauhaus", masterKey: "test-only", wechatHtml: "<p>清洁的渲染正文</p>", riskConfirmed: true });
    expect(result.errorCode).toBe("publication-text-blocked");
    expect(prepare).not.toHaveBeenCalled();
  });

  it("语义专项否决的同义正文也不能经风险确认推送", async () => {
    const body = "手边提供给我的这些信息，还不足以让我完成核对。";
    vi.mocked(findCreativeFinishedArticleById).mockReturnValue({ status: "needs_review", titles: ["安排"], humanMarkdown: `${body}\n\n跪求点赞、关注。`,
      manualReviewReason: "人工强制重写 · 待人工审核", stepTrace: [{ meta: { publicationCheck: {
        policy: "reader-facing-v1", passed: false, bodyHash: createHash("sha256").update(body).digest("hex"),
        issues: [{ field: "body", excerpt: body }],
      } } }],
    } as never);
    const prepare = vi.fn(() => { throw new Error("不得开始推送写入"); });
    const result = await pushArticleToWechatDraft({ db: { prepare } as unknown as SqliteDatabase, articleId: 3664, themeId: "bauhaus", masterKey: "test-only", wechatHtml: `<p>${body}</p>`, riskConfirmed: true });
    expect(result.errorCode).toBe("publication-text-blocked");
    expect(prepare).not.toHaveBeenCalled();
  });

  it("HTML的图片说明和辅助阅读文字也不能绕过", async () => {
    vi.mocked(findCreativeFinishedArticleById).mockReturnValue({ status: "ready_for_publish", titles: ["安排"], humanMarkdown: "按通知出勤。" } as never);
    const prepare = vi.fn(() => { throw new Error("不得开始推送写入"); });
    const result = await pushArticleToWechatDraft({ db: { prepare } as unknown as SqliteDatabase, articleId: 3664, themeId: "bauhaus", masterKey: "test-only", wechatHtml: `<p>按通知出勤。</p><img src="/offline.png" alt="${dirty}">` });
    expect(result.errorCode).toBe("publication-text-blocked");
    expect(prepare).not.toHaveBeenCalled();
  });

  it("正式正文干净但提交HTML含拆标签及零宽字符的流程语句时仍阻断", async () => {
    vi.mocked(findCreativeFinishedArticleById).mockReturnValue({ status: "ready_for_publish", titles: ["节后安排"], intros: [], humanMarkdown: "按通知安排出勤。", contentMarkdown: "原始稿" } as never);
    const prepare = vi.fn(() => { throw new Error("不得开始推送写入"); });
    const result = await pushArticleToWechatDraft({ db: { prepare } as unknown as SqliteDatabase, articleId: 3664, themeId: "bauhaus", masterKey: "test-only", wechatHtml: "<p>但现有证据只是搜索<span>页\u200b面</span>抓取内容。</p>" });
    expect(result.errorCode).toBe("publication-text-blocked");
    expect(prepare).not.toHaveBeenCalled();
  });
});
