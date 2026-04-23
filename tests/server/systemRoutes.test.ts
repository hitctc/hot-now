import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/server/createServer.js";

const clientBuildRoot = createClientBuildFixture();

function createSystemTestServer(overrides: Parameters<typeof createServer>[0] = {}) {
  // The system route suite pins its own bundle fixture so concurrent build tests cannot race on dist/.
  return createServer({
    clientBuildRoot,
    ...overrides
  } as never);
}

describe("system routes", () => {
  it("renders the view-rules page as the Vue client entry shell", async () => {
    const app = createSystemTestServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue({
          username: "admin",
          displayName: "系统管理员",
          role: "admin"
        })
      }
    } as never);

    const loginResponse = await app.inject({
      method: "POST",
      url: "/login",
      payload: { username: "admin", password: "admin" }
    });
    const cookie = Array.isArray(loginResponse.headers["set-cookie"])
      ? loginResponse.headers["set-cookie"][0]?.split(";")[0]
      : loginResponse.headers["set-cookie"]?.split(";")[0];

    const response = await app.inject({
      method: "GET",
      url: "/settings/view-rules",
      headers: {
        cookie: cookie ?? ""
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<div id="app"></div>');
    expect(response.body).toContain('/client/assets/');
    expect(response.body).toContain('script type="module" crossorigin src="/client/assets/');
    expect(response.body).toContain('<link rel="stylesheet" crossorigin href="/client/assets/');
  }, 15_000);

  it("renders the sources page as the Vue client entry shell", async () => {
    const app = createSystemTestServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue({
          username: "admin",
          displayName: "系统管理员",
          role: "admin"
        })
      }
    } as never);

    const loginResponse = await app.inject({
      method: "POST",
      url: "/login",
      payload: { username: "admin", password: "admin" }
    });
    const cookie = Array.isArray(loginResponse.headers["set-cookie"])
      ? loginResponse.headers["set-cookie"][0]?.split(";")[0]
      : loginResponse.headers["set-cookie"]?.split(";")[0];

    const response = await app.inject({
      method: "GET",
      url: "/settings/sources",
      headers: {
        cookie: cookie ?? ""
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<div id="app"></div>');
    expect(response.body).toContain('/client/assets/');
  });

  it("renders the profile page as the Vue client entry shell", async () => {
    const app = createSystemTestServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue({
          username: "admin",
          displayName: "系统管理员",
          role: "admin"
        })
      }
    } as never);

    const loginResponse = await app.inject({
      method: "POST",
      url: "/login",
      payload: { username: "admin", password: "admin" }
    });
    const cookie = Array.isArray(loginResponse.headers["set-cookie"])
      ? loginResponse.headers["set-cookie"][0]?.split(";")[0]
      : loginResponse.headers["set-cookie"]?.split(";")[0];

    const response = await app.inject({
      method: "GET",
      url: "/settings/profile",
      headers: {
        cookie: cookie ?? ""
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<div id="app"></div>');
    expect(response.body).toContain('/client/assets/');
  });

  it("renders disabled state on both manual action cards when a job is already running", async () => {
    const app = createSystemTestServer({
      listSources: vi.fn().mockResolvedValue([
        {
          kind: "openai",
          name: "OpenAI",
          rssUrl: "https://openai.com/news/rss.xml",
          isEnabled: true,
          lastCollectedAt: "2026-03-28T08:00:00.000Z",
          lastCollectionStatus: "running"
        }
      ]),
      getSourcesOperationSummary: vi.fn().mockResolvedValue({
        lastCollectionRunAt: "2026-03-29T15:12:00.000Z",
        lastSendLatestEmailAt: null
      }),
      triggerManualRun: vi.fn().mockResolvedValue({ accepted: true }),
      triggerManualSendLatestEmail: vi.fn().mockResolvedValue({ accepted: true, action: "send-latest-email" }),
      isRunning: () => true
    } as never);

    const response = await app.inject({ method: "GET", url: "/settings/sources" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<div id="app"></div>');
    expect(response.body).toContain('/client/assets/');
    expect(response.body).not.toContain('class="system-section system-section--operations system-section--workbench"');
  });

  it("calls toggleSource for source enable action", async () => {
    const toggleSource = vi.fn().mockResolvedValue({ ok: true });
    const app = createSystemTestServer({
      toggleSource
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/sources/toggle",
      payload: { kind: "openai", enable: true }
    });

    expect(response.statusCode).toBe(200);
    expect(toggleSource).toHaveBeenCalledWith("openai", true);
  });

  it("calls updateSourceDisplayMode for source display mode action", async () => {
    const updateSourceDisplayMode = vi.fn().mockResolvedValue({ ok: true });
    const app = createSystemTestServer({
      updateSourceDisplayMode
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/sources/display-mode",
      payload: { kind: "openai", showAllWhenSelected: true }
    });

    expect(response.statusCode).toBe(200);
    expect(updateSourceDisplayMode).toHaveBeenCalledWith("openai", true);
  });

  it("returns 400 when source display mode payload is not boolean", async () => {
    const updateSourceDisplayMode = vi.fn();
    const app = createSystemTestServer({
      updateSourceDisplayMode
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/sources/display-mode",
      payload: { kind: "openai", showAllWhenSelected: "yes" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, reason: "invalid-source-display-mode" });
    expect(updateSourceDisplayMode).not.toHaveBeenCalled();
  });

  it("returns 404 when toggling a source kind that does not exist", async () => {
    const app = createSystemTestServer({
      toggleSource: vi.fn().mockResolvedValue({ ok: false, reason: "not-found" })
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/sources/toggle",
      payload: { kind: "missing-source", enable: false }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ ok: false, reason: "not-found" });
  });

  it("returns 400 when source enable payload is not boolean", async () => {
    const toggleSource = vi.fn();
    const app = createSystemTestServer({
      toggleSource
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/sources/toggle",
      payload: { kind: "openai", enable: "yes" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, reason: "invalid-source-enable" });
    expect(toggleSource).not.toHaveBeenCalled();
  });

  it("calls createSource for the source create action", async () => {
    const createSource = vi.fn().mockResolvedValue({ ok: true, kind: "wechat_demo" });
    const app = createSystemTestServer({
      createSource
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/sources/create",
      payload: {
        sourceType: "wechat_bridge",
        wechatName: "微信 Demo",
        articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(createSource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "wechat_bridge",
        wechatName: "微信 Demo",
        articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
      })
    );
  });

  it("returns 400 for invalid source create payloads", async () => {
    const createSource = vi.fn();
    const app = createSystemTestServer({
      createSource
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/sources/create",
      payload: { sourceType: "wechat_bridge", kind: "wechat_demo" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, reason: "invalid-source-payload" });
    expect(createSource).not.toHaveBeenCalled();
  });

  it("calls updateSource for the source update action", async () => {
    const updateSource = vi.fn().mockResolvedValue({ ok: true, kind: "wechat_demo" });
    const app = createSystemTestServer({
      updateSource
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/sources/update",
      payload: {
        sourceType: "rss",
        kind: "wechat_demo",
        name: "微信 Demo",
        siteUrl: "https://example.com",
        rssUrl: "https://example.com/feed.xml"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(updateSource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "rss",
        rssUrl: "https://example.com/feed.xml"
      })
    );
  });

  it("calls deleteSource for the source delete action", async () => {
    const deleteSource = vi.fn().mockResolvedValue({ ok: true, kind: "wechat_demo" });
    const app = createSystemTestServer({
      deleteSource
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/sources/delete",
      payload: { kind: "wechat_demo" }
    });

    expect(response.statusCode).toBe(200);
    expect(deleteSource).toHaveBeenCalledWith("wechat_demo");
  });

  it("calls createTwitterAccount for the twitter account create action", async () => {
    const createTwitterAccount = vi.fn().mockResolvedValue({
      ok: true,
      account: {
        id: 1,
        username: "openai",
        displayName: "OpenAI",
        category: "official_vendor",
        priority: 90,
        includeReplies: false,
        isEnabled: true,
        userId: null,
        notes: null,
        lastFetchedAt: null,
        lastSuccessAt: null,
        lastError: null,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z"
      }
    });
    const app = createSystemTestServer({ createTwitterAccount } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/twitter-accounts/create",
      payload: {
        username: "@OpenAI",
        displayName: "OpenAI",
        category: "official_vendor",
        priority: 90,
        includeReplies: false,
        notes: "official account"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(createTwitterAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "@OpenAI",
        displayName: "OpenAI",
        category: "official_vendor",
        priority: 90,
        includeReplies: false,
        notes: "official account"
      })
    );
  });

  it("calls updateTwitterAccount for the twitter account update action", async () => {
    const updateTwitterAccount = vi.fn().mockResolvedValue({
      ok: true,
      account: {
        id: 1,
        username: "openai",
        displayName: "OpenAI News",
        category: "product",
        priority: 80,
        includeReplies: true,
        isEnabled: true,
        userId: null,
        notes: null,
        lastFetchedAt: null,
        lastSuccessAt: null,
        lastError: null,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z"
      }
    });
    const app = createSystemTestServer({ updateTwitterAccount } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/twitter-accounts/update",
      payload: {
        id: 1,
        username: "openai",
        displayName: "OpenAI News",
        category: "product",
        priority: 80,
        includeReplies: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(updateTwitterAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        username: "openai",
        displayName: "OpenAI News",
        category: "product",
        priority: 80,
        includeReplies: true
      })
    );
  });

  it("calls deleteTwitterAccount for the twitter account delete action", async () => {
    const deleteTwitterAccount = vi.fn().mockResolvedValue({ ok: true, id: 1 });
    const app = createSystemTestServer({ deleteTwitterAccount } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/twitter-accounts/delete",
      payload: { id: 1 }
    });

    expect(response.statusCode).toBe(200);
    expect(deleteTwitterAccount).toHaveBeenCalledWith(1);
  });

  it("calls toggleTwitterAccount for the twitter account toggle action", async () => {
    const toggleTwitterAccount = vi.fn().mockResolvedValue({
      ok: true,
      account: { id: 1, isEnabled: false }
    });
    const app = createSystemTestServer({ toggleTwitterAccount } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/twitter-accounts/toggle",
      payload: { id: 1, enable: false }
    });

    expect(response.statusCode).toBe(200);
    expect(toggleTwitterAccount).toHaveBeenCalledWith(1, false);
    expect(response.json()).toEqual({ ok: true, id: 1, enable: false });
  });

  it("returns 400 for invalid twitter account action payloads", async () => {
    const createTwitterAccount = vi.fn();
    const app = createSystemTestServer({ createTwitterAccount } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/twitter-accounts/create",
      payload: { displayName: "OpenAI" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, reason: "invalid-twitter-account-payload" });
    expect(createTwitterAccount).not.toHaveBeenCalled();
  });

  it("calls saveProviderSettings for llm provider configuration", async () => {
    const saveProviderSettings = vi.fn().mockResolvedValue({ ok: true });
    const app = createSystemTestServer({
      saveProviderSettings
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/view-rules/provider-settings",
      payload: {
        providerKind: "deepseek",
        apiKey: "sk-live-secret-1234"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(saveProviderSettings).toHaveBeenCalledWith({
      providerKind: "deepseek",
      apiKey: "sk-live-secret-1234"
    });
  });

  it("calls updateProviderSettingsActivation to enable a saved provider", async () => {
    const updateProviderSettingsActivation = vi.fn().mockResolvedValue({ ok: true });
    const app = createSystemTestServer({
      updateProviderSettingsActivation
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/view-rules/provider-settings/activation",
      payload: {
        providerKind: "minimax",
        enable: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(updateProviderSettingsActivation).toHaveBeenCalledWith({
      providerKind: "minimax",
      enable: true
    });
  });

  it("calls deleteProviderSettings with the selected provider kind", async () => {
    const deleteProviderSettings = vi.fn().mockResolvedValue(true);
    const app = createSystemTestServer({
      deleteProviderSettings
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/view-rules/provider-settings/delete",
      payload: {
        providerKind: "deepseek"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(deleteProviderSettings).toHaveBeenCalledWith("deepseek");
  });

  it("calls saveContentFilterRule for the dedicated content-filter action", async () => {
    const saveContentFilterRule = vi.fn().mockResolvedValue({ ok: true, ruleKey: "ai" });
    const app = createSystemTestServer({
      saveContentFilterRule
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/view-rules/content-filters",
      payload: {
        ruleKey: "ai",
        toggles: {
          enableTimeWindow: false,
          enableSourceViewBonus: true,
          enableAiKeywordWeight: true,
          enableHeatKeywordWeight: false,
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
      }
    });

    expect(response.statusCode).toBe(200);
    expect(saveContentFilterRule).toHaveBeenCalledWith({
      ruleKey: "ai",
      toggles: {
        enableTimeWindow: false,
        enableSourceViewBonus: true,
        enableAiKeywordWeight: true,
        enableHeatKeywordWeight: false,
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
    });
  });

  it("removes the old nl-rules and draft action routes", async () => {
    const app = createSystemTestServer({} as never);

    const nlRulesResponse = await app.inject({
      method: "POST",
      url: "/actions/view-rules/nl-rules",
      payload: {}
    });
    const cancelResponse = await app.inject({
      method: "POST",
      url: "/actions/view-rules/nl-rules/cancel",
      payload: {}
    });
    const draftCreateResponse = await app.inject({
      method: "POST",
      url: "/actions/feedback-pool/201/create-draft",
      payload: {}
    });
    const draftSaveResponse = await app.inject({
      method: "POST",
      url: "/actions/strategy-drafts/301/save",
      payload: {}
    });
    const draftDeleteResponse = await app.inject({
      method: "POST",
      url: "/actions/strategy-drafts/301/delete",
      payload: {}
    });

    expect(nlRulesResponse.statusCode).toBe(404);
    expect(cancelResponse.statusCode).toBe(404);
    expect(draftCreateResponse.statusCode).toBe(404);
    expect(draftSaveResponse.statusCode).toBe(404);
    expect(draftDeleteResponse.statusCode).toBe(404);
  });

  it("returns 401 for anonymous system actions when auth is enabled", async () => {
    const app = createSystemTestServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue(null)
      },
      toggleSource: vi.fn().mockResolvedValue({ ok: true }),
      clearAllFeedback: vi.fn().mockResolvedValue(1)
    } as never);

    const activateResponse = await app.inject({
      method: "POST",
      url: "/actions/sources/toggle",
      payload: { kind: "openai", enable: true }
    });
    const feedbackResponse = await app.inject({
      method: "POST",
      url: "/actions/feedback-pool/clear",
      payload: {}
    });

    expect(activateResponse.statusCode).toBe(401);
    expect(feedbackResponse.statusCode).toBe(401);
  });
});

function createClientBuildFixture() {
  // The fixture only needs the emitted HTML contract and referenced asset paths that system route tests assert on.
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "hot-now-system-client-"));
  const assetsDir = path.join(fixtureRoot, "assets");
  mkdirSync(assetsDir, { recursive: true });
  writeFileSync(path.join(assetsDir, "index-test.js"), "console.log('system route fixture');\n", "utf8");
  writeFileSync(path.join(assetsDir, "index-test.css"), "body{background:#fff;}\n", "utf8");
  writeFileSync(
    path.join(fixtureRoot, "index.html"),
    `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HotNow Test Shell</title>
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
