import { afterEach, describe, expect, it, vi } from "vitest";
import { clearModelTaskRequest, clearDailyDigestRequest, requestModelTask } from "../../src/client/services/modelTaskRequest.js";

const path = "/api/creative/finished-articles/7/manual-text/title";
afterEach(() => {
  clearModelTaskRequest(7, "title");
  clearDailyDigestRequest("2026-09-29");
  vi.restoreAllMocks();
});

describe("模型任务提交响应丢失", () => {
  it("网络失败后保留原请求编号，受理后也保留直到观察到终态", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("网络中断"))
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, taskId: "title-one", status: "queued" }), { status: 202 }));
    await expect(requestModelTask(path, { method: "POST" })).rejects.toThrow("网络中断");
    const first = JSON.parse(String(fetch.mock.calls[0]![1]?.body)).requestId;
    expect(first).toMatch(/^\d{13}-[0-9a-f]{32}$/);
    await requestModelTask(path, { method: "POST" });
    const second = JSON.parse(String(fetch.mock.calls[1]![1]?.body)).requestId;
    expect(second).toBe(first);
    expect(localStorage.getItem("hotnow:model-request:7:title")).toBe(first);
  });

  it("重新加载模块仍通过持久编号找回原提交，不依赖内存缓存", async () => {
    const requestId = `${Date.now()}-12345678123442348234123456789abc`;
    localStorage.setItem("hotnow:model-request:7:title", requestId);
    vi.resetModules();
    const restored = await import("../../src/client/services/modelTaskRequest.js");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, taskId: "original", status: "done" })));
    await restored.requestModelTask(path, { method: "POST" });
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body)).requestId).toBe(requestId);
    expect(localStorage.getItem("hotnow:model-request:7:title")).toBeNull();
    restored.clearModelTaskRequest(7, "title");
  });

  it("终态明确后下一次主动生成使用新编号", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, taskId: "old", status: "done" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, taskId: "new", status: "queued" }), { status: 202 }));
    await requestModelTask(path, { method: "POST" });
    await requestModelTask(path, { method: "POST" });
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body)).requestId)
      .not.toBe(JSON.parse(String(fetch.mock.calls[1]![1]?.body)).requestId);
  });

  it("普通保存和 GET 不带请求编号，也不隐式重试", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}")).mockResolvedValueOnce(new Response("{}"));
    await requestModelTask("/api/creative/finished-articles/7", { method: "PATCH", body: JSON.stringify({ humanMarkdown: "正文" }) });
    await requestModelTask(`${path}/status?taskId=old`);
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({ humanMarkdown: "正文" });
    expect(fetch.mock.calls[1]![1]?.body).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("日报按素材日期保留提交编号，不把受理误当生成完成", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ ok: true, taskId: "digest-one", status: "queued" }), { status: 202 }));
    const init = { method: "POST", body: JSON.stringify({ date: "2026-09-29" }) };
    await requestModelTask("/api/creative/daily-digests/generate", init);
    await requestModelTask("/api/creative/daily-digests/generate", init);
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body)).requestId)
      .toBe(JSON.parse(String(fetch.mock.calls[1]![1]?.body)).requestId);
  });
});
