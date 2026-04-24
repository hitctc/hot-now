import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createSessionToken } from "../../src/core/auth/session.js";
import { createServer } from "../../src/server/createServer.js";

const clientBuildRoot = createClientBuildFixture();

function createContentTestServer(overrides: Parameters<typeof createServer>[0] = {}) {
  return createServer({
    clientBuildRoot,
    ...overrides
  } as never);
}

describe("content routes", () => {
  it("serves the Vue client entry on /, /ai-new and /ai-hot, and removes /articles", async () => {
    const app = createContentTestServer({
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
    const contentCards = [
      {
        id: 101,
        title: "AI Weekly Insight",
        summary: "Roundup of recent AI and product updates.",
        sourceName: "OpenAI",
        sourceKind: "openai",
        canonicalUrl: "https://example.com/ai-weekly",
        publishedAt: "2026-03-28T10:00:00.000Z",
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
        sourceKind: "openai",
        canonicalUrl: "https://example.com/ai-policy",
        publishedAt: "2026-03-28T09:00:00.000Z",
        contentScore: 88,
        scoreBadges: ["24h 内", "官方源"]
      }
    ];
    const listContentView = vi.fn().mockImplementation((_viewKey, options) => {
      const selectedSourceKinds = options?.selectedSourceKinds;

      if (!selectedSourceKinds || selectedSourceKinds.length === 0) {
        return contentCards;
      }

      return contentCards.filter((card) => selectedSourceKinds.includes(card.sourceKind));
    });
    const app = createContentTestServer({
      listContentView,
      listContentSources: vi.fn().mockResolvedValue([
        { kind: "openai", name: "OpenAI", isEnabled: true, showAllWhenSelected: false },
        { kind: "ithome", name: "IT之家", isEnabled: true, showAllWhenSelected: true }
      ])
    } as never);

    const aiNewResponse = await app.inject({
      method: "GET",
      url: "/api/content/ai-new",
      headers: {
        "x-hot-now-source-filter": "openai,missing",
        "x-hot-now-twitter-account-filter": "1,2",
        "x-hot-now-twitter-keyword-filter": "11",
        "x-hot-now-content-sort": "content_score",
        "x-hot-now-content-search": "AI%20Weekly"
      }
    });
    const aiNewPayload = aiNewResponse.json() as {
      pageKey: string;
      featuredCard: { id: number } | null;
      cards: { id: number }[];
      sourceFilter?: {
        options: { kind: string; name: string; showAllWhenSelected: boolean; currentPageVisibleCount: number }[];
        selectedSourceKinds: string[];
      };
      emptyState: { title: string; tone: string } | null;
    };

    expect(aiNewResponse.statusCode).toBe(200);
    expect(aiNewPayload.pageKey).toBe("ai-new");
    expect(aiNewPayload.featuredCard).toBeNull();
    expect(aiNewPayload.cards.map((card) => card.id)).toEqual([101]);
    expect(aiNewPayload.sourceFilter?.options).toEqual([
      { kind: "openai", name: "OpenAI", showAllWhenSelected: false, currentPageVisibleCount: 1 },
      { kind: "ithome", name: "IT之家", showAllWhenSelected: true, currentPageVisibleCount: 0 }
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
    expect(listContentView).toHaveBeenCalledWith("ai", {
      selectedSourceKinds: ["openai"],
      selectedTwitterAccountIds: undefined,
      selectedTwitterKeywordIds: undefined,
      sortMode: "content_score"
    });
    expect(listContentView).toHaveBeenCalledWith("hot", {
      selectedSourceKinds: ["openai"],
      selectedTwitterAccountIds: undefined,
      selectedTwitterKeywordIds: undefined,
      sortMode: "published_at"
    });
  });

  it("includes enabled search aggregate source groups in the fallback content API model", async () => {
    const contentCards = [
      {
        id: 201,
        title: "OpenAI Codex B 站视频",
        summary: "B 站视频摘要",
        sourceName: "B 站搜索",
        sourceKind: "bilibili_search",
        canonicalUrl: "https://www.bilibili.com/video/BV-fallback",
        publishedAt: "2026-03-28T10:00:00.000Z",
        contentScore: 86,
        scoreBadges: ["24h 内"]
      },
      {
        id: 202,
        title: "Codex on Hacker News",
        summary: "HN 摘要",
        sourceName: "Hacker News",
        sourceKind: "hackernews_search",
        canonicalUrl: "https://news.ycombinator.com/item?id=1",
        publishedAt: "2026-03-28T09:00:00.000Z",
        contentScore: 84,
        scoreBadges: ["24h 内"]
      }
    ];
    const listContentView = vi.fn().mockImplementation((_viewKey, options) => {
      const selectedSourceKinds = options?.selectedSourceKinds ?? [];
      return contentCards.filter((card) => selectedSourceKinds.includes(card.sourceKind));
    });
    const app = createContentTestServer({
      listContentView,
      listContentSources: vi.fn().mockResolvedValue([
        { kind: "openai", name: "OpenAI", isEnabled: true, showAllWhenSelected: false }
      ]),
      listHackerNewsQueries: vi.fn().mockResolvedValue([{ id: 1, query: "Codex" }]),
      listBilibiliQueries: vi.fn().mockResolvedValue([{ id: 2, query: "OpenAI" }])
    } as never);

    const response = await app.inject({
      method: "GET",
      url: "/api/content/ai-new"
    });
    const payload = response.json() as {
      cards: { id: number }[];
      sourceFilter?: {
        options: { kind: string }[];
        selectedSourceKinds: string[];
      };
    };

    expect(response.statusCode).toBe(200);
    expect(payload.sourceFilter?.options.map((option) => option.kind)).toEqual(
      expect.arrayContaining(["hackernews_search", "bilibili_search"])
    );
    expect(payload.sourceFilter?.selectedSourceKinds).toEqual(
      expect.arrayContaining(["hackernews_search", "bilibili_search"])
    );
    expect(payload.cards.map((card) => card.id)).toEqual([201, 202]);
  });

  it("passes page query through to getContentPageModel and returns pagination metadata", async () => {
    const getContentPageModel = vi.fn().mockResolvedValue({
      pageKey: "ai-new",
      sourceFilter: {
        options: [
          { kind: "openai", name: "OpenAI", showAllWhenSelected: false, currentPageVisibleCount: 50 }
        ],
        selectedSourceKinds: ["openai"]
      },
      featuredCard: null,
      cards: Array.from({ length: 50 }, (_, index) => ({
        id: index + 1,
        title: `Paged card ${index + 1}`,
        summary: "Paged summary",
        sourceName: "OpenAI",
        sourceKind: "openai",
        canonicalUrl: `https://example.com/paged-${index + 1}`,
        publishedAt: "2026-03-31T10:00:00.000Z",
        contentScore: 90,
        scoreBadges: ["24h 内"]
      })),
      pagination: {
        page: 2,
        pageSize: 50,
        totalResults: 120,
        totalPages: 3
      },
      emptyState: null
    });
    const app = createContentTestServer({
      getContentPageModel
    } as never);

    const response = await app.inject({
      method: "GET",
      url: "/api/content/ai-new?page=2",
      headers: {
        "x-hot-now-source-filter": "openai",
        "x-hot-now-twitter-account-filter": "1,2",
        "x-hot-now-twitter-keyword-filter": "11",
        "x-hot-now-content-sort": "published_at",
        "x-hot-now-content-search": "agent"
      }
    });
    const payload = response.json() as {
      pageKey: string;
      pagination: {
        page: number;
        pageSize: number;
        totalResults: number;
        totalPages: number;
      } | null;
    };

    expect(response.statusCode).toBe(200);
    expect(payload.pageKey).toBe("ai-new");
    expect(payload.pagination).toEqual({
      page: 2,
      pageSize: 50,
      totalResults: 120,
      totalPages: 3
    });
    expect(getContentPageModel).toHaveBeenCalledWith("ai-new", {
      selectedSourceKinds: ["openai"],
      selectedTwitterAccountIds: [1, 2],
      selectedTwitterKeywordIds: [11],
      sortMode: "published_at",
      page: 2,
      searchKeyword: "agent"
    });
  });

  it("decodes encoded search headers before passing the keyword to the content model", async () => {
    const getContentPageModel = vi.fn().mockResolvedValue({
      pageKey: "ai-new",
      sourceFilter: undefined,
      featuredCard: null,
      cards: [],
      pagination: null,
      emptyState: null
    });
    const app = createContentTestServer({
      getContentPageModel
    } as never);

    const response = await app.inject({
      method: "GET",
      url: "/api/content/ai-new",
      headers: {
        "x-hot-now-content-search": "%E7%89%B9%E6%96%AF%E6%8B%89%20AI"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(getContentPageModel).toHaveBeenCalledWith("ai-new", {
      selectedSourceKinds: undefined,
      selectedTwitterAccountIds: undefined,
      selectedTwitterKeywordIds: undefined,
      sortMode: undefined,
      page: 1,
      searchKeyword: "特斯拉 AI"
    });
  });

  it("degrades content APIs when the local content store is malformed", async () => {
    const listContentView = vi.fn().mockImplementation(() => {
      const error = new Error("database disk image is malformed");
      (error as Error & { code?: string }).code = "SQLITE_CORRUPT";
      throw error;
    });
    const app = createContentTestServer({
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
    const app = createContentTestServer({
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
    const app = createContentTestServer({
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
    const app = createContentTestServer({
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

  it("removes the favorite and reaction action endpoints", async () => {
    const app = createContentTestServer({} as never);

    const favoriteResponse = await app.inject({
      method: "POST",
      url: "/actions/content/42/favorite",
      payload: { isFavorited: true }
    });
    const reactionResponse = await app.inject({
      method: "POST",
      url: "/actions/content/42/reaction",
      payload: { reaction: "dislike" }
    });

    expect(favoriteResponse.statusCode).toBe(404);
    expect(reactionResponse.statusCode).toBe(404);
  });

  it("calls saveContentFeedback for feedback pool action", async () => {
    const saveContentFeedback = vi.fn().mockResolvedValue({ ok: true, entryId: 9 });
    const app = createContentTestServer({
      saveContentFeedback
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/content/42/feedback-pool",
      payload: {
        freeText: "保留 agent workflow 内容",
        suggestedEffect: "boost",
        strengthLevel: "high",
        positiveKeywords: ["agent", "workflow"],
        negativeKeywords: ["融资"]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(saveContentFeedback).toHaveBeenCalledWith(42, {
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
    const app = createContentTestServer({
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
    const app = createContentTestServer({
      saveRatings: vi.fn().mockResolvedValue({ ok: false, reason: "not-found" })
    } as never);

    const ratingsResponse = await app.inject({
      method: "POST",
      url: "/actions/content/999/ratings",
      payload: { scores: { value: 4 } }
    });

    expect(ratingsResponse.statusCode).toBe(404);
  });

  it("returns 400 when ratings payload contains unknown dimensions", async () => {
    const app = createContentTestServer({
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
    const app = createContentTestServer({
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
    const app = createContentTestServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue(null)
      },
      saveRatings: vi.fn().mockResolvedValue({ ok: true, saved: 1, averageRating: 4 })
    });

    const ratingsResponse = await app.inject({
      method: "POST",
      url: "/actions/content/42/ratings",
      payload: { scores: { value: 4 } }
    });

    expect(ratingsResponse.statusCode).toBe(401);
  });
});

function createClientBuildFixture() {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "hot-now-content-client-"));
  const assetsDir = path.join(fixtureRoot, "assets");
  mkdirSync(assetsDir, { recursive: true });
  writeFileSync(path.join(assetsDir, "index-test.js"), "console.log('content route fixture');\n", "utf8");
  writeFileSync(path.join(assetsDir, "index-test.css"), "body{background:#fff;}\n", "utf8");
  writeFileSync(
    path.join(fixtureRoot, "index.html"),
    `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HotNow Content Test Shell</title>
    <script type="module" crossorigin src="/client/assets/index-test.js"></script>
    <link rel="stylesheet" crossorigin href="/client/assets/index-test.css" />
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
`,
    "utf8"
  );

  return fixtureRoot;
}
