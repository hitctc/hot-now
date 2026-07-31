import { describe, expect, it } from "vitest";

import { createLatestRequestGuard } from "../../src/client/utils/latestRequestGuard";

describe("latest request guard", () => {
  it("accepts only the newest request and invalidates it when the view closes", () => {
    const guard = createLatestRequestGuard();
    const first = guard.begin();
    const second = guard.begin();

    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);

    guard.invalidate();
    expect(guard.isCurrent(second)).toBe(false);
  });
});
