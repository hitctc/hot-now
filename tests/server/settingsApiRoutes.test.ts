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
      nlRules: [
        { scope: "base", enabled: true, ruleText: "", createdAt: "", updatedAt: "" },
        { scope: "ai_new", enabled: true, ruleText: "", createdAt: "", updatedAt: "" },
        { scope: "ai_hot", enabled: true, ruleText: "", createdAt: "", updatedAt: "" }
      ],
      feedbackPool: [],
      strategyDrafts: [],
      latestEvaluationRun: null,
      isEvaluationRunning: false,
      isEvaluationStopRequested: false
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
    triggerManualRun: vi.fn().mockResolvedValue({ accepted: true }),
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
      },
      nlRules: [
        { scope: "base", enabled: true },
        { scope: "ai_new", enabled: true },
        { scope: "ai_hot", enabled: true }
      ]
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
      operations: {
        lastCollectionRunAt: "2026-03-31T03:00:00.000Z",
        lastSendLatestEmailAt: "2026-03-31T03:10:00.000Z",
        nextCollectionRunAt: expect.any(String),
        canTriggerManualCollect: true,
        canTriggerManualSendLatestEmail: false,
        isRunning: false
      },
      capability: {
        wechatArticleUrlEnabled: false
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
