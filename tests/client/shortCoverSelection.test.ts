import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
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
  }, global: { stubs: { EditablePromptRow: true, OperationCapabilityBadge: true, "a-button": { template: '<button><slot /></button>' }, "a-image": true, "a-image-preview-group": { template: "<div><slot /></div>" } } } });
}

describe("短内容封面动作", () => {
  it.each(["article", "short_content"] as const)("%s代码图与封面按地址合并，选图使用原索引且保留制作/下载/复制", async direction => {
    const wrapper = mountCovers(direction);
    try {
      await wrapper.setProps({ article: { direction, codeImageCards: [
        { variant: "2.5:1", status: "succeeded", url: "/wide.png", width: 1500, height: 600 },
        { variant: "1:1", status: "stale", url: "/square.png", width: 1500, height: 1500 },
        { variant: "3:4", status: "succeeded", url: "/portrait.png", width: 1500, height: 2000 },
      ] } as unknown as CreativeFinishedArticle,
        displayCoverImages: ["/uploaded.png", "/square.png", "/wide.png", "/portrait.png", "/uploaded.png"], activeCoverIndex: 1 });
      expect(wrapper.findAll("[data-image-cover-section]")).toHaveLength(1);
      expect(wrapper.findAll(".article-cover-card")).toHaveLength(4);
      expect(wrapper.findAll(".article-cover-image")).toHaveLength(4);
      const wide = wrapper.get('[data-code-image-card="2.5:1"]');
      await wide.get(".article-cover-select").trigger("click");
      expect(wrapper.emitted("select-cover")).toEqual([[2]]);
      await wide.findAll("button").find(button => button.text() === "复制图片地址")!.trigger("click");
      expect(wrapper.emitted("copy-code-image-url")).toEqual([["/wide.png"]]);
      expect(wide.get("a[download]").attributes("href")).toBe("/wide.png");
      await wrapper.get("[data-code-image-regenerate]").trigger("click");
      expect(wrapper.emitted("generate-code-images")).toEqual([["all"]]);
      expect(wrapper.get('[data-code-image-card="1:1"] .article-cover-current').text()).toContain("当前发布封面");
      expect(wrapper.get("[data-code-image-stale-notice]").text()).toContain("建议重新制作");
    } finally { wrapper.unmount(); }
  });
  it("折叠后仍可上传和生成封面提示词，生成中禁止重复制图", async () => {
    const wrapper = mountCovers("short_content");
    try {
      await wrapper.setProps({ codeImagesGenerating: true });
      expect(wrapper.get("[data-code-image-regenerate]").attributes("disabled")).toBeDefined();
      await wrapper.getComponent(CodeImageCardsSection).get('[aria-expanded]').trigger("click");
      const file = new File(["image"], "cover.png", { type: "image/png" });
      const input = wrapper.get('input[type="file"]');
      Object.defineProperty(input.element, "files", { value: [file], configurable: true });
      await input.trigger("change");
      const event = wrapper.emitted("upload-cover")![0]![0] as Event;
      expect(event.target).toBe(input.element);
      expect((event.target as HTMLInputElement).files![0]).toBe(file);
      await wrapper.findAll("button").find(button => button.text() === "生成封面提示词")!.trigger("click");
      expect(wrapper.emitted("generate-cover-prompt")).toEqual([[]]);
    } finally { wrapper.unmount(); localStorage.clear(); }
  });
  it.each(["article", "short_content"] as const)("%s当前封面高亮随索引切换，重复候选及只读时仍只有一个标识", async direction => {
    const wrapper = mountCovers(direction);
    try {
      expect(wrapper.findAll('[aria-current="true"]')).toHaveLength(1);
      expect(wrapper.findAll(".article-cover-card")[1]!.attributes("aria-current")).toBe("true");
      await wrapper.setProps({ activeCoverIndex: 0 });
      expect(wrapper.findAll(".article-cover-card")[0]!.classes()).toContain("article-cover-card--selected");
      expect(wrapper.findAll(".article-cover-card")[1]!.classes()).not.toContain("article-cover-card--selected");
      expect(wrapper.findAll(".article-cover-current")).toHaveLength(1);
      await wrapper.setProps({ readonly: true, displayCoverImages: ["/wide.png", "/square.png", "/square.png"], activeCoverIndex: 2 });
      expect(wrapper.findAll(".article-cover-card")).toHaveLength(2);
      expect(wrapper.findAll('[aria-current="true"]')).toHaveLength(1);
      expect(wrapper.findAll(".article-cover-card")[1]!.get(".article-cover-current-label").text()).toBe("当前发布封面");
      expect(wrapper.find(".article-cover-select").exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });
  it("当前封面使用粗绿框、深绿白字与大勾选，不遮盖缩略图", () => {
    const section = readFileSync("src/client/components/creative/article-detail/CodeImageCardsSection.vue", "utf8");
    expect(section).toContain("box-shadow: 0 0 0 3px #059669");
    expect(section).toMatch(/\.article-cover-card--selected \.article-cover-current\s*\{[^}]*background-color: #047857;[^}]*color: #ffffff;[^}]*font-weight: 800;/);
    expect(section).toMatch(/\.article-cover-current-icon\s*\{[^}]*width: 26px;[^}]*height: 26px;/);
    expect(section).not.toMatch(/position:\s*absolute/);
  });
  it("仅手机压缩状态及下载复制操作，桌面仍保留原尺寸", () => {
    const source = readFileSync("src/client/components/creative/article-detail/CodeImageCardsSection.vue", "utf8");
    const styles = source.split("<style scoped>")[1]!.split("</style>")[0]!;
    const desktop = styles.split("@media")[0]!;
    const mobile = styles.match(/@media \(max-width: 768px\) \{([\s\S]*)\}/)?.[1] ?? "";
    // DOM替身不计算真实手机排版，锁定媒体查询约束；实际窄屏效果仍需浏览器验收。
    expect(mobile).toMatch(/\.article-cover-card--selected \.article-cover-current,\s*\.article-cover-select\s*\{[^}]*height: 44px;[^}]*min-height: 44px;/);
    expect(mobile).toMatch(/\.article-cover-card--selected \.article-cover-current\s*\{[^}]*flex-wrap: nowrap;[^}]*font-size: clamp\(9px, 2\.6vw, 11px\);/);
    expect(mobile).toMatch(/\.article-cover-current-icon\s*\{[^}]*width: 12px;[^}]*height: 12px;/);
    expect(mobile).toMatch(/\.article-cover-current-label\s*\{[^}]*white-space: nowrap;/);
    expect(mobile).toMatch(/\.article-cover-actions > a,\s*\.article-cover-actions > button\s*\{[^}]*height: 24px;[^}]*min-height: 24px;[^}]*padding: 0;/);
    expect(desktop).toContain("min-height: 60px;");
    expect(desktop).toContain("width: 26px;");
    expect(desktop).not.toContain(".article-cover-actions");
    const wrapper = mountCovers("short_content");
    try {
      const actions = wrapper.get(".article-cover-actions");
      expect(actions.get("a").classes()).toContain("min-h-[44px]");
      expect(actions.get("button").classes()).toContain("min-h-[44px]");
    } finally { wrapper.unmount(); }
  });
  it("缩略图按预算缩放，不新增内部滚动或重复独立区块", () => {
    const section = readFileSync("src/client/components/creative/article-detail/CodeImageCardsSection.vue", "utf8");
    expect(section).toContain("height: min(160px, calc(min(440px, 60vh) / 2))");
    expect(section).not.toMatch(/overflow(?:-y)?:\s*(auto|scroll)/);
    const drawer = readFileSync("src/client/components/creative/ArticleDetailDrawer.vue", "utf8");
    expect(drawer).not.toContain("<CodeImageCardsSection");
    expect(drawer).toContain('@generate-code-images="handleGenerateCodeImages"');
  });
  it("短内容用常驻的大按钮，保持原封面选择事件且突出当前封面", async () => {
    const wrapper = mountCovers("short_content");
    const button = wrapper.get(".article-cover-select");
    expect(button.classes()).toContain("min-h-[44px]");
    expect(button.classes()).toContain("w-full");
    expect(button.classes()).not.toContain("absolute");
    expect(button.element.parentElement?.classList.contains("opacity-60")).toBe(false);
    expect(wrapper.text()).toContain("当前发布封面");
    expect(wrapper.get(".article-cover-current").attributes("role")).toBe("status");
    expect(wrapper.get(".article-cover-current-icon").text()).toBe("✓");
    expect(wrapper.get(".article-cover-current-icon").attributes("aria-hidden")).toBe("true");
    expect(button.classes()).toContain("bg-violet-600");
    expect(wrapper.findAll(".article-cover-card")[1]!.classes()).toContain("article-cover-card--selected");
    await button.trigger("click");
    expect(wrapper.emitted("select-cover")).toEqual([[0]]);
    wrapper.unmount();
  });
  it("长短内容共用常驻封面选择，只读时不能选择或制作", () => {
    const long = mountCovers("article");
    expect(long.get('[aria-current="true"]').classes()).toContain("article-cover-card--selected");
    expect(long.get(".article-cover-select").classes()).not.toContain("absolute");
    expect(long.get(".article-cover-select").classes()).toContain("min-h-[44px]");
    long.unmount();
    const readonly = mountCovers("short_content", true);
    expect(readonly.find(".article-cover-select").exists()).toBe(false);
    expect(readonly.find("[data-code-image-regenerate]").exists()).toBe(false);
    expect(readonly.text()).toContain("下载图片");
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
      const wrapper = mount(CodeImageCardsSection, { props: { article: { direction, codeImageCards: [] } as unknown as CreativeFinishedArticle, generating: false, readonly: true }, global: { stubs: { "a-button": true, "a-image": true, "a-image-preview-group": { template: "<div><slot /></div>" } } } });
      if (direction === "short_content") {
        expect(wrapper.text()).toContain("不自动插入正文");
        expect(wrapper.text()).toContain("默认发布封面");
      } else { expect(wrapper.text()).toContain("公众号主封面"); }
      wrapper.unmount();
    }
  });
});
