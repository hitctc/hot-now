import { flushPromises, mount } from "@vue/test-utils";
import Antd, { message } from "ant-design-vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ContentHeroCard from "../../src/client/components/content/ContentHeroCard.vue";
import type { ContentCard } from "../../src/client/services/contentApi";
import { HttpError } from "../../src/client/services/http";

vi.mock("../../src/client/services/contentApi", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/contentApi")>(
    "../../src/client/services/contentApi"
  );

  return {
    ...actual,
    saveFeedbackPoolEntry: vi.fn()
  };
});

import * as contentApi from "../../src/client/services/contentApi";

function createMockMessageHandle(): ReturnType<typeof message.success> {
  return (() => undefined) as ReturnType<typeof message.success>;
}

const card: ContentCard = {
  id: 101,
  title: "AI Weekly Insight",
  summary: "Roundup of recent AI and product updates.",
  sourceName: "OpenAI",
  sourceKind: "openai",
  canonicalUrl: "https://example.com/ai-weekly",
  publishedAt: "2026-03-31T10:00:00.000Z",
  contentScore: 94,
  scoreBadges: ["24h 内", "官方源"],
  feedbackEntry: {
    freeText: "保留 agent workflow 内容",
    suggestedEffect: "boost",
    strengthLevel: "high",
    positiveKeywords: ["agent", "workflow"],
    negativeKeywords: []
  }
};

describe("ContentHeroCard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders featured content with only the feedback action and saves feedback payloads", async () => {
    const successSpy = vi.spyOn(message, "success").mockImplementation(() => createMockMessageHandle());
    vi.mocked(contentApi.saveFeedbackPoolEntry).mockResolvedValue({ ok: true, contentItemId: 101, entryId: 1 });

    const wrapper = mount(ContentHeroCard, {
      props: {
        card,
        feedbackOpen: false,
        statusText: "已同步到内容池"
      },
      global: {
        plugins: [Antd]
      },
      attachTo: document.body
    });

    expect(wrapper.get("[data-content-hero]").text()).toContain("AI Weekly Insight");
    expect(wrapper.get("[data-content-hero-title]").text()).toContain("AI Weekly Insight");
    expect(wrapper.get("[data-content-hero-summary]").text()).toContain("Roundup of recent AI and product updates.");
    expect(wrapper.get("[data-content-hero-summary]").attributes("data-content-summary-expanded")).toBe("false");
    expect(wrapper.find("[data-content-summary-toggle]").exists()).toBe(false);
    expect(wrapper.get("[data-content-hero]").classes()).toEqual(
      expect.arrayContaining(["editorial-spotlight-card", "rounded-editorial-xl", "border", "border-editorial-border-strong"])
    );
    expect(wrapper.find("[data-content-hero-stage]").exists()).toBe(true);
    expect(wrapper.find("[data-content-hero-sidecar]").exists()).toBe(true);
    expect(wrapper.get("[data-content-hero]").classes()).toContain("shadow-editorial-card");
    expect(wrapper.text()).toContain("AI Weekly Insight");
    expect(wrapper.text()).toContain("已同步到内容池");
    expect(wrapper.find("[data-content-action='favorite']").exists()).toBe(false);
    expect(wrapper.find("[data-content-action='reaction']").exists()).toBe(false);
    expect(document.body.querySelector("[data-feedback-panel]")).toBeNull();

    await wrapper.get("[data-content-action='feedback-panel-toggle']").trigger("click");
    await flushPromises();
    expect(document.body.textContent).toContain("反馈说明");
    const textarea = document.body.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect((textarea as HTMLTextAreaElement).value).toBe("保留 agent workflow 内容");
    const feedbackSubmitButton = document.body.querySelector("[data-feedback-panel] button");
    expect(feedbackSubmitButton).not.toBeNull();
    (feedbackSubmitButton as HTMLButtonElement).click();
    await flushPromises();

    expect(contentApi.saveFeedbackPoolEntry).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
      freeText: "保留 agent workflow 内容",
      positiveKeywords: ["agent", "workflow"],
      suggestedEffect: "boost",
      strengthLevel: "high"
      })
    );
    expect(vi.mocked(contentApi.saveFeedbackPoolEntry).mock.calls[0]?.[1]).not.toHaveProperty("reactionSnapshot");
    expect(successSpy).toHaveBeenCalledWith("反馈词已保存到反馈池");
    expect(document.body.querySelector("[data-feedback-panel]")).toBeNull();
  });

  it("shows expand and collapse controls for long featured summaries", async () => {
    const wrapper = mount(ContentHeroCard, {
      props: {
        card: {
          ...card,
          summary: "Long featured summary ".repeat(32)
        }
      },
      global: {
        plugins: [Antd]
      },
      attachTo: document.body
    });

    await flushPromises();

    expect(wrapper.get("[data-content-summary-toggle]").text()).toBe("展开");
    expect(wrapper.get("[data-content-hero-summary]").attributes("class")).toContain("[-webkit-line-clamp:6]");

    await wrapper.get("[data-content-summary-toggle]").trigger("click");
    await flushPromises();

    expect(wrapper.get("[data-content-summary-toggle]").text()).toBe("收起");
    expect(wrapper.get("[data-content-hero-summary]").attributes("data-content-summary-expanded")).toBe("true");
    expect(wrapper.get("[data-content-hero-summary]").attributes("class")).not.toContain("[-webkit-line-clamp:6]");
  });

  it("shows a login-required message when feedback save is rejected with 401", async () => {
    const warningSpy = vi.spyOn(message, "warning").mockImplementation(() => createMockMessageHandle());
    vi.mocked(contentApi.saveFeedbackPoolEntry).mockRejectedValue(
      new HttpError("Request failed for /actions/content/101/feedback-pool", 401, { ok: false, reason: "unauthorized" })
    );

    const wrapper = mount(ContentHeroCard, {
      props: {
        card
      },
      global: {
        plugins: [Antd]
      },
      attachTo: document.body
    });

    await wrapper.get("[data-content-action='feedback-panel-toggle']").trigger("click");
    await flushPromises();

    expect(document.body.querySelector("[data-feedback-panel]")).not.toBeNull();
    const feedbackSubmitButton = document.body.querySelector("[data-feedback-panel] button");
    expect(feedbackSubmitButton).not.toBeNull();
    (feedbackSubmitButton as HTMLButtonElement).click();
    await flushPromises();

    expect(wrapper.text()).toContain("请先登录后再保存反馈词。");
    expect(warningSpy).toHaveBeenCalledWith("请先登录后再保存反馈词。");
  });
});
