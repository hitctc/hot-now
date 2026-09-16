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

function mountSections(article: CreativeFinishedArticle) {
  return mountWithApp(ArticlePlanningSections, {
    props: {
      article,
      readonly: false,
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
      titleCandidateAt: () => null,
    },
  });
}

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

  it("没有标签时仍然展示区域并说明原因", () => {
    const wrapper = mountSections(buildArticle({ codeImageKeywords: [] }));

    const section = wrapper.find('[data-testid="article-code-image-keywords"]');
    expect(section.exists()).toBe(true);
    expect(section.text()).toContain("暂无标签");
  });

  it("长文成品不展示代码图片标签区域", () => {
    const wrapper = mountSections(buildArticle({ direction: "article", codeImageKeywords: ["AI监管"] }));

    expect(wrapper.find('[data-testid="article-code-image-keywords"]').exists()).toBe(false);
  });
});
