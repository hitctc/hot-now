import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AiHotPage from "../../src/client/pages/content/AiHotPage.vue";

const contentApiMocks = vi.hoisted(() => ({
  readAiHotPage: vi.fn(),
  readStoredContentSourceKinds: vi.fn(),
  writeStoredContentSourceKinds: vi.fn(),
  readStoredContentSortMode: vi.fn(),
  writeStoredContentSortMode: vi.fn()
}));

vi.mock("../../src/client/services/contentApi", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/contentApi")>(
    "../../src/client/services/contentApi"
  );

  return {
    ...actual,
    readAiHotPage: contentApiMocks.readAiHotPage,
    readStoredContentSourceKinds: contentApiMocks.readStoredContentSourceKinds,
    writeStoredContentSourceKinds: contentApiMocks.writeStoredContentSourceKinds,
    readStoredContentSortMode: contentApiMocks.readStoredContentSortMode,
    writeStoredContentSortMode: contentApiMocks.writeStoredContentSortMode
  };
});

const baseModel = {
  pageKey: "ai-hot" as const,
  sourceFilter: {
    options: [
      { kind: "openai", name: "OpenAI", showAllWhenSelected: false, currentPageVisibleCount: 1 },
      { kind: "ithome", name: "IT之家", showAllWhenSelected: true, currentPageVisibleCount: 0 }
    ],
    selectedSourceKinds: ["openai"]
  },
  featuredCard: null,
  cards: [
    {
      id: 11,
      title: "Hot AI Event",
      summary: "A hot signal that is already trending.",
      sourceName: "OpenAI",
      sourceKind: "openai",
      canonicalUrl: "https://example.com/hot",
      publishedAt: "2026-03-31T13:00:00.000Z",
      isFavorited: false,
      reaction: "none",
      contentScore: 90,
      scoreBadges: ["热点"]
    }
  ],
  emptyState: null
};

function createModel(overrides: Partial<typeof baseModel> = {}) {
  return {
    ...baseModel,
    ...overrides
  };
}

describe("AiHotPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    contentApiMocks.readStoredContentSourceKinds.mockReturnValue(["openai"]);
    contentApiMocks.readStoredContentSortMode.mockReturnValue("content_score");
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

  it("renders the hot card stream", async () => {
    contentApiMocks.readAiHotPage.mockResolvedValueOnce(createModel());

    const wrapper = mount(AiHotPage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    expect(contentApiMocks.readAiHotPage).toHaveBeenCalledWith(["openai"], "content_score");
    expect(wrapper.get("[data-content-page='ai-hot']").classes()).toEqual(
      expect.arrayContaining(["flex", "flex-col", "gap-6"])
    );
    expect(wrapper.find("[data-content-filter-shell]").exists()).toBe(false);
    expect(wrapper.find("[data-content-source-filter]").exists()).toBe(true);
    expect(wrapper.find("[data-content-toolbar]").exists()).toBe(true);
    expect(wrapper.get("[data-content-source-filter]").text()).toContain("已选 1 / 2 · 共 1 条");
    expect(wrapper.find("[data-source-option-count='openai']").exists()).toBe(false);
    expect(wrapper.find("[data-source-option-count='ithome']").exists()).toBe(false);
    expect(wrapper.find("[data-content-sort-control]").exists()).toBe(true);
    expect(wrapper.get("[data-content-section='list']").attributes("data-list-style")).toBe("database");
    expect(wrapper.get("[data-content-section='list']").text()).toContain("Hot AI Event");
    expect(wrapper.findAll("[data-content-row]").length).toBe(1);
  });

  it("shows a degraded empty state when loading fails", async () => {
    contentApiMocks.readAiHotPage.mockRejectedValueOnce(new Error("network down"));

    const wrapper = mount(AiHotPage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    expect(wrapper.text()).toContain("AI 热点加载失败，请稍后重试。");
    expect(wrapper.get("[data-content-empty-state]").text()).toContain("页面加载失败");
  });
});
