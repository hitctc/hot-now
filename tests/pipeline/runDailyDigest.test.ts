import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import cron from "node-cron";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runDailyDigest } from "../../src/core/pipeline/runDailyDigest.js";
import { createRunLock } from "../../src/core/runtime/runLock.js";
import { startScheduler } from "../../src/core/scheduler/startScheduler.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";
import type { RuntimeConfig } from "../../src/core/types/appConfig.js";

vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn()
  }
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function makeConfig(rootDir: string): RuntimeConfig {
  return {
    server: { port: 3010 },
    schedule: { enabled: true, dailyTime: "08:00", timezone: "Asia/Shanghai" },
    report: { topN: 10, dataDir: rootDir, allowDegraded: true },
    source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
    manualRun: { enabled: true },
    database: { file: path.join(rootDir, "hot-now.sqlite") },
    smtp: {
      host: "smtp.qq.com",
      port: 465,
      secure: true,
      user: "sender@qq.com",
      pass: "secret",
      to: "receiver@example.com",
      baseUrl: "http://127.0.0.1:3010"
    },
    auth: {
      username: "admin",
      password: "admin",
      sessionSecret: "dev-session-secret"
    }
  };
}

describe("createRunLock", () => {
  it("rejects overlapping runs and clears the lock after completion", async () => {
    const lock = createRunLock();
    const first = lock.runExclusive(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 20);
        })
    );

    await expect(lock.runExclusive(async () => undefined)).rejects.toThrow("already in progress");
    await first;
    expect(lock.isRunning()).toBe(false);
  });
});

describe("startScheduler", () => {
  it("returns null when scheduling is disabled", () => {
    const config = makeConfig("/tmp");
    config.schedule.enabled = false;

    expect(startScheduler(config, vi.fn())).toBeNull();
  });

  it("registers a cron job with the configured time and timezone", () => {
    const scheduleMock = vi.mocked(cron.schedule);
    const task = { stop: vi.fn() } as never;
    scheduleMock.mockReturnValue(task);

    const config = makeConfig("/tmp");
    const result = startScheduler(config, vi.fn());

    expect(scheduleMock).toHaveBeenCalledWith("0 8 * * *", expect.any(Function), {
      timezone: "Asia/Shanghai"
    });
    expect(result).toBe(task);
  });
});

