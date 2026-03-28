import { describe, expect, it, vi } from "vitest";
import { sendDailyEmail } from "../../src/core/mail/sendDailyEmail.js";
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
        topicCount: 1,
        degraded: false,
        mailStatus: "pending"
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
    expect(message.html).toContain("http://127.0.0.1:3030/reports/2026-03-26");
  });
});
