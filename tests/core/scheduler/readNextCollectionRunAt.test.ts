import { describe, expect, it } from "vitest";

import { readNextCollectionRunAt } from "../../../src/core/scheduler/readNextCollectionRunAt.js";

describe("readNextCollectionRunAt", () => {
  it("returns the next future boundary for a 10-minute collection schedule", () => {
    const result = readNextCollectionRunAt(
      {
        enabled: true,
        intervalMinutes: 10
      },
      new Date("2026-04-09T18:34:00+08:00")
    );

    expect(result).toBe("2026-04-09T10:40:00.000Z");
  });

  it("returns the next boundary when now is already on a trigger minute", () => {
    const result = readNextCollectionRunAt(
      {
        enabled: true,
        intervalMinutes: 10
      },
      new Date("2026-04-09T18:40:00+08:00")
    );

    expect(result).toBe("2026-04-09T10:50:00.000Z");
  });

  it("returns null when collection schedule is disabled", () => {
    const result = readNextCollectionRunAt(
      {
        enabled: false,
        intervalMinutes: 10
      },
      new Date("2026-04-09T18:34:00+08:00")
    );

    expect(result).toBeNull();
  });
});
