import { describe, expect, it } from "vitest";
import { classifyImportantAiTimelineEvent } from "../../src/core/aiTimeline/aiTimelineImportance.js";

describe("aiTimelineImportance", () => {
  it("classifies flagship model releases as S level with Chinese summary", () => {
    const result = classifyImportantAiTimelineEvent({
      companyKey: "xiaomi_mimo",
      companyName: "Xiaomi MiMo",
      sourceLabel: "Xiaomi MiMo Blog",
      defaultEventType: "模型发布",
      title: "Xiaomi MiMo-V2.5 Series Models Brand New Release",
      summary: "Xiaomi MiMo-V2.5-Pro flagship foundation model with 1M context.",
      officialUrl: "https://mimo.xiaomi.com/blog"
    });

    expect(result.importanceLevel).toBe("S");
    expect(result.eventType).toBe("模型发布");
    expect(result.releaseStatus).toBe("released");
    expect(result.importanceSummaryZh).toContain("小米");
    expect(result.importanceSummaryZh).toContain("为什么重要");
    expect(result.detectedEntities).toContain("MiMo-V2.5-Pro");
  });

  it("marks official previews as not formally released", () => {
    const result = classifyImportantAiTimelineEvent({
      companyKey: "google_ai",
      companyName: "Google AI",
      sourceLabel: "Gemini API Release Notes",
      defaultEventType: "官方前瞻",
      title: "Gemini model preview coming soon",
      summary: "Preview access will be available soon.",
      officialUrl: "https://ai.google.dev/gemini-api/docs/changelog"
    });

    expect(result.releaseStatus).toBe("official_preview");
    expect(result.importanceSummaryZh).toContain("尚未正式发布");
  });

  it("keeps small maintenance notes out of the main timeline", () => {
    const result = classifyImportantAiTimelineEvent({
      companyKey: "anthropic",
      companyName: "Anthropic",
      sourceLabel: "Claude Code Changelog",
      defaultEventType: "开发生态",
      title: "Fixed typo in documentation",
      summary: "Minor documentation update.",
      officialUrl: "https://code.claude.com/docs/en/changelog"
    });

    expect(["B", "C"]).toContain(result.importanceLevel);
    expect(result.visibilityStatus).toBe("auto_visible");
  });

  it("classifies native 4K video model releases as S level", () => {
    const result = classifyImportantAiTimelineEvent({
      companyKey: "kling_ai",
      companyName: "可灵 AI",
      sourceLabel: "Kling Release Notes",
      defaultEventType: "模型发布",
      title: "Kling launches native 4K video model",
      summary: "New native 4K quality video generation model for creators.",
      officialUrl: "https://kling.ai/release-note"
    });

    expect(result.importanceLevel).toBe("S");
    expect(result.eventType).toBe("模型发布");
    expect(result.importanceSummaryZh).toContain("视频");
    expect(result.detectedEntities).toEqual(expect.arrayContaining(["Kling", "4K"]));
  });
});
