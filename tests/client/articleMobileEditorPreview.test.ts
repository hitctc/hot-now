// 移动端文章详情：只保留人工转写栏，预览改为独立全屏层；桌面端展示不变。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import ArticleEditorPanel from "../../src/client/components/creative/article-detail/ArticleEditorPanel.vue";
import type { CreativeFinishedArticle } from "../../src/client/services/creativeApi.js";
import { mountWithApp } from "./helpers/mountWithApp";

const styles = readFileSync(resolve(process.cwd(), "src/client/components/creative/article-detail/articleDetailDrawer.css"), "utf8");
const editorSource = readFileSync(resolve(process.cwd(), "src/client/components/creative/ArticleMarkdownEditor.vue"), "utf8");
const panelSource = readFileSync(resolve(process.cwd(), "src/client/components/creative/article-detail/ArticleEditorPanel.vue"), "utf8");

const article = {
  id: 2373, status: "ready_for_publish", originType: "article",
  titles: '["测试标题"]', contentMarkdown: "AI 正文", humanMarkdown: "人工正文", coverImage: [],
} as unknown as CreativeFinishedArticle;

/** 组装面板所需的完整 props，避免用例只覆盖部分入参。 */
function mountPanel(readonly = false) {
  return mountWithApp(ArticleEditorPanel, {
    props: {
      article, readonly, isManualArticle: false,
      humanContent: "人工正文", aiDraft: "AI 正文",
      previewHtml: "<p>预览正文</p>", previewLabel: "落日胶片",
      previewThemeOptions: [{ key: "sunsetFilm", label: "落日胶片" }],
      activePreviewTheme: "sunsetFilm",
      syncScrollEnabled: true, autoFocusModeEnabled: true, savedAtLabel: "",
      focusMode: false, saving: false, wechatCopying: false, canPush: false,
      missingConditions: [], dynamicHeight: 600, editorFullscreen: false,
    },
  });
}

describe("移动端文章详情编辑与预览", () => {
  it("移动端三栏编辑只保留人工转写，草稿与预览栏都隐藏且编辑区占满", () => {
    const mobileBlock = editorSource.match(/@media \(max-width: 768px\) \{([\s\S]*?)\n\}\n/)?.[1] ?? "";
    expect(mobileBlock).toMatch(/\.md-editor--3pane \.md-editor__pane--ai-draft,[\s\S]*?\.md-editor__divider--after-draft,[\s\S]*?\.md-editor__pane--preview,[\s\S]*?\.md-editor__divider--before-preview\s*\{\s*display: none;/);
    expect(mobileBlock).toMatch(/\.md-editor--3pane \.md-editor__pane--human\s*\{[^}]*flex: 1 1 auto;/);
    // 模板里必须真的带上这些标记，否则选择器不会命中。
    expect(editorSource).toContain("md-editor__pane--ai-draft");
    expect(editorSource).toContain("md-editor__pane--human");
    expect(editorSource).toContain("md-editor__pane--preview");
  });

  it("预览按钮与全屏预览层仅在移动端显示，桌面端完全不出现", () => {
    expect(styles).toMatch(/\.article-detail-preview-button,\s*\.article-mobile-preview\s*\{\s*display: none;/);
    // 样式文件里有多段移动端媒体查询，逐段检查而不是只看第一段。
    const mobileBlocks = [...styles.matchAll(/@media \(max-width: 768px\) \{([\s\S]*?)\n\}/g)].map((match) => match[1] ?? "");
    expect(mobileBlocks.length).toBeGreaterThan(0);
    expect(mobileBlocks.some((block) => /\.article-detail-preview-button\s*\{\s*display: inline-flex;/.test(block))).toBe(true);
    expect(mobileBlocks.some((block) => /\.article-mobile-preview\s*\{[^}]*position: fixed;[^}]*inset: 0;/.test(block))).toBe(true);
  });

  it("点击预览打开全屏预览，关闭后回到编辑", async () => {
    const wrapper = mountPanel();
    try {
      expect(wrapper.find("[data-mobile-preview]").exists()).toBe(false);
      await wrapper.get("[data-mobile-preview-trigger]").trigger("click");
      const overlay = wrapper.get("[data-mobile-preview]");
      expect(overlay.text()).toContain("落日胶片预览");
      expect(overlay.html()).toContain("预览正文");
      await wrapper.get("[data-mobile-preview-close]").trigger("click");
      expect(wrapper.find("[data-mobile-preview]").exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it("只读详情不提供预览按钮，避免出现无意义的空预览入口", () => {
    const wrapper = mountPanel(true);
    try {
      expect(wrapper.find("[data-mobile-preview-trigger]").exists()).toBe(false);
      expect(panelSource).toContain('v-if="!readonly"');
    } finally { wrapper.unmount(); }
  });
});
