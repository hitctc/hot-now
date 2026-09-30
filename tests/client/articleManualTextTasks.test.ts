import { computed, effectScope, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { message } from "ant-design-vue";
import { useArticlePlanningActions } from "../../src/client/components/creative/article-detail/useArticlePlanningActions.js";
import { saveManualTextTask } from "../../src/client/components/creative/article-detail/manualTextTaskWait.js";
import { getManualTextTaskStatus, regenCodeImageKeywords, regenTitle, type CreativeFinishedArticle } from "../../src/client/services/creativeApi.js";

vi.mock("../../src/client/services/creativeApi.js", () => ({ regenTitle: vi.fn(), regenCodeImageKeywords: vi.fn(), getManualTextTaskStatus: vi.fn(), editFinishedArticle: vi.fn(), regenIntro: vi.fn(), getRegenIntroStatus: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); localStorage.clear(); });

describe("详情人工文案任务恢复", () => {
  it("重新打开恢复标签查询，不重新提交，也不覆盖未保存正文", async () => {
    vi.useFakeTimers();
    vi.spyOn(message, "info").mockImplementation(() => undefined as never);
    vi.spyOn(message, "success").mockImplementation(() => undefined as never);
    const article = { id: 42, updatedAt: "before", humanMarkdown: "未保存正文", contentMarkdown: "原始正文" } as CreativeFinishedArticle;
    saveManualTextTask(42, "keywords", "original-task");
    vi.mocked(getManualTextTaskStatus).mockResolvedValue({ ok: true, status: "done", article: { ...article, humanMarkdown: "服务器正文", codeImageKeywords: ["标签"], codeImageCards: [], updatedAt: "after" } });
    const save = vi.fn();
    const scope = effectScope();
    scope.run(() => useArticlePlanningActions({
      getArticle: () => article, isManualArticle: computed(() => false), editContent: ref("原始正文"), humanContent: ref("未保存正文"), activePreviewTheme: ref("live"),
      themeIdMap: { classic: "classic", bauhaus: "bauhaus", sunsetFilm: "sunset-film", receipt: "receipt", blackGold: "black-gold" },
      prepareExplicitContentSave: save, getLastSavedContent: () => "", setLastSavedContent: vi.fn(), getLastSavedHuman: () => "", setLastSavedHuman: vi.fn(), onSaved: vi.fn(),
    }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(regenCodeImageKeywords).not.toHaveBeenCalled();
    expect(regenTitle).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(article.codeImageKeywords).toEqual(["标签"]);
    expect(article.updatedAt).toBe("after");
    expect(article.humanMarkdown).toBe("未保存正文");
    scope.stop();
  });
});
