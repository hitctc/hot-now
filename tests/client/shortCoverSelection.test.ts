import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ArticleImageWorkflowSections from "../../src/client/components/creative/article-detail/ArticleImageWorkflowSections.vue";
import CodeImageCardsSection from "../../src/client/components/creative/article-detail/CodeImageCardsSection.vue";
import type { CreativeFinishedArticle } from "../../src/client/services/creativeApi.js";

/** 隔离图片及提示词控件，仅检查封面动作的长短边界、可见样式和原事件。 */
function mountCovers(direction: "article" | "short_content", readonly = false) {
  return mount(ArticleImageWorkflowSections, { props: {
    article: { direction } as CreativeFinishedArticle, readonly, articleImages: [], displayCoverImages: ["/wide.png", "/square.png"], activeCoverIndex: 1,
    inlineImageSlotCount: 0, totalImageSlotCount: 0, coverPromptGenerating: false, inlinePromptsGenerating: false, inlinePromptGeneratingIndex: null,
    uploadingCover: false, uploadingInline: new Set<number>(), lunaImageEligible: false, lunaImageJobs: {},
  }, global: { stubs: { EditablePromptRow: true, OperationCapabilityBadge: true, "a-button": true, "a-image": true, "a-image-preview-group": { template: "<div><slot /></div>" } } } });
}

describe("短内容封面动作", () => {
  it("短内容用常驻的大按钮，保持原封面选择事件且突出当前封面", async () => {
    const wrapper = mountCovers("short_content");
    const button = wrapper.get("button");
    expect(button.classes()).toContain("min-h-[44px]");
    expect(button.classes()).toContain("w-full");
    expect(button.classes()).not.toContain("absolute");
    expect(button.element.parentElement?.classList.contains("opacity-60")).toBe(false);
    expect(wrapper.text()).toContain("当前发布封面");
    expect(wrapper.get(".article-cover-current").classes()).toEqual(expect.arrayContaining(["border-emerald-600", "bg-emerald-50", "text-emerald-800"]));
    expect(wrapper.get(".article-cover-current").classes()).not.toContain("bg-violet-700");
    expect(button.classes()).toContain("bg-violet-600");
    expect(wrapper.findAll(".article-cover-card")[1]!.classes()).toContain("border-emerald-600");
    await button.trigger("click");
    expect(wrapper.emitted("select-cover")).toEqual([[0]]);
    wrapper.unmount();
  });
  it("长内容保留原叠加小按钮和透明度，短内容只读时不能选择", () => {
    const long = mountCovers("article");
    expect(long.get(".article-cover-current").classes()).toContain("bg-emerald-50");
    expect(long.get("button").classes()).toContain("absolute");
    expect(long.get("button").element.parentElement?.classList.contains("opacity-60")).toBe(true);
    long.unmount();
    const readonly = mountCovers("short_content", true);
    expect(readonly.find("button").exists()).toBe(false);
    readonly.unmount();
  });
  it("三列布局保留三个及更多封面候选，不改变候选编号和预览入口", async () => {
    const wrapper = mountCovers("short_content");
    try {
      await wrapper.setProps({ displayCoverImages: ["/wide.png", "/square.png", "/portrait.png"] });
      expect(wrapper.get(".article-cover-grid").findAll(".article-cover-card")).toHaveLength(3);
      expect(wrapper.findAll(".article-cover-image")).toHaveLength(3);
      await wrapper.setProps({ displayCoverImages: ["/wide.png", "/square.png", "/portrait.png", "/uploaded.png"] });
      expect(wrapper.findAll(".article-cover-card")).toHaveLength(4);
      await wrapper.findAll(".article-cover-select")[2]!.trigger("click");
      expect(wrapper.emitted("select-cover")).toEqual([[3]]);
    } finally { wrapper.unmount(); }
  });
  it("短内容说明不再宣称写入正文，方图标为默认封面；长内容用途保持", () => {
    for (const direction of ["short_content", "article"] as const) {
      const wrapper = mount(CodeImageCardsSection, { props: { article: { direction, codeImageCards: [] } as unknown as CreativeFinishedArticle, generating: false, readonly: true }, global: { stubs: { "a-image-preview-group": { template: "<div><slot /></div>" } } } });
      if (direction === "short_content") {
        expect(wrapper.text()).toContain("不自动插入正文");
        expect(wrapper.text()).toContain("默认发布封面");
      } else { expect(wrapper.text()).toContain("公众号主封面"); }
      wrapper.unmount();
    }
  });
});
