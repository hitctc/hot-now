import { describe, expect, it, vi } from "vitest";

import { createHermesWriteQueueStatusReader } from "../../src/server/hermesWriteQueueStatus.js";

const healthyStatus = {
  current: null,
  queue_length: 0,
  queue: [],
  stats: { total_completed: 12 }
};

describe("Hermes write queue status reader", () => {
  it("shares an active request and reuses the fresh server cache", async () => {
    let now = 1_000;
    const fetchStatus = vi.fn().mockResolvedValue(healthyStatus);
    const reader = createHermesWriteQueueStatusReader({
      fetchStatus,
      now: () => now
    });

    const [first, second] = await Promise.all([reader.read(), reader.read()]);
    now += 14_000;
    const cached = await reader.read();

    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(first.stats.total_completed).toBe(12);
    expect(second.status_delayed).toBeUndefined();
    expect(cached.status_delayed).toBeUndefined();
  });

  it("returns the recent successful status with a delayed marker after failure", async () => {
    let now = 1_000;
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce(healthyStatus)
      .mockRejectedValueOnce(new Error("Hermes timeout"));
    const reader = createHermesWriteQueueStatusReader({
      fetchStatus,
      freshMs: 15_000,
      now: () => now
    });

    await reader.read();
    now += 16_000;
    const delayed = await reader.read();

    expect(delayed.stats.total_completed).toBe(12);
    expect(delayed.status_delayed).toBe(true);
    expect(delayed.status_unavailable).toBe(false);
    expect(delayed.status_cached_at).toBe(new Date(1_000).toISOString());
  });

  it("returns an explicit unavailable state when no recent success exists", async () => {
    const reader = createHermesWriteQueueStatusReader({
      fetchStatus: vi.fn().mockRejectedValue(new Error("Hermes offline"))
    });

    await expect(reader.read()).resolves.toMatchObject({
      current: null,
      queue_length: 0,
      status_delayed: true,
      status_unavailable: true
    });
  });
});
