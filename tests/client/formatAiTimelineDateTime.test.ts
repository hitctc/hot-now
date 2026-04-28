import { describe, expect, it } from "vitest";

import { formatAiTimelineDateTime } from "../../src/client/utils/formatAiTimelineDateTime";

describe("client formatAiTimelineDateTime", () => {
  it("formats AI timeline timestamps without year or seconds", () => {
    expect(formatAiTimelineDateTime("2026-04-26T16:00:00.000Z")).toBe("04-27 00:00");
    expect(formatAiTimelineDateTime("2026-04-24T10:05:53.000Z")).toBe("04-24 18:05");
  });

  it("keeps stable fallback labels for empty or invalid timestamps", () => {
    expect(formatAiTimelineDateTime(null)).toBe("暂无");
    expect(formatAiTimelineDateTime("not-a-date")).toBe("时间无效");
  });
});
