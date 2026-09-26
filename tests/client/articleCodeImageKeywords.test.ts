import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import ArticlePlanningSections from "../../src/client/components/creative/article-detail/ArticlePlanningSections.vue";
import type { CreativeFinishedArticle } from "../../src/client/services/creativeListApi.js";
import { mountWithApp } from "./helpers/mountWithApp.js";

/** 构造最小可用成品，只覆盖代码图片标签区域所需字段。 */
function buildArticle(overrides: Partial<CreativeFinishedArticle> = {}): CreativeFinishedArticle {
  return {
    id: 1,
    direction: "short_content",
    codeImageKeywords: null,
    titles: JSON.stringify(["示例标题"]),
    thesis: null,
    intros: null,
    summary100: null,
    ...overrides,
  } as unknown as CreativeFinishedArticle;
}

function mountSections(
  article: CreativeFinishedArticle,
  overrides: { readonly?: boolean; loading?: boolean } = {},
) {
  return mountWithApp(ArticlePlanningSections, {
    props: {
      article,
      readonly: overrides.readonly ?? false,
      isManualArticle: false,
      manualTitle: "",
      displayTitles: ["示例标题"],
      activeTitleIndex: 0,
      editingTitleIndex: null,
      editingTitleValue: "",
      regenTitleLoading: false,
      displayIntros: [],
      activeIntroIndex: 0,
      regenIntroLoading: false,
      displaySummaries: [],
      regenCodeImageKeywordsLoading: overrides.loading ?? false,
      titleCandidateAt: () => null,
    },
  });
}

describe("短内容原标题转写入口", () => {
  it("展示素材原标题并提供复制入口", () => {
    const wrapper = mountSections(buildArticle({ sourceTitle: "16岁少年强奸案，追问法定代理人到场权的落实" }));

    const sourceTitle = wrapper.get('[data-testid="short-source-original-title"]');
    expect(sourceTitle.text()).toContain("素材原标题");
    expect(sourceTitle.text()).toContain("16岁少年强奸案");
    expect(sourceTitle.text()).toContain("复制原标题");
    expect(wrapper.text()).toContain("按原标题生成");
  });

  it("缺少素材原标题时允许以现有标题生成新表达", () => {
    const wrapper = mountSections(buildArticle({ sourceTitle: null }));

    expect(wrapper.get('[data-testid="short-source-original-title"]').text()).toContain("未找到关联素材原标题");
    const button = wrapper.findAllComponents({ name: "AButton" })
      .find((component) => component.text().includes("按现有标题生成"));
    expect(button?.props("disabled")).toBe(false);
  });
});

describe("成品详情代码图片标签", () => {
  it("展示写作阶段产出的标签", () => {
    const wrapper = mountSections(buildArticle({ codeImageKeywords: ["AI监管", "算力供给"] }));

    const section = wrapper.find('[data-testid="article-code-image-keywords"]');
    expect(section.exists()).toBe(true);
    expect(section.text()).toContain("代码图片标签");
    expect(section.text()).toContain("AI监管");
    expect(section.text()).toContain("算力供给");
    expect(section.text()).not.toContain("暂无标签");
  });

  it("没有标签时仍然展示区域并提供生成入口", () => {
    const wrapper = mountSections(buildArticle({ codeImageKeywords: [] }));

    const section = wrapper.find('[data-testid="article-code-image-keywords"]');
    expect(section.exists()).toBe(true);
    expect(section.text()).toContain("暂无标签");
    expect(wrapper.find('[data-code-image-keywords-generate]').exists()).toBe(true);
  });

  it("已有标签时提供重新生成入口，并通过确认后才触发覆盖", async () => {
    const wrapper = mountSections(buildArticle({ codeImageKeywords: ["AI监管"] }));

    // 有标签时按钮包在弹层确认里，避免误点覆盖；点击按钮本身不会直接触发事件。
    const section = wrapper.findComponent(ArticlePlanningSections);
    expect(wrapper.find('[data-code-image-keywords-regenerate]').exists()).toBe(true);
    expect(wrapper.find('[data-code-image-keywords-generate]').exists()).toBe(false);
    await wrapper.find('[data-code-image-keywords-regenerate]').trigger("click");
    expect(section.emitted("regenerate-code-image-keywords")).toBeUndefined();

    const confirm = wrapper
      .findAllComponents({ name: "APopconfirm" })
      .find((component) => component.find('[data-code-image-keywords-regenerate]').exists());
    expect(confirm).toBeTruthy();

    confirm!.vm.$emit("confirm");
    await flushPromises();
    expect(section.emitted("regenerate-code-image-keywords")).toHaveLength(1);
  });

  it("只读模式下不提供生成入口", () => {
    const wrapper = mountSections(buildArticle({ codeImageKeywords: [] }), { readonly: true });

    expect(wrapper.find('[data-code-image-keywords-generate]').exists()).toBe(false);
    expect(wrapper.find('[data-code-image-keywords-regenerate]').exists()).toBe(false);
  });

  it("长文成品不展示代码图片标签区域", () => {
    const wrapper = mountSections(buildArticle({ direction: "article", codeImageKeywords: ["AI监管"] }));

    expect(wrapper.find('[data-testid="article-code-image-keywords"]').exists()).toBe(false);
  });
});
