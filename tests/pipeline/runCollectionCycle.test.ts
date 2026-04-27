import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { runCollectionCycle, type RunCollectionCycleDeps } from "../../src/core/pipeline/runCollectionCycle.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";
import { createTwitterAccount } from "../../src/core/twitter/twitterAccountRepository.js";
import type { RuntimeConfig } from "../../src/core/types/appConfig.js";

type HasSendDailyEmailDep = "sendDailyEmail" extends keyof RunCollectionCycleDeps ? true : false;
const collectionCycleAcceptsMailDep: HasSendDailyEmailDep = false;

function makeConfig(rootDir: string): RuntimeConfig {
  return {
    server: { port: 3030 },
    publicBaseUrl: "https://now.achuan.cc",
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

describe("runCollectionCycle", () => {
  it("keeps the juya feed title even when article extraction returns a different page title", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-collection-"));
    const config = makeConfig(rootDir);
    const db = createTestDatabase(path.join(rootDir, "hot-now.sqlite"));

    await runCollectionCycle(config, "manual", {
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
      })
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

  it("writes collection artifacts, mirrors sqlite state, and never sends email", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-collection-"));
    const config = makeConfig(rootDir);
    const db = createTestDatabase(path.join(rootDir, "hot-now.sqlite"));
    expect(collectionCycleAcceptsMailDep).toBe(false);
    const runNlEvaluationCycle = vi.fn().mockResolvedValue(undefined);

    const result = await runCollectionCycle(config, "manual", {
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
      runNlEvaluationCycle
    });

    const reportJson = JSON.parse(
      await readFile(path.join(rootDir, "2026-03-29", "report.json"), "utf8")
    ) as typeof result.report;
    const reportHtml = await readFile(path.join(rootDir, "2026-03-29", "report.html"), "utf8");
    const runMeta = JSON.parse(
      await readFile(path.join(rootDir, "2026-03-29", "run-meta.json"), "utf8")
    ) as Record<string, unknown>;

    expect(result.mailStatus).toBe("not-sent-by-collection");
    expect(result.report.meta.mailStatus).toBe("not-sent-by-collection");
    expect(result.report.meta.degraded).toBe(true);
    expect(reportJson.meta.mailStatus).toBe("not-sent-by-collection");
    expect(reportJson.meta.degraded).toBe(true);
    expect(reportHtml).toContain("HotNow 多源热点汇总 2026-03-29");
    expect(reportHtml).toContain("数据源：openai / google_ai");
    expect(reportHtml).toContain("邮件状态：not-sent-by-collection");
    expect(reportHtml).toContain("失败源数：0");
    expect(reportHtml).toContain("降级抓取");
    expect(runMeta.mailStatus).toBe("not-sent-by-collection");
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
    expect(collectionRun.notes).toContain('"mailStatus":"not-sent-by-collection"');
    expect(digestReport).toEqual({
      report_date: "2026-03-29",
      report_json_path: path.join(rootDir, "2026-03-29", "report.json"),
      report_html_path: path.join(rootDir, "2026-03-29", "report.html"),
      mail_status: "not-sent-by-collection",
      collection_run_id: 1
    });
    expect(runNlEvaluationCycle).toHaveBeenCalledTimes(1);
    expect(runNlEvaluationCycle).toHaveBeenCalledWith({
      mode: "incremental-after-collect",
      contentItemIds: [1, 2]
    });

    db.close();
  });

  it("triggers incremental nl evaluation after persisting mirrored content", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-collection-"));
    const config = makeConfig(rootDir);
    const db = createTestDatabase(path.join(rootDir, "hot-now.sqlite"));
    const runNlEvaluationCycle = vi.fn().mockResolvedValue(undefined);

    await runCollectionCycle(config, "manual", {
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
        }
      ]),
      fetchArticle: vi.fn(async (url: string) => ({
        ok: true,
        url,
        title: "GPT-Next",
        text: "OpenAI 发布新的模型与 API 更新。"
      })),
      runNlEvaluationCycle
    });

    expect(runNlEvaluationCycle).toHaveBeenCalledTimes(1);
    expect(runNlEvaluationCycle).toHaveBeenCalledWith({
      mode: "incremental-after-collect",
      contentItemIds: [1]
    });

    db.close();
  });

  it("leaves twitter accounts out of the default collection cycle", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-collection-twitter-"));
    const config = makeConfig(rootDir);
    const db = createTestDatabase(path.join(rootDir, "hot-now.sqlite"));
    createTwitterAccount(db, {
      username: "openai",
      displayName: "OpenAI"
    });

    await runCollectionCycle(config, "manual", {
      db,
      loadEnabledSourceIssues: vi.fn().mockResolvedValue([
        {
          date: "2026-04-23",
          issueUrl: "https://openai.com/news/",
          sourceKind: "openai",
          sourceType: "official",
          sourcePriority: 95,
          items: []
        }
      ]),
      fetchArticle: vi.fn(async (url: string) => ({
        ok: false,
        url,
        title: "",
        text: "",
        error: "twitter page skipped"
      }))
    });

    const row = db
      .prepare(
        `
          SELECT cs.kind AS source_kind, ci.external_id
          FROM content_items ci
          JOIN content_sources cs ON cs.id = ci.source_id
          WHERE cs.kind = 'twitter_accounts'
          LIMIT 1
        `
      )
      .get() as {
      source_kind: string;
      external_id: string;
    } | undefined;

    expect(row).toBeUndefined();

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
