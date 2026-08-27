import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import ArticleEditorPanel from "../../src/client/components/creative/article-detail/ArticleEditorPanel.vue";
import type { CreativeFinishedArticle } from "../../src/client/services/creativeApi.js";
import { mountWithApp } from "./helpers/mountWithApp";

const article = {
  id: 2373,
  status: "ready_for_publish",
  originType: "article",
  titles: '["测试标题"]',
  contentMarkdown: "AI 正文",
  humanMarkdown: "人工正文",
  coverImage: ["https://img.test/cover.png"],
} as unknown as CreativeFinishedArticle;

function mountPanel() {
  return mountWithApp(ArticleEditorPanel, {
    props: {
      article,
      isManualArticle: false,
      humanContent: "人工正文",
      aiDraft: "AI 正文",
      previewHtml: "<p>预览</p>",
      previewLabel: "落日胶片",
      previewThemeOptions: [
        { key: "classic", label: "默认" },
        { key: "bauhaus", label: "包豪斯" },
        { key: "sunsetFilm", label: "落日胶片" },
        { key: "receipt", label: "购物小票" },
        { key: "blackGold", label: "黑金主题" },
        { key: "live", label: "实时预览" },
      ],
      activePreviewTheme: "sunsetFilm",
      syncScrollEnabled: true,
      savedAtLabel: "保存成功",
      focusMode: true,
      saving: false,
      wechatCopying: false,
      canPush: false,
      missingConditions: ["状态不允许推送"],
      dynamicHeight: 600,
      editorFullscreen: false,
    },
    global: {
      stubs: {
        ArticleMarkdownEditor: { template: "<div data-markdown-editor />" },
      },
    },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("article editor focus tools", () => {
  it("鼠标移入后在同一面板展示主题、编辑和底部流程操作", async () => {
    const wrapper = mountPanel();
    const panelComponent = wrapper.findComponent(ArticleEditorPanel);
    const tools = wrapper.get("[data-focus-tools]");
    const panel = wrapper.get("[data-focus-tools-panel]");

    expect(panel.classes()).toContain("focus-tools__panel--hidden");
    expect(panel.attributes("aria-hidden")).toBe("true");
    await tools.trigger("mouseenter");

    expect(panel.classes()).not.toContain("focus-tools__panel--hidden");
    expect(panel.attributes("aria-hidden")).toBe("false");
    expect(wrapper.findAll(".focus-tools__section")).toHaveLength(3);
    expect(wrapper.get("[data-focus-tools-flow-label]").text()).toBe("");
    expect(panel.text()).toMatch(/默\s*认/);
    expect(panel.text()).toContain("实时预览");
    expect(panel.text()).toContain("复制原文");
    expect(panel.text()).toContain("同步滚动：开");
    expect(panel.text()).toContain("复制格式");
    expect(panel.text()).toContain("取消推送");
    expect(panel.text()).toMatch(/废\s*弃/);

    const themeButton = wrapper.findAll("button").find((button) => button.text().replace(/\s/g, "") === "包豪斯");
    expect(themeButton).toBeDefined();
    await themeButton!.trigger("click");
    expect(panelComponent.emitted("select-theme")).toEqual([["bauhaus"]]);

    await wrapper.get('[data-focus-save]').trigger("click");
    expect(panelComponent.emitted("save")).toHaveLength(1);

    const copyFormatButton = wrapper.findAll("button").find((button) => button.text() === "复制格式");
    expect(copyFormatButton).toBeDefined();
    await copyFormatButton!.trigger("click");
    expect(panelComponent.emitted("copy-format")).toHaveLength(1);
  });

  it("鼠标离开工具区后延迟收起，避免移入面板时闪退", async () => {
    vi.useFakeTimers();
    const wrapper = mountPanel();
    const tools = wrapper.get("[data-focus-tools]");
    const panel = wrapper.get("[data-focus-tools-panel]");

    await tools.trigger("mouseenter");
    expect(panel.classes()).not.toContain("focus-tools__panel--hidden");

    await tools.trigger("mouseleave");
    vi.advanceTimersByTime(179);
    await nextTick();
    expect(panel.classes()).not.toContain("focus-tools__panel--hidden");

    vi.advanceTimersByTime(1);
    await nextTick();
    expect(panel.classes()).toContain("focus-tools__panel--hidden");
    expect(panel.attributes("aria-hidden")).toBe("true");
  });
});
