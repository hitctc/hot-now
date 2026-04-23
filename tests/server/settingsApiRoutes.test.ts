import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/server/createServer.js";

function pickCookieValue(setCookieHeader: string | string[] | undefined) {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;

  if (!raw) {
    return null;
  }

  return raw.split(";")[0] ?? null;
}

function createAuthenticatedServer() {
  return createServer({
    config: {
      collectionSchedule: {
        enabled: true,
        intervalMinutes: 10
      }
    },
    auth: {
      requireLogin: true,
      sessionSecret: "test-secret",
      verifyLogin: vi.fn().mockResolvedValue({
        username: "admin",
        displayName: "系统管理员",
        role: "admin"
      })
    },
    getViewRulesWorkbenchData: vi.fn().mockResolvedValue({
      filterWorkbench: {
        aiRule: {
          ruleKey: "ai",
          displayName: "AI 新讯怎么排",
          summary: "现在 AI 新讯默认只看最近 24 小时。排序时主要看 AI 内容、AI 新讯重点来源、综合分，下面会把这些词的意思直接写清楚。",
          toggles: {
            enableTimeWindow: true,
            enableSourceViewBonus: true,
            enableAiKeywordWeight: true,
            enableHeatKeywordWeight: true,
            enableFreshnessWeight: true,
            enableScoreRanking: true
          },
          weights: {
            freshnessWeight: 0.1,
            sourceWeight: 0.1,
            completenessWeight: 0.15,
            aiWeight: 0.5,
            heatWeight: 0.15
          }
        },
        hotRule: {
          ruleKey: "hot",
          displayName: "AI 热点怎么排",
          summary: "现在 AI 热点不限制 24 小时。排序时主要看热点词、新内容、AI 热点重点来源、综合分，下面会把这些词的意思直接写清楚。",
          toggles: {
            enableTimeWindow: false,
            enableSourceViewBonus: true,
            enableAiKeywordWeight: true,
            enableHeatKeywordWeight: true,
            enableFreshnessWeight: true,
            enableScoreRanking: true
          },
          weights: {
            freshnessWeight: 0.35,
            sourceWeight: 0.1,
            completenessWeight: 0.1,
            aiWeight: 0.05,
            heatWeight: 0.4
          }
        }
      },
      providerSettings: [
        {
          providerKind: "deepseek",
          apiKeyLast4: "1234",
          isEnabled: true,
          updatedAt: "2026-03-31T09:00:00.000Z"
        },
        {
          providerKind: "minimax",
          apiKeyLast4: "5678",
          isEnabled: false,
          updatedAt: "2026-03-31T08:30:00.000Z"
        }
      ],
      providerCapability: {
        hasMasterKey: true,
        featureAvailable: true,
        message: "已配置可用厂商"
      },
      feedbackPool: []
    }),
    listSources: vi.fn().mockResolvedValue([
      {
        kind: "openai",
        name: "OpenAI",
        rssUrl: "https://openai.com/news/rss.xml",
        isEnabled: true,
        showAllWhenSelected: true,
        lastCollectedAt: "2026-03-31T01:05:00.000Z",
        lastCollectionStatus: "completed"
      }
    ]),
    listTwitterAccounts: vi.fn().mockResolvedValue([
      {
        id: 1,
        username: "openai",
        userId: "123",
        displayName: "OpenAI",
        category: "official_vendor",
        priority: 90,
        includeReplies: false,
        isEnabled: true,
        notes: null,
        lastFetchedAt: null,
        lastSuccessAt: null,
        lastError: null,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z"
      }
    ]),
    listHackerNewsQueries: vi.fn().mockResolvedValue([
      {
        id: 11,
        query: "OpenAI",
        priority: 90,
        isEnabled: true,
        notes: "重点 query",
        lastFetchedAt: null,
        lastSuccessAt: null,
        lastResult: null,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z"
      }
    ]),
    listBilibiliQueries: vi.fn().mockResolvedValue([
      {
        id: 12,
        query: "OpenAI",
        priority: 88,
        isEnabled: true,
        notes: "视频重点词",
        lastFetchedAt: null,
        lastSuccessAt: null,
        lastResult: null,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z"
      }
    ]),
    hasTwitterApiKey: true,
    triggerManualRun: vi.fn().mockResolvedValue({ accepted: true }),
    triggerManualHackerNewsCollect: vi.fn().mockResolvedValue({ accepted: true }),
    triggerManualBilibiliCollect: vi.fn().mockResolvedValue({ accepted: true }),
    getSourcesOperationSummary: vi.fn().mockResolvedValue({
      lastCollectionRunAt: "2026-03-31T03:00:00.000Z",
      lastSendLatestEmailAt: "2026-03-31T03:10:00.000Z"
    }),
    getCurrentUserProfile: vi.fn().mockResolvedValue({
      username: "admin",
      displayName: "系统管理员",
      role: "admin",
      email: "admin@example.com"
    })
  } as never);
}

