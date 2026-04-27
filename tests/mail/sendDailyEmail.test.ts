import { describe, expect, it, vi } from "vitest";
import { sendAiTimelineAlertEmail } from "../../src/core/mail/sendAiTimelineAlertEmail.js";
import { sendDailyEmail } from "../../src/core/mail/sendDailyEmail.js";
import type { AiTimelineEventRecord } from "../../src/core/aiTimeline/aiTimelineTypes.js";
import type { DailyReport } from "../../src/core/report/buildDailyReport.js";

describe("sendDailyEmail", () => {
  it("sends html email through an injected transport", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "1" });
    const report = {
      meta: {
        date: "2026-03-26",
        generatedAt: "2026-03-26T00:00:00.000Z",
        trigger: "manual",
        issueUrl: "",
        issueUrls: ["https://openai.com/news/", "https://blog.google/technology/ai/"],
        sourceKinds: ["openai", "google_ai"],
        topicCount: 1,
        degraded: false,
        mailStatus: "pending",
        sourceFailureCount: 1,
        failedSourceKinds: ["juya"]
      },
      topics: [
        {
          rank: 1,
          title: "谷歌推出 Lyria 3 Pro 音乐模型",
          category: "要闻",
          whyItMatters: "原因",
          summary: "摘要",
          keywords: [],
          relatedCount: 1,
          relatedItems: []
        }
      ]
    } satisfies DailyReport;

    await sendDailyEmail(
      {
        publicBaseUrl: "https://now.achuan.cc",
        smtp: {
          host: "smtp.qq.com",
          port: 465,
          secure: true,
          user: "sender@qq.com",
          pass: "secret",
          to: "receiver@example.com",
          baseUrl: "http://127.0.0.1:3030"
        }
      } as never,
      report,
      sendMail
    );

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "sender@qq.com",
        to: "receiver@example.com",
        subject: expect.stringContaining("2026-03-26"),
        html: expect.stringContaining("谷歌推出 Lyria 3 Pro 音乐模型")
      })
    );

    const [[message]] = sendMail.mock.calls;
    expect(message.html).toContain("2026-03-26");
    expect(message.html).toContain("https://now.achuan.cc/reports/2026-03-26");
    expect(message.html).toContain("HotNow 多源热点汇总");
    expect(message.html).toContain("数据源：openai / google_ai");
    expect(message.html).toContain("本次有 1 个来源抓取失败：juya");
  });
});

describe("sendAiTimelineAlertEmail", () => {
  it("sends a short S-level timeline alert email", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "alert-1" });

    await sendAiTimelineAlertEmail(
      {
        publicBaseUrl: "https://now.achuan.cc",
        smtp: {
          host: "smtp.qq.com",
          port: 465,
          secure: true,
          user: "sender@qq.com",
          pass: "secret",
          to: "receiver@example.com",
          baseUrl: "http://127.0.0.1:3030"
        }
      } as never,
      makeAiTimelineEvent(),
      sendMail
    );

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "sender@qq.com",
        to: "receiver@example.com",
        subject: "AI S级事件提醒：OpenAI 发布重要模型",
        html: expect.stringContaining("https://now.achuan.cc/ai-timeline")
      })
    );
  });
});

function makeAiTimelineEvent(): AiTimelineEventRecord {
  return {
    id: 1,
    companyKey: "openai",
    companyName: "OpenAI",
    eventType: "模型发布",
    title: "OpenAI Important Model",
    summary: "官方发布重要模型。",
    officialUrl: "https://openai.com/index/example/",
    sourceLabel: "AI 官方发布时间线 feed",
    sourceKind: "ai_timeline_feed",
    publishedAt: "2026-04-27T09:00:00.000Z",
    discoveredAt: "2026-04-27T10:00:00.000Z",
    importance: 100,
    importanceLevel: "S",
    releaseStatus: "released",
    importanceSummaryZh: "这会影响开发者和产品节奏。",
    visibilityStatus: "auto_visible",
    manualTitle: null,
    manualSummaryZh: null,
    manualImportanceLevel: null,
    detectedEntities: ["OpenAI"],
    eventKey: "2026-04-27-openai-important-model",
    reliabilityStatus: "single_source",
    evidenceCount: 1,
    lastVerifiedAt: "2026-04-27T10:00:00.000Z",
    evidenceLinks: [
      {
        id: 10,
        eventId: 1,
        sourceId: "openai-1",
        companyKey: "openai",
        sourceLabel: "OpenAI",
        sourceKind: "official_blog",
        officialUrl: "https://openai.com/index/example/",
        title: "OpenAI announcement",
        summary: null,
        publishedAt: "2026-04-27T09:00:00.000Z",
        discoveredAt: "2026-04-27T10:00:00.000Z",
        rawSourceJson: null,
        createdAt: "2026-04-27T10:00:00.000Z",
        updatedAt: "2026-04-27T10:00:00.000Z"
      }
    ],
    displayTitle: "OpenAI 发布重要模型",
    displaySummaryZh: "官方发布重要模型。",
    rawSourceJson: null,
    createdAt: "2026-04-27T10:00:00.000Z",
    updatedAt: "2026-04-27T10:00:00.000Z"
  };
}
