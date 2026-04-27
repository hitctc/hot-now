import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { runAiTimelineAlertCycle } from "../../src/core/notifications/runAiTimelineAlertCycle.js";
import type { RuntimeConfig } from "../../src/core/types/appConfig.js";

describe("runAiTimelineAlertCycle", () => {
  it("sends new S-level events to Feishu and email once", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-alerts-"));
    const feedFile = path.join(rootDir, "feeds", "ai-timeline-feed.md");
    const db = openDatabase(path.join(rootDir, "hot-now.sqlite"));
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0 }), { status: 200 }));
    const sendMail = vi.fn().mockResolvedValue({ messageId: "1" });

    await mkdir(path.dirname(feedFile), { recursive: true });
    await writeFile(feedFile, buildFeedMarkdown());
    runMigrations(db);

    try {
      const firstResult = await runAiTimelineAlertCycle(makeConfig(rootDir, feedFile), db, {
        fetchImpl: fetchImpl as never,
        sendMail
      });
      const secondResult = await runAiTimelineAlertCycle(makeConfig(rootDir, feedFile), db, {
        fetchImpl: fetchImpl as never,
        sendMail
      });

      expect(firstResult).toEqual({
        scannedEventCount: 1,
        pendingEventCount: 1,
        notifiedEventCount: 1,
        failedEventCount: 0
      });
      expect(secondResult).toEqual({
        scannedEventCount: 1,
        pendingEventCount: 0,
        notifiedEventCount: 0,
        failedEventCount: 0
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [, request] = fetchImpl.mock.calls[0];
      expect(String(request?.body)).toContain("https://now.achuan.cc/ai-timeline");
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "AI S级事件提醒：OpenAI 发布重要模型"
        })
      );

      const rows = db
        .prepare("SELECT event_key, feishu_status, email_status FROM ai_timeline_event_notifications")
        .all() as Array<{ event_key: string; feishu_status: string; email_status: string }>;
      expect(rows).toEqual([
        {
          event_key: "2026-04-27-openai-important-model",
          feishu_status: "sent",
          email_status: "sent"
        }
      ]);
    } finally {
      db.close();
    }
  });
});

function makeConfig(rootDir: string, feedFile: string): RuntimeConfig {
  return {
    server: { port: 3030 },
    publicBaseUrl: "https://now.achuan.cc",
    collectionSchedule: { enabled: true, intervalMinutes: 10 },
    mailSchedule: { enabled: false, dailyTime: "10:00", timezone: "Asia/Shanghai" },
    aiTimelineAlerts: {
      enabled: true,
      intervalMinutes: 5,
      channels: { feishu: true, email: true },
      feishuWebhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/test"
    },
    manualActions: { collectEnabled: true, sendLatestEmailEnabled: true },
    report: { topN: 10, dataDir: path.join(rootDir, "reports"), allowDegraded: true },
    aiTimelineFeed: {
      url: null,
      file: feedFile,
      manifestFile: path.join(rootDir, "feeds", "ai-timeline-feed-manifest.json"),
      maxFallbackVersions: 10
    },
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
      sessionSecret: "session-secret"
    }
  };
}

function buildFeedMarkdown() {
  return `# AI Timeline

\`\`\`json ai-timeline-feed
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-04-27T10:00:00.000Z",
  "events": [
    {
      "eventKey": "2026-04-27-openai-important-model",
      "title": "OpenAI Important Model",
      "titleZh": "OpenAI 发布重要模型",
      "company": "OpenAI",
      "companyKey": "openai",
      "eventType": "模型发布",
      "releaseStatus": "released",
      "importance": "S",
      "eventTime": "2026-04-27T09:00:00.000Z",
      "summaryZh": "官方发布重要模型。",
      "whyItMattersZh": "这会影响开发者和产品节奏。",
      "officialUrl": "https://openai.com/index/example/",
      "officialSources": [
        {
          "type": "official_blog",
          "title": "OpenAI announcement",
          "url": "https://openai.com/index/example/",
          "publishedAt": "2026-04-27T09:00:00.000Z"
        }
      ],
      "tags": ["OpenAI"],
      "confidence": "high",
      "visibility": "show"
    },
    {
      "eventKey": "2026-04-27-openai-a-model",
      "title": "OpenAI A Model",
      "company": "OpenAI",
      "eventType": "模型发布",
      "importance": "A",
      "eventTime": "2026-04-27T08:00:00.000Z",
      "summaryZh": "A级事件。",
      "officialUrl": "https://openai.com/index/a/",
      "confidence": "high",
      "visibility": "show"
    }
  ]
}
\`\`\`
`;
}
