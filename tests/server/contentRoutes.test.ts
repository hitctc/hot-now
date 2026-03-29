import { describe, expect, it, vi } from "vitest";
import { createSessionToken } from "../../src/core/auth/session.js";
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
      listRatingDimensions: vi.fn()
    } as never);

    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("AI Weekly Insight");
    expect(response.body).toContain('class="content-kicker"');
    expect(response.body).toContain('class="content-intro content-intro--signal"');
    expect(response.body).toContain('class="content-stack content-stack--signal"');
    expect(response.body).toContain('data-content-id="101"');
    expect(response.body).toContain('class="content-card content-card--signal"');
    expect(response.body).toContain('class="content-summary-shell"');
    expect(response.body).toContain('class="content-title-link"');
    expect(response.body).toContain('title="AI Weekly Insight"');
    expect(response.body).toContain('class="content-score-pill"');
    expect(response.body).toContain('data-role="content-score"');
    expect(response.body).toContain('data-role="content-score">91</span>');
    expect(response.body).not.toContain("系统分");
    expect(response.body).not.toContain("/100");
    expect(response.body).toContain('class="content-score-badges"');
    expect(response.body).toContain('class="content-score-badge"');
    expect(response.body).toContain("24h 内");
    expect(response.body).toContain("官方源");
    expect(response.body).toContain("正文完整");
    expect(response.body).not.toContain('data-role="action-status"');
    expect(response.body).not.toContain('content-card-region--status');
    expect(response.body).toContain('href="https://example.com/ai-weekly"');
    expect(response.body).not.toContain('href="javascript:alert(1)"');
    expect(response.body).toContain("Unsafe Link Item");
    expect(listContentView).toHaveBeenCalledWith("hot");
    expect(response.body).not.toContain('class="rating-form"');
    expect(response.body).not.toContain('data-content-action="ratings"');
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
    expect(response.body).toContain('class="sidebar-page-summary"');
    expect(response.body).toContain("当前页面");
    expect(response.body).toContain("热点资讯");
    expect(response.body).toContain("这里会展示统一内容池中的热点内容与时效优先结果。");
    expect(response.body).toContain("data-theme-toggle");
    expect(response.body).toContain('class="sidebar-account"');
    expect(response.body).toContain("公开访问模式");
    expect(response.body).toContain('data-theme-choice="dark" aria-pressed="true"');
    expect(response.body).toContain('data-theme-choice="light" aria-pressed="false"');
    expect(response.body).not.toContain('class="shell-header"');
    expect(response.body).not.toContain("主题切换将在下一步启用。");
  });

  it("renders the signed-in user block beside the theme controls", async () => {
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
    expect(response.body).toContain('class="sidebar-account"');
    expect(response.body).toContain("系统管理员");
    expect(response.body).toContain("退出登录");
    expect(response.body).toContain('form method="post" action="/logout"');
    expect(response.body).not.toContain('class="shell-header"');
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
