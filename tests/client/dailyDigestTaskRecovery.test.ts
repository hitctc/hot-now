import { shallowMount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { message, Modal } from "ant-design-vue";
import DailyDigestPage from "../../src/client/pages/creative/DailyDigestPage.vue";
import { readDailyDigests, readGenerateDigestTask, triggerGenerateDigest } from "../../src/client/services/dailyDigestApi.js";

vi.mock("../../src/client/services/dailyDigestApi.js", () => ({
  readDailyDigests: vi.fn(), readDailyDigest: vi.fn(), triggerGenerateDigest: vi.fn(), readGenerateDigestTask: vi.fn(),
}));
const taskKey = "hotnow:daily-digest-task";
const wrappers: ReturnType<typeof shallowMount>[] = [];

/** 挂载日报页面并保留清理句柄；组件替身不触发真实接口或模型。 */
function mountPage() {
  const wrapper = shallowMount(DailyDigestPage, { global: { stubs: {
    "a-button": { template: '<button @click="$emit(\'click\')"><slot /></button>' },
    "a-select": true, "a-select-option": true, "a-table": true, "a-tag": true,
  } } });
  wrappers.push(wrapper);
  return wrapper;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(readDailyDigests).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
  for (const method of ["success", "warning", "error", "info"] as const) {
    vi.spyOn(message, method).mockImplementation(() => undefined as never);
  }
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); localStorage.clear();
});

describe("日报任务页面恢复", () => {
  it("刷新只观察原编号，离开停止查询，重开确认取消后清理编号", async () => {
    localStorage.setItem(taskKey, "original");
    localStorage.setItem("hotnow:model-request:daily:yesterday", "request-original");
    vi.mocked(readGenerateDigestTask).mockResolvedValue({ ok: true, status: "running" });
    const first = mountPage();
    await vi.advanceTimersByTimeAsync(3000);
    expect(readGenerateDigestTask).toHaveBeenLastCalledWith("original");
    first.unmount();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(readGenerateDigestTask).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(taskKey)).toBe("original");
    vi.mocked(readGenerateDigestTask).mockResolvedValue({ ok: true, status: "stopped" });
    mountPage();
    await vi.advanceTimersByTimeAsync(3000);
    expect(triggerGenerateDigest).not.toHaveBeenCalled();
    expect(localStorage.getItem(taskKey)).toBeNull();
    expect(localStorage.getItem("hotnow:model-request:daily:yesterday")).toBeNull();
    expect(message.warning).toHaveBeenCalledWith("日报任务已取消");
  });

  it("网络故障退避并保留原编号，恢复完成后刷新列表而不重复生成", async () => {
    localStorage.setItem(taskKey, "original");
    vi.mocked(readGenerateDigestTask).mockRejectedValueOnce(new TypeError("离线"))
      .mockResolvedValueOnce({ ok: true, status: "done" });
    mountPage();
    await vi.advanceTimersByTimeAsync(3000);
    expect(localStorage.getItem(taskKey)).toBe("original");
    await vi.advanceTimersByTimeAsync(5999);
    expect(readGenerateDigestTask).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(readGenerateDigestTask).toHaveBeenCalledTimes(2);
    expect(triggerGenerateDigest).not.toHaveBeenCalled();
    expect(readDailyDigests).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(taskKey)).toBeNull();
  });

  it("离开后迟到的受理响应只保存编号，不启动后台页面轮询", async () => {
    let resolve!: (result: { ok: boolean; taskId: string; status: string }) => void;
    vi.mocked(triggerGenerateDigest).mockReturnValue(new Promise((done) => { resolve = done; }));
    const confirm = vi.spyOn(Modal, "confirm").mockReturnValue({ destroy: vi.fn(), update: vi.fn() });
    const wrapper = mountPage();
    await wrapper.find("button").trigger("click");
    const pending = confirm.mock.calls[0]![0].onOk!();
    wrapper.unmount();
    resolve({ ok: true, taskId: "late", status: "queued" });
    await pending;
    await flushPromises();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(localStorage.getItem(taskKey)).toBe("late");
    expect(readGenerateDigestTask).not.toHaveBeenCalled();
  });
});
