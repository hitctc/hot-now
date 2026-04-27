import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import {
  LatestReportEmailError,
  sendLatestReportEmail
} from "../../src/core/pipeline/sendLatestReportEmail.js";
import type { DailyReport } from "../../src/core/report/buildDailyReport.js";
import { upsertDigestReport, writeJsonFile } from "../../src/core/storage/reportStore.js";
import type { RuntimeConfig } from "../../src/core/types/appConfig.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendLatestReportEmail", () => {
  it("prefers the latest digest report date from sqlite and sends that report", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-send-latest-"));
    const config = makeConfig(rootDir);
    const db = createTestDatabase(config.database.file);
    const sendDailyEmail = vi.fn().mockResolvedValue(undefined);

    await writeReport(rootDir, makeReport("2026-03-28"));
    await writeReport(rootDir, makeReport("2026-03-29"));
    upsertDigestReport(db, {
      reportDate: "2026-03-28",
      reportJsonPath: path.join(rootDir, "2026-03-28", "report.json"),
      reportHtmlPath: path.join(rootDir, "2026-03-28", "report.html"),
      mailStatus: "not-sent-by-collection"
    });

    const result = await sendLatestReportEmail(config, { db, sendDailyEmail });
    const digestRow = db
      .prepare(
        `
          SELECT mail_status, last_email_attempted_at
          FROM digest_reports
          WHERE report_date = ?
        `
      )
      .get("2026-03-28") as { mail_status: string; last_email_attempted_at: string | null } | undefined;

    expect(result.reportDate).toBe("2026-03-28");
    expect(result.mailStatus).toBe("sent");
    expect(result.report.meta.date).toBe("2026-03-28");
    expect(result.report.meta.mailStatus).toBe("sent");
    expect(digestRow?.mail_status).toBe("sent");
    expect(digestRow?.last_email_attempted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(sendDailyEmail).toHaveBeenCalledWith(config, expect.objectContaining({ meta: expect.objectContaining({ date: "2026-03-28" }) }));

    db.close();
  });

  it("falls back to the latest report directory when sqlite has no digest report rows", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-send-latest-"));
    const config = makeConfig(rootDir);
    const db = createTestDatabase(config.database.file);
    const sendDailyEmail = vi.fn().mockResolvedValue(undefined);

    await writeReport(rootDir, makeReport("2026-03-27"));
    await writeReport(rootDir, makeReport("2026-03-29"));

    const result = await sendLatestReportEmail(config, { db, sendDailyEmail });
    const digestRow = db
      .prepare(
        `
          SELECT report_date, mail_status, last_email_attempted_at
          FROM digest_reports
          WHERE report_date = ?
        `
      )
      .get("2026-03-29") as
      | { report_date: string; mail_status: string; last_email_attempted_at: string | null }
      | undefined;

    expect(result.reportDate).toBe("2026-03-29");
    expect(result.mailStatus).toBe("sent");
    expect(digestRow?.report_date).toBe("2026-03-29");
    expect(digestRow?.mail_status).toBe("sent");
    expect(digestRow?.last_email_attempted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(sendDailyEmail).toHaveBeenCalledWith(config, expect.objectContaining({ meta: expect.objectContaining({ date: "2026-03-29" }) }));

    db.close();
  });

  it("uses the newest sqlite digest report date when sqlite contains multiple rows", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-send-latest-"));
    const config = makeConfig(rootDir);
    const db = createTestDatabase(config.database.file);
    const sendDailyEmail = vi.fn().mockResolvedValue(undefined);

    await writeReport(rootDir, makeReport("2026-03-27"));
    await writeReport(rootDir, makeReport("2026-03-28"));
    await writeReport(rootDir, makeReport("2026-03-29"));
    upsertDigestReport(db, {
      reportDate: "2026-03-27",
      reportJsonPath: path.join(rootDir, "2026-03-27", "report.json"),
      reportHtmlPath: path.join(rootDir, "2026-03-27", "report.html"),
      mailStatus: "not-sent-by-collection"
    });
    upsertDigestReport(db, {
      reportDate: "2026-03-28",
      reportJsonPath: path.join(rootDir, "2026-03-28", "report.json"),
      reportHtmlPath: path.join(rootDir, "2026-03-28", "report.html"),
      mailStatus: "not-sent-by-collection"
    });

    const result = await sendLatestReportEmail(config, { db, sendDailyEmail });

    expect(result.reportDate).toBe("2026-03-28");
    expect(result.mailStatus).toBe("sent");
    expect(result.report.meta.date).toBe("2026-03-28");
    expect(result.report.meta.mailStatus).toBe("sent");
    expect(sendDailyEmail).toHaveBeenCalledWith(config, expect.objectContaining({ meta: expect.objectContaining({ date: "2026-03-28" }) }));

    db.close();
  });

  it("throws a not-found error when there is no report in sqlite or on disk", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-send-latest-"));
    const config = makeConfig(rootDir);
    const db = createTestDatabase(config.database.file);

    await expect(sendLatestReportEmail(config, { db, sendDailyEmail: vi.fn() })).rejects.toEqual(
      expect.objectContaining<Partial<LatestReportEmailError>>({
        reason: "not-found"
      })
    );

    db.close();
  });

  it("throws a report-unavailable error when the latest report json is unreadable", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-send-latest-"));
    const config = makeConfig(rootDir);
    const db = createTestDatabase(config.database.file);
    const reportDir = path.join(rootDir, "2026-03-29");

    await mkdir(reportDir, { recursive: true });
    await writeFile(path.join(reportDir, "report.json"), "{broken-json", "utf8");
    upsertDigestReport(db, {
      reportDate: "2026-03-29",
      reportJsonPath: path.join(reportDir, "report.json"),
      reportHtmlPath: path.join(reportDir, "report.html"),
      mailStatus: "not-sent-by-collection"
    });

    await expect(sendLatestReportEmail(config, { db, sendDailyEmail: vi.fn() })).rejects.toEqual(
      expect.objectContaining<Partial<LatestReportEmailError>>({
        reason: "report-unavailable",
        reportDate: "2026-03-29"
      })
    );

    db.close();
  });

  it("throws a send-failed error when smtp delivery fails", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-send-latest-"));
    const config = makeConfig(rootDir);
    const db = createTestDatabase(config.database.file);
    const sendDailyEmail = vi.fn().mockRejectedValue(new Error("smtp down"));

    await writeReport(rootDir, makeReport("2026-03-29"));
    upsertDigestReport(db, {
      reportDate: "2026-03-29",
      reportJsonPath: path.join(rootDir, "2026-03-29", "report.json"),
      reportHtmlPath: path.join(rootDir, "2026-03-29", "report.html"),
      mailStatus: "not-sent-by-collection"
    });

    await expect(sendLatestReportEmail(config, { db, sendDailyEmail })).rejects.toEqual(
      expect.objectContaining<Partial<LatestReportEmailError>>({
        reason: "send-failed",
        reportDate: "2026-03-29"
      })
    );
    const digestRow = db
      .prepare(
        `
          SELECT mail_status, last_email_attempted_at
          FROM digest_reports
          WHERE report_date = ?
        `
      )
      .get("2026-03-29") as { mail_status: string; last_email_attempted_at: string | null } | undefined;

    expect(digestRow?.mail_status).toBe("failed:send-failed");
    expect(digestRow?.last_email_attempted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    db.close();
  });
});

