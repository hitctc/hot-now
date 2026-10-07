import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerHermesOperationalRoutes } from "../../src/server/routes/hermesOperationalRoutes.js";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("强制重写代理", () => {
  it("未经确认不能调用 Hermes；确认后仅转发原编号、请求编号和确认意图", async () => {
    vi.stubEnv("HERMES_API_BASE_URL", "https://hermes.test");
    vi.stubEnv("HERMES_API_TOKEN", "test-only");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, task_id: "new-task" }), { status: 202 }));
    const app = Fastify();
    registerHermesOperationalRoutes(app, { readSession: () => ({}) });
    try {
      const denied = await app.inject({ method: "POST", url: "/api/creative/write-queue/force-rewrite", payload: { taskId: "original" } });
      expect(denied.statusCode).toBe(400);
      expect(fetch).not.toHaveBeenCalled();
      const accepted = await app.inject({ method: "POST", url: "/api/creative/write-queue/force-rewrite", payload: { taskId: "original", requestId: "request-one", confirmed: true, sourceItemId: 999, risk: "fake" } });
      expect(accepted.statusCode).toBe(202);
      expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({ taskId: "original", requestId: "request-one", confirmed: true });
    } finally { await app.close(); }
  });

  it("没有会话权限时不转发写操作", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const app = Fastify();
    registerHermesOperationalRoutes(app, { readSession: (_request, reply) => { reply.code(401).send({ ok: false }); return undefined; } });
    try {
      const result = await app.inject({ method: "POST", url: "/api/creative/write-queue/force-rewrite", payload: { taskId: "original", confirmed: true } });
      expect(result.statusCode).toBe(401);
      expect(fetch).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
});