async function loginAndGetCookie(app: ReturnType<typeof createServer>) {
  const loginResponse = await app.inject({
    method: "POST",
    url: "/login",
    payload: { username: "admin", password: "admin" }
  });

  return pickCookieValue(loginResponse.headers["set-cookie"]);
}

describe("settings api routes", () => {
  it("returns the view-rules workbench model for logged-in users", async () => {
    const app = createAuthenticatedServer();
    const cookie = await loginAndGetCookie(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/settings/view-rules",
      headers: {
        cookie: cookie ?? ""
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      filterWorkbench: {
        aiRule: {
          displayName: "AI 新讯怎么排",
          toggles: {
            enableTimeWindow: true
          }
        },
        hotRule: {
          displayName: "AI 热点怎么排",
          toggles: {
            enableScoreRanking: true
          }
        }
      },
      providerSettings: [
        {
          providerKind: "deepseek",
          apiKeyLast4: "1234",
          isEnabled: true
        },
        {
          providerKind: "minimax",
          apiKeyLast4: "5678",
          isEnabled: false
        }
      ],
      providerCapability: {
        hasMasterKey: true,
        featureAvailable: true
      }
    });
  });

  it("returns the sources model for logged-in users", async () => {
    const app = createAuthenticatedServer();
    const cookie = await loginAndGetCookie(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/settings/sources",
      headers: {
        cookie: cookie ?? ""
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sources: [
        {
          kind: "openai",
          name: "OpenAI",
          isEnabled: true,
          showAllWhenSelected: true
        }
      ],
      twitterAccounts: [
        {
          id: 1,
          username: "openai",
          displayName: "OpenAI",
          category: "official_vendor",
          priority: 90,
          isEnabled: true
        }
      ],
      hackerNewsQueries: [
        {
          id: 11,
          query: "OpenAI",
          priority: 90,
          isEnabled: true
        }
      ],
      bilibiliQueries: [
        {
          id: 12,
          query: "OpenAI",
          priority: 88,
          isEnabled: true
        }
      ],
      operations: {
        lastCollectionRunAt: "2026-03-31T03:00:00.000Z",
        lastSendLatestEmailAt: "2026-03-31T03:10:00.000Z",
        nextCollectionRunAt: expect.any(String),
        canTriggerManualCollect: true,
        canTriggerManualTwitterCollect: false,
        canTriggerManualHackerNewsCollect: true,
        canTriggerManualBilibiliCollect: true,
        canTriggerManualSendLatestEmail: false,
        isRunning: false
      },
      capability: {
        wechatArticleUrlEnabled: false,
        twitterAccountCollectionEnabled: true,
        hackerNewsSearchEnabled: true,
        bilibiliSearchEnabled: true
      }
    });
  });

  it("does not pass content-page source filters through to the sources workbench reader", async () => {
    const listSources = vi.fn().mockResolvedValue([
      {
        kind: "openai",
        name: "OpenAI",
        rssUrl: "https://openai.com/news/rss.xml",
        isEnabled: true,
        showAllWhenSelected: false,
        lastCollectedAt: null,
        lastCollectionStatus: null
      }
    ]);
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue({
          username: "admin",
          displayName: "系统管理员",
          role: "admin"
        })
      },
      listSources,
      getSourcesOperationSummary: vi.fn().mockResolvedValue({
        lastCollectionRunAt: null,
        lastSendLatestEmailAt: null
      })
    } as never);
    const cookie = await loginAndGetCookie(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/settings/sources",
      headers: {
        cookie: cookie ?? "",
        "x-hot-now-source-filter": "openai,juya"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(listSources).toHaveBeenCalledWith();
  });

  it("returns the current user model for logged-in users", async () => {
    const app = createAuthenticatedServer();
    const cookie = await loginAndGetCookie(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/settings/profile",
      headers: {
        cookie: cookie ?? ""
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      profile: {
        username: "admin",
        displayName: "系统管理员",
        role: "admin",
        email: "admin@example.com",
        loggedIn: true
      }
    });
  });

  it("rejects anonymous profile reads when auth is enabled", async () => {
    const app = createAuthenticatedServer();

    const response = await app.inject({
      method: "GET",
      url: "/api/settings/profile"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("allows direct reads when auth is disabled", async () => {
    const app = createServer({
      getCurrentUserProfile: vi.fn().mockResolvedValue({
        username: "guest",
        displayName: "公开访客",
        role: "reader",
        email: null
      })
    } as never);

    const response = await app.inject({
      method: "GET",
      url: "/api/settings/profile"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      profile: {
        username: "guest",
        displayName: "公开访客",
        role: "reader",
        email: null,
        loggedIn: false
      }
    });
  });
});
