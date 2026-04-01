import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AiNewPage from "../../src/client/pages/content/AiNewPage.vue";

const contentApiMocks = vi.hoisted(() => ({
  readAiNewPage: vi.fn(),
  readStoredContentSourceKinds: vi.fn(),
  writeStoredContentSourceKinds: vi.fn()
}));

vi.mock("../../src/client/services/contentApi", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/contentApi")>(
    "../../src/client/services/contentApi"
  );

  return {
    ...actual,
    readAiNewPage: contentApiMocks.readAiNewPage,
    readStoredContentSourceKinds: contentApiMocks.readStoredContentSourceKinds,
    writeStoredContentSourceKinds: contentApiMocks.writeStoredContentSourceKinds
  };
});

const baseModel = {
  pageKey: "ai-new" as const,
  sourceFilter: {
    options: [
      { kind: "openai", name: "OpenAI" },
      { kind: "ithome", name: "IT之家" }
    ],
    selectedSourceKinds: ["openai"]
  },
  featuredCard: {
    id: 1,
    title: "AI Weekly Insight",
    summary: "Feature story about AI workflow.",
    sourceName: "OpenAI",
    sourceKind: "openai",
    canonicalUrl: "https://example.com/featured",
    publishedAt: "2026-03-31T10:00:00.000Z",
    isFavorited: false,
    reaction: "none",
    contentScore: 95,
    scoreBadges: ["精选"]
  },
  cards: [
    {
      id: 1,
      title: "AI Weekly Insight",
      summary: "Feature story about AI workflow.",
      sourceName: "OpenAI",
      sourceKind: "openai",
      canonicalUrl: "https://example.com/featured",
      publishedAt: "2026-03-31T10:00:00.000Z",
      isFavorited: false,
      reaction: "none",
      contentScore: 95,
      scoreBadges: ["精选"]
    },
    {
      id: 2,
      title: "AI Agent Launch",
      summary: "Standard card for a new agent release.",
      sourceName: "IT之家",
      sourceKind: "ithome",
      canonicalUrl: "https://example.com/agent",
      publishedAt: "2026-03-31T11:00:00.000Z",
      isFavorited: true,
      reaction: "like",
      contentScore: 82,
      scoreBadges: ["24h 内"]
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

describe("AiNewPage", () => {
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

  it("renders the featured card and the standard list", async () => {
    contentApiMocks.readAiNewPage.mockResolvedValueOnce(createModel());

    const wrapper = mount(AiNewPage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    expect(contentApiMocks.readAiNewPage).toHaveBeenCalledWith(["openai"]);
    expect(wrapper.get("[data-content-page='ai-new']").text()).toContain("AI 新讯");
    expect(wrapper.find("[data-content-source-filter]").exists()).toBe(true);
    expect(wrapper.get("[data-content-section='featured']").text()).toContain("AI Weekly Insight");
    expect(wrapper.get("[data-content-section='list']").text()).toContain("AI Agent Launch");
  });

  it("persists source selections and reloads with the updated filter", async () => {
    contentApiMocks.readStoredContentSourceKinds.mockReturnValue(null);
    contentApiMocks.readAiNewPage
      .mockResolvedValueOnce(createModel())
      .mockResolvedValueOnce(
        createModel({
          featuredCard: {
            id: 3,
            title: "New OpenAI Model",
            summary: "Updated featured story after filter change.",
            sourceName: "OpenAI",
            sourceKind: "openai",
            canonicalUrl: "https://example.com/new-model",
            publishedAt: "2026-03-31T12:00:00.000Z",
            isFavorited: false,
            reaction: "none",
            contentScore: 97,
            scoreBadges: ["精选"]
          },
          cards: [
            {
              id: 3,
              title: "New OpenAI Model",
              summary: "Updated featured story after filter change.",
              sourceName: "OpenAI",
              sourceKind: "openai",
              canonicalUrl: "https://example.com/new-model",
              publishedAt: "2026-03-31T12:00:00.000Z",
              isFavorited: false,
              reaction: "none",
              contentScore: 97,
              scoreBadges: ["精选"]
            }
          ],
          sourceFilter: {
            options: [
              { kind: "openai", name: "OpenAI" },
              { kind: "ithome", name: "IT之家" }
            ],
            selectedSourceKinds: ["openai", "ithome"]
          }
        })
      );

    const wrapper = mount(AiNewPage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    await wrapper.get("[data-source-kind='ithome']").setValue(true);
    await flushPromises();

    expect(contentApiMocks.writeStoredContentSourceKinds).toHaveBeenCalledWith(["openai"]);
    expect(contentApiMocks.writeStoredContentSourceKinds).toHaveBeenCalledWith(["openai", "ithome"]);
    expect(contentApiMocks.readAiNewPage).toHaveBeenCalledTimes(2);
    expect(contentApiMocks.readAiNewPage).toHaveBeenLastCalledWith(["openai", "ithome"]);
    expect(wrapper.get("[data-content-section='featured']").text()).toContain("New OpenAI Model");
  });
});
