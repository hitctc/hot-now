import { enrichWriteQueueDisplay } from "../../core/creative/creativeWriteQueueDisplayRepository.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { SqliteDatabase } from "../../core/db/openDatabase.js";
import {
  createHermesWriteQueueStatusReader,
  type HermesWriteQueueStatus,
} from "../hermesWriteQueueStatus.js";

export type HermesOperationalRouteOptions = {
  db?: SqliteDatabase;
  readSession: (request: FastifyRequest, reply: FastifyReply) => unknown | undefined;
};

/** 注册写作队列、运行监控和人工生图任务的 Hermes 代理接口。 */
export function registerHermesOperationalRoutes(
  app: FastifyInstance,
  options: HermesOperationalRouteOptions
): void {
  const { db } = options;

  // 读取器只在服务启动时初始化，沿用原有的 3 秒超时和缓存降级策略。
  const hermesWriteQueueStatusReader = createHermesWriteQueueStatusReader({
    fetchStatus: async () => {
      const hermesApiUrl = process.env.HERMES_API_BASE_URL;
      const hermesApiToken = process.env.HERMES_API_TOKEN;
      if (!hermesApiUrl || !hermesApiToken) {
        throw new Error("Hermes API is not configured");
      }

      const response = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/write-queue/status`, {
        method: "GET",
        headers: { Authorization: `Bearer ${hermesApiToken}` },
        signal: AbortSignal.timeout(3_000)
      });
      if (!response.ok) {
        throw new Error(`Hermes HTTP ${response.status}`);
      }
      return await response.json() as HermesWriteQueueStatus;
    }
  });

  for (const action of ["cancel", "result"] as const) {
    app.route({ method: action === "cancel" ? "POST" : "GET", url: `/api/creative/write-queue/${action}`,
      /** 代理单任务取消或私有产物读取；只接受编号，不接受本地路径。 */
      handler: async (request, reply) => {
        if (options.readSession(request, reply) === undefined) return;
        const taskId = (action === "cancel" ? request.body : request.query) as { taskId?: unknown } | undefined;
        if (typeof taskId?.taskId !== "string" || !taskId.taskId || taskId.taskId.length > 128) {
          return reply.code(400).send({ success: false, error: "无效任务编号" });
        }
        const base = process.env.HERMES_API_BASE_URL;
        const token = process.env.HERMES_API_TOKEN;
        if (!base || !token) return reply.code(503).send({ success: false, error: "Hermes 未配置" });
        try {
          const response = await fetch(`${base.replace(/\/+$/, "")}/api/write-queue/${action}${action === "result" ? `?taskId=${encodeURIComponent(taskId.taskId)}` : ""}`, {
            method: action === "cancel" ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            ...(action === "cancel" ? { body: JSON.stringify({ taskId: taskId.taskId }) } : {}), signal: AbortSignal.timeout(10_000),
          });
          return reply.code(response.status >= 500 ? 502 : response.status).send(await response.json());
        } catch { return reply.code(502).send({ success: false, error: "任务服务暂不可达，请查询原编号" }); }
      },
    });
  }

  // 队列状态仅补充展示关联：短素材外部标识和成品关联均转换为平台 ID，不改变 Hermes 任务。
  app.get("/api/creative/write-queue/status", async (request, reply) => {
    const session = options.readSession(request, reply);
    if (session === undefined) { return; }

    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }

    const data = await hermesWriteQueueStatusReader.read();

    // 队列终态历史从 Hermes 持久化读取；旧版本服务没有历史文件时，用本地 pipeline 成品补齐成功记录。
    if (db) enrichWriteQueueDisplay(db, data);

    return reply.send(data);
  });

  // ─── Hermes 监控 API 代理 ───
  // 统一鉴权 + 转发到 Hermes /api/monitor/*
  const hermesMonitorProxy = async (request: any, reply: any, hermesPath: string, method: string = "GET") => {
    const session = options.readSession(request, reply);
    if (session === undefined) { return; }
    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }
    try {
      const fetchOpts: RequestInit = {
        method,
        headers: { "Authorization": `Bearer ${hermesApiToken}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15_000),
      };
      // GET 请求把 query string 原样传递
      const qs = request.url.split("?")[1] || "";
      const fullPath = `${hermesApiUrl.replace(/\/+$/, "")}${hermesPath}${qs ? `?${qs}` : ""}`;
      if (method === "POST" && request.body) {
        fetchOpts.body = JSON.stringify(request.body);
      }
      const res = await fetch(fullPath, fetchOpts);
      const body = await res.text();
      return reply.code(res.status).header("Content-Type", "application/json; charset=utf-8").send(body);
    } catch (err) {
      const errMessage = (err as Error).message ?? String(err);
      return reply.code(502).send({ ok: false, reason: "Hermes 调用失败", detail: errMessage });
    }
  };

  app.get("/api/monitor/stats", async (req, reply) => hermesMonitorProxy(req, reply, "/api/monitor/stats"));
  app.get("/api/monitor/platform-stats", async (req, reply) => hermesMonitorProxy(req, reply, "/api/monitor/platform-stats"));
  app.get("/api/monitor/runs-with-steps", async (req, reply) => hermesMonitorProxy(req, reply, "/api/monitor/runs-with-steps"));
  app.get("/api/monitor/runs", async (req, reply) => hermesMonitorProxy(req, reply, "/api/monitor/runs"));
  app.get("/api/monitor/runs/:id", async (req, reply) => hermesMonitorProxy(req, reply, `/api/monitor/runs/${(req.params as { id: string }).id}`));
  app.get("/api/monitor/items", async (req, reply) => hermesMonitorProxy(req, reply, "/api/monitor/items"));
  app.get("/api/monitor/switch/:key", async (req, reply) => hermesMonitorProxy(req, reply, `/api/monitor/switch/${(req.params as { key: string }).key}`));
  app.post("/api/monitor/switch/:key", async (req, reply) => hermesMonitorProxy(req, reply, `/api/monitor/switch/${(req.params as { key: string }).key}`, "POST"));

  // ─── Codex 生图可观测性 ───
  app.get("/api/codex/tasks", async (req, reply) => hermesMonitorProxy(req, reply, "/api/codex/tasks"));
  app.get("/api/codex/consumption", async (req, reply) => hermesMonitorProxy(req, reply, "/api/codex/consumption"));

  // ─── 定时任务立即触发 ───
  app.post("/api/monitor/trigger/pipeline", async (req, reply) => hermesMonitorProxy(req, reply, "/api/monitor/trigger/pipeline", "POST"));
  app.post("/api/monitor/trigger/codex-generate", async (req, reply) => hermesMonitorProxy(req, reply, "/api/monitor/trigger/codex-generate", "POST"));
  app.post("/api/monitor/trigger/codex-consume", async (req, reply) => hermesMonitorProxy(req, reply, "/api/monitor/trigger/codex-consume", "POST"));

  // ─── 手动生图 API 代理（provider-manual / codex-manual） ───
  app.post("/api/provider/generate-image", async (request, reply) => {
    const session = options.readSession(request, reply);
    if (session === undefined) { return; }
    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }
    try {
      const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/provider/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hermesApiToken}` },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(120_000),
      });
      const body = await res.text();
      return reply.code(res.status).header("Content-Type", "application/json; charset=utf-8").send(body);
    } catch (err) {
      return reply.code(502).send({ ok: false, reason: "Hermes 调用失败", detail: (err as Error).message });
    }
  });

  app.post("/api/codex/generate-image-tasks", async (request, reply) => {
    const session = options.readSession(request, reply);
    if (session === undefined) { return; }
    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }
    try {
      const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/codex/generate-image-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hermesApiToken}` },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(120_000),
      });
      const body = await res.text();
      return reply.code(res.status).header("Content-Type", "application/json; charset=utf-8").send(body);
    } catch (err) {
      return reply.code(502).send({ ok: false, reason: "Hermes 调用失败", detail: (err as Error).message });
    }
  });
}
