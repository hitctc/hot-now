import { readFileSync } from "node:fs";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ArticleDetailHeader from "../../src/client/components/creative/article-detail/ArticleDetailHeader.vue";
import ArticlePlanningSections from "../../src/client/components/creative/article-detail/ArticlePlanningSections.vue";
import type { CreativeFinishedArticle } from "../../src/client/services/creativeApi.js";

const styles = readFileSync("src/client/components/creative/article-detail/articleDetailDrawer.css", "utf8");
const mobileStyles = styles.slice(styles.indexOf("@media (max-width: 768px)"));

// 长文本夹具用于确认布局不以省略字段或截断标题换取紧凑高度。
const title = "完整标题包含主体事件和需要保留的关键事实".repeat(4);
const sourceTitle = "关联素材完整标题".repeat(8);
const article = { id: 42, sourceItemId: 7, direction: "short_content", titles: JSON.stringify([title]), sourceTitle, sourceName: "weibo", createdAt: "2026-10-07T03:00:00Z" } as unknown as CreativeFinishedArticle;

describe("详情移动端内容与操作分层", () => {
  it("顶部保留完整标题、来源时间与素材链接，复制和打开事件不变", async () => {
    const wrapper = mount(ArticleDetailHeader, { props: { article } });
    try {
      expect(wrapper.get(".article-detail-header__title").text()).toBe(title);
      expect(wrapper.get(".article-detail-header__related").text()).toContain(sourceTitle);
      expect(wrapper.get("[data-short-article-source]").text()).toContain("来源：");
      expect(wrapper.get(".article-detail-header__time").text()).not.toBe("");
      await wrapper.get(".article-detail-header__id").trigger("click");
      await wrapper.get(".article-detail-header__related").trigger("click");
      expect(wrapper.emitted("copy-id")).toEqual([[42]]);
      expect(wrapper.emitted("open-source")).toEqual([[7]]);
    } finally { wrapper.unmount(); }
    expect(mobileStyles).toMatch(/\.article-detail-header__title\s*\{[^}]*flex-basis: 100%;/);
    expect(mobileStyles).toMatch(/\.article-detail-header__source\s*\{[^}]*flex-basis: auto;/);
    expect(mobileStyles).toMatch(/\.article-detail-header__related\s*\{[^}]*flex-basis: 100%;/);
  });

  it("候选标题与导语全文独立于操作组，选择、编辑和复制仍传原值", async () => {
    const intro = "完整导语".repeat(30);
    const wrapper = mount(ArticlePlanningSections, { props: {
      article, isManualArticle: false, manualTitle: "", displayTitles: [title], activeTitleIndex: 0,
      editingTitleIndex: null, editingTitleValue: "", regenTitleLoading: false, displayIntros: [intro],
      activeIntroIndex: 1, regenIntroLoading: false, displaySummaries: [], regenCodeImageKeywordsLoading: false,
      titleCandidateAt: () => null,
    }, global: { stubs: { "a-button": { template: "<button><slot /></button>" }, "a-input": true, "a-popconfirm": true, OperationCapabilityBadge: true } } });
    try {
      const candidates = wrapper.findAll(".article-candidate");
      expect(candidates[0]!.get(".article-candidate__text").text()).toBe(title);
      expect(candidates[1]!.get(".article-candidate__text").text()).toBe(intro);
      expect(candidates[0]!.get(".article-candidate__actions").text()).not.toContain(title);
      const actions = candidates[0]!.get(".article-candidate__actions").findAll("button");
      for (const button of actions) await button.trigger("click");
      expect(wrapper.emitted("select-title")).toEqual([[0]]);
      expect(wrapper.emitted("start-title-edit")).toEqual([[0]]);
      expect(wrapper.emitted("copy")).toEqual([[title]]);
      await candidates[1]!.get("button").trigger("click");
      expect(wrapper.emitted("select-intro")).toEqual([[0]]);
    } finally { wrapper.unmount(); }
    expect(mobileStyles).toMatch(/\.article-candidate\s*\{[^}]*grid-template-columns: 14px minmax\(0, 1fr\);/);
    expect(mobileStyles).toMatch(/\.article-candidate__actions\s*\{[^}]*grid-column: 2;[^}]*flex-wrap: wrap;/);
  });

  it("移动端区块按钮、提示词和正文工具独立排布，三列封面完整展示且样式不外溢", () => {
    expect(mobileStyles).toMatch(/\.article-section-heading\s*\{[^}]*flex-direction: column;[^}]*align-items: stretch;/);
    expect(mobileStyles).toMatch(/\.article-text-actions > span:first-child\s*\{[^}]*flex-basis: 100%;/);
    expect(mobileStyles).toMatch(/\.article-editor-actions\s*\{[^}]*display: flex;[^}]*width: 100%;/);
    expect(mobileStyles).toMatch(/\.article-cover-grid\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
    expect(mobileStyles).toMatch(/\.article-cover-image \.ant-image-img\s*\{[^}]*object-fit: contain;/);
    const sharedStyles = styles.slice(0, styles.indexOf("@media (max-width: 768px)"));
    expect(sharedStyles).toMatch(/\.article-candidate__actions,[\s\S]*?\.article-editor-actions\s*\{\s*display: contents;/);
    expect(sharedStyles).not.toContain("grid-template-columns: repeat(3");
    for (const component of ["ArticlePlanningSections", "ArticleSupplementalSections", "CodeImageCardsSection", "ArticleImageWorkflowSections", "ArticleEditorPanel"]) {
      expect(readFileSync(`src/client/components/creative/article-detail/${component}.vue`, "utf8")).toContain("article-section-heading");
    }
  });
});
