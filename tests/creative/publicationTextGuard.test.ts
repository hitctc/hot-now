import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { findArticlePublicationTextIssue, findPublicationTextIssue } from "../../src/core/creative/publicationTextGuard.js";
import { checkPublishConditions } from "../../src/core/creative/creativeFinishedArticleRepository.js";

const dirty = "但现有证据只是搜索页面抓取内容，不能确认这是统一的官方安排。";

describe("读者侧发布字段", () => {
  it.each(["警方披露，该公司通过抓取搜索页面收集个人信息。", "现有证据支持法院的判决，其他争议仍需依法审理。", "据国务院办公厅通知，相关假期按日历安排。"])("不封禁合法事件报道：%s", body => {
    expect(findPublicationTextIssue({ body })).toBeNull();
  });
  it("正式稿已修正时不因未选标题或原始AI稿继续阻断", () => {
    expect(findArticlePublicationTextIssue({ titles: [dirty, "节后安排"], titleIndex: 1, contentMarkdown: dirty, humanMarkdown: "按所在单位通知出勤。" })).toBeNull();
  });
  it("3664的原正文不能取得发布条件资格", () => {
    const result = checkPublishConditions({ originType: "pipeline", titles: ["节后安排"], coverImage: ["/offline.png"], humanMarkdown: dirty, contentMarkdown: dirty.repeat(3) } as never);
    expect(result.qualified).toBe(false);
    expect(result.missing.join(" ")).toContain("发布稿语境");
  });
  it("标题否决只绑定被否决候选，改正文不能绕过坏标题，改选标题则不要求另改正文", () => {
    const titles = ["手边信息不足让我核对", "正式安排"];
    const body = "按单位通知安排出勤。";
    const stepTrace = [{ meta: { publicationCheck: { policy: "reader-facing-v1", passed: false,
      bodyHash: createHash("sha256").update(body).digest("hex"),
      titleHashes: titles.map(title => createHash("sha256").update(title).digest("hex")),
      issues: [{ field: "titles[0]", excerpt: titles[0] }],
    } } }];
    expect(findArticlePublicationTextIssue({ titles, titleIndex: 0, humanMarkdown: body, stepTrace })).toContain("否决");
    expect(findArticlePublicationTextIssue({ titles, titleIndex: 0, humanMarkdown: "另一个正常正文。", stepTrace })).toContain("否决");
    expect(findArticlePublicationTextIssue({ titles, titleIndex: 1, humanMarkdown: body, stepTrace })).toBeNull();
  });
  it("未发送的评论被否决不误伤已选标题和正式正文", () => {
    const body = "按单位通知安排出勤。";
    expect(findArticlePublicationTextIssue({ titles: ["正式安排"], humanMarkdown: body, stepTrace: [{ meta: { publicationCheck: {
      policy: "reader-facing-v1", passed: false, bodyHash: createHash("sha256").update(body).digest("hex"),
      issues: [{ field: "comments[0].author_reply", excerpt: dirty }],
    } } }] })).toBeNull();
  });
  it("语义专项已否决的同一正文不能靠固定结语或风险确认绕过，修正正文后旧结论失效", () => {
    const body = "手边提供给我的这些信息，还不足以让我完成核对。";
    const stepTrace = [{ meta: { publicationCheck: { policy: "reader-facing-v1", passed: false, bodyHash: createHash("sha256").update(body).digest("hex") } } }];
    expect(findArticlePublicationTextIssue({ titles: ["事件"], humanMarkdown: `${body}\n\n跪求点赞、关注。`, stepTrace })).toContain("否决");
    expect(findArticlePublicationTextIssue({ titles: ["事件"], humanMarkdown: "按正式通知中的日期安排出勤。", stepTrace })).toBeNull();
  });
});
