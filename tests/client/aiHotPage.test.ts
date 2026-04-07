import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AiHotPage from "../../src/client/pages/content/AiHotPage.vue";

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
  readAiHotPage: vi.fn(),
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
    readAiHotPage: contentApiMocks.readAiHotPage,
    readStoredContentSourceKinds: contentApiMocks.readStoredContentSourceKinds,
    writeStoredContentSourceKinds: contentApiMocks.writeStoredContentSourceKinds,
    readStoredContentSortMode: contentApiMocks.readStoredContentSortMode,
    writeStoredContentSortMode: contentApiMocks.writeStoredContentSortMode,
    readStoredContentSearchKeyword: contentApiMocks.readStoredContentSearchKeyword,
    writeStoredContentSearchKeyword: contentApiMocks.writeStoredContentSearchKeyword
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
  pagination: {
    page: 1,
    pageSize: 50,
    totalResults: 80,
    totalPages: 2
  },
  cards: [
    {
      id: 11,
      title: "Hot AI Event",
      summary: "A hot signal that is already trending.",
      sourceName: "OpenAI",
      sourceKind: "openai",
      canonicalUrl: "https://example.com/hot",
      publishedAt: "2026-03-31T13:00:00.000Z",
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

describe("AiHotPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    routeState.query = {};
    routerMocks.replace.mockImplementation(async (location: { query?: Record<string, unknown> }) => {
      routeState.query = location.query ?? {};
    });
    contentApiMocks.readStoredContentSourceKinds.mockReturnValue(["openai"]);
    contentApiMocks.readStoredContentSortMode.mockReturnValue("content_score");
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

  it("renders the hot card stream", async () => {
    contentApiMocks.readAiHotPage.mockResolvedValueOnce(createModel());

    const wrapper = mount(AiHotPage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    expect(contentApiMocks.readAiHotPage).toHaveBeenCalledWith({
      selectedSourceKinds: ["openai"],
      sortMode: "content_score",
      page: 1,
      searchKeyword: ""
    });
    expect(wrapper.get("[data-content-page='ai-hot']").classes()).toEqual(
      expect.arrayContaining(["flex", "flex-col", "gap-6"])
    );
    expect(wrapper.find("[data-content-filter-shell]").exists()).toBe(false);
    expect(wrapper.findAll("[data-content-toolbar-card]").length).toBe(1);
    expect(wrapper.get("[data-content-sticky-toolbar]").classes()).toEqual(
      expect.arrayContaining(["sticky", "z-20", "top-4", "max-[900px]:top-[72px]"])
    );
    expect((wrapper.get("[data-content-toolbar-source-panel]").element as HTMLElement).style.display).toBe("none");
    expect(wrapper.get("[data-content-toolbar-summary]").attributes("aria-expanded")).toBe("false");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").text()).toContain("展开来源");
    await wrapper.get("[data-content-toolbar-source-toggle]").trigger("click");
    await flushPromises();
    expect((wrapper.get("[data-content-toolbar-source-panel]").element as HTMLElement).style.display).toBe("");
    expect(wrapper.get("[data-content-toolbar-summary]").attributes("aria-expanded")).toBe("true");
    expect(wrapper.get("[data-content-source-filter]").text()).toContain("已选 1 / 2 · 共 80 条");
    expect(wrapper.find("[data-content-sort-control]").exists()).toBe(true);
    expect(wrapper.get("[data-content-pagination-summary]").text()).toContain("第 1 / 2 页 · 共 80 条");
    expect(wrapper.get("[data-content-section='list']").attributes("data-list-style")).toBe("database");
    expect(wrapper.get("[data-content-section='list']").text()).toContain("Hot AI Event");
    expect(wrapper.findAll("[data-content-row]").length).toBe(1);
    expect(wrapper.findAll("[data-content-display-index]").map((node) => node.text())).toEqual(["1"]);
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

  it("clears the shared search keyword and reloads the default result set", async () => {
    contentApiMocks.readStoredContentSearchKeyword.mockReturnValue("agent");
    contentApiMocks.readAiHotPage.mockResolvedValue(createModel());

    const wrapper = mount(AiHotPage, { global: { plugins: [Antd] } });
    await flushPromises();

    await wrapper.get("[data-content-search-clear]").trigger("click");
    await flushPromises();

    expect(contentApiMocks.writeStoredContentSearchKeyword).toHaveBeenCalledWith("");
    expect(contentApiMocks.readAiHotPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ searchKeyword: "" })
    );
  });

  it("keeps the silent refresh spinner horizontally centered after source filter changes", async () => {
    const deferred = createDeferred<typeof baseModel>();
    contentApiMocks.readAiHotPage.mockResolvedValueOnce(createModel()).mockImplementationOnce(() => deferred.promise);

    const wrapper = mount(AiHotPage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();
    await wrapper.get("[data-content-toolbar-source-toggle]").trigger("click");
    await flushPromises();
    await wrapper.get("[data-source-kind='ithome']").setValue(true);
    await flushPromises();

    const indicator = wrapper.get("[data-content-refresh-indicator]");

    expect(indicator.classes()).toEqual(expect.arrayContaining(["flex", "w-full", "justify-center"]));
    expect(indicator.find(".ant-spin").exists()).toBe(true);

    deferred.resolve(createModel());
    await flushPromises();
  });

  it("reloads ai-hot when the user flips to the next page", async () => {
    routeState.query = { page: "1" };
    contentApiMocks.readAiHotPage
      .mockResolvedValueOnce(createModel())
      .mockResolvedValueOnce(
        createModel({
          pagination: {
            page: 2,
            pageSize: 50,
            totalResults: 80,
            totalPages: 2
          },
          cards: [
            {
              id: 21,
              title: "Page 2 Hot AI Event",
              summary: "A hot signal that keeps its global order on the second page.",
              sourceName: "OpenAI",
              sourceKind: "openai",
              canonicalUrl: "https://example.com/hot-page-2",
              publishedAt: "2026-03-31T16:00:00.000Z",
              contentScore: 89,
              scoreBadges: ["热点"]
            }
          ]
        })
      );

    const wrapper = mount(AiHotPage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();
    expect(wrapper.findAll("[data-content-display-index]").map((node) => node.text())).toEqual(["1"]);
    await wrapper.get("[data-content-pagination-action='next']").trigger("click");
    await flushPromises();

    expect(routerMocks.replace).toHaveBeenCalledWith({
      query: {
        page: "2"
      }
    });
    expect(contentApiMocks.readAiHotPage).toHaveBeenNthCalledWith(2, {
      selectedSourceKinds: ["openai"],
      sortMode: "content_score",
      page: 2,
      searchKeyword: ""
    });
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "auto"
    });
    expect(wrapper.findAll("[data-content-display-index]").map((node) => node.text())).toEqual(["51"]);
  });
});
