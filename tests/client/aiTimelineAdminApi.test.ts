import { beforeEach, describe, expect, it, vi } from "vitest";

const requestJson = vi.fn();

vi.mock("../../src/client/services/http", () => ({
  requestJson
}));

describe("aiTimelineAdminApi", () => {
  beforeEach(() => {
    requestJson.mockReset();
  });

  it("reads the AI timeline admin workbench with query filters", async () => {
    const { readAiTimelineAdminWorkbench } = await import("../../src/client/services/aiTimelineAdminApi");

    requestJson.mockResolvedValue({ overview: {}, sources: [], events: { events: [] } });

    await readAiTimelineAdminWorkbench({
      eventType: "模型发布",
      company: "openai",
      searchKeyword: "GPT",
      importance: ["S", "A"],
      visibility: ["auto_visible"],
      recentDays: 7,
      page: 2
    });

    expect(requestJson).toHaveBeenCalledWith(
      "/api/settings/ai-timeline?eventType=%E6%A8%A1%E5%9E%8B%E5%8F%91%E5%B8%83&company=openai&q=GPT&importance=S%2CA&visibility=auto_visible&recentDays=7&page=2"
    );
  });

  it("reads paged admin events from the dedicated events endpoint", async () => {
    const { readAiTimelineAdminEvents } = await import("../../src/client/services/aiTimelineAdminApi");

    requestJson.mockResolvedValue({ events: [] });

    await readAiTimelineAdminEvents({ importance: ["S"], page: 2 });

    expect(requestJson).toHaveBeenCalledWith("/api/settings/ai-timeline/events?importance=S&page=2");
  });
});
