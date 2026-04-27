import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import cron from "node-cron";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runDailyDigest } from "../../src/core/pipeline/runDailyDigest.js";
import { createRunLock } from "../../src/core/runtime/runLock.js";
import {
  startAiTimelineAlertScheduler,
  startCollectionScheduler,
  startMailScheduler
} from "../../src/core/scheduler/startScheduler.js";
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
    server: { port: 3030 },
    publicBaseUrl: "https://now.achuan.cc",
    collectionSchedule: { enabled: true, intervalMinutes: 10 },
    mailSchedule: { enabled: true, dailyTime: "10:00", timezone: "Asia/Shanghai" },
    aiTimelineAlerts: {
      enabled: true,
      intervalMinutes: 5,
      channels: { feishu: true, email: true },
      feishuWebhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/test"
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

describe("startCollectionScheduler", () => {
  it("returns null when collection scheduling is disabled", () => {
    const config = makeConfig("/tmp");
    config.collectionSchedule.enabled = false;

    expect(startCollectionScheduler(config, vi.fn())).toBeNull();
  });

  it("registers a cron job with the configured interval", () => {
    const scheduleMock = vi.mocked(cron.schedule);
    const task = { stop: vi.fn() } as never;
    scheduleMock.mockReturnValue(task);

    const config = makeConfig("/tmp");
    const result = startCollectionScheduler(config, vi.fn());

    expect(scheduleMock).toHaveBeenCalledWith("*/10 * * * *", expect.any(Function));
    expect(result).toBe(task);
  });
});

describe("startMailScheduler", () => {
  it("returns null when mail scheduling is disabled", () => {
    const config = makeConfig("/tmp");
    config.mailSchedule.enabled = false;

    expect(startMailScheduler(config, vi.fn())).toBeNull();
  });

  it("registers a cron job with the configured time and timezone", () => {
    const scheduleMock = vi.mocked(cron.schedule);
    const task = { stop: vi.fn() } as never;
    scheduleMock.mockReturnValue(task);

    const config = makeConfig("/tmp");
    const result = startMailScheduler(config, vi.fn());

    expect(scheduleMock).toHaveBeenCalledWith("0 10 * * *", expect.any(Function), {
      timezone: "Asia/Shanghai"
    });
    expect(result).toBe(task);
  });
});

describe("startAiTimelineAlertScheduler", () => {
  it("returns null when AI timeline alert scheduling is disabled", () => {
    const config = makeConfig("/tmp");
    config.aiTimelineAlerts.enabled = false;

    expect(startAiTimelineAlertScheduler(config, vi.fn())).toBeNull();
  });

  it("registers a cron job with the configured alert interval", () => {
    const scheduleMock = vi.mocked(cron.schedule);
    const task = { stop: vi.fn() } as never;
    scheduleMock.mockReturnValue(task);

    const config = makeConfig("/tmp");
    const result = startAiTimelineAlertScheduler(config, vi.fn());

    expect(scheduleMock).toHaveBeenCalledWith("*/5 * * * *", expect.any(Function));
    expect(result).toBe(task);
  });
});

describe("runDailyDigest", () => {
  it("keeps the juya feed title even when article extraction returns a different page title", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-run-"));
    const config = makeConfig(rootDir);
    const db = createTestDatabase(path.join(rootDir, "hot-now.sqlite"));

    await runDailyDigest(config, "manual", {
      db,
      loadEnabledSourceIssues: vi.fn().mockResolvedValue([
        {
          date: "2026-04-01",
          issueUrl: "https://imjuya.github.io/juya-ai-daily/issue-46/",
          sourceKind: "juya",
          sourceType: "aggregator",
          sourcePriority: 70,
          items: [
            {
              rank: 1,
              category: "要闻",
              title: "OpenAI 完成 1220 亿美元融资，官宣打造超级应用",
              sourceUrl: "https://openai.com/index/accelerating-the-next-phase-ai/",
              sourceName: "Juya AI Daily",
              externalId: "juya-1",
              summary: "OpenAI 融资摘要",
              publishedAt: "2026-04-01T01:02:39.000Z"
            }
          ]
        }
      ]),
      fetchArticle: vi.fn().mockResolvedValue({
        ok: true,
        url: "https://openai.com/index/accelerating-the-next-phase-ai/",
        title: "Accelerating the next phase of AI",
        text: "OpenAI 官方页面正文。"
      }),
      sendDailyEmail: vi.fn().mockResolvedValue(undefined)
    });

    const contentItem = db
      .prepare(
        `
          SELECT title, canonical_url
          FROM content_items
          WHERE canonical_url = 'https://openai.com/index/accelerating-the-next-phase-ai/'
          LIMIT 1
        `
      )
      .get() as { title: string; canonical_url: string } | undefined;

    expect(contentItem).toEqual({
      title: "OpenAI 完成 1220 亿美元融资，官宣打造超级应用",
      canonical_url: "https://openai.com/index/accelerating-the-next-phase-ai/"
    });

    db.close();
  });

  it("writes report files and mirrors content from multiple enabled sources", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-run-"));
    const config = makeConfig(rootDir);
    const db = createTestDatabase(path.join(rootDir, "hot-now.sqlite"));

    const result = await runDailyDigest(config, "manual", {
      db,
      loadEnabledSourceIssues: vi.fn().mockResolvedValue([
        {
          date: "2026-03-29",
          issueUrl: "https://openai.com/news/",
          sourceKind: "openai",
          sourceType: "official",
          sourcePriority: 95,
          items: [
            {
              rank: 1,
              category: "最新 AI 消息",
              title: "OpenAI 发布 GPT-Next",
              sourceUrl: "https://openai.com/index/gpt-next",
              sourceName: "OpenAI",
              externalId: "openai-1",
              summary: "OpenAI 发布新模型摘要",
              publishedAt: "2026-03-29T08:00:00.000Z"
            }
          ]
        },
        {
          date: "2026-03-28",
          issueUrl: "https://blog.google/technology/ai/",
          sourceKind: "google_ai",
          sourceType: "official",
          sourcePriority: 92,
          items: [
            {
              rank: 1,
              category: "最新 AI 消息",
              title: "Google 推出 Lyria 3 Pro 音乐模型",
              sourceUrl: "https://blog.google/lyria",
              sourceName: "Google AI",
              externalId: "google-1",
              summary: "音乐模型摘要",
              publishedAt: "2026-03-28T08:00:00.000Z"
            }
          ]
        }
      ]),
      fetchArticle: vi.fn(async (url: string) => {
        if (url.includes("gpt-next")) {
          return {
            ok: true,
            url,
            title: "GPT-Next",
            text: "OpenAI 发布新的模型与 API 更新。"
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

    const reportJson = JSON.parse(await readFile(path.join(rootDir, "2026-03-29", "report.json"), "utf8")) as typeof result.report;
    const reportHtml = await readFile(path.join(rootDir, "2026-03-29", "report.html"), "utf8");
    const runMeta = JSON.parse(await readFile(path.join(rootDir, "2026-03-29", "run-meta.json"), "utf8")) as Record<string, unknown>;

    expect(result.mailStatus).toBe("sent");
    expect(result.report.meta.mailStatus).toBe("sent");
    expect(result.report.meta.degraded).toBe(true);
    expect(reportJson.meta.mailStatus).toBe("sent");
    expect(reportJson.meta.degraded).toBe(true);
    expect(reportHtml).toContain("HotNow 多源热点汇总 2026-03-29");
    expect(reportHtml).toContain("数据源：openai / google_ai");
    expect(reportHtml).toContain("邮件状态：sent");
    expect(reportHtml).toContain("失败源数：0");
    expect(reportHtml).toContain("降级抓取");
    expect(runMeta.mailStatus).toBe("sent");
    expect(runMeta.degraded).toBe(true);
    expect(reportJson.meta.sourceKinds).toEqual(["openai", "google_ai"]);
    expect(reportJson.meta.issueUrls).toEqual([
      "https://openai.com/news/",
      "https://blog.google/technology/ai/"
    ]);
    expect(reportJson.meta.sourceFailureCount).toBe(0);
    expect(reportJson.meta.failedSourceKinds).toEqual([]);

    const contentItems = db
      .prepare(
        `
          SELECT cs.kind AS source_kind, external_id, title, canonical_url, summary, body_markdown
          FROM content_items
          JOIN content_sources cs ON cs.id = content_items.source_id
          ORDER BY canonical_url
        `
      )
      .all() as Array<{
      source_kind: string;
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
        source_kind: "google_ai",
        external_id: "google-1",
        title: "Google 推出 Lyria 3 Pro 音乐模型",
        canonical_url: "https://blog.google/lyria",
        summary: "音乐模型摘要",
        body_markdown: ""
      },
      {
        source_kind: "openai",
        external_id: "openai-1",
        title: "GPT-Next",
        canonical_url: "https://openai.com/index/gpt-next",
        summary: "OpenAI 发布新模型摘要",
        body_markdown: "OpenAI 发布新的模型与 API 更新。"
      }
    ]);
    expect(collectionRun.run_date).toBe("2026-03-29");
    expect(collectionRun.trigger_kind).toBe("manual");
    expect(collectionRun.status).toBe("completed");
    expect(collectionRun.finished_at).toBeTruthy();
    expect(collectionRun.notes).toContain('"sourceKinds":["openai","google_ai"]');
    expect(collectionRun.notes).toContain('"sourceCount":2');
    expect(collectionRun.notes).toContain('"itemCount":2');
    expect(digestReport).toEqual({
      report_date: "2026-03-29",
      report_json_path: path.join(rootDir, "2026-03-29", "report.json"),
      report_html_path: path.join(rootDir, "2026-03-29", "report.html"),
      mail_status: "sent",
      collection_run_id: 1
    });

    db.close();
  });

  it("keeps writing report artifacts and marks the run degraded when one source loader fails", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-run-"));
    const config = makeConfig(rootDir);
    const db = createTestDatabase(path.join(rootDir, "hot-now.sqlite"));

    const loaderResult = Object.assign(
      [
        {
          date: "2026-03-29",
          issueUrl: "https://blog.google/technology/ai/",
          sourceKind: "google_ai",
          sourceType: "official",
          sourcePriority: 92,
          items: [
            {
              rank: 1,
              category: "最新 AI 消息",
              title: "Google 推出 Lyria 3 Pro 音乐模型",
              sourceUrl: "https://blog.google/lyria",
              sourceName: "Google AI",
              externalId: "google-1",
              summary: "音乐模型摘要",
              publishedAt: "2026-03-29T08:00:00.000Z"
            }
          ]
        }
      ],
      {
        failures: [
          {
            kind: "openai",
            reason: "RSS request failed with 500 for openai"
          }
        ]
      }
    );

    const result = await runDailyDigest(config, "manual", {
      db,
      loadEnabledSourceIssues: vi.fn().mockResolvedValue(loaderResult),
      fetchArticle: vi.fn().mockResolvedValue({
        ok: true,
        url: "https://blog.google/lyria",
        title: "Lyria 3 Pro",
        text: "Google 发布新的音乐模型。"
      }),
      sendDailyEmail: vi.fn().mockResolvedValue(undefined)
    });

    const reportJson = JSON.parse(await readFile(path.join(rootDir, "2026-03-29", "report.json"), "utf8")) as typeof result.report;
    const runMeta = JSON.parse(await readFile(path.join(rootDir, "2026-03-29", "run-meta.json"), "utf8")) as Record<string, unknown>;
    const collectionRun = db
      .prepare(
        `
          SELECT status, notes
          FROM collection_runs
          LIMIT 1
        `
      )
      .get() as { status: string; notes: string };

    expect(result.mailStatus).toBe("sent");
    expect(result.report.meta.degraded).toBe(true);
    expect(reportJson.meta.degraded).toBe(true);
    expect(reportJson.meta.sourceKinds).toEqual(["google_ai"]);
    expect(reportJson.meta.issueUrls).toEqual(["https://blog.google/technology/ai/"]);
    expect(reportJson.meta.sourceFailureCount).toBe(1);
    expect(reportJson.meta.failedSourceKinds).toEqual(["openai"]);
    expect(runMeta.mailStatus).toBe("sent");
    expect(runMeta.degraded).toBe(true);
    expect(runMeta.sourceFailureCount).toBe(1);
    expect(runMeta.failedSourceKinds).toEqual(["openai"]);
    expect(collectionRun.status).toBe("completed");
    expect(collectionRun.notes).toContain('"sourceKinds":["google_ai"]');
    expect(collectionRun.notes).toContain('"sourceFailureCount":1');
    expect(collectionRun.notes).toContain('"failedSourceKinds":["openai"]');

    db.close();
  });

  it("keeps writing report artifacts when email sending fails", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-run-"));
    const config = makeConfig(rootDir);
    const db = createTestDatabase(path.join(rootDir, "hot-now.sqlite"));

    const result = await runDailyDigest(config, "scheduled", {
      db,
      loadEnabledSourceIssues: vi.fn().mockResolvedValue([
        {
          date: "2026-03-27",
          issueUrl: "https://example.com",
          sourceKind: "juya",
          sourceType: "aggregator",
          sourcePriority: 70,
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
        }
      ]),
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
    expect(reportJson.meta.sourceKinds).toEqual(["juya"]);
    expect(reportJson.meta.issueUrls).toEqual(["https://example.com"]);
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
    expect(collectionRun.notes).toContain('"sourceKinds":["juya"]');
    expect(collectionRun.notes).toContain("failed:smtp down");

    db.close();
  });

  it("keeps writing report artifacts when sqlite mirror persistence fails", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-run-"));
    const config = makeConfig(rootDir);

    const result = await runDailyDigest(config, "manual", {
      db: {
        prepare: vi.fn(() => {
          throw new Error("sqlite unavailable");
        })
      } as never,
      loadEnabledSourceIssues: vi.fn().mockResolvedValue([
        {
          date: "2026-03-28",
          issueUrl: "https://example.com",
          sourceKind: "juya",
          sourceType: "aggregator",
          sourcePriority: 70,
          items: [
            {
              rank: 1,
              category: "要闻",
              title: "数据库镜像失败不应阻断落盘",
              sourceUrl: "https://example.com/persist",
              sourceName: "Example",
              externalId: "juya-persist-1",
              summary: "摘要",
              publishedAt: "2026-03-28T08:00:00.000Z"
            }
          ]
        }
      ]),
      fetchArticle: vi.fn().mockResolvedValue({
        ok: true,
        url: "https://example.com/persist",
        title: "数据库镜像失败不应阻断落盘",
        text: "正文内容"
      }),
      sendDailyEmail: vi.fn().mockResolvedValue(undefined)
    });

    const reportJson = JSON.parse(await readFile(path.join(rootDir, "2026-03-28", "report.json"), "utf8")) as typeof result.report;
    const reportHtml = await readFile(path.join(rootDir, "2026-03-28", "report.html"), "utf8");
    const runMeta = JSON.parse(await readFile(path.join(rootDir, "2026-03-28", "run-meta.json"), "utf8")) as Record<string, unknown>;

    expect(result.mailStatus).toBe("sent");
    expect(reportJson.meta.mailStatus).toBe("sent");
    expect(reportJson.meta.sourceKinds).toEqual(["juya"]);
    expect(reportJson.meta.issueUrls).toEqual(["https://example.com"]);
    expect(reportHtml).toContain("邮件状态：sent");
    expect(runMeta.mailStatus).toBe("sent");
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
