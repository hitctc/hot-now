import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/server/createServer.js";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];
afterEach(() => {
  handles.splice(0).forEach((handle) => handle.close());
  vi.restoreAllMocks();
  delete process.env.HERMES_API_BASE_URL;
  delete process.env.HERMES_API_TOKEN;
});

describe("日报唯一队列代理", () => {
  it("保留请求编号并立即返回受理，不把 202 描述为生成完成", async () => {
    const handle = await createTestDatabase("hot-now-digest-queue-");
    handles.push(handle);
    const app = createServer({ db: handle.db });
    try {
      process.env.HERMES_API_BASE_URL = "http://hermes.test";
      process.env.HERMES_API_TOKEN = "test-token";
      const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, taskId: "digest-one", status: "queued" }), { status: 202 }));
      const response = await app.inject({ method: "POST", url: "/api/creative/daily-digests/generate", payload: { date: "2026-09-29", requestId: "request-one" } });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toMatchObject({ ok: true, taskId: "digest-one", status: "queued" });
      expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({ date: "2026-09-29", requestId: "request-one" });
      expect(response.json().detail).toContain("受理");
    } finally { await app.close(); }
  });

  it("状态查询只 GET 原编号，失败状态不再提交生成", async () => {
    const handle = await createTestDatabase("hot-now-digest-status-");
    handles.push(handle);
    const app = createServer({ db: handle.db });
    try {
      process.env.HERMES_API_BASE_URL = "http://hermes.test";
      process.env.HERMES_API_TOKEN = "test-token";
      const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, status: "stopped", error: "用户取消" })));
      const response = await app.inject({ method: "GET", url: "/api/creative/daily-digests/generate/status?taskId=digest-one" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ taskId: "digest-one", status: "stopped", reason: "用户取消" });
      expect(String(fetch.mock.calls[0]![0])).toContain("/api/generate-digest/status?taskId=digest-one");
      expect(fetch.mock.calls[0]![1]?.body).toBeUndefined();
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { await app.close(); }
  });

  it("受理响应缺少任务号时失败，不让页面误报成功", async () => {
    const handle = await createTestDatabase("hot-now-digest-invalid-");
    handles.push(handle);
    const app = createServer({ db: handle.db });
    try {
      process.env.HERMES_API_BASE_URL = "http://hermes.test";
      process.env.HERMES_API_TOKEN = "test-token";
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 202 }));
      const response = await app.inject({ method: "POST", url: "/api/creative/daily-digests/generate" });
      expect(response.statusCode).toBe(502);
      expect(response.json().ok).toBe(false);
    } finally { await app.close(); }
  });
});
