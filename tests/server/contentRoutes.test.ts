import { describe, expect, it, vi } from "vitest";
import { createSessionToken } from "../../src/core/auth/session.js";
import { createServer } from "../../src/server/createServer.js";

describe("content routes", () => {
  it("renders AI 新讯 cards on / and /ai-new with the shared AI-first shell", async () => {
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
        title: "Unsafe Link Item",
        summary: "Entry containing an unsafe link value.",
        sourceName: "Juya AI Daily",
        canonicalUrl: "javascript:alert(1)",
        publishedAt: "2026-03-28T09:00:00.000Z",
        isFavorited: false,
        reaction: "none",
        contentScore: 64,
        scoreBadges: ["3 天内", "聚合源"]
      }
    ]);
    const app = createServer({
      listContentView,
      listRatingDimensions: vi.fn().mockResolvedValue([])
    } as never);

    for (const pathname of ["/", "/ai-new"]) {
      const response = await app.inject({ method: "GET", url: pathname });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("AI Weekly Insight");
      expect(response.body).toContain('class="content-intro content-intro--signal content-intro--ai"');
      expect(response.body).toContain('class="content-grid content-grid--ai"');
      expect(response.body).toContain('data-content-id="101"');
      expect(response.body).toContain('class="content-card content-card--featured"');
      expect(response.body).toContain('data-card-variant="featured"');
      expect(response.body).toContain('class="content-card content-card--compact"');
      expect(response.body).toContain('href="https://example.com/ai-weekly"');
      expect(response.body).not.toContain('href="javascript:alert(1)"');
      expect(response.body).toContain("Unsafe Link Item");
      expect(response.body).toContain("AI 新讯");
      expect(response.body).toContain('class="nav-link nav-link--content is-active" data-shell-nav href="/ai-new"');
      expect(response.body).toContain('class="mobile-top-tab mobile-top-tab--content is-active" data-shell-nav href="/ai-new"');
      expect(response.body).not.toContain('href="/articles"');
      expect(response.body).not.toContain('href="/ai"');
    }

    expect(listContentView).toHaveBeenNthCalledWith(1, "ai");
    expect(listContentView).toHaveBeenNthCalledWith(2, "ai");
  });

  it("renders AI 热点 cards on /ai-hot and removes /articles", async () => {
    const listContentView = vi.fn().mockResolvedValue([
      {
        id: 201,
        title: "AI Heat Watch",
        summary: "Signals that already look like emerging hotspots.",
        sourceName: "OpenAI",
        canonicalUrl: "https://example.com/ai-heat",
        publishedAt: "2026-03-30T08:00:00.000Z",
        isFavorited: false,
        reaction: "none",
        contentScore: 88,
        scoreBadges: ["24h 内", "官方源"]
      }
    ]);
    const app = createServer({
      listContentView,
      listRatingDimensions: vi.fn().mockResolvedValue([])
    } as never);

    const response = await app.inject({ method: "GET", url: "/ai-hot" });
    const removedResponse = await app.inject({ method: "GET", url: "/articles" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('class="content-intro content-intro--signal content-intro--hot"');
    expect(response.body).toContain('class="content-grid content-grid--hot"');
    expect(response.body).toContain('class="content-card content-card--featured"');
    expect(response.body).toContain('data-card-variant="featured"');
    expect(response.body).toContain('class="nav-link nav-link--content is-active" data-shell-nav href="/ai-hot"');
    expect(response.body).toContain('class="mobile-top-tab mobile-top-tab--content is-active" data-shell-nav href="/ai-hot"');
    expect(listContentView).toHaveBeenCalledWith("hot");
    expect(removedResponse.statusCode).toBe(404);
  });

  it("renders a compact source filter bar on AI-first content pages", async () => {
    const listContentView = vi.fn().mockResolvedValue([
      {
        id: 101,
        title: "AI Weekly Insight",
        summary: "Roundup of recent AI and product updates.",
        sourceName: "OpenAI",
        sourceKind: "openai",
        canonicalUrl: "https://example.com/ai-weekly",
        publishedAt: "2026-03-31T01:00:00.000Z",
        isFavorited: false,
        reaction: "none",
        contentScore: 91,
        scoreBadges: ["24h 内"]
      }
    ]);
    const app = createServer({
      listContentView,
      listContentSources: vi.fn().mockResolvedValue([
        { kind: "openai", name: "OpenAI", isEnabled: true },
        { kind: "ithome", name: "IT之家", isEnabled: true }
      ])
    } as never);

    const response = await app.inject({ method: "GET", url: "/ai-new" });

    expect(response.body).toContain('class="content-source-filter"');
    expect(response.body).toContain('data-content-source-filter');
    expect(response.body).toContain("来源筛选");
    expect(response.body).toContain("全选");
    expect(response.body).toContain("全不选");
    expect(response.body).toContain('data-source-kind="openai"');
  });

  it("passes selected source kinds from shell header into the AI 热点 view", async () => {
    const listContentView = vi.fn().mockResolvedValue([]);
    const app = createServer({
      listContentView,
      listContentSources: vi.fn().mockResolvedValue([{ kind: "openai", name: "OpenAI", isEnabled: true }])
    } as never);

    await app.inject({
      method: "GET",
      url: "/ai-hot",
      headers: {
        "x-hot-now-source-filter": "openai"
      }
    });

    expect(listContentView).toHaveBeenCalledWith("hot", { selectedSourceKinds: ["openai"] });
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

  it("degrades content pages when the local content store is malformed", async () => {
    const listContentView = vi.fn().mockImplementation(() => {
      const error = new Error("database disk image is malformed");
      (error as Error & { code?: string }).code = "SQLITE_CORRUPT";
      throw error;
    });
    const app = createServer({
      listContentView,
      listRatingDimensions: vi.fn().mockResolvedValue([])
    } as never);

    const response = await app.inject({ method: "GET", url: "/ai-new" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("内容暂不可用");
    expect(response.body).toContain("检测到本地内容库读取失败");
    expect(response.body).toContain("data/hot-now.sqlite");
    expect(response.body).toContain('class="content-empty content-empty--signal content-empty--degraded"');
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
    expect(contentResponse.body).toContain("AI 新讯");
    expect(contentResponse.body).toContain("当前为内容公开访问模式");
    expect(contentResponse.body).toContain('href="/login"');
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
