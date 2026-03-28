import { describe, expect, it } from "vitest";
import { buildDailyReport } from "../../src/core/report/buildDailyReport.js";
import { renderReportHtml } from "../../src/core/report/renderReportHtml.js";
import type { Topic } from "../../src/core/topics/clusterTopics.js";

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    topicKey: "lyria",
    score: 120,
    category: "要闻",
    headline: "谷歌推出 Lyria 3 Pro 音乐模型",
    items: [
      {
        rank: 1,
        category: "要闻",
        title: "谷歌推出 Lyria 3 Pro 音乐模型",
        sourceUrl: "https://blog.google/lyria",
        article: {
          ok: true,
          url: "https://blog.google/lyria",
          title: "Lyria 3 Pro",
          text: "Google 发布新的音乐模型。"
        }
      }
    ],
    ...overrides
  };
}

describe("buildDailyReport", () => {
  it("creates stable metadata, truncates topics by topN, and keeps degraded state", () => {
    const report = buildDailyReport({
      issue: {
        date: "2026-03-26",
        issueUrl: "https://imjuya.github.io/juya-ai-daily/issue-40/",
        issueUrls: [
          "https://imjuya.github.io/juya-ai-daily/issue-40/",
          "https://openai.com/news/"
        ],
        sourceKinds: ["juya", "openai"],
        items: []
      },
      trigger: "manual",
      topics: [
        makeTopic(),
        makeTopic({
          topicKey: "claude",
          score: 90,
          category: "产品应用",
          headline: "Claude 移动端新增工作相关功能",
          items: [
            {
              rank: 9,
              category: "产品应用",
              title: "Claude 移动端新增工作相关功能",
              sourceUrl: "https://x.com/claudeai/status/1",
              article: {
                ok: false,
                url: "https://x.com/claudeai/status/1",
                title: "",
                text: "",
                error: "403"
              }
            }
          ]
        })
      ],
      topN: 1
    });

    expect(report.meta.date).toBe("2026-03-26");
    expect(report.meta.issueUrl).toBe("https://imjuya.github.io/juya-ai-daily/issue-40/");
    expect(report.meta.issueUrls).toEqual([
      "https://imjuya.github.io/juya-ai-daily/issue-40/",
      "https://openai.com/news/"
    ]);
    expect(report.meta.sourceKinds).toEqual(["juya", "openai"]);
    expect(report.meta.topicCount).toBe(1);
    expect(report.meta.degraded).toBe(true);
    expect(report.meta.mailStatus).toBe("pending");
    expect(report.meta.sourceFailureCount).toBe(0);
    expect(report.meta.failedSourceKinds).toEqual([]);
    expect(report.topics).toHaveLength(1);
    expect(report.topics[0].title).toContain("Lyria 3 Pro");
    expect(report.topics[0].relatedItems).toHaveLength(1);
  });

  it("renders a standalone html report", () => {
    const report = buildDailyReport({
      issue: {
        date: "2026-03-26",
        issueUrl: "https://example.com",
        issueUrls: ["https://example.com", "https://openai.com/news/"],
        sourceKinds: ["juya", "openai"],
        items: []
      },
      trigger: "manual",
      topics: [],
      topN: 10
    });

    const html = renderReportHtml(report);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("HotNow 多源热点汇总 2026-03-26");
    expect(html).toContain("数据源：juya / openai");
    expect(html).toContain("来源入口：");
    expect(html).toContain("邮件状态：pending");
    expect(html).toContain("失败源数：0");
  });
});