describe("runDailyDigest", () => {
  it("writes report files and marks the report as degraded when one article fails", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-run-"));
    const config = makeConfig(rootDir);
    const db = createTestDatabase(path.join(rootDir, "hot-now.sqlite"));

    const result = await runDailyDigest(config, "manual", {
      db,
      loadLatestIssue: vi.fn().mockResolvedValue({
        date: "2026-03-26",
        issueUrl: "https://example.com",
        sourceKind: "juya",
        items: [
          {
            rank: 1,
            category: "要闻",
            title: "谷歌推出 Lyria 3 Pro 音乐模型",
            sourceUrl: "https://blog.google/lyria",
            sourceName: "Google AI",
            externalId: "juya-1",
            summary: "音乐模型摘要",
            publishedAt: "2026-03-26T08:00:00.000Z"
          },
          {
            rank: 9,
            category: "产品应用",
            title: "Claude 移动端新增工作相关功能",
            sourceUrl: "https://x.com/claudeai/status/1",
            sourceName: "X",
            externalId: "juya-9",
            summary: "移动端功能摘要",
            publishedAt: "2026-03-26T08:10:00.000Z"
          }
        ]
      }),
      fetchArticle: vi.fn(async (url: string) => {
        if (url.includes("lyria")) {
          return {
            ok: true,
            url,
            title: "Lyria 3 Pro",
            text: "Google 发布新的音乐模型。"
          };
        }

        return {
          ok: false,
          url,
          title: "",
          text: "",
          error: "403"
        };
      }),
      sendDailyEmail: vi.fn().mockResolvedValue(undefined)
    });

    const reportJson = JSON.parse(await readFile(path.join(rootDir, "2026-03-26", "report.json"), "utf8")) as typeof result.report;
    const reportHtml = await readFile(path.join(rootDir, "2026-03-26", "report.html"), "utf8");
    const runMeta = JSON.parse(await readFile(path.join(rootDir, "2026-03-26", "run-meta.json"), "utf8")) as Record<string, unknown>;

    expect(result.mailStatus).toBe("sent");
    expect(result.report.meta.mailStatus).toBe("sent");
    expect(result.report.meta.degraded).toBe(true);
    expect(reportJson.meta.mailStatus).toBe("sent");
    expect(reportJson.meta.degraded).toBe(true);
    expect(reportHtml).toContain("HotNow 每日热点 2026-03-26");
    expect(reportHtml).toContain("邮件状态：sent");
    expect(reportHtml).toContain("降级抓取");
    expect(runMeta.mailStatus).toBe("sent");
    expect(runMeta.degraded).toBe(true);

    const contentItems = db
      .prepare(
        `
          SELECT external_id, title, canonical_url, summary, body_markdown
          FROM content_items
          ORDER BY canonical_url
        `
      )
      .all() as Array<{
      external_id: string;
      title: string;
      canonical_url: string;
      summary: string;
      body_markdown: string;
    }>;
    const collectionRun = db
      .prepare(
        `
          SELECT run_date, trigger_kind, status, finished_at, notes
          FROM collection_runs
          LIMIT 1
        `
      )
      .get() as {
      run_date: string;
      trigger_kind: string;
      status: string;
      finished_at: string | null;
      notes: string;
    };
    const digestReport = db
      .prepare(
        `
          SELECT report_date, report_json_path, report_html_path, mail_status, collection_run_id
          FROM digest_reports
          LIMIT 1
        `
      )
      .get() as {
      report_date: string;
      report_json_path: string;
      report_html_path: string;
      mail_status: string;
      collection_run_id: number;
    };

    expect(contentItems).toEqual([
      {
        external_id: "juya-1",
        title: "Lyria 3 Pro",
        canonical_url: "https://blog.google/lyria",
        summary: "音乐模型摘要",
        body_markdown: "Google 发布新的音乐模型。"
      },
      {
        external_id: "juya-9",
        title: "Claude 移动端新增工作相关功能",
        canonical_url: "https://x.com/claudeai/status/1",
        summary: "移动端功能摘要",
        body_markdown: ""
      }
    ]);
    expect(collectionRun.run_date).toBe("2026-03-26");
    expect(collectionRun.trigger_kind).toBe("manual");
    expect(collectionRun.status).toBe("completed");
    expect(collectionRun.finished_at).toBeTruthy();
    expect(collectionRun.notes).toContain('"itemCount":2');
    expect(digestReport).toEqual({
      report_date: "2026-03-26",
      report_json_path: path.join(rootDir, "2026-03-26", "report.json"),
      report_html_path: path.join(rootDir, "2026-03-26", "report.html"),
      mail_status: "sent",
      collection_run_id: 1
    });

    db.close();
  });

  it("keeps writing report artifacts when email sending fails", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-run-"));
    const config = makeConfig(rootDir);
    const db = createTestDatabase(path.join(rootDir, "hot-now.sqlite"));

    const result = await runDailyDigest(config, "scheduled", {
      db,
      loadLatestIssue: vi.fn().mockResolvedValue({
        date: "2026-03-27",
        issueUrl: "https://example.com",
        sourceKind: "juya",
        items: [
          {
            rank: 1,
            category: "要闻",
            title: "谷歌推出 Lyria 3 Pro 音乐模型",
            sourceUrl: "https://blog.google/lyria",
            sourceName: "Google AI",
            externalId: "juya-1",
            summary: "音乐模型摘要",
            publishedAt: "2026-03-27T08:00:00.000Z"
          }
        ]
      }),
      fetchArticle: vi.fn().mockResolvedValue({
        ok: true,
        url: "https://blog.google/lyria",
        title: "Lyria 3 Pro",
        text: "Google 发布新的音乐模型。"
      }),
      sendDailyEmail: vi.fn().mockRejectedValue(new Error("smtp down"))
    });

    const reportJson = JSON.parse(await readFile(path.join(rootDir, "2026-03-27", "report.json"), "utf8")) as typeof result.report;
    const reportHtml = await readFile(path.join(rootDir, "2026-03-27", "report.html"), "utf8");
    const runMeta = JSON.parse(await readFile(path.join(rootDir, "2026-03-27", "run-meta.json"), "utf8")) as Record<string, unknown>;

    expect(result.mailStatus).toBe("failed:smtp down");
    expect(result.report.meta.mailStatus).toBe("failed:smtp down");
    expect(reportJson.meta.mailStatus).toBe("failed:smtp down");
    expect(reportHtml).toContain("邮件状态：failed:smtp down");
    expect(runMeta.mailStatus).toBe("failed:smtp down");

    const digestReport = db
      .prepare(
        `
          SELECT report_date, mail_status
          FROM digest_reports
          LIMIT 1
        `
      )
      .get() as { report_date: string; mail_status: string };
    const collectionRun = db
      .prepare(
        `
          SELECT status, notes
          FROM collection_runs
          LIMIT 1
        `
      )
      .get() as { status: string; notes: string };

    expect(digestReport).toEqual({
      report_date: "2026-03-27",
      mail_status: "failed:smtp down"
    });
    expect(collectionRun.status).toBe("completed");
    expect(collectionRun.notes).toContain("failed:smtp down");

    db.close();
  });
});

function createTestDatabase(file: string) {
  const db = openDatabase(file);
  runMigrations(db);
  seedInitialData(db, {
    username: "admin",
    password: "bootstrap-password"
  });
  return db;
}
