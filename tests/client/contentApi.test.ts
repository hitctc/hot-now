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
    const { CONTENT_SOURCE_STORAGE_KEY, readStoredContentSourceKinds, writeStoredContentSourceKinds } = await import(
      "../../src/client/services/contentApi"
    );

    writeStoredContentSourceKinds([" openai ", "openai", "ithome"]);

    expect(window.localStorage.getItem(CONTENT_SOURCE_STORAGE_KEY)).toBe('["openai","ithome"]');
    expect(readStoredContentSourceKinds()).toEqual(["openai", "ithome"]);
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
