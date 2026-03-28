import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/server/createServer.js";

describe("system routes", () => {
  it("renders view-rules page with persisted rule content", async () => {
    const app = createServer({
      listViewRules: vi.fn().mockResolvedValue([
        {
          ruleKey: "hot",
          displayName: "热点策略",
          config: {
            limit: 20,
            freshnessWindowDays: 3,
            freshnessWeight: 0.35,
            sourceWeight: 0.1,
            completenessWeight: 0.1,
            aiWeight: 0.05,
            heatWeight: 0.4
          },
          isEnabled: true
        }
      ])
    } as never);

    const response = await app.inject({ method: "GET", url: "/settings/view-rules" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("筛选策略");
    expect(response.body).toContain('class="content-kicker"');
    expect(response.body).toContain('class="content-intro content-intro--system"');
    expect(response.body).toContain('class="sidebar-page-summary"');
    expect(response.body).toContain("这里会配置各内容菜单的筛选规则与展示偏好。");
    expect(response.body).not.toContain('class="shell-header"');
    expect(response.body).toContain('class="system-stack system-stack--control"');
    expect(response.body).toContain("热点策略");
    expect(response.body).toMatch(/class="[^"]*\bsystem-card\b[^"]*"/);
    expect(response.body).toContain('class="system-card system-card--control system-card--view-rule"');
    expect(response.body).toContain('class="action-status system-status"');
    expect(response.body).toContain("hot");
    expect(response.body).toContain('name="limit"');
    expect(response.body).toContain('name="freshnessWindowDays"');
    expect(response.body).toContain('name="freshnessWeight"');
    expect(response.body).toContain('name="sourceWeight"');
    expect(response.body).toContain('name="completenessWeight"');
    expect(response.body).toContain('name="aiWeight"');
    expect(response.body).toContain('name="heatWeight"');
    expect(response.body).not.toContain("<textarea");
  });

  it("renders sources page with enable toggles instead of active-source copy", async () => {
    const app = createServer({
      listSources: vi.fn().mockResolvedValue([
        {
          kind: "juya",
          name: "Juya AI Daily",
          rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml",
          isEnabled: true,
          lastCollectedAt: "2026-03-28T08:00:00.000Z",
          lastCollectionStatus: "completed"
        },
        {
          kind: "openai",
          name: "OpenAI",
          rssUrl: "https://openai.com/news/rss.xml",
          isEnabled: false,
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
    expect(response.body).toContain("当前启用 sources：Juya AI Daily");
    expect(response.body).toContain("Juya AI Daily");
    expect(response.body).toContain("已启用");
    expect(response.body).toContain("已停用");
    expect(response.body).toContain("停用 source");
    expect(response.body).toContain("启用 source");
    expect(response.body).not.toContain("设为当前启用");
    expect(response.body).toContain("completed");
  });

  it("renders running state on the manual collection card when a job is already running", async () => {
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
    expect(response.body).toContain('class="sidebar-page-summary"');
    expect(response.body).not.toContain('class="shell-header"');
    expect(response.body).toContain('class="system-card system-card--control system-card--profile"');
    expect(response.body).toContain("系统管理员");
    expect(response.body).toContain("admin@example.com");
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
