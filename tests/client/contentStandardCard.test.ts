import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ContentStandardCard from "../../src/client/components/content/ContentStandardCard.vue";
import type { ContentCard } from "../../src/client/services/contentApi";

vi.mock("../../src/client/services/contentApi", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/contentApi")>(
    "../../src/client/services/contentApi"
  );

  return {
    ...actual,
    saveFeedbackPoolEntry: vi.fn()
  };
});

const baseCard: ContentCard = {
  id: 202,
  title: "Agent Monitor Update",
  summary: "A compact summary.",
  sourceName: "36氪",
  sourceKind: "36kr",
  canonicalUrl: "https://example.com/agent-monitor",
  publishedAt: "2026-04-07T10:00:00.000Z",
  contentScore: 84,
  scoreBadges: ["24h 内", "媒体源"]
};

describe("ContentStandardCard", () => {
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

  it("keeps short summaries expanded without rendering a toggle", async () => {
    const wrapper = mount(ContentStandardCard, {
      props: {
        card: baseCard,
        displayIndex: 12
      },
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    expect(wrapper.get("[data-content-standard-summary]").text()).toContain("A compact summary.");
    expect(wrapper.get("[data-content-standard-summary]").attributes("data-content-summary-expanded")).toBe("false");
    expect(wrapper.get("[data-content-standard-summary]").attributes("class")).toContain("[-webkit-line-clamp:5]");
    expect(wrapper.get("[data-content-display-index]").text()).toBe("12");
    expect(wrapper.find("[data-content-summary-toggle]").exists()).toBe(false);
    expect(wrapper.find("[data-content-action='favorite']").exists()).toBe(false);
    expect(wrapper.find("[data-content-action='reaction']").exists()).toBe(false);
    expect(wrapper.get("[data-content-action='feedback-panel-toggle']").text()).toContain("补充反馈");
  });

  it("shows expand and collapse controls for long standard summaries", async () => {
    const wrapper = mount(ContentStandardCard, {
      props: {
        card: {
          ...baseCard,
          summary: "Long standard summary ".repeat(24)
        }
      },
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    expect(wrapper.get("[data-content-summary-toggle]").text()).toBe("展开");
    expect(wrapper.get("[data-content-standard-summary]").attributes("class")).toContain("[-webkit-line-clamp:5]");

    await wrapper.get("[data-content-summary-toggle]").trigger("click");
    await flushPromises();

    expect(wrapper.get("[data-content-summary-toggle]").text()).toBe("收起");
    expect(wrapper.get("[data-content-standard-summary]").attributes("data-content-summary-expanded")).toBe("true");
    expect(wrapper.get("[data-content-standard-summary]").attributes("class")).not.toContain("[-webkit-line-clamp:5]");
  });
});
