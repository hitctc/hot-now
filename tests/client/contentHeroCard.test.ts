import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ContentHeroCard from "../../src/client/components/content/ContentHeroCard.vue";
import type { ContentCard } from "../../src/client/services/contentApi";

vi.mock("../../src/client/services/contentApi", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/contentApi")>(
    "../../src/client/services/contentApi"
  );

  return {
    ...actual,
    saveFavorite: vi.fn(),
    saveReaction: vi.fn(),
    saveFeedbackPoolEntry: vi.fn()
  };
});

import * as contentApi from "../../src/client/services/contentApi";

const card: ContentCard = {
  id: 101,
  title: "AI Weekly Insight",
  summary: "Roundup of recent AI and product updates.",
  sourceName: "OpenAI",
  sourceKind: "openai",
  canonicalUrl: "https://example.com/ai-weekly",
  publishedAt: "2026-03-31T10:00:00.000Z",
  isFavorited: false,
  reaction: "none",
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

  it("renders featured content and calls the action endpoints", async () => {
    vi.mocked(contentApi.saveFavorite).mockResolvedValue({ ok: true, contentItemId: 101, isFavorited: true });
    vi.mocked(contentApi.saveReaction).mockResolvedValue({ ok: true, contentItemId: 101, reaction: "like" });
    vi.mocked(contentApi.saveFeedbackPoolEntry).mockResolvedValue({ ok: true, contentItemId: 101, entryId: 1 });

    const wrapper = mount(ContentHeroCard, {
      props: {
        card,
        feedbackOpen: false,
        statusText: "已同步到内容池"
      },
      global: {
        plugins: [Antd]
      }
    });

    expect(wrapper.get("[data-content-hero]").text()).toContain("AI Weekly Insight");
    expect(wrapper.get("[data-content-hero-title]").text()).toContain("AI Weekly Insight");
    expect(wrapper.get("[data-content-hero-summary]").text()).toContain("Roundup of recent AI and product updates.");
    expect(wrapper.get("[data-content-hero]").classes()).toEqual(
      expect.arrayContaining(["rounded-editorial-lg", "border", "border-editorial-border", "bg-editorial-panel"])
    );
    expect(wrapper.get("[data-content-hero]").classes()).toContain("shadow-editorial-card");
    expect(wrapper.text()).toContain("AI Weekly Insight");
    expect(wrapper.text()).toContain("保留 agent workflow 内容");
    expect(wrapper.text()).toContain("已同步到内容池");

    await wrapper.get("[data-content-action='favorite']").trigger("click");
    await flushPromises();
    expect(contentApi.saveFavorite).toHaveBeenCalledWith(101, true);
    expect(wrapper.text()).toContain("已加入收藏");
    expect(wrapper.get("[data-content-action='favorite']").attributes("class")).toContain("!select-none");
    expect(wrapper.get("[data-content-action='favorite']").attributes("class")).toContain("!bg-editorial-link-active");
    expect(wrapper.get("[data-content-action='favorite']").attributes("class")).toContain("!text-editorial-text-main");

    await wrapper.get("[data-content-action='reaction'][data-reaction='like']").trigger("click");
    await flushPromises();
    expect(contentApi.saveReaction).toHaveBeenCalledWith(101, "like");
    expect(wrapper.text()).toContain("已记录点赞，可以继续补充原因");
    expect(wrapper.text()).toContain("反馈说明");
    expect(wrapper.get("[data-content-action='reaction'][data-reaction='like']").attributes("class")).toContain(
      "!bg-editorial-link-active"
    );
    expect(wrapper.get("[data-content-action='reaction'][data-reaction='like']").attributes("class")).toContain(
      "!text-editorial-text-main"
    );

    await wrapper.get("[data-content-action='feedback-panel-toggle']").trigger("click");
    await flushPromises();
    expect(wrapper.text()).not.toContain("反馈说明");

    await wrapper.get("[data-content-action='feedback-panel-toggle']").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("反馈说明");
  });
});
