import { afterEach, describe, expect, it, vi } from "vitest";
import { getManualTextTaskStatus, getRegenIntroStatus } from "../../src/client/services/creativeApi.js";
import { readManualTextTask, saveManualTextTask, waitManualTextTask } from "../../src/client/components/creative/article-detail/manualTextTaskWait.js";

vi.mock("../../src/client/services/creativeApi.js", () => ({ getManualTextTaskStatus: vi.fn(), getRegenIntroStatus: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); localStorage.clear(); });

describe("人工文案任务等待", () => {
  it("排队和网络超时只查询原任务，终态才删除保存的编号", async () => {
    vi.useFakeTimers();
    saveManualTextTask(7, "title", "title-original");
    vi.mocked(getManualTextTaskStatus).mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({ ok: true, status: "queued" })
      .mockResolvedValueOnce({ ok: true, status: "done", titles: ["新标题"] });
    const result = waitManualTextTask(7, "title", "title-original", () => true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(readManualTextTask(7, "title")).toBe("title-original");
    await vi.advanceTimersByTimeAsync(6000);
    await vi.advanceTimersByTimeAsync(3000);
    expect((await result)?.titles).toEqual(["新标题"]);
    expect(getManualTextTaskStatus).toHaveBeenCalledTimes(3);
    for (const call of vi.mocked(getManualTextTaskStatus).mock.calls) expect(call).toEqual([7, "title", "title-original"]);
    expect(readManualTextTask(7, "title")).toBeNull();
  });

  it("导语恢复查询原编号，终态不再保留待处理编号", async () => {
    vi.useFakeTimers();
    saveManualTextTask(7, "intro", "intro-original");
    vi.mocked(getRegenIntroStatus).mockResolvedValue({ ok: true, status: "done", intros: ["新导语"] });
    const result = waitManualTextTask(7, "intro", "intro-original", () => true);
    await vi.advanceTimersByTimeAsync(3000);
    expect((await result)?.intros).toEqual(["新导语"]);
    expect(getRegenIntroStatus).toHaveBeenCalledWith(7, "intro-original");
    expect(getManualTextTaskStatus).not.toHaveBeenCalled();
    expect(readManualTextTask(7, "intro")).toBeNull();
  });

  it("关闭或切换文章停止查询，保留编号供重新打开恢复", async () => {
    vi.useFakeTimers();
    saveManualTextTask(7, "keywords", "keywords-original");
    let current = true;
    const result = waitManualTextTask(7, "keywords", "keywords-original", () => current);
    current = false;
    await vi.advanceTimersByTimeAsync(3000);
    expect(await result).toBeNull();
    expect(getManualTextTaskStatus).not.toHaveBeenCalled();
    expect(readManualTextTask(7, "keywords")).toBe("keywords-original");
  });
});
