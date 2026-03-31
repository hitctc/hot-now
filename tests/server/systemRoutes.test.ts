import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/server/createServer.js";

describe("system routes", () => {
  it("renders the view-rules page as the Vue client entry shell", async () => {
    const app = createServer({
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
    const app = createServer({
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
    const app = createServer({
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
    const app = createServer({
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
    const app = createServer({
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

  it("returns 404 when toggling a source kind that does not exist", async () => {
    const app = createServer({
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
    const app = createServer({
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

  it("calls saveViewRuleConfig for view rule save action", async () => {
    const saveViewRuleConfig = vi.fn().mockResolvedValue({ ok: true });
    const app = createServer({
      saveViewRuleConfig
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/view-rules/hot",
      payload: {
        config: {
          limit: 10,
          freshnessWindowDays: 3,
          freshnessWeight: 0.4,
          sourceWeight: 0.1,
          completenessWeight: 0.1,
          aiWeight: 0.05,
          heatWeight: 0.35
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(saveViewRuleConfig).toHaveBeenCalledWith("hot", {
      limit: 10,
      freshnessWindowDays: 3,
      freshnessWeight: 0.4,
      sourceWeight: 0.1,
      completenessWeight: 0.1,
      aiWeight: 0.05,
      heatWeight: 0.35
    });
  });

  it("calls saveProviderSettings for llm provider configuration", async () => {
    const saveProviderSettings = vi.fn().mockResolvedValue({ ok: true });
    const app = createServer({
      saveProviderSettings
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/view-rules/provider-settings",
      payload: {
        providerKind: "deepseek",
        apiKey: "sk-live-secret-1234",
        isEnabled: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(saveProviderSettings).toHaveBeenCalledWith({
      providerKind: "deepseek",
      apiKey: "sk-live-secret-1234",
      isEnabled: true
    });
  });

  it("calls saveNlRules and returns the recompute result", async () => {
    const saveNlRules = vi.fn().mockResolvedValue({
      ok: true,
      run: {
        runId: 5,
        status: "completed",
        itemCount: 10,
        successCount: 10,
        failureCount: 0
      }
    });
    const app = createServer({
      saveNlRules
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/view-rules/nl-rules",
      payload: {
        rules: {
          global: "暂不展示融资快讯。",
          hot: "",
          articles: "",
          ai: "优先展示 agent workflow。"
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(saveNlRules).toHaveBeenCalledWith({
      global: "暂不展示融资快讯。",
      hot: "",
      articles: "",
      ai: "优先展示 agent workflow。"
    });
    expect(response.json()).toEqual({
      ok: true,
      run: {
        runId: 5,
        status: "completed",
        itemCount: 10,
        successCount: 10,
        failureCount: 0
      }
    });
  });

  it("returns 400 for invalid view-rule payload", async () => {
    const saveViewRuleConfig = vi.fn();
    const app = createServer({
      saveViewRuleConfig
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/view-rules/hot",
      payload: { config: "invalid" }
    });

    expect(response.statusCode).toBe(400);
    expect(saveViewRuleConfig).not.toHaveBeenCalled();
  });

  it("returns 401 for anonymous system actions when auth is enabled", async () => {
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue(null)
      },
      toggleSource: vi.fn().mockResolvedValue({ ok: true }),
      saveViewRuleConfig: vi.fn().mockResolvedValue({ ok: true })
    } as never);

    const activateResponse = await app.inject({
      method: "POST",
      url: "/actions/sources/toggle",
      payload: { kind: "openai", enable: true }
    });
    const ruleResponse = await app.inject({
      method: "POST",
      url: "/actions/view-rules/hot",
      payload: {
        config: {
          limit: 20,
          freshnessWindowDays: 3,
          freshnessWeight: 0.35,
          sourceWeight: 0.1,
          completenessWeight: 0.1,
          aiWeight: 0.05,
          heatWeight: 0.4
        }
      }
    });

    expect(activateResponse.statusCode).toBe(401);
    expect(ruleResponse.statusCode).toBe(401);
  });
});
