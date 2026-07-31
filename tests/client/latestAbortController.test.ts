import { describe, expect, it } from "vitest";

import {
  createLatestAbortController,
  isAbortError
} from "../../src/client/utils/latestAbortController.js";

describe("createLatestAbortController", () => {
  it("cancels the previous request and only accepts the latest controller", () => {
    const requests = createLatestAbortController();
    const first = requests.begin();
    const second = requests.begin();

    expect(first.signal.aborted).toBe(true);
    expect(requests.isCurrent(first)).toBe(false);
    expect(requests.isCurrent(second)).toBe(true);

    requests.cancel();
    expect(second.signal.aborted).toBe(true);
    expect(requests.isCurrent(second)).toBe(false);
  });

  it("recognizes a standard AbortError", () => {
    expect(isAbortError(new DOMException("cancelled", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("network failed"))).toBe(false);
  });
});
