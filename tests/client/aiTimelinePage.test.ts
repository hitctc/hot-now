import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
      importanceLevel: "S",
      releaseStatus: "released",
      importanceSummaryZh: "OpenAI 正式发布主力模型，影响 API 和产品能力。",
      visibilityStatus: "auto_visible",
      manualTitle: null,
      manualSummaryZh: null,
      manualImportanceLevel: null,
      detectedEntities: ["GPT-5.5"],
      eventKey: "openai:gpt-5-5:2026-04-24",
      reliabilityStatus: "multi_source",
      evidenceCount: 2,
      lastVerifiedAt: "2026-04-24T12:30:00.000Z",
      evidenceLinks: [
        {
          id: 1,
          eventId: 1,
          sourceId: "openai-news",
          companyKey: "openai",
          sourceLabel: "OpenAI News",
          sourceKind: "official_blog",
          officialUrl: "https://openai.com/news/introducing-gpt-5-5/",
          title: "Introducing GPT-5.5",
          summary: null,
          publishedAt: "2026-04-24T10:00:00.000Z",
          discoveredAt: "2026-04-24T12:00:00.000Z",
          rawSourceJson: {},
          createdAt: "2026-04-24T12:00:00.000Z",
          updatedAt: "2026-04-24T12:00:00.000Z"
        },
        {
          id: 2,
          eventId: 1,
          sourceId: "openai-release-notes",
          companyKey: "openai",
          sourceLabel: "OpenAI Release Notes",
          sourceKind: "docs_changelog",
          officialUrl: "https://platform.openai.com/docs/changelog",
          title: "GPT-5.5 available",
          summary: null,
          publishedAt: "2026-04-24T10:05:00.000Z",
          discoveredAt: "2026-04-24T12:01:00.000Z",
          rawSourceJson: {},
          createdAt: "2026-04-24T12:01:00.000Z",
          updatedAt: "2026-04-24T12:01:00.000Z"
        }
      ],
      displayTitle: "Introducing GPT-5.5",
      displaySummaryZh: "OpenAI 正式发布主力模型，影响 API 和产品能力。",
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
      importanceLevel: "A",
      releaseStatus: "released",
      importanceSummaryZh: "Google 更新开发者工具，影响 Gemini 生态开发体验。",
      visibilityStatus: "auto_visible",
      manualTitle: null,
      manualSummaryZh: null,
      manualImportanceLevel: null,
      detectedEntities: ["Gemini"],
      eventKey: "google_ai:gemini-tool:2026-04-23",
      reliabilityStatus: "source_degraded",
      evidenceCount: 1,
      lastVerifiedAt: "2026-04-24T12:30:00.000Z",
      evidenceLinks: [
        {
          id: 3,
          eventId: 2,
          sourceId: "google-ai-blog",
          companyKey: "google_ai",
          sourceLabel: "Google AI Blog",
          sourceKind: "official_blog",
          officialUrl: "https://blog.google/technology/ai/developer-tool/",
          title: "Google AI releases a new developer tool",
          summary: null,
          publishedAt: "2026-04-23T09:00:00.000Z",
          discoveredAt: "2026-04-24T12:00:00.000Z",
          rawSourceJson: {},
          createdAt: "2026-04-24T12:00:00.000Z",
          updatedAt: "2026-04-24T12:00:00.000Z"
        }
      ],
      displayTitle: "Google AI releases a new developer tool",
      displaySummaryZh: "Google 更新开发者工具，影响 Gemini 生态开发体验。",
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
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    installIntersectionObserverMock();
    Object.defineProperty(window, "scrollTo", {
      writable: true,
      value: vi.fn()
    });
    Object.defineProperty(window, "scrollY", {
      writable: true,
      value: 0
    });
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
    expect(wrapper.get("[data-ai-timeline-intro]").text()).toContain("Markdown feed");
    expect(wrapper.get("[data-ai-timeline-filters]").text()).toContain("事件类型");
    expect(wrapper.findAll("[data-ai-timeline-event-card]")).toHaveLength(2);
    expect(wrapper.findAll("[data-ai-timeline-display-index]").map((node) => node.text())).toEqual(["1", "2"]);
    expect(wrapper.get("[data-ai-timeline-time]").text()).toContain("18:00");
    expect(wrapper.get("[data-ai-timeline-time]").text()).toContain("04/24");
    expect(wrapper.get("[data-ai-timeline-event-card]").classes()).toEqual(
      expect.arrayContaining(["grid", "grid-cols-[52px_32px_minmax(0,1fr)]"])
    );
    expect(wrapper.get("[data-ai-timeline-axis-line]").classes()).toEqual(
      expect.arrayContaining(["w-[2px]", "bg-editorial-border-strong"])
    );
    expect(wrapper.get("[data-ai-timeline-display-index]").classes()).toEqual(
      expect.arrayContaining(["text-white", "font-black"])
    );
    expect(wrapper.get("[data-ai-timeline-list]").text()).toContain("Introducing GPT-5.5");
    expect(wrapper.get("[data-ai-timeline-list]").text()).toContain("Google AI releases a new developer tool");
    expect(wrapper.get("[data-ai-timeline-evidence-badge]").text()).toContain("2 条官方证据");
    expect(wrapper.get("[data-ai-timeline-reliability-badge]").text()).toContain("多官方证据确认");
    expect(wrapper.findAll("[data-ai-timeline-event-card]")[1].text()).toContain("来源近期异常，已保留官方事件");
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

    vi.useFakeTimers();
    triggerInfiniteLoad();
    await flushPromises();
    expect(wrapper.get("[data-ai-timeline-infinite-load-status]").find(".ant-spin").exists()).toBe(true);
    expect(aiTimelineApiMocks.readAiTimelinePage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1999);
    await flushPromises();
    expect(aiTimelineApiMocks.readAiTimelinePage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
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

  it("does not show delayed infinite loading when there is no next timeline page", async () => {
    aiTimelineApiMocks.readAiTimelinePage.mockResolvedValueOnce(
      createTimelineModel({
        totalResults: 2,
        totalPages: 1
      })
    );

    const wrapper = mount(AiTimelinePage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    vi.useFakeTimers();
    triggerInfiniteLoad();
    await flushPromises();

    expect(wrapper.get("[data-ai-timeline-infinite-load-status]").find(".ant-spin").exists()).toBe(false);
    expect(wrapper.get("[data-ai-timeline-infinite-load-status]").text()).toContain("已加载全部 2 条");

    await vi.advanceTimersByTimeAsync(2000);
    await flushPromises();

    expect(aiTimelineApiMocks.readAiTimelinePage).toHaveBeenCalledTimes(1);
    expect(wrapper.get("[data-ai-timeline-infinite-load-status]").find(".ant-spin").exists()).toBe(false);
  });

  it("shows the shared back-to-top button after scrolling down", async () => {
    aiTimelineApiMocks.readAiTimelinePage.mockResolvedValueOnce(createTimelineModel());

    const wrapper = mount(AiTimelinePage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    expect(wrapper.find("[data-content-back-to-top]").exists()).toBe(false);

    Object.defineProperty(window, "scrollY", {
      writable: true,
      value: 720
    });
    window.dispatchEvent(new Event("scroll"));
    await flushPromises();

    expect(wrapper.get("[data-content-back-to-top]").text()).toContain("回到顶部");

    await wrapper.get("[data-content-back-to-top]").trigger("click");
    await flushPromises();

    expect(window.scrollTo).toHaveBeenLastCalledWith({
      top: 0,
      behavior: "smooth"
    });
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

    expect(wrapper.get("[data-ai-timeline-empty]").text()).toContain("等待外部 Markdown feed");
  });
});
