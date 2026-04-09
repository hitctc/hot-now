import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AiNewPage from "../../src/client/pages/content/AiNewPage.vue";

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn()
}));

const routeState = vi.hoisted(() => ({
  query: {} as Record<string, unknown>
}));

vi.mock("vue-router", () => ({
  useRouter: () => routerMocks,
  useRoute: () => routeState
}));

const contentApiMocks = vi.hoisted(() => ({
  readAiNewPage: vi.fn(),
  readStoredContentSourceKinds: vi.fn(),
  writeStoredContentSourceKinds: vi.fn(),
  readStoredContentSortMode: vi.fn(),
  writeStoredContentSortMode: vi.fn(),
  readStoredContentSearchKeyword: vi.fn(),
  writeStoredContentSearchKeyword: vi.fn()
}));

vi.mock("../../src/client/services/contentApi", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/contentApi")>(
    "../../src/client/services/contentApi"
  );

  return {
    ...actual,
    readAiNewPage: contentApiMocks.readAiNewPage,
    readStoredContentSourceKinds: contentApiMocks.readStoredContentSourceKinds,
    writeStoredContentSourceKinds: contentApiMocks.writeStoredContentSourceKinds,
    readStoredContentSortMode: contentApiMocks.readStoredContentSortMode,
    writeStoredContentSortMode: contentApiMocks.writeStoredContentSortMode,
    readStoredContentSearchKeyword: contentApiMocks.readStoredContentSearchKeyword,
    writeStoredContentSearchKeyword: contentApiMocks.writeStoredContentSearchKeyword
  };
});

