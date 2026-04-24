import { beforeEach, describe, expect, it, vi } from "vitest";

const requestJson = vi.fn();

vi.mock("../../src/client/services/http", () => ({
  requestJson
}));

describe("aiTimelineApi", () => {
  beforeEach(() => {
    requestJson.mockReset();
  });

  it("reads the timeline without query params by default", async () => {
    const { readAiTimelinePage } = await import("../../src/client/services/aiTimelineApi");

    requestJson.mockResolvedValue({
      page: 1,
      pageSize: 50,
      totalResults: 0,
      totalPages: 0,
      filters: { eventTypes: [], companies: [] },
      events: []
    });

    await readAiTimelinePage();

    expect(requestJson).toHaveBeenCalledWith("/api/ai-timeline");
  });

  it("serializes event type, company, title search and page filters", async () => {
    const { readAiTimelinePage } = await import("../../src/client/services/aiTimelineApi");

    requestJson.mockResolvedValue({
      page: 2,
      pageSize: 50,
      totalResults: 51,
      totalPages: 2,
      filters: { eventTypes: ["模型发布"], companies: [] },
      events: []
    });

    await readAiTimelinePage({
      eventType: " 模型发布 ",
      company: " openai ",
      searchKeyword: " GPT ",
      page: 2
    });

    expect(requestJson).toHaveBeenCalledWith(
      "/api/ai-timeline?eventType=%E6%A8%A1%E5%9E%8B%E5%8F%91%E5%B8%83&company=openai&q=GPT&page=2"
    );
  });
});
