import { ref } from "vue";
import { describe, expect, it } from "vitest";

import { syncArticleEditorContent } from "../../src/client/components/creative/article-detail/articleDetailContentSync.js";
import type { CreativeFinishedArticle } from "../../src/client/services/creativeApi.js";

function article(overrides: Partial<CreativeFinishedArticle> = {}): CreativeFinishedArticle {
  return {
    id: 16212,
    contentMarkdown: "服务端 AI 正文",
    humanMarkdown: "服务端人工正文",
    ...overrides,
  } as CreativeFinishedArticle;
}

describe("article detail content sync", () => {
  it("图片写回后立即同步服务端最新正文", () => {
    const editContent = ref("旧 AI 正文");
    const humanContent = ref("旧人工正文");
    let lastSavedContent = "旧 AI 正文";
    let lastSavedHuman = "旧人工正文";

    const result = syncArticleEditorContent({
      article: article({
        contentMarkdown: "新 AI 正文\n\n![配图1](https://img.test/1.png)",
        humanMarkdown: "新人工正文\n\n![配图1](https://img.test/1.png)",
      }),
      editContent,
      humanContent,
      getLastSavedContent: () => lastSavedContent,
      setLastSavedContent: (value) => { lastSavedContent = value; },
      getLastSavedHuman: () => lastSavedHuman,
      setLastSavedHuman: (value) => { lastSavedHuman = value; },
    });

    expect(result).toEqual({ draftSynced: true, humanSynced: true });
    expect(editContent.value).toContain("![配图1]");
    expect(humanContent.value).toContain("![配图1]");
    expect(lastSavedContent).toBe(editContent.value);
    expect(lastSavedHuman).toBe(humanContent.value);
  });

  it("服务端刷新不能覆盖用户尚未保存的正文", () => {
    const editContent = ref("用户正在编辑 AI 正文");
    const humanContent = ref("用户正在编辑人工正文");
    let lastSavedContent = "旧 AI 正文";
    let lastSavedHuman = "旧人工正文";

    const result = syncArticleEditorContent({
      article: article(),
      editContent,
      humanContent,
      getLastSavedContent: () => lastSavedContent,
      setLastSavedContent: (value) => { lastSavedContent = value; },
      getLastSavedHuman: () => lastSavedHuman,
      setLastSavedHuman: (value) => { lastSavedHuman = value; },
    });

    expect(result).toEqual({ draftSynced: false, humanSynced: false });
    expect(editContent.value).toBe("用户正在编辑 AI 正文");
    expect(humanContent.value).toBe("用户正在编辑人工正文");
  });
});
