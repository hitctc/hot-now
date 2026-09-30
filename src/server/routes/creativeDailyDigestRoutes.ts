import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { SqliteDatabase } from "../../core/db/openDatabase.js";
import {
  editDailyDigest,
  findDailyDigestByDate,
  findDailyDigestById,
  insertDailyDigest,
  listDailyDigests,
  replaceDailyDigest,
  updateDailyDigestStatus,
} from "../../core/dailyDigest/dailyDigestRepository.js";

export type CreativeDailyDigestRouteOptions = {
  db?: SqliteDatabase;
  authorizeCreativeApiToken: (request: FastifyRequest, reply: FastifyReply) => boolean;
  hasCreativeApiToken: (request: FastifyRequest) => boolean;
  readSession: (request: FastifyRequest, reply: FastifyReply) => unknown | undefined;
  authorizeStateAction: (request: FastifyRequest, reply: FastifyReply) => boolean;
  pushDailyDigestToWechatDraft?: (
    digestId: number,
    themeId: string,
    wechatHtml: string,
    onProgress?: (step: string, status: "running" | "done" | "error", detail?: string) => void | Promise<void>
  ) => Promise<{ ok: boolean; mediaId?: string; errorCode?: string; errorMessage?: string }>;
};

/** 注册日报的 Agent 写入、管理端编辑、生成与微信草稿推送接口。 */
export function registerCreativeDailyDigestRoutes(
  app: FastifyInstance,
  options: CreativeDailyDigestRouteOptions
): void {
  const { db } = options;

  // ─── Daily Digest: Hermes 推送日报（token 鉴权） ───

  app.post("/api/creative/daily-digests", async (request, reply) => {
    if (!options.authorizeCreativeApiToken(request, reply)) {
      return;
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const body = request.body as Record<string, unknown> | undefined;
    const date = typeof body?.date === "string" ? body.date.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const contentMarkdown = typeof body?.contentMarkdown === "string" ? body.contentMarkdown : "";
    const totalItems = typeof body?.totalItems === "number" ? body.totalItems : 0;
    const categories = Array.isArray(body?.categories) ? body.categories as string[] : [];
    const collectorAgent = typeof body?.collectorAgent === "string" ? body.collectorAgent.trim() : "";
    const coverImage = typeof body?.coverImage === "string" ? body.coverImage : undefined;

    if (!date || !title || !contentMarkdown || !collectorAgent) {
      return reply.code(400).send({ ok: false, reason: "missing-required-fields" });
    }

    // 同一天幂等：已存在则全量覆盖（Hermes 改进日报后可重新 POST 更新）
    const existing = findDailyDigestByDate(db, date);
    if (existing) {
      const replaced = replaceDailyDigest(db, date, {
        date,
        title,
        contentMarkdown,
        coverImage,
        totalItems,
        categories,
        collectorAgent
      });
      return reply.send(replaced);
    }

    const record = insertDailyDigest(db, {
      date,
      title,
      contentMarkdown,
      coverImage,
      totalItems,
      categories,
      collectorAgent
    });

    return reply.code(201).send(record);
  });

  // ─── Daily Digest: 前端查询列表（session 鉴权） ───

  app.get("/api/creative/daily-digests", async (request, reply) => {
    const session = options.readSession(request, reply);
    if (session === undefined) { return; }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const query = request.query as Record<string, string | undefined>;
    const result = listDailyDigests(db, {
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo
    });

    return reply.send(result);
  });

  // ─── Daily Digest: 前端查询详情（session 鉴权） ───

  app.get("/api/creative/daily-digests/:id", async (request, reply) => {
    const session = options.readSession(request, reply);
    if (session === undefined) { return; }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const params = request.params as { id: string };
    const id = parseInt(params.id, 10);
    const record = findDailyDigestById(db, id);
    if (!record) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send(record);
  });

  // ─── Daily Digest: 更新状态（session 鉴权） ───

  app.patch("/api/creative/daily-digests/:id", async (request, reply) => {
    // 支持两种认证：token（外部 Agent）或 session（管理 UI）
    const hasToken = options.hasCreativeApiToken(request);
    if (!hasToken) {
      const session = options.readSession(request, reply);
      if (session === undefined) { return; }
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const params = request.params as { id: string };
    const id = parseInt(params.id, 10);
    const body = request.body as Record<string, unknown> | undefined;

    // 更新状态
    if (typeof body?.status === "string") {
      const status = body.status;
      if (!["generated", "publishing", "published", "failed"].includes(status)) {
        return reply.code(400).send({ ok: false, reason: "invalid-status" });
      }
      const updated = updateDailyDigestStatus(db, id, status as "generated" | "publishing" | "published" | "failed");
      if (!updated) {
        return reply.code(404).send({ ok: false, reason: "not-found" });
      }
      return reply.send(updated);
    }

    // 编辑内容
    const contentMarkdown = typeof body?.contentMarkdown === "string" ? body.contentMarkdown : undefined;
    const title = typeof body?.title === "string" ? body.title : undefined;

    if (contentMarkdown === undefined && title === undefined) {
      return reply.code(400).send({ ok: false, reason: "no-fields-to-update" });
    }

    const updated = editDailyDigest(db, id, { contentMarkdown, title });
    if (!updated) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send(updated);
  });

  // 日报仅代理异步受理，模型耗时和取消由 Hermes 唯一队列负责。

  app.post("/api/creative/daily-digests/generate", async (request, reply) => {
    const session = options.readSession(request, reply);
    if (session === undefined) { return; }

    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) {
      return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" });
    }

    const body = request.body as { date?: unknown; requestId?: unknown } | undefined;
    if (body?.date !== undefined && typeof body.date !== "string") return reply.code(400).send({ ok: false, reason: "invalid-date" });
    const requestBody: Record<string, unknown> = { requestId: body?.requestId };
    if (typeof body?.date === "string" && body.date) {
      requestBody.date = body.date;
    }

    try {
      const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/generate-digest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${hermesApiToken}`,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ error: `Hermes HTTP ${res.status}` }));
        return reply.code(res.status >= 500 ? 502 : res.status).send({
          ok: false,
          reason: errorBody.error ?? `Hermes HTTP ${res.status}`,
        });
      }

      const data = await res.json() as { success?: boolean; taskId?: string; status?: string; detail?: string; error?: string };
      if (!data.success || (res.status === 202 && !data.taskId)) return reply.code(502).send({ ok: false, reason: "invalid-digest-task-response" });
      return reply.code(res.status === 202 ? 202 : 200).send({ ok: true, taskId: data.taskId, status: data.status, detail: data.detail ?? "日报任务已受理" });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return reply.code(504).send({ ok: false, reason: "日报受理响应暂不可查，请用原请求编号恢复" });
      }
      return reply.code(502).send({ ok: false, reason: `Hermes 调用失败: ${(err as Error).message}` });
    }
  });

  /** 查询既有日报任务；不得通过 GET 重新触发生成或向公众号推送。 */
  app.get("/api/creative/daily-digests/generate/status", async (request, reply) => {
    if (options.readSession(request, reply) === undefined) return;
    const taskId = (request.query as { taskId?: string }).taskId;
    if (!taskId) return reply.code(400).send({ ok: false, reason: "missing-task-id" });
    const base = process.env.HERMES_API_BASE_URL;
    const token = process.env.HERMES_API_TOKEN;
    if (!base || !token) return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" });
    try {
      const response = await fetch(`${base.replace(/\/+$/, "")}/api/generate-digest/status?${new URLSearchParams({ taskId })}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000),
      });
      const result = await response.json() as { success?: boolean; status?: string; error?: string };
      return reply.code(response.ok ? 200 : response.status >= 500 ? 502 : response.status)
        .send({ ok: Boolean(result.success), taskId, status: result.status, reason: result.error });
    } catch { return reply.code(502).send({ ok: false, reason: "日报任务状态暂不可查" }); }
  });

  // ─── Daily Digest: 推送公众号草稿（SSE 流式推送） ───

  app.post("/api/creative/daily-digests/:id/push-draft", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) {
      return;
    }
    if (!options.pushDailyDigestToWechatDraft) {
      return reply.code(503).send({ ok: false, reason: "wechat-push-not-configured" });
    }

    const params = request.params as { id: string };
    const body = request.body as { themeId?: string; wechatHtml?: string } | undefined;
    const id = parseInt(params.id, 10);
    const themeId = body?.themeId ?? "bauhaus";
    const wechatHtml = body?.wechatHtml ?? "";

    if (!wechatHtml) {
      return reply.code(400).send({ ok: false, reason: "missing-wechat-html" });
    }

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    res.socket?.setNoDelay(true);

    const sendEvent = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const onProgress = async (step: string, status: "running" | "done" | "error", detail?: string) => {
      const event: Record<string, unknown> = { step, status };
      if (detail) event.detail = detail;
      sendEvent(event);
      if (status === "done" || status === "running") {
        await new Promise(r => setTimeout(r, 100));
      }
    };

    try {
      const result = await options.pushDailyDigestToWechatDraft(id, themeId, wechatHtml, onProgress);
      if (result.ok) {
        sendEvent({ step: "complete", status: "done", mediaId: result.mediaId });
      } else {
        sendEvent({ step: "complete", status: "error", errorCode: result.errorCode, errorMessage: result.errorMessage });
      }
    } catch (err) {
      sendEvent({ step: "complete", status: "error", errorMessage: (err as Error).message });
    } finally {
      res.end();
    }
  });
}
