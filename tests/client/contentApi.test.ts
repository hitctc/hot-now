import { beforeEach, describe, expect, it, vi } from "vitest";

const requestJson = vi.fn();

vi.mock("../../src/client/services/http", () => ({
  requestJson
}));

describe("contentApi", () => {
  beforeEach(() => {
    requestJson.mockReset();
    window.localStorage.clear();
  });

  it("reads content pages with normalized source filters", async () => {
    requestJson.mockResolvedValue({
      pageKey: "ai-new",
      sourceFilter: {
        options: [{ kind: "openai", name: "OpenAI", showAllWhenSelected: false, currentPageVisibleCount: 3 }],
        selectedSourceKinds: ["openai"]
      },
      twitterAccountFilter: {
        options: [{ id: 1, label: "OpenAI", username: "openai" }],
        selectedAccountIds: [1]
      },
      twitterKeywordFilter: {
        options: [{ id: 11, label: "Image2" }],
        selectedKeywordIds: [11]
      },
      featuredCard: null,
      cards: [],
      pagination: {
        page: 2,
        pageSize: 50,
        totalResults: 120,
        totalPages: 3
      },
      emptyState: null
    });

    const { readAiNewPage, readAiHotPage } = await import("../../src/client/services/contentApi");

    await readAiNewPage({
      selectedSourceKinds: [" openai ", "openai", "ithome"],
      selectedTwitterAccountIds: [1, 1, 2],
      selectedTwitterKeywordIds: [11, 11, 12],
      sortMode: "content_score",
      page: 2
    });
    await readAiHotPage({ sortMode: "published_at" });
    const result = await readAiNewPage({
      selectedSourceKinds: ["openai"],
      sortMode: "content_score",
      page: 2
    });

    expect(requestJson).toHaveBeenNthCalledWith(
      1,
      "/api/content/ai-new?page=2",
      expect.objectContaining({
        headers: {
          "x-hot-now-source-filter": "openai,ithome",
          "x-hot-now-twitter-account-filter": "1,2",
          "x-hot-now-twitter-keyword-filter": "11,12",
          "x-hot-now-content-sort": "content_score"
        }
      })
    );
    expect(requestJson).toHaveBeenNthCalledWith(2, "/api/content/ai-hot", {
      headers: {
        "x-hot-now-content-sort": "published_at"
      }
    });
    expect(result.sourceFilter?.options[0]?.currentPageVisibleCount).toBe(3);
    expect(result.pagination?.page).toBe(2);
  });

  it("persists and restores selected content source kinds", async () => {
    const {
      CONTENT_SOURCE_STORAGE_KEY,
      CONTENT_SOURCE_STORAGE_VERSION_KEY,
      readStoredContentSourceKinds,
      writeStoredContentSourceKinds
    } = await import("../../src/client/services/contentApi");

    window.localStorage.setItem(CONTENT_SOURCE_STORAGE_KEY, '["openai"]');
    expect(readStoredContentSourceKinds()).toBeNull();

    writeStoredContentSourceKinds([" openai ", "openai", "ithome"]);

    expect(window.localStorage.getItem(CONTENT_SOURCE_STORAGE_KEY)).toBe('["openai","ithome"]');
    expect(window.localStorage.getItem(CONTENT_SOURCE_STORAGE_VERSION_KEY)).toBe("2");
    expect(readStoredContentSourceKinds()).toEqual(["openai", "ithome"]);
  });

  it("persists and restores twitter account and keyword filters", async () => {
    const {
      CONTENT_TWITTER_ACCOUNT_STORAGE_KEY,
      CONTENT_TWITTER_KEYWORD_STORAGE_KEY,
      readStoredTwitterAccountIds,
      readStoredTwitterKeywordIds,
      writeStoredTwitterAccountIds,
      writeStoredTwitterKeywordIds,
      deriveInitialSelectedEntityIds
    } = await import("../../src/client/services/contentApi");

    writeStoredTwitterAccountIds([1, 1, 2]);
    writeStoredTwitterKeywordIds([11, 11, 12]);

    expect(window.localStorage.getItem(CONTENT_TWITTER_ACCOUNT_STORAGE_KEY)).toBe("[1,2]");
    expect(window.localStorage.getItem(CONTENT_TWITTER_KEYWORD_STORAGE_KEY)).toBe("[11,12]");
    expect(readStoredTwitterAccountIds()).toEqual([1, 2]);
    expect(readStoredTwitterKeywordIds()).toEqual([11, 12]);
    expect(
      deriveInitialSelectedEntityIds(
        [{ id: 1 }, { id: 2 }, { id: 3 }],
        null
      )
    ).toEqual([1, 2, 3]);
    expect(
      deriveInitialSelectedEntityIds(
        [{ id: 1 }, { id: 2 }, { id: 3 }],
        [2, 9]
      )
    ).toEqual([2]);
  });

  it("persists sort mode and derives first-visit source defaults", async () => {
    const {
      CONTENT_SORT_STORAGE_KEY,
      readStoredContentSortMode,
      writeStoredContentSortMode,
      deriveInitialSelectedSourceKinds
    } = await import("../../src/client/services/contentApi");

    writeStoredContentSortMode("content_score");

    expect(window.localStorage.getItem(CONTENT_SORT_STORAGE_KEY)).toBe("content_score");
    expect(readStoredContentSortMode()).toBe("content_score");
    expect(
      deriveInitialSelectedSourceKinds(
        [
          { kind: "openai", name: "OpenAI", showAllWhenSelected: false, currentPageVisibleCount: 0 },
          { kind: "juya", name: "Juya AI Daily", showAllWhenSelected: true, currentPageVisibleCount: 0 }
        ],
        null
      )
    ).toEqual(["openai"]);
    expect(
      deriveInitialSelectedSourceKinds(
        [
          { kind: "openai", name: "OpenAI", showAllWhenSelected: false, currentPageVisibleCount: 0 },
          { kind: "juya", name: "Juya AI Daily", showAllWhenSelected: true, currentPageVisibleCount: 0 }
        ],
        ["juya"]
      )
    ).toEqual(["juya"]);
  });

  it("stores and reads the shared content search keyword from localStorage", async () => {
    const { CONTENT_SEARCH_STORAGE_KEY, readStoredContentSearchKeyword, writeStoredContentSearchKeyword } =
      await import("../../src/client/services/contentApi");

    writeStoredContentSearchKeyword("agent");

    expect(window.localStorage.getItem(CONTENT_SEARCH_STORAGE_KEY)).toBe("agent");
    expect(readStoredContentSearchKeyword()).toBe("agent");
  });

  it("sends the shared title search keyword through the content header", async () => {
    requestJson.mockResolvedValue({
      pageKey: "ai-new",
      sourceFilter: undefined,
      featuredCard: null,
      cards: [],
      pagination: null,
      emptyState: null
    });

    const { readAiNewPage } = await import("../../src/client/services/contentApi");

    await readAiNewPage({
      selectedSourceKinds: ["openai"],
      selectedTwitterAccountIds: [1],
      selectedTwitterKeywordIds: [11],
      sortMode: "published_at",
      searchKeyword: "agent"
    });

    expect(requestJson).toHaveBeenCalledWith("/api/content/ai-new", {
      headers: {
        "x-hot-now-source-filter": "openai",
        "x-hot-now-twitter-account-filter": "1",
        "x-hot-now-twitter-keyword-filter": "11",
        "x-hot-now-content-sort": "published_at",
        "x-hot-now-content-search": "agent"
      }
    });
  });

  it("encodes non-ascii title search keywords before sending the content header", async () => {
    requestJson.mockResolvedValue({
      pageKey: "ai-new",
      sourceFilter: undefined,
      featuredCard: null,
      cards: [],
      pagination: null,
      emptyState: null
    });

    const { readAiNewPage } = await import("../../src/client/services/contentApi");

    await readAiNewPage({
      selectedSourceKinds: ["ithome"],
      sortMode: "published_at",
      searchKeyword: "特斯拉 AI"
    });

    expect(requestJson).toHaveBeenCalledWith("/api/content/ai-new", {
      headers: {
        "x-hot-now-source-filter": "ithome",
        "x-hot-now-content-sort": "published_at",
        "x-hot-now-content-search": "%E7%89%B9%E6%96%AF%E6%8B%89%20AI"
      }
    });
  });

  it("sends the shared title search keyword through ai-hot header", async () => {
    requestJson.mockResolvedValue({
      pageKey: "ai-hot",
      sourceFilter: undefined,
      featuredCard: null,
      cards: [],
      pagination: null,
      emptyState: null
    });

    const { readAiHotPage } = await import("../../src/client/services/contentApi");

    await readAiHotPage({
      selectedSourceKinds: ["ithome"],
      sortMode: "content_score",
      searchKeyword: "workflow"
    });

    expect(requestJson).toHaveBeenCalledWith("/api/content/ai-hot", {
      headers: {
        "x-hot-now-source-filter": "ithome",
        "x-hot-now-content-sort": "content_score",
        "x-hot-now-content-search": "workflow"
      }
    });
  });

  it("does not send content search header for blank keywords", async () => {
    requestJson.mockResolvedValue({
      pageKey: "ai-new",
      sourceFilter: undefined,
      featuredCard: null,
      cards: [],
      pagination: null,
      emptyState: null
    });

    const { readAiNewPage } = await import("../../src/client/services/contentApi");

    await readAiNewPage({
      selectedSourceKinds: ["openai"],
      sortMode: "published_at",
      searchKeyword: "   "
    });

    expect(requestJson).toHaveBeenCalledWith("/api/content/ai-new", {
      headers: {
        "x-hot-now-source-filter": "openai",
        "x-hot-now-content-sort": "published_at"
      }
    });
  });

  it("only posts feedback pool actions and no longer exports favorite or reaction helpers", async () => {
    requestJson.mockResolvedValue({ ok: true });

    const contentApi = await import("../../src/client/services/contentApi");

    expect("saveFavorite" in contentApi).toBe(false);
    expect("saveReaction" in contentApi).toBe(false);

    await contentApi.saveFeedbackPoolEntry(42, {
      freeText: "保留 agent workflow 内容",
      suggestedEffect: "boost",
      strengthLevel: "high",
      positiveKeywords: ["agent", "workflow"],
      negativeKeywords: []
    });

    expect(requestJson).toHaveBeenNthCalledWith(1, "/actions/content/42/feedback-pool", {
      method: "POST",
      body: JSON.stringify({
        freeText: "保留 agent workflow 内容",
        suggestedEffect: "boost",
        strengthLevel: "high",
        positiveKeywords: ["agent", "workflow"],
        negativeKeywords: []
      })
    });
  });
});
