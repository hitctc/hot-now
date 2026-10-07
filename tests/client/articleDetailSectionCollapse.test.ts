import { effectScope, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import ArticleSupplementalSections from "../../src/client/components/creative/article-detail/ArticleSupplementalSections.vue";
import CodeImageCardsSection from "../../src/client/components/creative/article-detail/CodeImageCardsSection.vue";
import type { CreativeFinishedArticle } from "../../src/client/services/creativeApi.js";
import { afterEach, describe, expect, it } from "vitest";
import { useArticleDetailSectionCollapse } from "../../src/client/components/creative/article-detail/useArticleDetailSectionCollapse.js";

afterEach(() => localStorage.clear());

describe("成品详情区块折叠状态", () => {
  it.each(["article", "short_content"])("%s 的按钮收起内容并在重开后恢复，也能记住展开", async (direction) => {
    const article = { direction, comments: [{ reader: "读者内容", author_reply: "作者回复" }], authorExtensions: ["拓展内容"], codeImageCards: [] } as unknown as CreativeFinishedArticle;
    const global = { stubs: {
      "a-button": { template: '<button><slot /></button>' },
      "a-image-preview-group": { template: '<div><slot /></div>' },
      "a-image": true, OperationCapabilityBadge: true,
    } };
    // 挂载真实展示组件，仅替换组件库外壳，验证按钮与内容可见性的实际绑定。
    const supplemental = () => mount(ArticleSupplementalSections, { props: { article, isManualArticle: false, sourceCoverUrl: null, generatingComments: false, generatingAuthorExtensions: false }, global });
    const images = () => mount(CodeImageCardsSection, { props: { article, generating: false }, global });
    let sections = supplemental();
    let cards = images();
    expect(sections.findAll('[aria-expanded="true"]')).toHaveLength(2);
    await sections.get('[aria-expanded]').trigger("click");
    expect(sections.findAll("section")[0]!.get(".flex-col").isVisible()).toBe(false);
    expect(sections.findAll("section")[1]!.get(".flex-col").isVisible()).toBe(true);
    await cards.get('[aria-expanded]').trigger("click");
    expect(cards.get(".grid").isVisible()).toBe(false);
    sections.unmount(); cards.unmount();
    sections = supplemental(); cards = images();
    expect(sections.get('[aria-expanded]').attributes("aria-expanded")).toBe("false");
    expect(cards.get(".grid").isVisible()).toBe(false);
    await sections.get('[aria-expanded]').trigger("click");
    await cards.get('[aria-expanded]').trigger("click");
    sections.unmount(); cards.unmount();
    sections = supplemental(); cards = images();
    expect(sections.findAll('[aria-expanded="true"]')).toHaveLength(2);
    expect(cards.get(".grid").isVisible()).toBe(true);
    sections.unmount(); cards.unmount();
  });
  it("独立记忆区块状态，并按长短内容类型恢复", async () => {
    const scope = effectScope();
    const direction = ref("article");
    const states = scope.run(() => ({
      comments: useArticleDetailSectionCollapse("comments", () => direction.value),
      extensions: useArticleDetailSectionCollapse("author-extensions", () => direction.value),
    }))!;

    states.comments.collapsed.value = true;
    await nextTick();
    expect(localStorage.getItem("creative-article-detail:article:comments:collapsed")).toBe("1");

    direction.value = "short_content";
    await nextTick();
    expect(states.comments.collapsed.value).toBe(false);
    states.comments.collapsed.value = true;
    await nextTick();

    direction.value = "article";
    await nextTick();
    expect(states.comments.collapsed.value).toBe(true);
    expect(states.extensions.collapsed.value).toBe(false);
    expect(localStorage.getItem("creative-article-detail:short_content:comments:collapsed")).toBe("1");
    scope.stop();
  });
});
