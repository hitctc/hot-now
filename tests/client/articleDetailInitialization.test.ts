import { flushPromises, shallowMount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import ArticleDetailDrawer from "../../src/client/components/creative/ArticleDetailDrawer.vue";
import SourceItemDetailModal from "../../src/client/components/creative/SourceItemDetailModal.vue";
import ArticleEditorPanel from "../../src/client/components/creative/article-detail/ArticleEditorPanel.vue";
import ArticleDetailFooter from "../../src/client/components/creative/article-detail/ArticleDetailFooter.vue";
import ArticleSupplementalSections from "../../src/client/components/creative/article-detail/ArticleSupplementalSections.vue";
import * as api from "../../src/client/services/creativeApi.js";
import * as renderer from "../../src/client/services/wechatRenderer.js";
import type { CreativeFinishedArticle, CreativeSourceItem } from "../../src/client/services/creativeApi.js";

/** 提供不触发模型或图片查询的合成稿件，测试首次已就绪的异步挂载边界。 */
function article(id = 42, sourceItemId: number | null = null): CreativeFinishedArticle {
  return { id, sourceItemId, status: "manual_draft", originType: "manual", direction: "article", titles: '["标题"]', contentMarkdown: "AI 正文", humanMarkdown: "人工正文", imagesJson: null, coverImage: [], stepTrace: [] } as unknown as CreativeFinishedArticle;
}

/** 实际详情组件只替换视觉子组件，保留初始化、保存和读取控制器。 */
function mountDrawer(open: boolean, value: CreativeFinishedArticle | null) {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const wrapper = shallowMount(ArticleDetailDrawer, { props: { open, article: value, readonly: true,
    "onUpdate:open": (next: boolean) => { if (!next) void wrapper.setProps({ open: false, article: null }); },
  }, global: { stubs: {
    "a-modal": { template: '<div><button data-test="close" @click="$emit(\'cancel\')">close</button><slot name="title" /><slot /><slot name="footer" /></div>' }, "a-spin": true,
  } } });
  return wrapper;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("article detail initialization", () => {
  it("loads source details when a lazy modal is first mounted with a visible source", async () => {
    const read = vi.spyOn(api, "readCreativeSourceItem").mockResolvedValue({ id: 5, title: "首开素材" } as api.CreativeSourceItem);
    const wrapper = shallowMount(SourceItemDetailModal, { props: { visible: true, sourceItemId: 5 }, global: { stubs: {
      "a-modal": { template: "<div><slot /></div>" }, "a-spin": { template: "<div><slot /></div>" },
      "a-descriptions": true, "a-descriptions-item": true, "a-tag": true,
    } } });
    await flushPromises();
    expect(read).toHaveBeenCalledWith(5);
    expect(wrapper.text()).toContain("首开素材");
    wrapper.unmount();
  });

  it("explicitly disables both dialog and mask motion for every detail entry", () => {
    const wrapper = mountDrawer(true, article());
    try {
      const modal = wrapper.get('[data-test="close"]').element.parentElement!;
      expect(modal.getAttribute("transition-name")).toBe("");
      expect(modal.getAttribute("mask-transition-name")).toBe("");
    } finally { wrapper.unmount(); }
  });

  it("initializes both text panes when mounted with an already-open article", async () => {
    const wrapper = mountDrawer(true, article());
    await flushPromises();
    expect(wrapper.findComponent(ArticleEditorPanel).props()).toMatchObject({ humanContent: "人工正文", aiDraft: "AI 正文" });
    wrapper.unmount();
  });

  it("短稿发布栏补结尾并保存，AI草稿不追加且连续保存不重复", async () => {
    const value = { ...article(), direction: "short_content", humanMarkdown: "# 标题\n\n发布正文" };
    const save = vi.spyOn(api, "editFinishedArticle").mockResolvedValue({ ok: true });
    const wrapper = mountDrawer(true, value);
    try {
      await flushPromises();
      expect(wrapper.findComponent(ArticleEditorPanel).props("humanContent")).toBe("# 标题\n\n发布正文\n\n跪求点赞、关注。");
      expect(wrapper.findComponent(ArticleEditorPanel).props("aiDraft")).toBe("AI 正文");
      await wrapper.setProps({ readonly: false });
      wrapper.findComponent(ArticleDetailFooter).vm.$emit("save");
      await flushPromises();
      wrapper.findComponent(ArticleDetailFooter).vm.$emit("save");
      await flushPromises();
      expect(save).toHaveBeenCalled();
      for (const [, fields] of save.mock.calls) {
        expect(fields.humanMarkdown).toBe("# 标题\n\n发布正文\n\n跪求点赞、关注。");
        expect(fields.contentMarkdown).not.toContain("跪求点赞");
      }
    } finally { wrapper.unmount(); }
  });

  it("saves the latest draft on close even when the parent clears the article immediately", async () => {
    const save = vi.spyOn(api, "editFinishedArticle").mockResolvedValue({ ok: true });
    const wrapper = mountDrawer(true, article());
    await wrapper.setProps({ readonly: false });
    wrapper.findComponent(ArticleEditorPanel).vm.$emit("update:human-content", "关闭前的最新人工稿");
    await flushPromises();
    await wrapper.get('[data-test="close"]').trigger("click");
    await flushPromises();
    expect(save).toHaveBeenCalledWith(42, { humanMarkdown: "关闭前的最新人工稿" });
    expect(save).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("keeps the latest draft open when close-time saving fails and allows retry", async () => {
    const save = vi.spyOn(api, "editFinishedArticle").mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: true });
    const wrapper = mountDrawer(true, article());
    await wrapper.setProps({ readonly: false });
    wrapper.findComponent(ArticleEditorPanel).vm.$emit("update:human-content", "失败时不能丢失的稿件");
    await flushPromises();
    await wrapper.get('[data-test="close"]').trigger("click");
    await flushPromises();
    expect(wrapper.props("open")).toBe(true);
    expect(wrapper.findComponent(ArticleEditorPanel).props("humanContent")).toBe("失败时不能丢失的稿件");
    await wrapper.get('[data-test="close"]').trigger("click");
    await flushPromises();
    expect(save).toHaveBeenLastCalledWith(42, { humanMarkdown: "失败时不能丢失的稿件" });
    expect(wrapper.props("open")).toBe(false);
    wrapper.unmount();
  });

  it("renders mobile preview only when requested and uses the latest edited text", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    const render = vi.spyOn(renderer, "renderWechatThemePreview").mockImplementation(text => `<p>${text}</p>`);
    const wrapper = mountDrawer(true, article());
    await wrapper.setProps({ readonly: false });
    render.mockClear();
    wrapper.findComponent(ArticleEditorPanel).vm.$emit("update:human-content", "最新人工正文");
    await flushPromises();
    expect(render).not.toHaveBeenCalled();
    wrapper.findComponent(ArticleEditorPanel).vm.$emit("preview-visibility-change", true);
    await flushPromises();
    expect(wrapper.findComponent(ArticleEditorPanel).props("previewHtml")).toBe("<p>最新人工正文</p>");
    wrapper.unmount();
  });

  it("keeps the new source cover when an old source response or failure arrives late", async () => {
    const reads: Array<{ resolve: (source: CreativeSourceItem) => void; reject: (error: Error) => void }> = [];
    vi.spyOn(api, "readCreativeSourceItem").mockImplementation(() => new Promise((resolve, reject) => reads.push({ resolve, reject })));
    const wrapper = mountDrawer(true, article(42, 1));
    await wrapper.setProps({ article: article(43, 2) });
    reads[1]!.resolve({ coverImageUrl: "https://image.test/new.png" } as CreativeSourceItem);
    await flushPromises();
    reads[0]!.reject(new Error("old source failure"));
    await flushPromises();
    expect(wrapper.findComponent(ArticleSupplementalSections).props("sourceCoverUrl")).toBe("https://image.test/new.png");
    await wrapper.setProps({ open: false });
    expect(wrapper.findComponent(ArticleSupplementalSections).props("sourceCoverUrl")).toBeNull();
    wrapper.unmount();
  });
});
