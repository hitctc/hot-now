import { describe, expect, it } from "vitest";
import { createAiTimelineEventKey } from "../../src/core/aiTimeline/aiTimelineEventKey.js";

describe("createAiTimelineEventKey", () => {
  it("uses company, detected entity and published date as the stable merge key", () => {
    expect(createAiTimelineEventKey({
      companyKey: "openai",
      title: "OpenAI 发布 GPT-5.5",
      publishedAt: "2026-04-24T08:00:00.000Z",
      detectedEntities: ["GPT-5.5"]
    })).toBe("openai:gpt-5-5:2026-04-24");
  });

  it("falls back to a normalized title when no entity is detected", () => {
    expect(createAiTimelineEventKey({
      companyKey: "xiaomi",
      title: "小米正式发布 MiMo-V2.5-Pro",
      publishedAt: "2026-04-21T10:00:00.000Z",
      detectedEntities: []
    })).toBe("xiaomi:小米-mimo-v2-5-pro:2026-04-21");
  });

  it("returns null when the official published date is not usable", () => {
    expect(createAiTimelineEventKey({
      companyKey: "openai",
      title: "OpenAI 发布 GPT-5.5",
      publishedAt: "not-a-date",
      detectedEntities: ["GPT-5.5"]
    })).toBeNull();
  });
});
