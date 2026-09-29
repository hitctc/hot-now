import { shallowMount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ArticleEditorPanel from "../../src/client/components/creative/article-detail/ArticleEditorPanel.vue";
import { useArticleEditorViewport } from "../../src/client/components/creative/article-detail/useArticleEditorViewport.js";
import type { CreativeFinishedArticle } from "../../src/client/services/creativeApi.js";

const focusArticle = { id: 1, status: "generated", originType: "article" } as unknown as CreativeFinishedArticle;

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.removeItem("md-editor-auto-focus-mode");
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  localStorage.removeItem("md-editor-auto-focus-mode");
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

  it("关闭自动专注后取消待触发计时，重新打开和重建时保留偏好", async () => {
    const body = document.createElement("div");
    body.className = "ant-modal-body";
    const section = document.createElement("section");
    const textarea = document.createElement("textarea");
    textarea.className = "md-editor__textarea";
    section.append(textarea);
    body.append(section);
    document.body.append(body);

    const viewport = useArticleEditorViewport();
    viewport.editorSectionRef.value = section;
    viewport.setupEditorResize();
    expect(viewport.autoFocusModeEnabled.value).toBe(true);
    textarea.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    viewport.toggleAutoFocusMode();
    await vi.advanceTimersByTimeAsync(1200);
    expect(viewport.focusMode.value).toBe(false);
    expect(localStorage.getItem("md-editor-auto-focus-mode")).toBe("0");
    viewport.teardownEditorResize();

    const reopened = useArticleEditorViewport();
    reopened.editorSectionRef.value = section;
    reopened.setupEditorResize();
    expect(reopened.autoFocusModeEnabled.value).toBe(false);
    textarea.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1200);
    expect(reopened.focusMode.value).toBe(false);
    reopened.toggleAutoFocusMode();
    textarea.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1200);
    expect(reopened.focusMode.value).toBe(true);
    expect(useArticleEditorViewport().autoFocusModeEnabled.value).toBe(true);
    reopened.toggleAutoFocusMode();
    expect(reopened.focusMode.value).toBe(false);
    reopened.teardownEditorResize();
    expect(useArticleEditorViewport().autoFocusModeEnabled.value).toBe(false);
  });

  it("专注态右上角显示锁定提示并发出解锁事件", async () => {
    const wrapper = shallowMount(ArticleEditorPanel, {
      props: {
        article: focusArticle,
        readonly: false,
        isManualArticle: false,
        humanContent: "正文",
        aiDraft: "草稿",
        previewHtml: "<p>预览</p>",
        previewLabel: "预览",
        previewThemeOptions: [],
        activePreviewTheme: "classic",
        syncScrollEnabled: true,
        autoFocusModeEnabled: true,
        savedAtLabel: "",
        focusMode: true,
        saving: false,
        wechatCopying: false,
        canPush: false,
        missingConditions: [],
        dynamicHeight: 400,
        editorFullscreen: false,
      },
      global: {
        stubs: { AButton: true, Teleport: true },
      },
    });

    const autoFocusSwitch = wrapper.get("[data-auto-focus-mode]");
    await autoFocusSwitch.trigger("click");
    expect(wrapper.emitted("toggle-auto-focus-mode")).toHaveLength(1);

    const lock = wrapper.get("[data-focus-mode-lock]");
    expect(lock.text()).toContain("解锁");
    await lock.trigger("click");
    expect(wrapper.emitted("unlock-focus-mode")).toHaveLength(1);
  });
});
