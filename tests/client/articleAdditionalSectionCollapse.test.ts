import { mount } from "@vue/test-utils";
import { Image } from "ant-design-vue";
import { afterEach, describe, expect, it } from "vitest";
import ArticleSimilaritySection from "../../src/client/components/creative/article-detail/ArticleSimilaritySection.vue";
import ArticleImageWorkflowSections from "../../src/client/components/creative/article-detail/ArticleImageWorkflowSections.vue";
import StepTraceTimeline from "../../src/client/components/creative/StepTraceTimeline.vue";
import type { CreativeFinishedArticle } from "../../src/client/services/creativeApi.js";

const global = { components: { "a-image-preview-group": Image.PreviewGroup }, stubs: {
  "a-button": { template: "<button><slot /></button>" }, "a-tooltip": { template: "<span><slot /></span>" },
  "a-image": true, EditablePromptRow: true, OperationCapabilityBadge: true,
} };

/** 挂载真实区块，配图使用真实多根预览组件，折叠必须隐藏实际内容而不卸载。 */
function mountSection(section: string, direction: string) {
  if (section === "similarity") return mount(ArticleSimilaritySection, { attachTo: document.body, props: {
    direction, isManualArticle: false, articleId: 1, similarityCheck: { risk_level: "high", literal_similarity: 0.3 },
  }, global });
  if (section === "writing-flow") return mount(StepTraceTimeline, { attachTo: document.body, props: {
    direction, stepTrace: [{ step: 1, stepName: "事实核验", status: "failed" }], stopStep: 1, reasonText: "事实证据不足",
  }, global });
  return mount(ArticleImageWorkflowSections, { attachTo: document.body, props: {
    article: { direction, inlineImagePrompts: { "1": "正文图片提示词" } } as unknown as CreativeFinishedArticle,
    readonly: true, articleImages: ["/image.png"], displayCoverImages: [], activeCoverIndex: 0,
    inlineImageSlotCount: 1, totalImageSlotCount: 1, coverPromptGenerating: false, inlinePromptsGenerating: false,
    inlinePromptGeneratingIndex: null, uploadingCover: false, uploadingInline: new Set<number>(), lunaImageEligible: false, lunaImageJobs: {},
  }, global });
}

afterEach(() => localStorage.clear());

describe("更多详情区块独立折叠", () => {
  it.each(["similarity", "writing-flow", "inline-images"])("%s 重开恢复折叠与展开，且长短内容互不影响", async section => {
    let wrapper = mountSection(section, "short_content");
    try {
      expect(wrapper.get(`[data-${section}-content]`).isVisible()).toBe(true);
      await wrapper.get(`[data-${section}-collapse]`).trigger("click");
      expect(wrapper.get(`[data-${section}-content]`).isVisible()).toBe(false);
      expect(localStorage.getItem(`creative-article-detail:short_content:${section}:collapsed`)).toBe("1");
      wrapper.unmount();
      wrapper = mountSection(section, "article");
      expect(wrapper.get(`[data-${section}-content]`).isVisible()).toBe(true);
      wrapper.unmount();
      wrapper = mountSection(section, "short_content");
      expect(wrapper.get(`[data-${section}-content]`).isVisible()).toBe(false);
      await wrapper.get(`[data-${section}-collapse]`).trigger("click");
      wrapper.unmount();
      wrapper = mountSection(section, "short_content");
      expect(wrapper.get(`[data-${section}-content]`).isVisible()).toBe(true);
    } finally { wrapper.unmount(); }
  });

  it("写作流程收起仍显示中止原因，不销毁步骤列表", async () => {
    const wrapper = mountSection("writing-flow", "article");
    try {
      await wrapper.get('[data-writing-flow-collapse]').trigger("click");
      expect(wrapper.get('[data-writing-flow-content]').isVisible()).toBe(false);
      expect(wrapper.text()).toContain("事实核验");
      expect(wrapper.findAll("div").find(item => item.classes().includes("border-orange-400"))?.isVisible()).toBe(true);
      expect(wrapper.text()).toContain("事实证据不足");
    } finally { wrapper.unmount(); }
  });

  it("未检测记录也可收起，手动文章仍不显示相似度区块", async () => {
    const wrapper = mount(ArticleSimilaritySection, { attachTo: document.body, props: { articleId: 1, direction: "article", isManualArticle: false, similarityCheck: null }, global });
    try {
      expect(wrapper.get('[data-similarity-content]').text()).toBe("未检测");
      await wrapper.get('[data-similarity-collapse]').trigger("click");
      expect(wrapper.get('[data-similarity-content]').isVisible()).toBe(false);
      await wrapper.setProps({ isManualArticle: true });
      expect(wrapper.find("section").exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });
});
