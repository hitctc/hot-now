import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AiTimelinePage from "../../src/client/pages/content/AiTimelinePage.vue";

const aiTimelineApiMocks = vi.hoisted(() => ({
  readAiTimelinePage: vi.fn()
}));

vi.mock("../../src/client/services/aiTimelineApi", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/aiTimelineApi")>(
    "../../src/client/services/aiTimelineApi"
  );

  return {
    ...actual,
    readAiTimelinePage: aiTimelineApiMocks.readAiTimelinePage
  };
});

const baseTimelineModel = {
  page: 1,
  pageSize: 50,
  totalResults: 51,
  totalPages: 2,
  filters: {
    eventTypes: ["要闻", "模型发布", "开发生态", "产品应用", "行业动态", "官方前瞻"],
    companies: [
      { key: "google_ai", name: "Google AI", eventCount: 12 },
      { key: "openai", name: "OpenAI", eventCount: 39 }
    ]
  },
  events: [
    {
      id: 1,
      companyKey: "openai",
      companyName: "OpenAI",
      eventType: "模型发布",
      title: "Introducing GPT-5.5",
      summary: "Official release notes from OpenAI.",
      officialUrl: "https://openai.com/news/introducing-gpt-5-5/",
      sourceLabel: "OpenAI News",
      sourceKind: "official_blog",
      publishedAt: "2026-04-24T10:00:00.000Z",
      discoveredAt: "2026-04-24T12:00:00.000Z",
      importance: 95,
      rawSourceJson: {},
      createdAt: "2026-04-24T12:00:00.000Z",
      updatedAt: "2026-04-24T12:00:00.000Z"
    },
    {
      id: 2,
      companyKey: "google_ai",
      companyName: "Google AI",
      eventType: "开发生态",
      title: "Google AI releases a new developer tool",
      summary: null,
      officialUrl: "https://blog.google/technology/ai/developer-tool/",
      sourceLabel: "Google AI Blog",
      sourceKind: "official_blog",
      publishedAt: "2026-04-23T09:00:00.000Z",
      discoveredAt: "2026-04-24T12:00:00.000Z",
      importance: 70,
      rawSourceJson: {},
      createdAt: "2026-04-24T12:00:00.000Z",
      updatedAt: "2026-04-24T12:00:00.000Z"
    }
  ]
};

function createTimelineModel(overrides: Partial<typeof baseTimelineModel> = {}) {
  return {
    ...baseTimelineModel,
    ...overrides
  };
}

let latestIntersectionObserverCallback: IntersectionObserverCallback | null = null;

function installIntersectionObserverMock(): void {
  latestIntersectionObserverCallback = null;
  vi.stubGlobal(
    "IntersectionObserver",
    vi.fn((callback: IntersectionObserverCallback) => {
      latestIntersectionObserverCallback = callback;

      return {
        observe: vi.fn(),
        disconnect: vi.fn(),
        unobserve: vi.fn(),
        takeRecords: vi.fn()
      };
    })
  );
}

function triggerInfiniteLoad(): void {
  expect(latestIntersectionObserverCallback).not.toBeNull();
  latestIntersectionObserverCallback?.(
    [{ isIntersecting: true } as IntersectionObserverEntry],
    {} as IntersectionObserver
  );
}

