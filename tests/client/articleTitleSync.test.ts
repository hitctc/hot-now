import { describe, expect, it } from "vitest";

import {
  buildArticleTitleSync,
  readFirstH1,
  replaceFirstH1,
} from "../../src/client/components/creative/article-detail/articleTitleSync.js";

describe("article title sync", () => {
  it("only replaces the first H1 and preserves matching body text", () => {
    const markdown = "# 旧标题\n\n正文里还有旧标题";

    expect(replaceFirstH1(markdown, "新标题")).toBe("# 新标题\n\n正文里还有旧标题");
    expect(readFirstH1("正文\n# 标题")).toBe("标题");
  });

  it("inserts an H1 when the manual draft has no title", () => {
    expect(replaceFirstH1("正文", "手动标题")).toBe("# 手动标题\n\n正文");
  });

  it("keeps manual articles on their only title without rewriting the AI draft", () => {
    const result = buildArticleTitleSync({
      isManualArticle: true,
      titles: ["旧标题"],
      activeTitleIndex: 0,
      humanMarkdown: "# 手动标题\n\n人工正文",
      contentMarkdown: "# 素材草稿\n\n左栏内容",
    });

    expect(result.titles).toEqual(["手动标题"]);
    expect(result.humanMarkdown).toContain("# 手动标题");
    expect(result.contentMarkdown).toBeUndefined();
    expect(result.fields).toEqual({
      humanMarkdown: "# 手动标题\n\n人工正文",
      titles: ["手动标题"],
    });
  });

  it("uses the selected pipeline title when the human content has no H1", () => {
    const result = buildArticleTitleSync({
      isManualArticle: false,
      titles: ["候选一", "已选发布标题"],
      activeTitleIndex: 1,
      humanMarkdown: "人工正文",
      contentMarkdown: "# 旧 AI 标题\n\nAI 正文",
    });

    expect(result.title).toBe("已选发布标题");
    expect(result.humanMarkdown).toBe("# 已选发布标题\n\n人工正文");
    expect(result.contentMarkdown).toBe("# 已选发布标题\n\nAI 正文");
  });
});
