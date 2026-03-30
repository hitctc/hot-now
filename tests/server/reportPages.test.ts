import { describe, expect, it, vi } from "vitest";
import { LatestReportEmailError } from "../../src/core/pipeline/sendLatestReportEmail.js";
import { createServer } from "../../src/server/createServer.js";

describe("report pages", () => {
  it("ships editorial desk theme tokens in the shared CSS asset", async () => {
    const app = createServer({} as never);

    const response = await app.inject({ method: "GET", url: "/assets/site.css" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("--paper-base: #f4ede3;");
    expect(response.body).toContain("--paper-elevated: #fbf7f1;");
    expect(response.body).toContain("--signal-blue: #2352ff;");
    expect(response.body).toContain("--signal-orange: #ff6a2a;");
    expect(response.body).not.toContain("--accent-strong: #53f3c3;");
    expect(response.body).toContain(".legacy-page {");
    expect(response.body).toContain(".legacy-shell {");
    expect(response.body).toContain(".legacy-card {");
    expect(response.body).toContain(".legacy-card ul {");
    expect(response.body).toContain(".legacy-card button {");
    expect(response.body).toContain(".mobile-top-nav {");
    expect(response.body).toContain(".mobile-top-nav-bar {");
    expect(response.body).toContain(".mobile-top-nav-tabs {");
    expect(response.body).toContain(".mobile-top-tab--content {");
    expect(response.body).toContain(".mobile-top-system-toggle {");
    expect(response.body).toContain(".mobile-system-drawer {");
    expect(response.body).toContain(".mobile-system-drawer[hidden] {");
    expect(response.body).toContain("var(--bg-header)");
    expect(response.body).toContain("var(--bg-sidebar-panel)");
    expect(response.body).toContain(".shell-sidebar .nav-group {");
    expect(response.body).toContain(".shell-main {");
    expect(response.body).toContain("order: 1;");
    expect(response.body).toContain("order: 2;");
    expect(response.body).toContain("display: none;");
    expect(response.body).toContain("position: sticky;");
    expect(response.body).toContain("top: 88px;");
    expect(response.body).toContain("z-index: 34;");
    expect(response.body).toContain("padding: 8px 10px 8px 28px;");
    expect(response.body).toContain("left: 14px;");
  });

  it("renders the control page with separate collect and send-latest-email actions", async () => {
    const app = createServer({
      config: {
        report: { dataDir: "./data/reports", topN: 10, allowDegraded: true },
        collectionSchedule: { enabled: true, intervalMinutes: 10 },
        mailSchedule: { enabled: true, dailyTime: "08:00", timezone: "Asia/Shanghai" },
        manualActions: { collectEnabled: true, sendLatestEmailEnabled: true },
        smtp: { user: "sender@qq.com", to: "receiver@example.com" }
      },
      listReportSummaries: vi.fn().mockResolvedValue([]),
      readReportHtml: vi.fn(),
      triggerManualCollect: vi.fn().mockResolvedValue({ accepted: true, action: "collect" }),
      triggerManualSendLatestEmail: vi.fn().mockResolvedValue({ accepted: true, action: "send-latest-email" }),
      latestReportDate: vi.fn().mockResolvedValue(null)
    } as never);

    const response = await app.inject({ method: "GET", url: "/control" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("HotNow 控制台");
    expect(response.body).toContain("采集周期：每 10 分钟");
    expect(response.body).toContain("发信时间：08:00");
    expect(response.body).toContain("08:00");
    expect(response.body).toContain('action="/actions/collect"');
    expect(response.body).toContain(">手动执行采集<");
    expect(response.body).toContain('action="/actions/send-latest-email"');
    expect(response.body).toContain(">手动发送最新报告<");
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

  it("accepts a manual collect request", async () => {
    const app = createServer({
      config: { report: { topN: 10 }, schedule: { dailyTime: "08:00" }, smtp: { to: "receiver@example.com" } },
      triggerManualCollect: vi.fn().mockResolvedValue({ accepted: true, action: "collect" })
    } as never);

    const response = await app.inject({ method: "POST", url: "/actions/collect" });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: true, action: "collect" });
  });

  it("keeps /actions/collect compatible with legacy triggerManualRun wiring", async () => {
    const triggerManualRun = vi.fn().mockResolvedValue({ accepted: true, action: "collect" });
    const app = createServer({
      config: { report: { topN: 10 }, schedule: { dailyTime: "08:00" }, smtp: { to: "receiver@example.com" } },
      triggerManualRun
    } as never);

    const response = await app.inject({ method: "POST", url: "/actions/collect" });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: true, action: "collect" });
    expect(triggerManualRun).toHaveBeenCalledTimes(1);
  });

  it("keeps /actions/run as a manual collect alias", async () => {
    const app = createServer({
      config: { report: { topN: 10 }, schedule: { dailyTime: "08:00" }, smtp: { to: "receiver@example.com" } },
      triggerManualCollect: vi.fn().mockResolvedValue({ accepted: true, action: "collect" })
    } as never);

    const response = await app.inject({ method: "POST", url: "/actions/run" });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: true, action: "collect" });
  });

  it("accepts sending the latest report email", async () => {
    const app = createServer({
      config: { report: { topN: 10 }, schedule: { dailyTime: "08:00" }, smtp: { to: "receiver@example.com" } },
      triggerManualSendLatestEmail: vi.fn().mockResolvedValue({ accepted: true, action: "send-latest-email" })
    } as never);

    const response = await app.inject({ method: "POST", url: "/actions/send-latest-email" });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: true, action: "send-latest-email" });
  });

  it("maps missing latest report email artifacts to 404", async () => {
    const app = createServer({
      config: { report: { topN: 10 }, schedule: { dailyTime: "08:00" }, smtp: { to: "receiver@example.com" } },
      triggerManualSendLatestEmail: vi.fn().mockRejectedValue(
        new LatestReportEmailError("not-found", "No digest report is available to send")
      )
    } as never);

    const response = await app.inject({ method: "POST", url: "/actions/send-latest-email" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ accepted: false, reason: "not-found" });
  });

  it("maps unavailable latest report artifacts to 503", async () => {
    const app = createServer({
      config: { report: { topN: 10 }, schedule: { dailyTime: "08:00" }, smtp: { to: "receiver@example.com" } },
      triggerManualSendLatestEmail: vi.fn().mockRejectedValue(
        new LatestReportEmailError("report-unavailable", "Failed to read latest digest report for 2026-03-26")
      )
    } as never);

    const response = await app.inject({ method: "POST", url: "/actions/send-latest-email" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ accepted: false, reason: "report-unavailable" });
  });

  it("maps latest report email delivery failures to 502", async () => {
    const app = createServer({
      config: { report: { topN: 10 }, schedule: { dailyTime: "08:00" }, smtp: { to: "receiver@example.com" } },
      triggerManualSendLatestEmail: vi.fn().mockRejectedValue(
        new LatestReportEmailError("send-failed", "Failed to send latest digest report for 2026-03-26")
      )
    } as never);

    const response = await app.inject({ method: "POST", url: "/actions/send-latest-email" });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ accepted: false, reason: "send-failed" });
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
