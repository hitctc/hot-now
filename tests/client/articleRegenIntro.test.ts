import { message } from "ant-design-vue";
import { computed, nextTick, ref, reactive } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useArticlePlanningActions } from "../../src/client/components/creative/article-detail/useArticlePlanningActions.js";
import { editFinishedArticle, getRegenIntroStatus, regenIntro, type CreativeFinishedArticle } from "../../src/client/services/creativeApi.js";

vi.mock("../../src/client/services/creativeApi.js", () => ({ regenIntro: vi.fn(), getRegenIntroStatus: vi.fn(), editFinishedArticle: vi.fn() }));

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

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
  it("排队时使用短轮询等待回调入库，完成前不会再次发起生成或修改正文", async () => {
    vi.useFakeTimers();
    const { actions } = setup();
    vi.mocked(regenIntro).mockResolvedValue({ ok: true, taskId: "intro-42", status: "queued" });
    vi.mocked(getRegenIntroStatus).mockResolvedValueOnce({ ok: true, status: "writing" })
      .mockResolvedValueOnce({ ok: true, status: "done", intros: ["新导语", "旧导语"], updatedAt: "after-callback" });
    vi.mocked(editFinishedArticle).mockResolvedValue({ updatedAt: "after-sync" } as Awaited<ReturnType<typeof editFinishedArticle>>);
    vi.spyOn(message, "info").mockImplementation(() => ({}) as never);
    vi.spyOn(message, "success").mockImplementation(() => ({}) as never);

    const pending = actions.handleRegenIntro();
    await vi.waitFor(() => expect(regenIntro).toHaveBeenCalledTimes(1));
    expect(editFinishedArticle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(6000);
    await pending;
    expect(getRegenIntroStatus).toHaveBeenCalledTimes(2);
    expect(editFinishedArticle).toHaveBeenCalledTimes(1);
    expect(message.success).toHaveBeenCalledWith("新导语已生成");
  });
  it("队列明确失败时显示原因，不写回旧导语", async () => {
    vi.useFakeTimers();
    const { actions } = setup();
    vi.mocked(regenIntro).mockResolvedValue({ ok: true, taskId: "intro-42", status: "queued" });
    vi.mocked(getRegenIntroStatus).mockResolvedValue({ ok: false, status: "failed", reason: "模型不可用" });
    vi.spyOn(message, "info").mockImplementation(() => ({}) as never);
    vi.spyOn(message, "error").mockImplementation(() => ({}) as never);
    const pending = actions.handleRegenIntro();
    await vi.waitFor(() => expect(regenIntro).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(3000);
    await pending;
    expect(message.error).toHaveBeenCalledWith("模型不可用");
    expect(editFinishedArticle).not.toHaveBeenCalled();
  });

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
