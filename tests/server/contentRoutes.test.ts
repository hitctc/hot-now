import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/server/createServer.js";

describe("content routes", () => {
  it("renders content cards on home page when content deps are provided", async () => {
    const listContentView = vi.fn().mockResolvedValue([
      {
        id: 101,
        title: "AI Weekly Insight",
        summary: "Roundup of recent AI and product updates.",
        sourceName: "Juya AI Daily",
        canonicalUrl: "https://example.com/ai-weekly",
        publishedAt: "2026-03-28T10:00:00.000Z",
        isFavorited: false,
        reaction: "none",
        averageRating: null
      }
    ]);
    const listRatingDimensions = vi.fn().mockResolvedValue([
      { id: 1, key: "value", name: "价值", description: "是否值得投入时间", weight: 1 }
    ]);
    const app = createServer({
      listContentView,
      listRatingDimensions
    } as never);

    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("AI Weekly Insight");
    expect(response.body).toContain('data-content-id="101"');
    expect(listContentView).toHaveBeenCalledWith("hot");
  });

  it("calls saveFavorite for favorite action", async () => {
    const saveFavorite = vi.fn().mockResolvedValue(undefined);
    const app = createServer({
      saveFavorite
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/content/42/favorite",
      payload: { isFavorited: true }
    });

    expect(response.statusCode).toBe(200);
    expect(saveFavorite).toHaveBeenCalledWith(42, true);
  });

  it("calls saveReaction for reaction action", async () => {
    const saveReaction = vi.fn().mockResolvedValue(undefined);
    const app = createServer({
      saveReaction
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/content/42/reaction",
      payload: { reaction: "dislike" }
    });

    expect(response.statusCode).toBe(200);
    expect(saveReaction).toHaveBeenCalledWith(42, "dislike");
  });

  it("calls saveRatings for ratings action", async () => {
    const saveRatings = vi.fn().mockResolvedValue(undefined);
    const app = createServer({
      saveRatings
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/content/42/ratings",
      payload: { scores: { value: 4, credibility: 5 } }
    });

    expect(response.statusCode).toBe(200);
    expect(saveRatings).toHaveBeenCalledWith(42, { value: 4, credibility: 5 });
  });

  it("rejects anonymous content actions with 401 when auth is enabled", async () => {
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue(null)
      },
      saveFavorite: vi.fn().mockResolvedValue(undefined),
      saveReaction: vi.fn().mockResolvedValue(undefined),
      saveRatings: vi.fn().mockResolvedValue(undefined)
    });

    const favoriteResponse = await app.inject({
      method: "POST",
      url: "/actions/content/42/favorite",
      payload: { isFavorited: true }
    });
    const reactionResponse = await app.inject({
      method: "POST",
      url: "/actions/content/42/reaction",
      payload: { reaction: "like" }
    });
    const ratingsResponse = await app.inject({
      method: "POST",
      url: "/actions/content/42/ratings",
      payload: { scores: { value: 4 } }
    });

    expect(favoriteResponse.statusCode).toBe(401);
    expect(reactionResponse.statusCode).toBe(401);
    expect(ratingsResponse.statusCode).toBe(401);
  });
});
