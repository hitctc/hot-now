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

  // ─── 写作队列状态：代理 Hermes GET /api/write-queue/status ───
  app.get("/api/creative/write-queue/status", async (request, reply) => {
    const session = options.readSession(request, reply);
    if (session === undefined) { return; }

    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }

    const data = await hermesWriteQueueStatusReader.read();

    // 队列终态历史从 Hermes 持久化读取；旧版本服务没有历史文件时，用本地 pipeline 成品补齐成功记录。
    if (db) {
      // 队列日期带必须读取数据库全量日统计，不能从有限的历史记录反推文章和素材数量。
      const articleDayRows = db.prepare(`
        SELECT date(datetime(created_at), '+8 hours') AS day_key, COUNT(*) AS article_count
        FROM creative_finished_articles
        WHERE deleted_at IS NULL
        GROUP BY day_key
      `).all() as Array<{ day_key: string; article_count: number }>;
      const sourceDayRows = db.prepare(`
        SELECT date(datetime(COALESCE(collector_timestamp, created_at)), '+8 hours') AS day_key, COUNT(*) AS source_count
        FROM creative_source_items
        GROUP BY day_key
      `).all() as Array<{ day_key: string; source_count: number }>;
      const dayCounts = new Map<string, { day_key: string; article_count: number; source_count: number }>();
      for (const row of articleDayRows) {
        dayCounts.set(row.day_key, { ...row, source_count: 0 });
      }
      for (const row of sourceDayRows) {
        const current = dayCounts.get(row.day_key) ?? { day_key: row.day_key, article_count: 0, source_count: 0 };
        current.source_count = row.source_count;
        dayCounts.set(row.day_key, current);
      }
      data.day_counts = [...dayCounts.values()].sort((left, right) => right.day_key.localeCompare(left.day_key));

      const history = Array.isArray(data.history) ? data.history as Array<Record<string, unknown>> : [];
      const knownArticleIds = new Set(
        history.map((task) => Number(task.finished_article_id)).filter((id) => Number.isFinite(id) && id > 0),
      );
      const legacyArticles = db.prepare(`
        SELECT id, source_item_id, created_at
        FROM creative_finished_articles
        WHERE origin_type = 'pipeline'
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT 500
      `).all() as Array<{ id: number; source_item_id: number | null; created_at: string }>;
      for (const article of legacyArticles) {
        if (knownArticleIds.has(article.id)) continue;
        history.push({
          task_id: `article-${article.id}`,
          label: `历史成品 · #${article.id}`,
          priority: "normal",
          source_item_id: article.source_item_id,
          status: "done",
          submitted_at: article.created_at,
          started_at: article.created_at,
          finished_at: article.created_at,
          finished_article_id: article.id,
        });
      }
      data.history = history;

      // 从队列中收集所有 source_item_id，批量查本地素材表补充标题和来源
      const tasks = [
        data.current,
        ...(data.queue ?? []),
        ...(data.recent ?? []),
        ...(data.history ?? []),
      ].filter(Boolean) as Array<Record<string, unknown>>;
      const sourceItemIds = [...new Set(tasks.map((task) => Number(task.source_item_id)).filter(Boolean))];
      if (sourceItemIds.length > 0) {
        const placeholders = sourceItemIds.map(() => "?").join(",");
        const rows = db.prepare(
          `SELECT id, title, source_name FROM creative_source_items WHERE id IN (${placeholders})`
        ).all(...sourceItemIds) as { id: number; title: string; source_name: string | null }[];
        const lookup = new Map(rows.map((row) => [row.id, row]));
        for (const task of tasks) {
          const sourceItemId = Number(task.source_item_id);
          if (sourceItemId && lookup.has(sourceItemId)) {
            const info = lookup.get(sourceItemId)!;
            task.source_item_title = info.title ?? null;
            task.source_item_source_name = info.source_name ?? null;
          }
        }
      }
    }

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
