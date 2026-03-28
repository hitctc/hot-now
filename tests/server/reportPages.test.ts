import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/server/createServer.js";

describe("report pages", () => {
  it("ships legacy wrapper styles in the shared CSS asset", async () => {
    const app = createServer({} as never);

    const response = await app.inject({ method: "GET", url: "/assets/site.css" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(".legacy-page {");
    expect(response.body).toContain(".legacy-shell {");
    expect(response.body).toContain(".legacy-card {");
    expect(response.body).toContain(".legacy-card ul {");
    expect(response.body).toContain(".legacy-card button {");
  });

  it("renders the control page with config summary", async () => {
    const app = createServer({
      config: {
        report: { dataDir: "./data/reports", topN: 10, allowDegraded: true },
        schedule: { enabled: true, dailyTime: "08:00", timezone: "Asia/Shanghai" },
        manualRun: { enabled: true },
        smtp: { user: "sender@qq.com", to: "receiver@example.com" }
      },
      listReportSummaries: vi.fn().mockResolvedValue([]),
      readReportHtml: vi.fn(),
      triggerManualRun: vi.fn().mockResolvedValue({ accepted: true }),
      latestReportDate: vi.fn().mockResolvedValue(null)
    } as never);

    const response = await app.inject({ method: "GET", url: "/control" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("HotNow 控制台");
    expect(response.body).toContain("08:00");
    expect(response.body).toContain('data-theme="dark"');
    expect(response.body).toContain('<link rel="stylesheet" href="/assets/site.css" />');
    expect(response.body).toContain('<script src="/assets/site.js" defer></script>');
    expect(response.body).toContain('class="legacy-page legacy-page--control"');
    expect(response.body).toContain('class="legacy-shell legacy-shell--control"');
    expect(response.body).toContain('class="legacy-card legacy-card--control"');
  });

  it("renders history entries with mail and degraded status", async () => {
    const app = createServer({
      config: { report: { topN: 10 }, schedule: { dailyTime: "08:00" }, smtp: { to: "receiver@example.com" } },
      listReportSummaries: vi.fn().mockResolvedValue([
        { date: "2026-03-26", topicCount: 10, degraded: true, mailStatus: "failed:timeout" }
      ])
    } as never);

    const response = await app.inject({ method: "GET", url: "/history" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("failed:timeout");
    expect(response.body).toContain("降级：是");
    expect(response.body).toContain('data-theme="dark"');
    expect(response.body).toContain('<link rel="stylesheet" href="/assets/site.css" />');
    expect(response.body).toContain('<script src="/assets/site.js" defer></script>');
    expect(response.body).toContain('class="legacy-page legacy-page--history"');
    expect(response.body).toContain('class="legacy-shell legacy-shell--history"');
    expect(response.body).toContain('class="legacy-card legacy-card--history"');
  });

  it("renders the report fallback notice page with shared theme resources", async () => {
    const app = createServer({
      config: { report: { topN: 10 }, schedule: { dailyTime: "08:00" }, smtp: { to: "receiver@example.com" } }
    } as never);

    const response = await app.inject({ method: "GET", url: "/reports/2026-03-26" });

    expect(response.statusCode).toBe(503);
    expect(response.body).toContain("HotNow 报告");
    expect(response.body).toContain("报告内容暂不可用");
    expect(response.body).toContain('data-theme="dark"');
    expect(response.body).toContain('<link rel="stylesheet" href="/assets/site.css" />');
    expect(response.body).toContain('<script src="/assets/site.js" defer></script>');
    expect(response.body).toContain('class="legacy-page legacy-page--notice"');
    expect(response.body).toContain('class="legacy-shell legacy-shell--notice"');
    expect(response.body).toContain('class="legacy-card legacy-card--notice"');
  });

  it("renders the latest stored report on the home page", async () => {
    const app = createServer({
      latestReportDate: vi.fn().mockResolvedValue("2026-03-26"),
      readReportHtml: vi.fn().mockResolvedValue("<!doctype html><html><body><h1>日报</h1></body></html>")
    } as never);

    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("日报");
  });

  it("accepts a manual run request", async () => {
    const app = createServer({
      config: { report: { topN: 10 }, schedule: { dailyTime: "08:00" }, smtp: { to: "receiver@example.com" } },
      triggerManualRun: vi.fn().mockResolvedValue({ accepted: true })
    } as never);

    const response = await app.inject({ method: "POST", url: "/actions/run" });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: true });
  });

  it("rejects a manual run when another job is running", async () => {
    const app = createServer({
      config: { report: { topN: 10 }, schedule: { dailyTime: "08:00" }, smtp: { to: "receiver@example.com" } },
      isRunning: () => true
    } as never);

    const response = await app.inject({ method: "POST", url: "/actions/run" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ accepted: false, reason: "already-running" });
  });
});
