import { describe, expect, it, vi } from "vitest";
import { createSessionToken } from "../../src/core/auth/session.js";
import { createServer } from "../../src/server/createServer.js";

describe("content routes", () => {
  it("serves the Vue client entry on /, /ai-new and /ai-hot, and removes /articles", async () => {
    const app = createServer({
      listContentView: vi.fn().mockResolvedValue([])
    } as never);

    for (const pathname of ["/", "/ai-new", "/ai-hot"]) {
      const response = await app.inject({ method: "GET", url: pathname });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('id="app"');
      expect(response.body).not.toContain('class="shell-root"');
      expect(response.body).not.toContain('data-shell-nav');
    }

    const articlesResponse = await app.inject({ method: "GET", url: "/articles" });
    expect(articlesResponse.statusCode).toBe(404);
  });

  it("returns AI 新讯 and AI 热点 models through dedicated JSON APIs", async () => {
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
        feedbackEntry: {
          freeText: "保留 agent workflow 内容",
          suggestedEffect: "boost",
          strengthLevel: "high",
          positiveKeywords: ["agent", "workflow"],
          negativeKeywords: ["融资"]
        },
        contentScore: 91,
        scoreBadges: ["24h 内", "官方源", "正文完整"]
      },
      {
        id: 102,
        title: "AI Policy Watch",
        summary: "A compact summary for layout verification.",
        sourceName: "OpenAI",
        canonicalUrl: "https://example.com/ai-policy",
        publishedAt: "2026-03-28T09:00:00.000Z",
        isFavorited: false,
        reaction: "none",
        contentScore: 88,
        scoreBadges: ["24h 内", "官方源"]
      }
    ]);
    const app = createServer({
      listContentView,
      listContentSources: vi.fn().mockResolvedValue([
        { kind: "openai", name: "OpenAI", isEnabled: true },
        { kind: "ithome", name: "IT之家", isEnabled: true }
      ])
    } as never);

    const aiNewResponse = await app.inject({
      method: "GET",
      url: "/api/content/ai-new",
      headers: {
        "x-hot-now-source-filter": "openai,missing"
      }
    });
    const aiNewPayload = aiNewResponse.json() as {
      pageKey: string;
      featuredCard: { id: number } | null;
      cards: { id: number }[];
      sourceFilter?: { options: { kind: string; name: string }[]; selectedSourceKinds: string[] };
      emptyState: { title: string; tone: string } | null;
    };

    expect(aiNewResponse.statusCode).toBe(200);
    expect(aiNewPayload.pageKey).toBe("ai-new");
    expect(aiNewPayload.featuredCard?.id).toBe(101);
    expect(aiNewPayload.cards.map((card) => card.id)).toEqual([102]);
    expect(aiNewPayload.sourceFilter?.options).toEqual([
      { kind: "openai", name: "OpenAI" },
      { kind: "ithome", name: "IT之家" }
    ]);
    expect(aiNewPayload.sourceFilter?.selectedSourceKinds).toEqual(["openai"]);
    expect(aiNewPayload.emptyState).toBeNull();

    const aiHotResponse = await app.inject({
      method: "GET",
      url: "/api/content/ai-hot"
    });
    const aiHotPayload = aiHotResponse.json() as {
      pageKey: string;
      featuredCard: { id: number } | null;
      cards: { id: number }[];
      emptyState: { title: string; tone: string } | null;
    };

    expect(aiHotResponse.statusCode).toBe(200);
    expect(aiHotPayload.pageKey).toBe("ai-hot");
    expect(aiHotPayload.featuredCard).toBeNull();
    expect(aiHotPayload.cards.map((card) => card.id)).toEqual([101, 102]);
    expect(aiHotPayload.emptyState).toBeNull();
    expect(listContentView).toHaveBeenCalledWith("ai", { selectedSourceKinds: ["openai"] });
    expect(listContentView).toHaveBeenCalledWith("hot");
  });

  it("degrades content APIs when the local content store is malformed", async () => {
    const listContentView = vi.fn().mockImplementation(() => {
      const error = new Error("database disk image is malformed");
      (error as Error & { code?: string }).code = "SQLITE_CORRUPT";
      throw error;
    });
    const app = createServer({
      listContentView,
      listRatingDimensions: vi.fn().mockResolvedValue([])
    } as never);

    const response = await app.inject({ method: "GET", url: "/api/content/ai-new" });
    const payload = response.json() as {
      featuredCard: unknown;
      cards: unknown[];
      emptyState: { title: string; description: string; tone: string } | null;
    };

    expect(response.statusCode).toBe(200);
    expect(payload.featuredCard).toBeNull();
    expect(payload.cards).toEqual([]);
    expect(payload.emptyState).toEqual({
      title: "内容暂不可用",
      description: "检测到本地内容库读取失败，请修复或重建 data/hot-now.sqlite 后再刷新。",
      tone: "degraded"
    });
  });

  it("keeps content pages public while auth-enabled system pages still redirect anonymous visitors", async () => {
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret"
      },
      listContentView: vi.fn().mockResolvedValue([]),
      listRatingDimensions: vi.fn().mockResolvedValue([])
    } as never);

    const contentResponse = await app.inject({ method: "GET", url: "/ai-new" });
    const systemResponse = await app.inject({ method: "GET", url: "/settings/profile" });

    expect(contentResponse.statusCode).toBe(200);
    expect(contentResponse.body).toContain('id="app"');
    expect(contentResponse.body).not.toContain('class="shell-root"');
    expect(systemResponse.statusCode).toBe(302);
    expect(systemResponse.headers.location).toBe("/login");
  });

  it("serves the signed-in system route through the client entry", async () => {
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret"
      },
      getCurrentUserProfile: vi.fn().mockResolvedValue({
        username: "admin",
        displayName: "系统管理员",
        role: "admin",
        email: "admin@example.com"
      })
    } as never);
    const sessionToken = createSessionToken(
      {
        username: "admin",
        displayName: "系统管理员",
        role: "admin"
      },
      "test-secret"
    );

    const response = await app.inject({
      method: "GET",
      url: "/settings/profile",
      headers: {
        cookie: `hot_now_session=${sessionToken}`
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('id="app"');
    expect(response.body).not.toContain('class="shell-sidebar"');
    expect(response.body).not.toContain("系统管理员");
    expect(response.body).not.toContain("退出登录");
  });

  it("serves site.js without ratings submit logic", async () => {
    const app = createServer({
      listContentView: vi.fn().mockResolvedValue([])
    } as never);

    const response = await app.inject({ method: "GET", url: "/assets/site.js" });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('"/actions/content/${contentId}/ratings"');
    expect(response.body).not.toContain("handleRatings");
    expect(response.body).toContain("global-status-toast");
    expect(response.body).toContain("ensureGlobalStatusToast");
    expect(response.body).toContain("document.body.appendChild(toast)");
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
    expect(response.json()).toEqual({ ok: true, contentItemId: 42, isFavorited: true });
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

  it("calls saveContentFeedback for feedback pool action", async () => {
    const saveContentFeedback = vi.fn().mockResolvedValue({ ok: true, entryId: 9 });
    const app = createServer({
      saveContentFeedback
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/content/42/feedback-pool",
      payload: {
        reactionSnapshot: "like",
        freeText: "保留 agent workflow 内容",
        suggestedEffect: "boost",
        strengthLevel: "high",
        positiveKeywords: ["agent", "workflow"],
        negativeKeywords: ["融资"]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(saveContentFeedback).toHaveBeenCalledWith(42, {
      reactionSnapshot: "like",
      freeText: "保留 agent workflow 内容",
      suggestedEffect: "boost",
      strengthLevel: "high",
      positiveKeywords: ["agent", "workflow"],
      negativeKeywords: ["融资"]
    });
    expect(response.json()).toEqual({
      ok: true,
      contentItemId: 42,
      entryId: 9
    });
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
