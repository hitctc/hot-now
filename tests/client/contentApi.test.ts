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
        options: [{ kind: "openai", name: "OpenAI" }],
        selectedSourceKinds: ["openai"]
      },
      featuredCard: null,
      cards: [],
      emptyState: null
    });

    const { readAiNewPage, readAiHotPage } = await import("../../src/client/services/contentApi");

    await readAiNewPage([" openai ", "openai", "ithome"]);
    await readAiHotPage(undefined);

    expect(requestJson).toHaveBeenNthCalledWith(
      1,
      "/api/content/ai-new",
      expect.objectContaining({
        headers: {
          "x-hot-now-source-filter": "openai,ithome"
        }
      })
    );
    expect(requestJson).toHaveBeenNthCalledWith(2, "/api/content/ai-hot", {
      headers: undefined
    });
  });

  it("persists and restores selected content source kinds", async () => {
    const { CONTENT_SOURCE_STORAGE_KEY, readStoredContentSourceKinds, writeStoredContentSourceKinds } = await import(
      "../../src/client/services/contentApi"
    );

    writeStoredContentSourceKinds([" openai ", "openai", "ithome"]);

    expect(window.localStorage.getItem(CONTENT_SOURCE_STORAGE_KEY)).toBe('["openai","ithome"]');
    expect(readStoredContentSourceKinds()).toEqual(["openai", "ithome"]);
  });

  it("posts content actions to dedicated endpoints", async () => {
    requestJson.mockResolvedValue({ ok: true });

    const { saveFavorite, saveReaction, saveFeedbackPoolEntry } = await import(
      "../../src/client/services/contentApi"
    );

    await saveFavorite(42, true);
    await saveReaction(42, "like");
    await saveFeedbackPoolEntry(42, {
      reactionSnapshot: "like",
      freeText: "保留 agent workflow 内容",
      suggestedEffect: "boost",
      strengthLevel: "high",
      positiveKeywords: ["agent", "workflow"],
      negativeKeywords: []
    });

    expect(requestJson).toHaveBeenNthCalledWith(1, "/actions/content/42/favorite", {
      method: "POST",
      body: JSON.stringify({ isFavorited: true })
    });
    expect(requestJson).toHaveBeenNthCalledWith(2, "/actions/content/42/reaction", {
      method: "POST",
      body: JSON.stringify({ reaction: "like" })
    });
    expect(requestJson).toHaveBeenNthCalledWith(3, "/actions/content/42/feedback-pool", {
      method: "POST",
      body: JSON.stringify({
        reactionSnapshot: "like",
        freeText: "保留 agent workflow 内容",
        suggestedEffect: "boost",
        strengthLevel: "high",
        positiveKeywords: ["agent", "workflow"],
        negativeKeywords: []
      })
    });
  });
});
