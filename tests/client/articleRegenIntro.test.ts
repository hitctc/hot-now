import { message } from "ant-design-vue";
import { computed, nextTick, ref, reactive } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useArticlePlanningActions } from "../../src/client/components/creative/article-detail/useArticlePlanningActions.js";
import { editFinishedArticle, regenIntro, type CreativeFinishedArticle } from "../../src/client/services/creativeApi.js";

vi.mock("../../src/client/services/creativeApi.js", () => ({ regenIntro: vi.fn(), editFinishedArticle: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

/** 用真实组合式逻辑复现导语生成后版本变更和详情同步的消息反馈。 */
function setup() {
  const article = reactive({ id: 42, intros: ["旧导语"], updatedAt: "before", contentMarkdown: "# 标题\n\n> 旧导语\n\n正文" }) as unknown as CreativeFinishedArticle;
  const editContent = ref(article.contentMarkdown);
  const order: string[] = [];
  const actions = useArticlePlanningActions({
    getArticle: () => article,
    isManualArticle: computed(() => false), editContent, humanContent: ref(""), activePreviewTheme: ref("live"),
    themeIdMap: { classic: "classic", bauhaus: "bauhaus", sunsetFilm: "sunset-film", receipt: "receipt", blackGold: "black-gold" },
    prepareExplicitContentSave: vi.fn(async () => { order.push("flush"); }),
    getLastSavedContent: () => "", setLastSavedContent: vi.fn(),
    getLastSavedHuman: () => "", setLastSavedHuman: vi.fn(), onSaved: vi.fn(),
  });
  return { article, actions, order };
}

describe("详情新导语生成", () => {
  it("生成前先收口正文保存，再用代理返回的新版本同步导语", async () => {
    const { actions, order } = setup();
    vi.mocked(regenIntro).mockImplementation(async () => { order.push("generate"); return { ok: true, intros: ["新导语", "旧导语"], updatedAt: "after-generate" }; });
    vi.mocked(editFinishedArticle).mockResolvedValue({ updatedAt: "after-sync" } as Awaited<ReturnType<typeof editFinishedArticle>>);
    vi.spyOn(message, "success").mockImplementation(() => ({}) as never);

    await actions.handleRegenIntro();
    await nextTick();
    expect(order).toEqual(["flush", "generate"]);
    expect(editFinishedArticle).toHaveBeenCalledWith(42, expect.objectContaining({ expectedUpdatedAt: "after-generate" }));
    expect(message.success).toHaveBeenCalledWith("新导语已生成");
  });

  it("导语已生成但正文同步冲突时不误报生成请求失败", async () => {
    const { actions } = setup();
    vi.mocked(regenIntro).mockResolvedValue({ ok: true, intros: ["新导语", "旧导语"], updatedAt: "after-generate" });
    vi.mocked(editFinishedArticle).mockRejectedValue(new Error("article-revision-conflict"));
    vi.spyOn(message, "error").mockImplementation(() => ({}) as never);
    vi.spyOn(message, "warning").mockImplementation(() => ({}) as never);

    await actions.handleRegenIntro();
    expect(message.warning).toHaveBeenCalledWith(expect.stringContaining("导语已生成"));
    expect(message.error).not.toHaveBeenCalledWith("导语生成请求失败");
  });
});
