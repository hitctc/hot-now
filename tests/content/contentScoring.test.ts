import { describe, expect, it } from "vitest";
import { scoreContentItem } from "../../src/core/content/contentScoring.js";

describe("scoreContentItem", () => {
  it("scores fresh official complete AI content highly and emits concise badges", () => {
    const result = scoreContentItem(
      {
        title: "OpenAI launches a new agent benchmark",
        summary: "A detailed roundup of model, agent, and product updates.",
        bodyMarkdown:
          "This report includes a full breakdown of the launch, rationale, implementation details, and follow-up context that make the item complete enough for the page.",
        publishedAt: "2026-03-29T06:00:00.000Z",
        sourceKind: "openai"
      },
      { now: "2026-03-29T12:00:00.000Z" }
    );

    expect(result.contentScore).toBeGreaterThanOrEqual(80);
    expect(result.contentScore).toBeLessThanOrEqual(100);
    expect(result.badges).toEqual(expect.arrayContaining(["24h 内", "官方源", "正文完整"]));
  });

  it("gives stale generic content a lower score than a fresh AI-heavy item", () => {
    const fresh = scoreContentItem(
      {
        title: "OpenAI launches a new agent benchmark",
        summary: "A detailed roundup of model, agent, and product updates.",
        bodyMarkdown:
          "This report includes a full breakdown of the launch, rationale, implementation details, and follow-up context that make the item complete enough for the page.",
        publishedAt: "2026-03-29T06:00:00.000Z",
        sourceKind: "openai"
      },
      { now: "2026-03-29T12:00:00.000Z" }
    );
    const stale = scoreContentItem(
      {
        title: "Quarterly product note",
        summary: "Short note.",
        bodyMarkdown: "",
        publishedAt: "2026-03-10T12:00:00.000Z",
        sourceKind: "techcrunch_ai"
      },
      { now: "2026-03-29T12:00:00.000Z" }
    );

    expect(fresh.contentScore).toBeGreaterThan(stale.contentScore);
    expect(stale.badges).not.toContain("24h 内");
  });

  it("treats newly added domestic media feeds as media sources instead of generic aggregators", () => {
    const result = scoreContentItem(
      {
        title: "36氪快讯：国产 AI 公司发布新模型",
        summary: "这是一条来自国内科技媒体的热点快讯。",
        bodyMarkdown: "文章正文给出了模型定位、发布时间和行业影响。",
        publishedAt: "2026-03-29T08:00:00.000Z",
        sourceKind: "kr36_newsflash"
      },
      { now: "2026-03-29T12:00:00.000Z" }
    );

    expect(result.badges).toContain("媒体源");
    expect(result.badges).not.toContain("聚合源");
  });
});
