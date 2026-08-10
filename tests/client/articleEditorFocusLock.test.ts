import { shallowMount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ArticleEditorPanel from "../../src/client/components/creative/article-detail/ArticleEditorPanel.vue";
import { useArticleEditorViewport } from "../../src/client/components/creative/article-detail/useArticleEditorViewport.js";

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("article editor focus lock", () => {
  it("进入专注模式后忽略焦点移出，只有显式解锁才退出", async () => {
    const body = document.createElement("div");
    body.className = "ant-modal-body";
    Object.defineProperty(body, "clientHeight", { value: 600 });
    const section = document.createElement("section");
    const textarea = document.createElement("textarea");
    textarea.className = "md-editor__textarea";
    section.append(textarea);
    const outsideButton = document.createElement("button");
    body.append(section, outsideButton);
    document.body.append(body);

    const viewport = useArticleEditorViewport();
    viewport.editorSectionRef.value = section;
    viewport.setupEditorResize();

    textarea.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1200);
    await nextTick();
    expect(viewport.focusMode.value).toBe(true);

    textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: outsideButton }));
    await nextTick();
    expect(viewport.focusMode.value).toBe(true);

    viewport.unlockFocusMode();
    await nextTick();
    expect(viewport.focusMode.value).toBe(false);

    textarea.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1200);
    expect(viewport.focusMode.value).toBe(true);
    viewport.teardownEditorResize();
    expect(viewport.focusMode.value).toBe(false);
  });

  it("专注态右上角显示锁定提示并发出解锁事件", async () => {
    const wrapper = shallowMount(ArticleEditorPanel, {
      props: {
        readonly: false,
        isManualArticle: false,
        humanContent: "正文",
        aiDraft: "草稿",
        previewHtml: "<p>预览</p>",
        previewLabel: "预览",
        previewThemeOptions: [],
        activePreviewTheme: "classic",
        syncScrollEnabled: true,
        savedAtLabel: "",
        focusMode: true,
        saving: false,
        dynamicHeight: 400,
        editorFullscreen: false,
      },
      global: {
        stubs: { AButton: true, Teleport: true },
      },
    });

    const lock = wrapper.get("[data-focus-mode-lock]");
    expect(lock.text()).toContain("专注模式已锁定 · 点击解锁");
    await lock.trigger("click");
    expect(wrapper.emitted("unlock-focus-mode")).toHaveLength(1);
  });
});