describe("AiTimelinePage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    installIntersectionObserverMock();
  });

  it("renders official AI timeline events and filter controls", async () => {
    aiTimelineApiMocks.readAiTimelinePage.mockResolvedValueOnce(createTimelineModel());

    const wrapper = mount(AiTimelinePage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    expect(aiTimelineApiMocks.readAiTimelinePage).toHaveBeenCalledWith({
      eventType: undefined,
      company: undefined,
      searchKeyword: "",
      page: 1
    });
    expect(wrapper.get("[data-ai-timeline-page]").text()).toContain("AI 官方发布时间线");
    expect(wrapper.get("[data-ai-timeline-intro]").text()).toContain("这里只收一手官方来源");
    expect(wrapper.get("[data-ai-timeline-filters]").text()).toContain("事件类型");
    expect(wrapper.findAll("[data-ai-timeline-event-card]")).toHaveLength(2);
    expect(wrapper.findAll("[data-ai-timeline-display-index]").map((node) => node.text())).toEqual(["1", "2"]);
    expect(wrapper.get("[data-ai-timeline-list]").text()).toContain("Introducing GPT-5.5");
    expect(wrapper.get("[data-ai-timeline-list]").text()).toContain("Google AI releases a new developer tool");
    expect(wrapper.get("[data-ai-timeline-official-link]").attributes("href")).toBe(
      "https://openai.com/news/introducing-gpt-5-5/"
    );
    expect(wrapper.get("[data-ai-timeline-result-summary]").text()).toContain("共 51 条");
    expect(wrapper.get("[data-ai-timeline-result-summary]").text()).toContain("已加载 2 条");
  });

  it("loads the next timeline page when the infinite load trigger enters the viewport", async () => {
    aiTimelineApiMocks.readAiTimelinePage
      .mockResolvedValueOnce(createTimelineModel())
      .mockResolvedValueOnce(
        createTimelineModel({
          page: 2,
          events: [
            {
              ...baseTimelineModel.events[0],
              id: 3,
              title: "Anthropic ships a Claude Code update",
              companyKey: "anthropic",
              companyName: "Anthropic",
              eventType: "开发生态"
            }
          ]
        })
      );

    const wrapper = mount(AiTimelinePage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();
    triggerInfiniteLoad();
    await flushPromises();

    expect(aiTimelineApiMocks.readAiTimelinePage).toHaveBeenNthCalledWith(2, {
      eventType: undefined,
      company: undefined,
      searchKeyword: "",
      page: 2
    });
    expect(wrapper.findAll("[data-ai-timeline-event-card]")).toHaveLength(3);
    expect(wrapper.findAll("[data-ai-timeline-display-index]").map((node) => node.text())).toEqual(["1", "2", "3"]);
    expect(wrapper.get("[data-ai-timeline-result-summary]").text()).toContain("已加载 3 条");
  });

  it("reloads from the first page after changing timeline filters", async () => {
    aiTimelineApiMocks.readAiTimelinePage
      .mockResolvedValueOnce(createTimelineModel())
      .mockResolvedValueOnce(
        createTimelineModel({
          totalResults: 1,
          totalPages: 1,
          events: [baseTimelineModel.events[0]]
        })
      )
      .mockResolvedValueOnce(
        createTimelineModel({
          totalResults: 1,
          totalPages: 1,
          events: [baseTimelineModel.events[0]]
        })
      );

    const wrapper = mount(AiTimelinePage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    await wrapper.get("[data-ai-timeline-event-type-filter]").setValue("模型发布");
    await flushPromises();

    expect(aiTimelineApiMocks.readAiTimelinePage).toHaveBeenLastCalledWith({
      eventType: "模型发布",
      company: undefined,
      searchKeyword: "",
      page: 1
    });

    await wrapper.get("[data-ai-timeline-company-filter]").setValue("openai");
    await flushPromises();

    expect(aiTimelineApiMocks.readAiTimelinePage).toHaveBeenLastCalledWith({
      eventType: "模型发布",
      company: "openai",
      searchKeyword: "",
      page: 1
    });
  });

  it("shows a clear empty state when no official events are available", async () => {
    aiTimelineApiMocks.readAiTimelinePage.mockResolvedValueOnce(
      createTimelineModel({
        totalResults: 0,
        totalPages: 0,
        events: []
      })
    );

    const wrapper = mount(AiTimelinePage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    expect(wrapper.get("[data-ai-timeline-empty]").text()).toContain("当前还没有官方时间线事件");
  });
});
