import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/server/createServer.js";

describe("system routes", () => {
  it("renders view-rules page with persisted rule content", async () => {
    const app = createServer({
      listViewRules: vi.fn().mockResolvedValue([
        {
          ruleKey: "hot",
          displayName: "热点策略",
          config: { limit: 20, sort: "recent" },
          isEnabled: true
        }
      ])
    } as never);

    const response = await app.inject({ method: "GET", url: "/settings/view-rules" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("筛选策略");
    expect(response.body).toContain('class="content-kicker"');
    expect(response.body).toContain('class="content-intro content-intro--system"');
    expect(response.body).toContain('class="system-stack system-stack--control"');
    expect(response.body).toContain("热点策略");
    expect(response.body).toMatch(/class="[^"]*\bsystem-card\b[^"]*"/);
    expect(response.body).toContain('class="system-card system-card--control system-card--view-rule"');
    expect(response.body).toContain('class="action-status system-status"');
    expect(response.body).toContain("hot");
    expect(response.body).toContain("&quot;sort&quot;: &quot;recent&quot;");
  });

  it("renders sources page with active source state", async () => {
    const app = createServer({
      listSources: vi.fn().mockResolvedValue([
        {
          kind: "juya",
          name: "Juya AI Daily",
          rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml",
          isActive: true,
          lastCollectedAt: "2026-03-28T08:00:00.000Z",
          lastCollectionStatus: "completed"
        },
        {
          kind: "openai",
          name: "OpenAI",
          rssUrl: "https://openai.com/news/rss.xml",
          isActive: false,
          lastCollectedAt: null,
          lastCollectionStatus: null
        }
      ]),
      triggerManualRun: vi.fn().mockResolvedValue({ accepted: true }),
      isRunning: () => false
    } as never);

    const response = await app.inject({ method: "GET", url: "/settings/sources" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("数据迭代收集");
    expect(response.body).toContain('class="content-intro content-intro--system"');
    expect(response.body).toContain('class="system-stack system-stack--control"');
    expect(response.body).toContain("手动执行采集");
    expect(response.body).toContain('class="system-card system-card--control system-card--manual-collection"');
    expect(response.body).toContain("当前启用 source：Juya AI Daily");
    expect(response.body).toContain("Juya AI Daily");
    expect(response.body).toContain("当前启用");
    expect(response.body).toContain("completed");
  });

  it("renders running state on the manual collection card when a job is already running", async () => {
    const app = createServer({
      listSources: vi.fn().mockResolvedValue([
        {
          kind: "openai",
          name: "OpenAI",
          rssUrl: "https://openai.com/news/rss.xml",
          isActive: true,
          lastCollectedAt: "2026-03-28T08:00:00.000Z",
          lastCollectionStatus: "running"
        }
      ]),
      triggerManualRun: vi.fn().mockResolvedValue({ accepted: true }),
      isRunning: () => true
    } as never);

    const response = await app.inject({ method: "GET", url: "/settings/sources" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("采集中...");
    expect(response.body).toContain('class="system-card system-card--control system-card--manual-collection"');
    expect(response.body).toContain("当前已有任务执行中，请稍后再试。");
    expect(response.body).toContain("disabled");
  });

  it("renders profile page with current user profile", async () => {
    const app = createServer({
      getCurrentUserProfile: vi.fn().mockResolvedValue({
        username: "admin",
        displayName: "系统管理员",
        role: "admin",
        email: "admin@example.com"
      })
    } as never);

    const response = await app.inject({ method: "GET", url: "/settings/profile" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("当前登录用户");
    expect(response.body).toContain('class="content-intro content-intro--system"');
    expect(response.body).toContain('class="system-card system-card--control system-card--profile"');
    expect(response.body).toContain("系统管理员");
    expect(response.body).toContain("admin@example.com");
  });

  it("calls setActiveSource for source activation action", async () => {
    const setActiveSource = vi.fn().mockResolvedValue({ ok: true });
    const app = createServer({
      setActiveSource
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/sources/activate",
      payload: { kind: "openai" }
    });

    expect(response.statusCode).toBe(200);
    expect(setActiveSource).toHaveBeenCalledWith("openai");
  });

  it("returns 404 when activating a source kind that does not exist", async () => {
    const app = createServer({
      setActiveSource: vi.fn().mockResolvedValue({ ok: false, reason: "not-found" })
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/actions/sources/activate",
      payload: { kind: "missing-source" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ ok: false, reason: "not-found" });
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
          sort: "recent"
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(saveViewRuleConfig).toHaveBeenCalledWith("hot", { limit: 10, sort: "recent" });
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
      setActiveSource: vi.fn().mockResolvedValue({ ok: true }),
      saveViewRuleConfig: vi.fn().mockResolvedValue({ ok: true })
    } as never);

    const activateResponse = await app.inject({
      method: "POST",
      url: "/actions/sources/activate",
      payload: { kind: "openai" }
    });
    const ruleResponse = await app.inject({
      method: "POST",
      url: "/actions/view-rules/hot",
      payload: { config: { limit: 20, sort: "recent" } }
    });

    expect(activateResponse.statusCode).toBe(401);
    expect(ruleResponse.statusCode).toBe(401);
  });
});
