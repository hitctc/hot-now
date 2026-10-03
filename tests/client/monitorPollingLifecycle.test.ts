import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import MonitorStatsCards from "../../src/client/components/monitor/MonitorStatsCards.vue";

const api = vi.hoisted(() => ({ stats: vi.fn(), platform: vi.fn() }));
vi.mock("../../src/client/services/monitorApi.js", () => ({ fetchMonitorStats: api.stats, fetchPlatformStats: api.platform }));

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.resetAllMocks(); });

describe("monitor polling lifecycle", () => {
  it("pauses hidden reads and refreshes on return without overlapping requests", async () => {
    vi.useFakeTimers();
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    let resolveStats!: (value: null) => void;
    api.stats.mockImplementation(() => new Promise(resolve => { resolveStats = resolve; }));
    api.platform.mockResolvedValue(null);
    const wrapper = mount(MonitorStatsCards, { global: { stubs: { "a-button": true, "a-spin": true } } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.stats).toHaveBeenCalledTimes(1);
    resolveStats(null);
    await flushPromises();
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.stats).toHaveBeenCalledTimes(1);
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();
    expect(api.stats).toHaveBeenCalledTimes(2);
    wrapper.unmount();
    resolveStats(null);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.stats).toHaveBeenCalledTimes(2);
  });
});
