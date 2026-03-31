import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AiHotPage from "../../src/client/pages/content/AiHotPage.vue";

const contentApiMocks = vi.hoisted(() => ({
  readAiHotPage: vi.fn(),
  readStoredContentSourceKinds: vi.fn(),
  writeStoredContentSourceKinds: vi.fn()
}));

vi.mock("../../src/client/services/contentApi", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/contentApi")>(
    "../../src/client/services/contentApi"
  );

  return {
    ...actual,
    readAiHotPage: contentApiMocks.readAiHotPage,
    readStoredContentSourceKinds: contentApiMocks.readStoredContentSourceKinds,
    writeStoredContentSourceKinds: contentApiMocks.writeStoredContentSourceKinds
  };
});

const baseModel = {
  pageKey: "ai-hot" as const,
  sourceFilter: {
    options: [
      { kind: "openai", name: "OpenAI" },
      { kind: "ithome", name: "IT之家" }
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

    expect(contentApiMocks.readAiHotPage).toHaveBeenCalledWith(["openai"]);
    expect(wrapper.get("[data-content-page='ai-hot']").text()).toContain("AI 热点");
    expect(wrapper.get("[data-content-section='list']").text()).toContain("Hot AI Event");
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