const baseModel = {
  pageKey: "ai-new" as const,
  sourceFilter: {
    options: [
      { kind: "openai", name: "OpenAI", showAllWhenSelected: false, currentPageVisibleCount: 1 },
      { kind: "ithome", name: "IT之家", showAllWhenSelected: true, currentPageVisibleCount: 1 }
    ],
    selectedSourceKinds: ["openai"]
  },
  featuredCard: null,
  strategySummary: {
    pageKey: "ai-new" as const,
    items: ["24 小时窗口 开", "来源偏置 开", "AI 关键词 开", "热点关键词 关", "评分排序 开"]
  },
  pagination: {
    page: 1,
    pageSize: 50,
    totalResults: 120,
    totalPages: 3
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

describe("AiNewPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    routeState.query = {};
    routerMocks.replace.mockImplementation(async (location: { query?: Record<string, unknown> }) => {
      routeState.query = location.query ?? {};
    });
    contentApiMocks.readStoredContentSourceKinds.mockReturnValue(["openai"]);
    contentApiMocks.readStoredContentSortMode.mockReturnValue(null);
    contentApiMocks.readStoredContentSearchKeyword.mockReturnValue(null);
    Object.defineProperty(window, "scrollTo", {
      writable: true,
      value: vi.fn()
    });
    Object.defineProperty(window, "scrollY", {
      writable: true,
      value: 0
    });
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

  it("renders AI 新讯 as one standard card list", async () => {
    contentApiMocks.readAiNewPage.mockResolvedValueOnce(createModel());

    const wrapper = mount(AiNewPage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    expect(contentApiMocks.readAiNewPage).toHaveBeenCalledWith({
      selectedSourceKinds: ["openai"],
      sortMode: "published_at",
      page: 1,
      searchKeyword: ""
    });
    expect(wrapper.get("[data-content-page='ai-new']").classes()).toEqual(
      expect.arrayContaining(["flex", "flex-col", "gap-6"])
    );
    expect(wrapper.find("[data-content-filter-shell]").exists()).toBe(false);
    expect(wrapper.get("[data-content-strategy-summary='ai-new']").text()).toContain("当前 AI 新讯");
    expect(wrapper.get("[data-content-strategy-summary='ai-new']").text()).toContain("24 小时窗口 开");
    expect(wrapper.findAll("[data-content-toolbar-card]").length).toBe(1);
    const toolbarMainRow = wrapper.get("[data-content-toolbar-main-row]");
    expect(toolbarMainRow.find("[data-content-toolbar-summary]").exists()).toBe(true);
    expect(toolbarMainRow.find("[data-content-sort-control]").exists()).toBe(true);
    expect(toolbarMainRow.find("[data-content-search-control]").exists()).toBe(true);
    expect(wrapper.get("[data-content-sticky-toolbar]").classes()).toEqual(
      expect.arrayContaining(["sticky", "z-20", "top-4", "max-[900px]:top-[72px]"])
    );
    expect((wrapper.get("[data-content-toolbar-source-panel]").element as HTMLElement).style.display).toBe("none");
    expect(wrapper.get("[data-content-toolbar-summary]").attributes("aria-expanded")).toBe("false");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").text()).toContain("展开来源");
    await wrapper.get("[data-content-toolbar-summary]").trigger("click");
    await flushPromises();
    expect((wrapper.get("[data-content-toolbar-source-panel]").element as HTMLElement).style.display).toBe("");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").text()).toContain("收起来源");
    expect(wrapper.find("[data-content-sort-control]").exists()).toBe(true);
    expect(wrapper.get("[data-content-source-filter]").text()).toContain("已选 1 / 2 · 共 120 条");
    expect(wrapper.get("[data-content-pagination-summary]").text()).toContain("第 1 / 3 页 · 共 120 条");
    expect(wrapper.get("[data-content-section='list']").attributes("data-list-style")).toBe("database");
    expect(wrapper.find("[data-content-section='featured']").exists()).toBe(false);
    expect(wrapper.get("[data-content-section='list']").text()).toContain("AI Weekly Insight");
    expect(wrapper.get("[data-content-section='list']").text()).toContain("AI Agent Launch");
    expect(wrapper.findAll("[data-content-row]").length).toBe(2);
    expect(wrapper.findAll("[data-content-display-index]").map((node) => node.text())).toEqual(["1", "2"]);
  });

  it("persists source selections and reloads with the updated filter", async () => {
    contentApiMocks.readStoredContentSourceKinds.mockReturnValue(null);
    contentApiMocks.readAiNewPage
      .mockResolvedValueOnce(createModel())
      .mockResolvedValueOnce(
        createModel({
          featuredCard: null,
          pagination: {
            page: 1,
            pageSize: 50,
            totalResults: 1,
            totalPages: 1
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
              contentScore: 97,
              scoreBadges: ["精选"]
            }
          ],
          sourceFilter: {
            options: [
              { kind: "openai", name: "OpenAI", showAllWhenSelected: false, currentPageVisibleCount: 1 },
              { kind: "ithome", name: "IT之家", showAllWhenSelected: true, currentPageVisibleCount: 1 }
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

    await wrapper.get("[data-content-toolbar-summary]").trigger("click");
    await flushPromises();
    await wrapper.get("[data-source-kind='ithome']").setValue(true);
    await flushPromises();

    expect(contentApiMocks.writeStoredContentSourceKinds).toHaveBeenCalledWith(["openai"]);
    expect(contentApiMocks.writeStoredContentSourceKinds).toHaveBeenCalledWith(["openai", "ithome"]);
    expect(routerMocks.replace).toHaveBeenCalledWith({
      query: {
        page: "1"
      }
    });
    expect(contentApiMocks.readAiNewPage).toHaveBeenCalledTimes(2);
    expect(contentApiMocks.readAiNewPage).toHaveBeenLastCalledWith({
      selectedSourceKinds: ["openai", "ithome"],
      sortMode: "published_at",
      page: 1,
      searchKeyword: ""
    });
    expect(wrapper.find("[data-content-section='featured']").exists()).toBe(false);
    expect(wrapper.get("[data-content-source-filter]").text()).toContain("已选 2 / 2 · 共 1 条");
    expect(wrapper.get("[data-content-section='list']").text()).toContain("New OpenAI Model");
    expect(wrapper.findAll("[data-content-row]").length).toBe(1);
  });

  it("persists sort mode changes and reloads with the shared sort preference", async () => {
    contentApiMocks.readAiNewPage
      .mockResolvedValueOnce(createModel())
      .mockResolvedValueOnce(createModel());

    const wrapper = mount(AiNewPage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();
    await wrapper.get("[data-content-sort-mode='content_score']").trigger("click");
    await flushPromises();

    expect(contentApiMocks.writeStoredContentSortMode).toHaveBeenCalledWith("content_score");
    expect(routerMocks.replace).toHaveBeenCalledWith({
      query: {
        page: "1"
      }
    });
    expect(contentApiMocks.readAiNewPage).toHaveBeenLastCalledWith({
      selectedSourceKinds: ["openai"],
      sortMode: "content_score",
      page: 1,
      searchKeyword: ""
    });
  });

  it("submits the shared title search keyword and reloads ai-new from page 1", async () => {
    contentApiMocks.readStoredContentSearchKeyword.mockReturnValue("agent");
    contentApiMocks.readAiNewPage.mockResolvedValue(createModel());

    const wrapper = mount(AiNewPage, { global: { plugins: [Antd] } });
    await flushPromises();

    await wrapper.get("[data-content-search-input]").setValue("openai");
    await wrapper.get("[data-content-search-submit]").trigger("click");
    await flushPromises();

    expect(contentApiMocks.writeStoredContentSearchKeyword).toHaveBeenCalledWith("openai");
    expect(routerMocks.replace).toHaveBeenCalledWith({ query: { page: "1" } });
    expect(contentApiMocks.readAiNewPage).toHaveBeenLastCalledWith({
      selectedSourceKinds: ["openai"],
      sortMode: "published_at",
      page: 1,
      searchKeyword: "openai"
    });
  });

  it("keeps the silent refresh spinner horizontally centered after source filter changes", async () => {
    const deferred = createDeferred<typeof baseModel>();
    contentApiMocks.readAiNewPage.mockResolvedValueOnce(createModel()).mockImplementationOnce(() => deferred.promise);

    const wrapper = mount(AiNewPage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();
    await wrapper.get("[data-source-kind='ithome']").setValue(true);
    await flushPromises();

    const indicator = wrapper.get("[data-content-refresh-indicator]");

    expect(indicator.classes()).toEqual(expect.arrayContaining(["flex", "w-full", "justify-center"]));
    expect(indicator.find(".ant-spin").exists()).toBe(true);

    deferred.resolve(createModel());
    await flushPromises();
  });

  it("shows a back-to-top button after scrolling and uses smooth scrolling when clicked", async () => {
    contentApiMocks.readAiNewPage.mockResolvedValueOnce(createModel());

    const wrapper = mount(AiNewPage, {
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

  it("syncs pagination through the route query and reloads the requested page", async () => {
    routeState.query = { page: "2" };
    contentApiMocks.readAiNewPage
      .mockResolvedValueOnce(
        createModel({
          pagination: {
            page: 2,
            pageSize: 50,
            totalResults: 120,
            totalPages: 3
          },
          cards: [
            {
              id: 201,
              title: "Page 2 First Card",
              summary: "The first card on the second page.",
              sourceName: "OpenAI",
              sourceKind: "openai",
              canonicalUrl: "https://example.com/page-2-first",
              publishedAt: "2026-03-31T14:00:00.000Z",
              contentScore: 88,
              scoreBadges: ["精选"]
            },
            {
              id: 202,
              title: "Page 2 Second Card",
              summary: "The second card on the second page.",
              sourceName: "IT之家",
              sourceKind: "ithome",
              canonicalUrl: "https://example.com/page-2-second",
              publishedAt: "2026-03-31T14:30:00.000Z",
              contentScore: 83,
              scoreBadges: ["24h 内"]
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        createModel({
          pagination: {
            page: 3,
            pageSize: 50,
            totalResults: 120,
            totalPages: 3
          },
          cards: [
            {
              id: 301,
              title: "Page 3 First Card",
              summary: "The first card on the third page.",
              sourceName: "OpenAI",
              sourceKind: "openai",
              canonicalUrl: "https://example.com/page-3-first",
              publishedAt: "2026-03-31T15:00:00.000Z",
              contentScore: 87,
              scoreBadges: ["精选"]
            },
            {
              id: 302,
              title: "Page 3 Second Card",
              summary: "The second card on the third page.",
              sourceName: "IT之家",
              sourceKind: "ithome",
              canonicalUrl: "https://example.com/page-3-second",
              publishedAt: "2026-03-31T15:30:00.000Z",
              contentScore: 81,
              scoreBadges: ["24h 内"]
            }
          ]
        })
      );

    const wrapper = mount(AiNewPage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();
    expect(wrapper.findAll("[data-content-display-index]").map((node) => node.text())).toEqual(["51", "52"]);
    await wrapper.get("[data-content-pagination-action='next']").trigger("click");
    await flushPromises();

    expect(contentApiMocks.readAiNewPage).toHaveBeenNthCalledWith(1, {
      selectedSourceKinds: ["openai"],
      sortMode: "published_at",
      page: 2,
      searchKeyword: ""
    });
    expect(routerMocks.replace).toHaveBeenCalledWith({
      query: {
        page: "3"
      }
    });
    expect(contentApiMocks.readAiNewPage).toHaveBeenNthCalledWith(2, {
      selectedSourceKinds: ["openai"],
      sortMode: "published_at",
      page: 3,
      searchKeyword: ""
    });
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "auto"
    });
    expect(wrapper.findAll("[data-content-display-index]").map((node) => node.text())).toEqual(["101", "102"]);
  });
});
