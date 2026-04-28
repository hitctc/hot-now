import { describe, expect, it } from "vitest";

import { formatAiTimelineDateTime } from "../../src/core/aiTimeline/formatAiTimelineDateTime.js";

describe("formatAiTimelineDateTime", () => {
  it("formats AI timeline timestamps as a Shanghai date time without timezone text", () => {
    expect(formatAiTimelineDateTime("2026-04-28T16:06:53+08:00")).toBe("2026-04-28 16:06:53");
    expect(formatAiTimelineDateTime("2026-04-27T09:00:00.000Z")).toBe("2026-04-27 17:00:00");
  });

  it("keeps empty and invalid values readable", () => {
    expect(formatAiTimelineDateTime(null)).toBe("暂无");
    expect(formatAiTimelineDateTime("not-a-date")).toBe("时间无效");
  });
});