// The config helper keeps each test focused on report lookup and mail behavior instead of unrelated bootstrap details.
function makeConfig(rootDir: string): RuntimeConfig {
  return {
    server: { port: 3030 },
    collectionSchedule: { enabled: true, intervalMinutes: 10 },
    mailSchedule: { enabled: true, dailyTime: "10:00", timezone: "Asia/Shanghai" },
    aiTimelineAlerts: {
      enabled: false,
      intervalMinutes: 5,
      channels: { feishu: false, email: false },
      feishuWebhookUrl: null
    },
    manualActions: { collectEnabled: true, sendLatestEmailEnabled: true },
    report: { topN: 10, dataDir: rootDir, allowDegraded: true },
    source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
    database: { file: path.join(rootDir, "hot-now.sqlite") },
    smtp: {
      host: "smtp.qq.com",
      port: 465,
      secure: true,
      user: "sender@qq.com",
      pass: "secret",
      to: "receiver@example.com",
      baseUrl: "http://127.0.0.1:3030"
    },
    auth: {
      username: "admin",
      password: "admin",
      sessionSecret: "dev-session-secret"
    }
  };
}

// A real SQLite file keeps the tests aligned with the same digest_reports query path production will use.
function createTestDatabase(file: string) {
  const db = openDatabase(file);
  runMigrations(db);
  return db;
}

// The report fixture only needs the fields consumed by the existing mail renderer and the new pipeline.
function makeReport(reportDate: string): DailyReport {
  return {
    meta: {
      date: reportDate,
      generatedAt: `${reportDate}T00:00:00.000Z`,
      trigger: "manual",
      issueUrl: "https://openai.com/news/",
      issueUrls: ["https://openai.com/news/"],
      sourceKinds: ["openai"],
      topicCount: 1,
      degraded: false,
      mailStatus: "not-sent-by-collection",
      sourceFailureCount: 0,
      failedSourceKinds: []
    },
    topics: [
      {
        rank: 1,
        title: `Topic ${reportDate}`,
        category: "要闻",
        whyItMatters: "原因",
        summary: "摘要",
        keywords: [],
        relatedCount: 1,
        relatedItems: []
      }
    ]
  };
}

// Writing report.json through the production storage helper keeps the fixture path identical to real report output.
async function writeReport(rootDir: string, report: DailyReport) {
  await writeJsonFile(rootDir, report.meta.date, "report.json", report);
}
