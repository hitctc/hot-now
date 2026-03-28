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
      },
      {
        id: 102,
        title: "Unsafe Link Item",
        summary: "Entry containing an unsafe link value.",
        sourceName: "Juya AI Daily",
        canonicalUrl: "javascript:alert(1)",
        publishedAt: "2026-03-28T09:00:00.000Z",
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
    expect(response.body).toContain('href="https://example.com/ai-weekly"');
    expect(response.body).not.toContain('href="javascript:alert(1)"');
    expect(response.body).toContain("Unsafe Link Item");
    expect(listContentView).toHaveBeenCalledWith("hot");
  });

  it("renders a sidebar theme switcher in the unified shell", async () => {
    const app = createServer({
      listContentView: vi.fn().mockResolvedValue([]),
      listRatingDimensions: vi.fn().mockResolvedValue([])
    } as never);

    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<script src="/assets/site.js" defer></script>');
    expect(response.body).toContain('data-theme="dark"');
    expect(response.body).toContain("HotNow Signal Grid");
    expect(response.body).toContain("Cyber Intelligence Console");
    expect(response.body).toContain("科技内容、采集状态与操作控制在同一控制台内完成。");
    expect(response.body).toContain("data-theme-toggle");
    expect(response.body).toContain('data-theme-choice="dark" aria-pressed="true"');
    expect(response.body).toContain('data-theme-choice="light" aria-pressed="false"');
    expect(response.body).not.toContain("主题切换将在下一步启用。");
  });

  it("keeps system menu pages accessible in public content mode", async () => {
    const app = createServer({
      listContentView: vi.fn().mockResolvedValue([]),
      listRatingDimensions: vi.fn().mockResolvedValue([])
    } as never);

    const response = await app.inject({ method: "GET", url: "/settings/profile" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("当前登录用户");
    expect(response.body).toContain("模块占位");
  });

  it("calls saveFavorite for favorite action", async () => {
    const saveFavorite = vi.fn().mockResolvedValue({ ok: true });
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
    const saveReaction = vi.fn().mockResolvedValue({ ok: true });
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

  it("returns latest average rating in ratings action response", async () => {
    const saveRatings = vi.fn().mockResolvedValue({
      ok: true,
      saved: 2,
      averageRating: 4.5
    });
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
    expect(response.json()).toEqual({ ok: true, contentItemId: 42, saved: 2, averageRating: 4.5 });
  });

  it("returns 404 for content actions when content id does not exist", async () => {
    const app = createServer({
      saveFavorite: vi.fn().mockResolvedValue({ ok: false, reason: "not-found" }),
      saveReaction: vi.fn().mockResolvedValue({ ok: false, reason: "not-found" }),
      saveRatings: vi.fn().mockResolvedValue({ ok: false, reason: "not-found" })
    } as never);

    const favoriteResponse = await app.inject({
      method: "POST",
      url: "/actions/content/999/favorite",
      payload: { isFavorited: true }
    });
    const reactionResponse = await app.inject({
      method: "POST",
      url: "/actions/content/999/reaction",
      payload: { reaction: "like" }
    });
    const ratingsResponse = await app.inject({
      method: "POST",
      url: "/actions/content/999/ratings",
      payload: { scores: { value: 4 } }
    });

    expect(favoriteResponse.statusCode).toBe(404);
    expect(reactionResponse.statusCode).toBe(404);
    expect(ratingsResponse.statusCode).toBe(404);
  });

  it("returns 400 when ratings payload contains unknown dimensions", async () => {
    const app = createServer({
      saveRatings: vi.fn().mockResolvedValue({
        ok: false,
        reason: "unknown-dimensions",
        unknownKeys: ["custom-x"]
      })
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/content/42/ratings",
      payload: { scores: { "custom-x": 3 } }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      ok: false,
      reason: "unknown-dimensions",
      unknownKeys: ["custom-x"]
    });
  });

  it("returns 400 and skips saveRatings when payload mixes valid and invalid scores", async () => {
    const saveRatings = vi.fn().mockResolvedValue({ ok: true, saved: 1, averageRating: 4 });
    const app = createServer({
      saveRatings
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/content/42/ratings",
      payload: { scores: { value: 4, credibility: 9, readability: "x" } }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, reason: "invalid-ratings-payload" });
    expect(saveRatings).not.toHaveBeenCalled();
  });

  it("rejects anonymous content actions with 401 when auth is enabled", async () => {
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue(null)
      },
      saveFavorite: vi.fn().mockResolvedValue({ ok: true }),
      saveReaction: vi.fn().mockResolvedValue({ ok: true }),
      saveRatings: vi.fn().mockResolvedValue({ ok: true, saved: 1, averageRating: 4 })
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
